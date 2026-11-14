const crypto = require('crypto');
const cheerio = require('cheerio');
const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');
const { MONITORED_SOURCES } = require('../config/sourceConfig');

const SNAPSHOTS_COLLECTION = 'scrapeSnapshots';
const CHANGES_COLLECTION = 'policyChanges';
const RUNS_COLLECTION = 'scrapeRuns';

const USER_AGENT = 'RootlessChangeMonitor/1.0 (class project)';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const DELAY_BETWEEN_SOURCES_MS = 1500;

// Firestore documents are limited to 1 MiB. 100,000 characters is at most
// about 400 KB even if every character needs 4 bytes in UTF-8.
const MAX_STORED_TEXT_CHARS = 100000;
// Keeps a change record well under the document limit for very large diffs.
const MAX_DIFF_LINES = 1000;
// Above this many line pairs the LCS table gets too large, so the diff
// falls back to a simpler comparison (see diffLines).
const MAX_LCS_CELLS = 4000000;

const STATUS_PENDING_REVIEW = 'pending_review';
const STATUS_REVIEWED = 'reviewed';
const CHANGE_STATUSES = [STATUS_PENDING_REVIEW, STATUS_REVIEWED];
const MAX_REVIEW_NOTE_LENGTH = 1000;

const RESULT_BASELINE = 'baseline';
const RESULT_UNCHANGED = 'unchanged';
const RESULT_CHANGED = 'changed';
const RESULT_FAILED = 'failed';

// Removed from the content area before extracting text. Site wide headers
// and footers sit outside the content selector, so they are not listed.
const STRIP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'svg',
  'nav',
  'aside',
  'form',
  '[hidden]',
  '[aria-hidden="true"]',
];

// Block level elements start a new line, so the stored text keeps a
// readable structure for the line diff.
const BLOCK_SELECTORS = [
  'address', 'article', 'blockquote', 'caption', 'dd', 'details', 'div',
  'dl', 'dt', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'li', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody',
  'td', 'th', 'thead', 'tr', 'ul',
].join(',');

/**
 * Error carrying an HTTP status and a machine-readable code so the route
 * layer can translate service failures into consistent JSON responses.
 */
class MonitoringError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'MonitoringError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getDb() {
  return initializeFirebaseAdmin().firestore();
}

