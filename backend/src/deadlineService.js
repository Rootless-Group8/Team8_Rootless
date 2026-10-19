// Works out the deadlines for a user's visa process, counting backward from
// their arrival date using the visa's processing time.

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_UNIT = { day: 1, week: 7, month: 30 };

class DeadlineError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'DeadlineError';
    this.status = status;
  }
}

// Turns "2026-12-01" into a UTC midnight Date, or returns null if it isn't a real date.
function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // catches things like 2026-02-31 rolling over into March
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfTodayUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Reads the number out of text like "4 to 12 weeks", "2-3 months" or "30 days".
// Returns the longest end of the range in days (worst case), or null if it can't be read.
function parseProcessingTime(text) {
  if (typeof text !== 'string') return null;
  const match = text
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(?:(?:to|-|–)\s*(\d+(?:\.\d+)?))?\s*(day|week|month)s?\b/);
  if (!match) return null;

  const low = parseFloat(match[1]);
  const high = match[2] ? parseFloat(match[2]) : low;
  const longest = Math.max(low, high);
  return Math.ceil(longest * DAYS_PER_UNIT[match[3]]);
}

// Country keys in the database are uppercase codes like CA and GB (same as eligibilityService)
function normalizeCountry(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

// Visa type keys are lowercase snake case ids like visitor_visa or study_permit
function normalizeVisaType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '_') : '';
}

// Firebase keys can't hold . # $ [ ] / so anything with those can't be a real country or visa type
function isSafeKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key);
}

async function getDeadlines(db, { arrivalDate, country, visaType } = {}, now = new Date()) {
  if (arrivalDate === undefined || arrivalDate === null || arrivalDate === '') {
    throw new DeadlineError(400, 'arrivalDate is required');
  }
  const arrival = parseIsoDate(arrivalDate);
  if (!arrival) {
    throw new DeadlineError(400, 'arrivalDate must be a valid date in YYYY-MM-DD format');
  }
  const today = startOfTodayUtc(now);
  if (arrival < today) {
    throw new DeadlineError(400, 'arrivalDate has already passed');
  }

  const countryKey = normalizeCountry(country);
  const visaKey = normalizeVisaType(visaType);
  if (!countryKey) throw new DeadlineError(400, 'country is required');
  if (!visaKey) throw new DeadlineError(400, 'visaType is required');
  if (!isSafeKey(countryKey)) throw new DeadlineError(404, `Unknown country: ${country}`);
  if (!isSafeKey(visaKey)) throw new DeadlineError(404, `Unknown visa type: ${visaType}`);

  const snapshot = await db.ref(`countryVisaPrograms/${countryKey}`).once('value');
  if (!snapshot.exists()) {
    throw new DeadlineError(404, `Unknown country: ${country}`);
  }
  const visa = snapshot.val()[visaKey];
  if (!visa) {
    throw new DeadlineError(404, `Unknown visa type: ${visaType} for ${country}`);
  }

  const result = {
    country: countryKey,
    visaType: visaKey,
    arrivalDate: toIsoDate(arrival),
    processingTime: visa.processingTime ?? null,
    deadlines: [],
    warnings: [],
  };

  const processingDays = parseProcessingTime(visa.processingTime);
  if (processingDays === null) {
    result.warnings.push(
      'Could not read the processing time for this visa, so no apply-by deadline was calculated.'
    );
    return result;
  }

  const applyBy = new Date(arrival.getTime() - processingDays * DAY_MS);
  result.deadlines.push({
    name: 'Latest date to apply',
    date: toIsoDate(applyBy),
  });

  if (applyBy < today) {
    result.warnings.push(
      'The latest apply date has already passed, so this visa may not be processed before arrival.'
    );
  }

  return result;
}

module.exports = { getDeadlines, parseProcessingTime, DeadlineError };
