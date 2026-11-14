// In-memory stand-in for the parts of Firestore the service uses. Each
// collection is a Map of id -> data.
const mockCollections = new Map();
let mockIdCounter = 0;
let mockClock = 0;

function mockStore(name) {
  if (!mockCollections.has(name)) {
    mockCollections.set(name, new Map());
  }
  return mockCollections.get(name);
}

function mockSnapshot(store, id) {
  const data = store.get(id);
  return {
    id,
    exists: data !== undefined,
    data: () => (data === undefined ? undefined : { ...data }),
  };
}

function mockCollection(name) {
  const store = mockStore(name);
  const query = (filter) => ({
    get: async () => ({
      docs: [...store.keys()]
        .filter((id) => !filter || filter(store.get(id)))
        .map((id) => mockSnapshot(store, id)),
    }),
  });
  return {
    add: async (data) => {
      mockIdCounter += 1;
      const id = `${name}-${mockIdCounter}`;
      store.set(id, { ...data });
      const ref = {
        id,
        update: async (updates) => {
          store.set(id, { ...store.get(id), ...updates });
        },
      };
      return ref;
    },
    doc: (id) => ({
      get: async () => mockSnapshot(store, id),
      update: async (updates) => {
        store.set(id, { ...store.get(id), ...updates });
      },
    }),
    where: (field, op, value) => query((data) => op === '==' && data[field] === value),
    get: query(null).get,
  };
}

jest.mock('../config/firebaseAdmin', () => {
  const firestore = () => ({ collection: (name) => mockCollection(name) });
  // Each server timestamp is one second after the previous one, so
  // "latest" ordering is deterministic.
  firestore.FieldValue = {
    serverTimestamp: () => {
      mockClock += 1000;
      return new Date(Date.UTC(2026, 10, 14) + mockClock);
    },
  };
  return { initializeFirebaseAdmin: () => ({ firestore }) };
});

const {
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
  MAX_ATTEMPTS,
  MAX_STORED_TEXT_CHARS,
} = require('../services/scraperService');

const SOURCE_A = {
  sourceId: 'uk-student-visa',
  country: 'United Kingdom',
  visaType: 'student',
  url: 'https://example.test/uk-student',
  selector: 'main#content',
  exclude: ['.print-link'],
};
const SOURCE_B = {
  sourceId: 'canada-study-permit',
  country: 'Canada',
  visaType: 'student',
  url: 'https://example.test/canada-study',
  selector: 'main#content',
};

function page(body) {
  return `<html><head><title>T</title><script>var x = 1;</script></head>
    <body><nav>Site menu</nav><main id="content">${body}</main><footer>Footer</footer></body></html>`;
}

function okResponse(html) {
  return { ok: true, status: 200, text: async () => html };
}

function errorResponse(status) {
  return { ok: false, status, text: async () => '' };
}

const noSleep = () => Promise.resolve();

function docsIn(name) {
  return [...mockStore(name).entries()].map(([id, data]) => ({ id, ...data }));
}