function serverTimestamp() {
  return initializeFirebaseAdmin().firestore.FieldValue.serverTimestamp();
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toIso(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date(value).toISOString();
}

function toMillis(value) {
  const iso = toIso(value);
  const millis = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(millis) ? 0 : millis;
}

/**
 * Extracts the readable text of the content area. Scripts, styles,
 * navigation and the source's excluded selectors are removed, each block
 * element goes on its own line, whitespace inside a line collapses to a
 * single space, and empty lines are dropped.
 *
 * @param {string} html
 * @param {string} selector CSS selector for the main content area
 * @param {string[]} [exclude] extra selectors to remove
 * @returns {string|null} normalized text, or null when the selector matches
 *   nothing or the content area is empty
 */
function extractNormalizedText(html, selector, exclude = []) {
  const $ = cheerio.load(String(html || ''));
  const root = $(selector).first();
  if (root.length === 0) {
    return null;
  }

  root.find([...STRIP_SELECTORS, ...exclude].join(',')).remove();
  root.find('br').replaceWith('\n');
  root.find(BLOCK_SELECTORS).each((index, element) => {
    $(element).prepend('\n').append('\n');
  });

  const text = root
    .text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text.length > 0 ? text : null;
}

/**
 * SHA-256 of the text with every run of whitespace (line breaks included)
 * collapsed to one space. Hashing this form means a change that only moves
 * text between elements, such as wrapping a sentence in a new div, does not
 * count as a policy change.
 *
 * @param {string} text
 * @returns {string} hex digest
 */
function computeContentHash(text) {
  const canonical = String(text).replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Caps text for storage. The caller hashes the full text first, so a change
 * past the cap is still detected.
 *
 * @param {string} text
 * @param {number} [maxChars]
 * @returns {{ text: string, truncated: boolean }}
 */
function truncateForStorage(text, maxChars = MAX_STORED_TEXT_CHARS) {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

function splitLines(text) {
  return text ? String(text).split('\n') : [];
}

/**
 * Fallback for very large inputs: compares line counts instead of order.
 * A line counts as added when it appears more often in the new text, and
 * removed when it appears more often in the old text.
 */
function countBasedDiff(oldLines, newLines) {
  const counts = new Map();
  for (const line of oldLines) {
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  const added = [];
  for (const line of newLines) {
    const remaining = counts.get(line) || 0;
    if (remaining > 0) {
      counts.set(line, remaining - 1);
    } else {
      added.push(line);
    }
  }
  const removed = [];
  for (const line of oldLines) {
    const remaining = counts.get(line) || 0;
    if (remaining > 0) {
      counts.set(line, remaining - 1);
      removed.push(line);
    }
  }
  return { added, removed };
}

/**
 * Line level diff based on the longest common subsequence. Lines shared at
 * the start and end are skipped first, so the table only covers the region
 * that actually changed.
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {{ added: string[], removed: string[] }} lines in document order
 */
function diffLines(oldText, newText) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start += 1;
  }

  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const a = oldLines.slice(start, oldEnd);
  const b = newLines.slice(start, newEnd);
  if (a.length === 0 || b.length === 0) {
    return { added: b, removed: a };
  }
  if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) {
    return countBasedDiff(a, b);
  }

  // lcs[i * width + j] = LCS length of a[i..] and b[j..]
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = a[i] === b[j]
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const added = [];
  const removed = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      removed.push(a[i]);
      i += 1;
    } else {
      added.push(b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    removed.push(a[i]);
    i += 1;
  }
  while (j < b.length) {
    added.push(b[j]);
    j += 1;
  }

  return { added, removed };
}

function describeFetchError(err, timeoutMs) {
  if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return `Request timed out after ${timeoutMs} ms`;
  }
  const causeCode = err && err.cause && err.cause.code;
  const message = (err && err.message) || String(err);
  return causeCode ? `${message} (${causeCode})` : message;
}

/**
 * Fetches a page, retrying timeouts, network errors and non 2xx responses.
 *
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<{ html: string, attempts: number }>}
 * @throws {Error} with an `attempts` property after the last failed attempt
 */
