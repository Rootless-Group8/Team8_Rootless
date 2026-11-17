const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');

const LIFE_EVENTS_COLLECTION = 'lifeEvents';

const EVENT_TYPES = [
  'visa_expiry',
  'renewal',
  'status_change',
  'appointment',
  'milestone',
];

const EVENT_STATUSES = ['upcoming', 'completed', 'cancelled'];
const DEFAULT_STATUS = 'upcoming';

const MAX_TITLE_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 60;
const MAX_NOTES_LENGTH = 1000;

const REQUIRED_FIELDS = ['type', 'title', 'date'];
const OPTIONAL_TEXT_FIELDS = {
  visaType: MAX_SHORT_TEXT_LENGTH,
  destinationCountry: MAX_SHORT_TEXT_LENGTH,
  notes: MAX_NOTES_LENGTH,
};

/**
 * Error carrying an HTTP status and a machine-readable code so the route
 * layer can translate service failures into consistent JSON responses.
 */
class LifeEventError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'LifeEventError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getDb() {
  return initializeFirebaseAdmin().firestore();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Parses an ISO 8601 date ("2026-12-01") or date-time
 * ("2026-12-01T14:30:00Z") and returns a normalized ISO string, or null when
 * the value is not a real date. Past dates are allowed on purpose so that
 * completed milestones and earlier status changes can be recorded.
 */
function normalizeDate(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(T.+)?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // Reject impossible calendar dates such as 2026-02-30, which Date would
  // otherwise roll over into March.
  if (!match[4]) {
    const [, year, month, day] = match;
    const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      check.getUTCFullYear() !== Number(year) ||
      check.getUTCMonth() !== Number(month) - 1 ||
      check.getUTCDate() !== Number(day)
    ) {
      return null;
    }
  }

  return parsed.toISOString();
}

/**
 * Validates and cleans life event input. Unknown fields are dropped.
 * On create every required field must be present. On update ({ partial: true })
 * only the fields that were sent are checked, and at least one valid field
 * must be present.
 *
 * @param {object} input
 * @param {{ partial?: boolean }} [options]
 * @returns {object} cleaned fields ready to store
 * @throws {LifeEventError} 400 with a list of problems when input is invalid
 */
function validateLifeEventInput(input, { partial = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const problems = [];
  const cleaned = {};

  if (!partial) {
    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        problems.push(`${field} is required.`);
      }
    }
  }

  if (body.type !== undefined && body.type !== null && body.type !== '') {
    if (EVENT_TYPES.includes(body.type)) {
      cleaned.type = body.type;
    } else {
      problems.push(`type must be one of: ${EVENT_TYPES.join(', ')}.`);
    }
  }

  if (body.title !== undefined && body.title !== null && body.title !== '') {
    if (!isNonEmptyString(body.title)) {
      problems.push('title must be a non-empty string.');
    } else if (body.title.trim().length > MAX_TITLE_LENGTH) {
      problems.push(`title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
    } else {
      cleaned.title = body.title.trim();
    }
  }

  if (body.date !== undefined && body.date !== null && body.date !== '') {
    const normalized = normalizeDate(body.date);
    if (normalized) {
      cleaned.date = normalized;
    } else {
      problems.push('date must be a valid ISO 8601 date, for example 2026-12-01.');
    }
  }

  if (body.status !== undefined && body.status !== null && body.status !== '') {
    if (EVENT_STATUSES.includes(body.status)) {
      cleaned.status = body.status;
    } else {
      problems.push(`status must be one of: ${EVENT_STATUSES.join(', ')}.`);
    }
  }

  for (const [field, maxLength] of Object.entries(OPTIONAL_TEXT_FIELDS)) {
    const value = body[field];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== 'string') {
      problems.push(`${field} must be a string.`);
    } else if (value.trim().length > maxLength) {
      problems.push(`${field} must be ${maxLength} characters or fewer.`);
    } else {
      cleaned[field] = value.trim();
    }
  }

  if (problems.length > 0) {
    throw new LifeEventError(
      400,
      'invalid_life_event',
      'The life event data is not valid.',
      problems
    );
  }

  if (partial && Object.keys(cleaned).length === 0) {
    throw new LifeEventError(
      400,
      'no_valid_fields',
      'Send at least one valid life event field to update.'
    );
  }

  return cleaned;
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

function toPublicLifeEvent(id, data) {
  return {
    id,
    type: data.type,
    title: data.title,
    date: toIso(data.date),
    status: data.status,
    visaType: data.visaType || null,
    destinationCountry: data.destinationCountry || null,
    notes: data.notes || null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Loads one event and confirms it belongs to the caller. An event owned by
 * someone else is reported exactly like a missing one, so callers cannot
 * learn which IDs exist.
 */
async function loadOwnedLifeEvent(uid, eventId) {
  const docRef = getDb().collection(LIFE_EVENTS_COLLECTION).doc(String(eventId));
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new LifeEventError(404, 'life_event_not_found', 'Life event not found.');
  }

  const data = snapshot.data();
  if (data.ownerUid !== uid) {
    throw new LifeEventError(404, 'life_event_not_found', 'Life event not found.');
  }

  return { docRef, data };
}

/**
 * Creates a life event for the caller.
 *
 * @param {string} uid Firebase UID from the verified token
 * @param {object} input
 * @returns {Promise<object>}
 */
async function createLifeEvent(uid, input) {
  const cleaned = validateLifeEventInput(input);
  const now = new Date();

  const record = {
    ...cleaned,
    status: cleaned.status || DEFAULT_STATUS,
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await getDb().collection(LIFE_EVENTS_COLLECTION).add(record);
  return toPublicLifeEvent(docRef.id, record);
}

/**
 * Lists the caller's life events in date order, soonest first. Sorting
 * happens here so no Firestore composite index is needed.
 *
 * @param {string} uid
 * @returns {Promise<object[]>}
 */
async function listLifeEvents(uid) {
  const snapshot = await getDb()
    .collection(LIFE_EVENTS_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .sort((a, b) => toMillis(a.data.date) - toMillis(b.data.date))
    .map(({ id, data }) => toPublicLifeEvent(id, data));
}

/**
 * @param {string} uid
 * @param {string} eventId
 * @returns {Promise<object>}
 */
async function getLifeEvent(uid, eventId) {
  const { data } = await loadOwnedLifeEvent(uid, eventId);
  return toPublicLifeEvent(String(eventId), data);
}

/**
 * Updates only the fields that were sent and refreshes updatedAt.
 * createdAt and ownerUid are never changed.
 *
 * @param {string} uid
 * @param {string} eventId
 * @param {object} input
 * @returns {Promise<object>}
 */
async function updateLifeEvent(uid, eventId, input) {
  const cleaned = validateLifeEventInput(input, { partial: true });
  const { docRef, data } = await loadOwnedLifeEvent(uid, eventId);

  const updates = { ...cleaned, updatedAt: new Date() };
  await docRef.update(updates);

  return toPublicLifeEvent(String(eventId), { ...data, ...updates });
}

/**
 * @param {string} uid
 * @param {string} eventId
 * @returns {Promise<void>}
 */
async function deleteLifeEvent(uid, eventId) {
  const { docRef } = await loadOwnedLifeEvent(uid, eventId);
  await docRef.delete();
}

module.exports = {
  createLifeEvent,
  listLifeEvents,
  getLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
  validateLifeEventInput,
  LifeEventError,
  EVENT_TYPES,
  EVENT_STATUSES,
  DEFAULT_STATUS,
};