beforeEach(() => {
  mockCollections.clear();
  mockIdCounter = 0;
  mockClock = 0;
  // No test may reach the network: any unmocked call fails loudly.
  global.fetch = jest.fn(() => {
    throw new Error('Unexpected real fetch in tests');
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('extractNormalizedText', () => {
  test('keeps only the content area and strips scripts, styles and navigation', () => {
    const html = page(`
      <style>.a { color: red; }</style>
      <nav>Contents: Overview, Eligibility</nav>
      <h1>Student visa</h1>
      <p>You can apply   for a Student visa.</p>
      <script>track();</script>
      <aside>Related content</aside>
      <ul><li>Be 16 or over</li><li>Have an offer</li></ul>
      <a class="print-link">Print entire guide</a>
    `);

    const text = extractNormalizedText(html, 'main#content', ['.print-link']);

    expect(text).toBe(
      'Student visa\nYou can apply for a Student visa.\nBe 16 or over\nHave an offer'
    );
    expect(text).not.toMatch(/Site menu|Footer|track|color|Contents|Related|Print/);
  });

  test('returns null when the selector matches nothing', () => {
    expect(extractNormalizedText(page('<p>Hi</p>'), 'main#missing')).toBeNull();
  });

  test('returns null when the content area is empty', () => {
    expect(extractNormalizedText(page('<script>x()</script>'), 'main#content')).toBeNull();
  });
});

describe('computeContentHash', () => {
  const original = page('<h1>Fees</h1><p>The fee is <strong>£490</strong>.</p>');

  test('is a SHA-256 hex digest', () => {
    expect(computeContentHash('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('whitespace only changes give the same hash', () => {
    const reformatted = page(`
      <h1>
        Fees
      </h1>
      <p>The   fee
         is <strong>£490</strong>.</p>`);

    const a = computeContentHash(extractNormalizedText(original, 'main#content'));
    const b = computeContentHash(extractNormalizedText(reformatted, 'main#content'));
    expect(b).toBe(a);
  });

  test('markup only changes give the same hash', () => {
    const remarked = page(`
      <div class="new-wrapper"><section>
        <h1 class="govuk-heading-l" id="fees">Fees</h1>
        <div><p data-x="1">The fee is <b>£490</b>.</p></div>
      </section></div>
      <script>analytics();</script>`);

    const a = computeContentHash(extractNormalizedText(original, 'main#content'));
    const b = computeContentHash(extractNormalizedText(remarked, 'main#content'));
    expect(b).toBe(a);
  });

  test('a text change gives a different hash', () => {
    const changed = page('<h1>Fees</h1><p>The fee is <strong>£524</strong>.</p>');

    const a = computeContentHash(extractNormalizedText(original, 'main#content'));
    const b = computeContentHash(extractNormalizedText(changed, 'main#content'));
    expect(b).not.toBe(a);
  });
});

describe('truncateForStorage', () => {
  test('leaves short text alone', () => {
    expect(truncateForStorage('short', 10)).toEqual({ text: 'short', truncated: false });
  });

  test('caps long text and sets the flag', () => {
    expect(truncateForStorage('abcdefghij', 4)).toEqual({ text: 'abcd', truncated: true });
  });
});

describe('diffLines', () => {
  test('reports added and removed lines in order', () => {
    const oldText = ['Intro', 'Fee is £490', 'Apply online', 'Contact us'].join('\n');
    const newText = ['Intro', 'Fee is £524', 'Apply online', 'Bring a passport', 'Contact us'].join('\n');

    expect(diffLines(oldText, newText)).toEqual({
      added: ['Fee is £524', 'Bring a passport'],
      removed: ['Fee is £490'],
    });
  });

  test('handles pure additions and pure removals', () => {
    expect(diffLines('a\nb', 'a\nb\nc')).toEqual({ added: ['c'], removed: [] });
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual({ added: [], removed: ['b'] });
  });

  test('handles empty previous text', () => {
    expect(diffLines('', 'a\nb')).toEqual({ added: ['a', 'b'], removed: [] });
  });

  test('identical text has no differences', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual({ added: [], removed: [] });
  });

  test('handles repeated lines', () => {
    expect(diffLines('x\ny\nx', 'x\nx\ny\nx')).toEqual({ added: ['x'], removed: [] });
  });
});

describe('fetchWithRetry', () => {
  test('sends the User-Agent and a timeout signal', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse('<p>ok</p>'));

    const result = await fetchWithRetry('https://example.test/page', { sleep: noSleep });

    expect(result).toEqual({ html: '<p>ok</p>', attempts: 1 });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://example.test/page');
    expect(init.headers['User-Agent']).toBe(USER_AGENT);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test('retries after a network error and a non 2xx response, then succeeds', async () => {
    const sleep = jest.fn().mockResolvedValue();
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse('<p>ok</p>'));

    const result = await fetchWithRetry('https://example.test/page', {
      sleep,
      retryDelayMs: 2000,
    });

    expect(result.attempts).toBe(3);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  test('reports timeouts clearly after the last attempt', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(timeout);

    await expect(
      fetchWithRetry('https://example.test/page', { sleep: noSleep, timeoutMs: 15000 })
    ).rejects.toMatchObject({
      message: 'Request timed out after 15000 ms',
      attempts: MAX_ATTEMPTS,
    });
    expect(global.fetch).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
});

describe('checkSource', () => {
  test('first snapshot is a baseline and creates no change record', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(page('<p>Rule one</p>')));

    const result = await checkSource(SOURCE_A, { sleep: noSleep });

    expect(result.status).toBe('baseline');
    const snapshots = docsIn(SNAPSHOTS_COLLECTION);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      id: result.snapshotId,
      sourceId: SOURCE_A.sourceId,
      url: SOURCE_A.url,
      text: 'Rule one',
      contentHash: computeContentHash('Rule one'),
      truncated: false,
    });
    expect(snapshots[0].createdAt).toBeInstanceOf(Date);
    expect(docsIn(CHANGES_COLLECTION)).toHaveLength(0);
  });

  test('same content again is unchanged and stores nothing new', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(okResponse(page('<p>Rule one</p>')))
      .mockResolvedValueOnce(okResponse(page('<div><p>Rule   one</p></div>')));

    await checkSource(SOURCE_A, { sleep: noSleep });
    const result = await checkSource(SOURCE_A, { sleep: noSleep });

    expect(result.status).toBe('unchanged');
    expect(docsIn(SNAPSHOTS_COLLECTION)).toHaveLength(1);
    expect(docsIn(CHANGES_COLLECTION)).toHaveLength(0);
  });

  test('different content stores a snapshot and a pending change with the diff', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(okResponse(page('<p>Rule one</p><p>Fee £490</p>')))
      .mockResolvedValueOnce(okResponse(page('<p>Rule one</p><p>Fee £524</p>')));

    const baseline = await checkSource(SOURCE_A, { sleep: noSleep });
    const result = await checkSource(SOURCE_A, { sleep: noSleep });

    expect(result.status).toBe('changed');
    expect(docsIn(SNAPSHOTS_COLLECTION)).toHaveLength(2);
    const changes = docsIn(CHANGES_COLLECTION);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: result.changeId,
      sourceId: SOURCE_A.sourceId,
      previousSnapshotId: baseline.snapshotId,
      newSnapshotId: result.snapshotId,
      addedLines: ['Fee £524'],
      removedLines: ['Fee £490'],
      status: 'pending_review',
    });
    expect(changes[0].detectedAt).toBeInstanceOf(Date);
  });

  test('compares against the latest snapshot, not the first', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(okResponse(page('<p>v1</p>')))
      .mockResolvedValueOnce(okResponse(page('<p>v2</p>')))
      .mockResolvedValueOnce(okResponse(page('<p>v2</p>')));

    await checkSource(SOURCE_A, { sleep: noSleep });
    const second = await checkSource(SOURCE_A, { sleep: noSleep });
    const third = await checkSource(SOURCE_A, { sleep: noSleep });

    expect(second.status).toBe('changed');
    expect(third.status).toBe('unchanged');
  });

  test('truncates stored text, sets the flag and hashes the full text', async () => {
    const longLine = 'x'.repeat(MAX_STORED_TEXT_CHARS + 500);
    global.fetch = jest.fn().mockResolvedValue(okResponse(page(`<p>${longLine}</p>`)));

    await checkSource(SOURCE_A, { sleep: noSleep });

    const [snapshot] = docsIn(SNAPSHOTS_COLLECTION);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.text).toHaveLength(MAX_STORED_TEXT_CHARS);
    expect(snapshot.contentHash).toBe(computeContentHash(longLine));
  });

  test('a change past the storage cap is still detected', async () => {
    const prefix = 'y'.repeat(MAX_STORED_TEXT_CHARS);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(okResponse(page(`<p>${prefix}</p><p>old tail</p>`)))
      .mockResolvedValueOnce(okResponse(page(`<p>${prefix}</p><p>new tail</p>`)));

    await checkSource(SOURCE_A, { sleep: noSleep });
    const result = await checkSource(SOURCE_A, { sleep: noSleep });

    expect(result.status).toBe('changed');
  });

  test('a selector that matches nothing is a failure, not a baseline', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse('<html><body>moved</body></html>'));

    const result = await checkSource(SOURCE_A, { sleep: noSleep });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/matched no content/);
    expect(docsIn(SNAPSHOTS_COLLECTION)).toHaveLength(0);
  });
});