async function fetchWithRetry(url, options = {}) {
  const {
    fetchImpl = (...args) => global.fetch(...args),
    sleep = defaultSleep,
    maxAttempts = MAX_ATTEMPTS,
    retryDelayMs = RETRY_DELAY_MS,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  let lastMessage = 'Fetch failed';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      return { html, attempts: attempt };
    } catch (err) {
      lastMessage = describeFetchError(err, timeoutMs);
      console.warn(`[monitoring] attempt ${attempt}/${maxAttempts} failed for ${url}: ${lastMessage}`);
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  const error = new Error(lastMessage);
  error.attempts = maxAttempts;
  throw error;
}

/**
 * Latest stored snapshot for a source. Snapshots are only written for a
 * baseline or a change, so each source has few of them, and sorting here
 * avoids needing a Firestore composite index.
 */
async function getLatestSnapshot(db, sourceId) {
  const snapshot = await db
    .collection(SNAPSHOTS_COLLECTION)
    .where('sourceId', '==', sourceId)
    .get();

  if (snapshot.docs.length === 0) {
    return null;
  }

  const latest = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .sort((a, b) => toMillis(b.data.createdAt) - toMillis(a.data.createdAt))[0];
  return latest;
}

function capLines(lines) {
  return {
    lines: lines.slice(0, MAX_DIFF_LINES),
    truncated: lines.length > MAX_DIFF_LINES,
  };
}

/**
 * Fetches one source and compares it with the latest snapshot. Never
 * throws: any failure is returned as a 'failed' result so the run can move
 * on to the next source.
 *
 * @param {object} source entry from sourceConfig
 * @param {object} [options] passed through to fetchWithRetry
 * @returns {Promise<object>} per source result
 */
async function checkSource(source, options = {}) {
  const base = { sourceId: source.sourceId, url: source.url };
  let attempts = 0;

  try {
    const fetched = await fetchWithRetry(source.url, options);
    attempts = fetched.attempts;

    const text = extractNormalizedText(fetched.html, source.selector, source.exclude);
    if (text === null) {
      throw new Error(`Selector "${source.selector}" matched no content`);
    }

    const contentHash = computeContentHash(text);
    const db = getDb();
    const previous = await getLatestSnapshot(db, source.sourceId);

    if (previous && previous.data.contentHash === contentHash) {
      return { ...base, status: RESULT_UNCHANGED, attempts, contentHash };
    }

    const stored = truncateForStorage(text);
    const snapshotRef = await db.collection(SNAPSHOTS_COLLECTION).add({
      sourceId: source.sourceId,
      url: source.url,
      text: stored.text,
      contentHash,
      truncated: stored.truncated,
      createdAt: serverTimestamp(),
    });

    if (!previous) {
      return {
        ...base,
        status: RESULT_BASELINE,
        attempts,
        contentHash,
        snapshotId: snapshotRef.id,
      };
    }

    const diff = diffLines(previous.data.text, stored.text);
    const added = capLines(diff.added);
    const removed = capLines(diff.removed);
    const changeRef = await db.collection(CHANGES_COLLECTION).add({
      sourceId: source.sourceId,
      country: source.country,
      visaType: source.visaType,
      url: source.url,
      previousSnapshotId: previous.id,
      newSnapshotId: snapshotRef.id,
      addedLines: added.lines,
      removedLines: removed.lines,
      diffTruncated: added.truncated || removed.truncated,
      detectedAt: serverTimestamp(),
      status: STATUS_PENDING_REVIEW,
    });

    return {
      ...base,
      status: RESULT_CHANGED,
      attempts,
      contentHash,
      snapshotId: snapshotRef.id,
      changeId: changeRef.id,
      addedCount: diff.added.length,
      removedCount: diff.removed.length,
    };
  } catch (err) {
    const message = (err && err.message) || String(err);
    console.error(`[monitoring] ${source.sourceId} failed: ${message}`);
    return {
      ...base,
      status: RESULT_FAILED,
      attempts: err && err.attempts ? err.attempts : attempts,
      error: message,
    };
  }
}

function countResults(results) {
  const counts = {
    [RESULT_BASELINE]: 0,
    [RESULT_UNCHANGED]: 0,
    [RESULT_CHANGED]: 0,
    [RESULT_FAILED]: 0,
  };
  for (const result of results) {
    counts[result.status] += 1;
  }
  return counts;
}

let activeRun = null;

function isRunInProgress() {
  return activeRun !== null;
}

async function executeRun(options) {
  const {
    sources = MONITORED_SOURCES,
    sleep = defaultSleep,
    delayBetweenSourcesMs = DELAY_BETWEEN_SOURCES_MS,
    trigger = 'manual',
  } = options;

  const db = getDb();
  const startedAt = new Date();
  const runRef = await db.collection(RUNS_COLLECTION).add({
    trigger,
    status: 'running',
    startedAt,
    finishedAt: null,
    results: [],
  });

  const results = [];
  for (let index = 0; index < sources.length; index += 1) {
    if (index > 0) {
      await sleep(delayBetweenSourcesMs);
    }
    // checkSource never throws, so one bad source cannot stop the run.
    results.push(await checkSource(sources[index], { ...options, sleep }));
  }

  const finishedAt = new Date();
  const counts = countResults(results);
  await runRef.update({ status: 'completed', finishedAt, results, counts });

  return {
    id: runRef.id,
    trigger,
    status: 'completed',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    counts,
    results,
  };
}

/**
 * Checks every configured source one at a time and records the run in
 * scrapeRuns. Only one run can be active at a time.
 *
 * @param {object} [options] sources, fetchImpl, sleep and timing overrides,
 *   plus trigger ('manual' or 'scheduled')
 * @returns {Promise<object>} run summary
 * @throws {MonitoringError} 409 when a run is already in progress
 */
async function runMonitoring(options = {}) {
  if (activeRun) {
    throw new MonitoringError(
      409,
      'run_in_progress',
      'A monitoring run is already in progress. Try again when it finishes.'
    );
  }

  activeRun = executeRun(options);
  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
}

function toPublicChange(id, data) {
  return {
    id,
    sourceId: data.sourceId,
    country: data.country || null,
    visaType: data.visaType || null,
    url: data.url || null,
    previousSnapshotId: data.previousSnapshotId,
    newSnapshotId: data.newSnapshotId,
    addedLines: data.addedLines || [],
    removedLines: data.removedLines || [],
    diffTruncated: Boolean(data.diffTruncated),
    status: data.status,
    detectedAt: toIso(data.detectedAt),
    reviewedAt: toIso(data.reviewedAt),
    reviewNote: data.reviewNote || null,
  };
}

/**
 * Lists change records newest first, optionally filtered by status.
 *
 * @param {{ status?: string }} [filters]
 * @returns {Promise<object[]>}
 */
async function listChanges({ status } = {}) {
  let query = getDb().collection(CHANGES_COLLECTION);

  if (status !== undefined) {
    if (!CHANGE_STATUSES.includes(status)) {
      throw new MonitoringError(
        400,
        'invalid_status',
        `status must be one of: ${CHANGE_STATUSES.join(', ')}.`
      );
    }
    query = query.where('status', '==', status);
  }

  const snapshot = await query.get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .sort((a, b) => toMillis(b.data.detectedAt) - toMillis(a.data.detectedAt))
    .map(({ id, data }) => toPublicChange(id, data));
}

/**
 * Marks a change record as reviewed, with an optional note.
 *
 * @param {string} changeId
 * @param {{ note?: string }} [input]
 * @returns {Promise<object>}
 */
async function markChangeReviewed(changeId, input = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const updates = { status: STATUS_REVIEWED, reviewedAt: new Date() };

  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      throw new MonitoringError(400, 'invalid_note', 'note must be a string.');
    }
    if (body.note.trim().length > MAX_REVIEW_NOTE_LENGTH) {
      throw new MonitoringError(
        400,
        'invalid_note',
        `note must be ${MAX_REVIEW_NOTE_LENGTH} characters or fewer.`
      );
    }
    updates.reviewNote = body.note.trim();
  }

  const docRef = getDb().collection(CHANGES_COLLECTION).doc(String(changeId));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new MonitoringError(404, 'change_not_found', 'Change record not found.');
  }

  await docRef.update(updates);
  return toPublicChange(String(changeId), { ...snapshot.data(), ...updates });
}

module.exports = {
  extractNormalizedText,
  computeContentHash,
  truncateForStorage,
  diffLines,
  fetchWithRetry,
  checkSource,
  runMonitoring,
  isRunInProgress,
  listChanges,
  markChangeReviewed,
  MonitoringError,
  SNAPSHOTS_COLLECTION,
  CHANGES_COLLECTION,
  RUNS_COLLECTION,
  USER_AGENT,
  REQUEST_TIMEOUT_MS,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  DELAY_BETWEEN_SOURCES_MS,
  MAX_STORED_TEXT_CHARS,
  MAX_DIFF_LINES,
  CHANGE_STATUSES,
  STATUS_PENDING_REVIEW,
  STATUS_REVIEWED,
};
