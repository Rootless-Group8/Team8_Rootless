const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');

const COMMUNITY_TIPS_COLLECTION = 'communityTips';

// The 10 supported destinations, spelled the same way as the display names in
// scripts/seedCostOfLiving.js. Matching is exact so stored values stay
// consistent and filters behave predictably.
const SUPPORTED_COUNTRIES = [
  'Canada',
  'UK',
  'Germany',
  'Portugal',
  'Mexico',
  'Spain',
  'Australia',
  'Japan',
  'Netherlands',
  'New Zealand',
];

const TIP_TOPICS = [
  'housing',
  'transportation',
  'healthcare',
  'banking',
  'language',
  'culture',
  'jobs',
  'other',
];

const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 1000;
const MAX_CITY_LENGTH = 100;
const MAX_AUTHOR_NAME_LENGTH = 100;
const DEFAULT_AUTHOR_NAME = 'Anonymous';

// Order matters: problems are reported in this order.
const TIP_FIELDS = ['title', 'content', 'destinationCountry', 'city', 'topic'];

const MAX_LENGTHS = {
  title: MAX_TITLE_LENGTH,
  content: MAX_CONTENT_LENGTH,
  city: MAX_CITY_LENGTH,
};

const ALLOWED_VALUES = {
  destinationCountry: SUPPORTED_COUNTRIES,
  topic: TIP_TOPICS,
};

/**
 * Error carrying an HTTP status and a machine-readable code so the route
 * layer can translate service failures into consistent JSON responses.
 */
class CommunityTipError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'CommunityTipError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getDb() {
  return initializeFirebaseAdmin().firestore();
}

/**
 * Checks one field value and returns either { value } with the trimmed
 * string or { problem } with a message for the caller.
 */
function checkField(field, rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return { problem: `${field} is required.` };
  }
  if (typeof rawValue !== 'string') {
    return { problem: `${field} must be a string.` };
  }

  const value = rawValue.trim();
  if (value.length === 0) {
    return { problem: `${field} cannot be empty.` };
  }

  const maxLength = MAX_LENGTHS[field];
  if (maxLength && value.length > maxLength) {
    return { problem: `${field} must be ${maxLength} characters or fewer.` };
  }

  const allowed = ALLOWED_VALUES[field];
  if (allowed && !allowed.includes(value)) {
    return { problem: `${field} must be one of: ${allowed.join(', ')}.` };
  }

  return { value };
}

/**
 * Validates and cleans tip input. Unknown fields (including ownerUid,
 * authorName, createdAt and updatedAt) are dropped.
 * On create every field is required. On update ({ partial: true }) only the
 * fields that were sent are checked, and at least one must be present.
 *
 * @param {object} input
 * @param {{ partial?: boolean }} [options]
 * @returns {object} cleaned fields ready to store
 * @throws {CommunityTipError} 400 with a list of problems when input is invalid
 */