describe('runMonitoring', () => {
  test('retries a failing source and then succeeds', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse(page('<p>A</p>')));

    const summary = await runMonitoring({ sources: [SOURCE_A], sleep: noSleep });

    expect(summary.results[0]).toMatchObject({
      sourceId: SOURCE_A.sourceId,
      status: 'baseline',
      attempts: 2,
    });
  });

  test('when retries run out, the source fails and the run continues', async () => {
    global.fetch = jest.fn((url) => (url === SOURCE_A.url
      ? Promise.resolve(errorResponse(500))
      : Promise.resolve(okResponse(page('<p>B</p>')))));

    const summary = await runMonitoring({ sources: [SOURCE_A, SOURCE_B], sleep: noSleep });

    const callsForA = global.fetch.mock.calls.filter(([url]) => url === SOURCE_A.url);
    expect(callsForA).toHaveLength(MAX_ATTEMPTS);
    expect(summary.results).toEqual([
      expect.objectContaining({
        sourceId: SOURCE_A.sourceId,
        status: 'failed',
        attempts: MAX_ATTEMPTS,
        error: 'HTTP 500',
      }),
      expect.objectContaining({ sourceId: SOURCE_B.sourceId, status: 'baseline' }),
    ]);
    expect(summary.counts).toEqual({ baseline: 1, unchanged: 0, changed: 0, failed: 1 });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`${SOURCE_A.sourceId} failed: HTTP 500`)
    );
  });

  test('records the run with start and end times and per source results', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(page('<p>Same</p>')));
    const sleep = jest.fn().mockResolvedValue();

    await runMonitoring({ sources: [SOURCE_A], sleep });
    const summary = await runMonitoring({
      sources: [SOURCE_A, SOURCE_B],
      sleep,
      delayBetweenSourcesMs: 1500,
      trigger: 'scheduled',
    });

    const runs = docsIn(RUNS_COLLECTION);
    expect(runs).toHaveLength(2);
    const run = runs.find((r) => r.id === summary.id);
    expect(run).toMatchObject({ trigger: 'scheduled', status: 'completed' });
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.finishedAt).toBeInstanceOf(Date);
    expect(run.finishedAt.getTime()).toBeGreaterThanOrEqual(run.startedAt.getTime());
    expect(run.results.map((r) => [r.sourceId, r.status])).toEqual([
      [SOURCE_A.sourceId, 'unchanged'],
      [SOURCE_B.sourceId, 'baseline'],
    ]);
    expect(run.counts).toEqual({ baseline: 1, unchanged: 1, changed: 0, failed: 0 });
    // One pause between the two sources in the second run.
    expect(sleep).toHaveBeenCalledWith(1500);
    expect(summary.startedAt).toEqual(run.startedAt.toISOString());
  });

  test('refuses to start while another run is in progress', async () => {
    let release;
    global.fetch = jest.fn(() => new Promise((resolve) => {
      release = () => resolve(okResponse(page('<p>A</p>')));
    }));

    const first = runMonitoring({ sources: [SOURCE_A], sleep: noSleep });
    await new Promise((resolve) => setImmediate(resolve));
    expect(isRunInProgress()).toBe(true);

    await expect(runMonitoring({ sources: [SOURCE_A], sleep: noSleep }))
      .rejects.toMatchObject({ status: 409, code: 'run_in_progress' });

    release();
    await first;
    expect(isRunInProgress()).toBe(false);
  });
});

