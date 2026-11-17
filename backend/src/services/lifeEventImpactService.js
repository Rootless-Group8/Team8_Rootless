// Works out how a user's life events affect their visa, using the rules in
// lifeEventImpactRules.js. Life events come from Firestore (through
// lifeEventService) and visa processing times come from the Realtime
// Database under countryVisaPrograms/{CC}/{visa_key}.processingTime, the same
// place the ranking engine reads them.
//
// This service only reads. It never creates or changes life events.

const {
  listLifeEvents,
  validateLifeEventInput,
  DEFAULT_STATUS,
} = require('./lifeEventService');
const { evaluateImpacts } = require('./lifeEventImpactRules');

const PREVIEW_EVENT_ID = 'preview';

// Life events store destinationCountry as free text, so accept the country
// names users are likely to type as well as the ISO codes the database uses.
const COUNTRY_CODES = {
  canada: 'CA',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  germany: 'DE',
  portugal: 'PT',
  mexico: 'MX',
  spain: 'ES',
  australia: 'AU',
  japan: 'JP',
  netherlands: 'NL',
  'the netherlands': 'NL',
  'new zealand': 'NZ',
};

function toCountryCode(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  // Names first, so "UK" maps to GB instead of being read as a code.
  const named = COUNTRY_CODES[trimmed.toLowerCase()];
  if (named) return named;
  return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : null;
}

function toVisaKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// Finds the visa program for a free-text visa type: an exact key match
// first ("study_permit"), then a single program whose key contains the text
// ("student" -> "student_visa"). Anything ambiguous is treated as unknown
// rather than guessed.
function findProgram(programs, visaType) {
  const key = toVisaKey(visaType);
  if (!programs || !key) return null;
  if (programs[key]) return programs[key];
  const matches = Object.keys(programs).filter((programKey) => programKey.includes(key));
  return matches.length === 1 ? programs[matches[0]] : null;
}

function readProcessingTime(program) {
  const processing = program && program.processingTime;
  if (!processing || typeof processing !== 'object') return null;
  const { minDays, maxDays } = processing;
  if (!Number.isFinite(maxDays)) return null;
  return { minDays: Number.isFinite(minDays) ? minDays : maxDays, maxDays };
}

/**
 * Looks up processing times for every visa_expiry event, reading each
 * country from the database once. Lookups that fail (unknown country, visa
 * not found, missing numbers, database error) come back as null so the
 * rules fall back to the default processing time instead of failing.
 *
 * @returns {Promise<Map<string, object|null>>} event ID -> processing time
 */
async function loadProcessingTimes(db, events) {
  const result = new Map();
  const expiryEvents = events.filter((event) => event.type === 'visa_expiry');
  if (!db || expiryEvents.length === 0) return result;

  const countries = new Map();
  for (const event of expiryEvents) {
    const code = toCountryCode(event.destinationCountry);
    if (code && !countries.has(code)) countries.set(code, null);
  }

  await Promise.all(
    [...countries.keys()].map(async (code) => {
      try {
        const snapshot = await db.ref(`countryVisaPrograms/${code}`).once('value');
        countries.set(code, snapshot.exists() ? snapshot.val() : null);
      } catch (err) {
        console.error(`Could not load visa programs for ${code}:`, err.message);
        countries.set(code, null);
      }
    })
  );

  for (const event of expiryEvents) {
    const programs = countries.get(toCountryCode(event.destinationCountry));
    result.set(event.id, readProcessingTime(findProgram(programs, event.visaType)));
  }
  return result;
}

async function runRules(db, events, now) {
  const processingTimes = await loadProcessingTimes(db, events);
  return evaluateImpacts(events, {
    now,
    processingFor: (event) => processingTimes.get(event.id) || null,
  });
}

/**
 * Impacts for all of the caller's saved life events.
 *
 * @param {object} db Realtime Database handle (for processing times)
 * @param {string} uid Firebase UID from the verified token
 * @param {{ now?: Date }} [options]
 */
async function getLifeEventImpacts(db, uid, { now = new Date() } = {}) {
  const events = await listLifeEvents(uid);
  const impacts = await runRules(db, events, now);
  return { impacts, count: impacts.length };
}

function impactKey(impact) {
  return `${impact.ruleId}:${impact.eventId}`;
}

/**
 * What-if check: runs the rules as if the given event had been added, without
 * saving it. Returns the full impact list plus which impacts the event would
 * introduce and which existing ones it would resolve (for example, planning a
 * renewal resolves "renewal needed").
 *
 * @param {object} db
 * @param {string} uid
 * @param {object} input same fields as POST /api/life-events
 * @param {{ now?: Date }} [options]
 * @throws {LifeEventError} 400 when the hypothetical event is invalid
 */
async function previewLifeEventImpacts(db, uid, input, { now = new Date() } = {}) {
  const cleaned = validateLifeEventInput(input);
  const hypothetical = {
    id: PREVIEW_EVENT_ID,
    type: cleaned.type,
    title: cleaned.title,
    date: cleaned.date,
    status: cleaned.status || DEFAULT_STATUS,
    visaType: cleaned.visaType || null,
    destinationCountry: cleaned.destinationCountry || null,
    notes: cleaned.notes || null,
  };

  const events = await listLifeEvents(uid);
  const [before, after] = await Promise.all([
    runRules(db, events, now),
    runRules(db, [...events, hypothetical], now),
  ]);

  const beforeKeys = new Set(before.map(impactKey));
  const afterKeys = new Set(after.map(impactKey));

  return {
    event: hypothetical,
    impacts: after,
    introduced: after.filter((impact) => !beforeKeys.has(impactKey(impact))),
    resolved: before.filter((impact) => !afterKeys.has(impactKey(impact))),
  };
}

module.exports = {
  getLifeEventImpacts,
  previewLifeEventImpacts,
  loadProcessingTimes,
  toCountryCode,
  findProgram,
  PREVIEW_EVENT_ID,
};