function validateTipInput(input, { partial = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const problems = [];
  const cleaned = {};

  for (const field of TIP_FIELDS) {
    const sent = Object.prototype.hasOwnProperty.call(body, field);
    if (partial && !sent) {
      continue;
    }
    const { value, problem } = checkField(field, body[field]);
    if (problem) {
      problems.push(problem);
    } else {
      cleaned[field] = value;
    }
  }

  if (problems.length > 0) {
    throw new CommunityTipError(
      400,
      'invalid_community_tip',
      'The community tip data is not valid.',
      problems
    );
  }

  if (partial && Object.keys(cleaned).length === 0) {
    throw new CommunityTipError(
      400,
      'no_valid_fields',
      `Send at least one of these fields to update: ${TIP_FIELDS.join(', ')}.`
    );
  }

  return cleaned;
}

/**
 * Validates the optional list filters. Empty values are treated as not sent.
 * A repeated query parameter (an array) is rejected rather than guessed at.
 *
 * @param {object} query
 * @returns {{ destinationCountry?: string, city?: string, topic?: string }}
 * @throws {CommunityTipError} 400 when a filter value is not valid
 */
function validateTipFilters(query) {
  const source = query && typeof query === 'object' ? query : {};
  const problems = [];
  const filters = {};

  for (const field of ['destinationCountry', 'city', 'topic']) {
    const raw = source[field];
    if (raw === undefined || raw === null) {
      continue;
    }
    if (typeof raw !== 'string') {
      problems.push(`${field} filter must be a single value.`);
      continue;
    }
    const value = raw.trim();
    if (value.length === 0) {
      continue;
    }
    const allowed = ALLOWED_VALUES[field];
    if (allowed && !allowed.includes(value)) {
      problems.push(`${field} filter must be one of: ${allowed.join(', ')}.`);
      continue;
    }
    filters[field] = value;
  }

  if (problems.length > 0) {
    throw new CommunityTipError(
      400,
      'invalid_filter',
      'One or more filters are not valid.',
      problems
    );
  }

  return filters;
}

/**
 * Picks the name shown on a tip. Uses the name claim on the verified token
 * first, then the first and last name saved on the user's profile, then a
 * generic fallback. Email is never used so addresses are not exposed on a
 * public list.
 *
 * @param {object} [firebaseUser] decoded token (req.firebaseUser)
 * @param {object} [localUser] synced user record (req.localUser)
 * @returns {string}
 */
function resolveAuthorName(firebaseUser, localUser) {
  const tokenName =
    firebaseUser && typeof firebaseUser.name === 'string' ? firebaseUser.name.trim() : '';

  let name = tokenName;
  if (!name) {
    const profile = (localUser && localUser.profile) || {};
    name = [profile.firstName, profile.lastName]
      .filter((part) => typeof part === 'string' && part.trim())
      .map((part) => part.trim())
      .join(' ');
  }

  return name ? name.slice(0, MAX_AUTHOR_NAME_LENGTH) : DEFAULT_AUTHOR_NAME;
}

function toIso(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function toMillis(value) {
  const iso = toIso(value);
  const millis = iso ? new Date(iso).getTime() : 0;
  return Number.isNaN(millis) ? 0 : millis;
}

function toPublicTip(id, data) {
  return {
    id,
    title: data.title,
    content: data.content,
    destinationCountry: data.destinationCountry,
    city: data.city,
    topic: data.topic,
    ownerUid: data.ownerUid,
    authorName: data.authorName || DEFAULT_AUTHOR_NAME,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function loadTip(tipId) {
  const docRef = getDb().collection(COMMUNITY_TIPS_COLLECTION).doc(String(tipId));
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new CommunityTipError(404, 'community_tip_not_found', 'Community tip not found.');
  }

  return { docRef, data: snapshot.data() };
}

/**
 * Loads a tip and confirms the caller wrote it. Tips are public, so a tip
 * owned by someone else gets a 403 rather than pretending it does not exist.
 */
async function loadAuthoredTip(uid, tipId, action) {
  const loaded = await loadTip(tipId);
  if (loaded.data.ownerUid !== uid) {
    throw new CommunityTipError(
      403,
      'forbidden',
      `Only the author of this tip can ${action} it.`
    );
  }
  return loaded;
}

/**
 * Creates a tip for the caller.
 *
 * @param {{ uid: string, name?: string }} author uid from the verified token
 *   and the display name from resolveAuthorName
 * @param {object} input
 * @returns {Promise<object>}
 */
async function createCommunityTip(author, input) {
  const cleaned = validateTipInput(input);
  const now = new Date();

  const record = {
    ...cleaned,
    ownerUid: author.uid,
    authorName: author.name || DEFAULT_AUTHOR_NAME,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await getDb().collection(COMMUNITY_TIPS_COLLECTION).add(record);
  return toPublicTip(docRef.id, record);
}

/**
 * Lists tips from all users, newest first, with optional filters.
 * destinationCountry and topic are equality filters in the query, which
 * Firestore serves from single-field indexes. City matching is case
 * insensitive, so it is applied here, and sorting also happens here, so no
 * composite index is needed.
 *
 * @param {object} [query] raw query parameters
 * @returns {Promise<object[]>}
 */
async function listCommunityTips(query) {
  const filters = validateTipFilters(query);

  let ref = getDb().collection(COMMUNITY_TIPS_COLLECTION);
  if (filters.destinationCountry) {
    ref = ref.where('destinationCountry', '==', filters.destinationCountry);
  }
  if (filters.topic) {
    ref = ref.where('topic', '==', filters.topic);
  }

  const snapshot = await ref.get();
  const city = filters.city ? filters.city.toLowerCase() : null;

  return snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(
      ({ data }) =>
        !city || (typeof data.city === 'string' && data.city.trim().toLowerCase() === city)
    )
    .sort((a, b) => toMillis(b.data.createdAt) - toMillis(a.data.createdAt))
    .map(({ id, data }) => toPublicTip(id, data));
}

/**
 * @param {string} tipId
 * @returns {Promise<object>}
 */
async function getCommunityTip(tipId) {
  const { data } = await loadTip(tipId);
  return toPublicTip(String(tipId), data);
}

/**
 * Updates only the fields that were sent and refreshes updatedAt.
 * Only the author may edit. createdAt, ownerUid and authorName never change.
 *
 * @param {string} uid
 * @param {string} tipId
 * @param {object} input
 * @returns {Promise<object>}
 */
async function updateCommunityTip(uid, tipId, input) {
  const { docRef, data } = await loadAuthoredTip(uid, tipId, 'edit');
  const cleaned = validateTipInput(input, { partial: true });

  const updates = { ...cleaned, updatedAt: new Date() };
  await docRef.update(updates);

  return toPublicTip(String(tipId), { ...data, ...updates });
}

/**
 * Deletes a tip. Only the author may delete.
 *
 * @param {string} uid
 * @param {string} tipId
 * @returns {Promise<void>}
 */
async function deleteCommunityTip(uid, tipId) {
  const { docRef } = await loadAuthoredTip(uid, tipId, 'delete');
  await docRef.delete();
}

module.exports = {
  createCommunityTip,
  listCommunityTips,
  getCommunityTip,
  updateCommunityTip,
  deleteCommunityTip,
  validateTipInput,
  validateTipFilters,
  resolveAuthorName,
  CommunityTipError,
  SUPPORTED_COUNTRIES,
  TIP_TOPICS,
  MAX_TITLE_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_CITY_LENGTH,
  DEFAULT_AUTHOR_NAME,
};