describe('listChanges and markChangeReviewed', () => {
  function seedChange(id, data) {
    mockStore(CHANGES_COLLECTION).set(id, {
      sourceId: SOURCE_A.sourceId,
      previousSnapshotId: 's1',
      newSnapshotId: 's2',
      addedLines: ['new'],
      removedLines: ['old'],
      ...data,
    });
  }

  test('lists newest first and filters by status', async () => {
    seedChange('c1', { status: 'reviewed', detectedAt: new Date('2026-11-01T00:00:00Z') });
    seedChange('c2', { status: 'pending_review', detectedAt: new Date('2026-11-03T00:00:00Z') });
    seedChange('c3', { status: 'pending_review', detectedAt: new Date('2026-11-02T00:00:00Z') });

    const all = await listChanges();
    expect(all.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
    expect(all[0].detectedAt).toBe('2026-11-03T00:00:00.000Z');

    const pending = await listChanges({ status: 'pending_review' });
    expect(pending.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  test('rejects an unknown status filter', async () => {
    await expect(listChanges({ status: 'bogus' }))
      .rejects.toMatchObject({ status: 400, code: 'invalid_status' });
  });

  test('marks a change as reviewed with an optional note', async () => {
    seedChange('c1', { status: 'pending_review', detectedAt: new Date() });

    const change = await markChangeReviewed('c1', { note: '  Updated checklist  ' });

    expect(change).toMatchObject({ id: 'c1', status: 'reviewed', reviewNote: 'Updated checklist' });
    expect(change.reviewedAt).toEqual(expect.any(String));
    expect(mockStore(CHANGES_COLLECTION).get('c1').status).toBe('reviewed');
  });

  test('unknown ID is a 404', async () => {
    const promise = markChangeReviewed('missing');
    await expect(promise).rejects.toBeInstanceOf(MonitoringError);
    await expect(promise).rejects.toMatchObject({ status: 404, code: 'change_not_found' });
  });

  test('rejects a note that is not a string', async () => {
    seedChange('c1', { status: 'pending_review' });
    await expect(markChangeReviewed('c1', { note: 5 }))
      .rejects.toMatchObject({ status: 400, code: 'invalid_note' });
  });
});
