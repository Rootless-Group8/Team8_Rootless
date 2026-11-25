// Works out the deadlines for a user's visa process, counting backward from
// their arrival date using the visa's processing time.

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Reads the structured { minDays, maxDays } processing time stored in the seed data
// (TM08-57). Returns { minDays, maxDays } as whole days, or null when the visa has
// no usable numbers (for example the Canada study and work permits, where the
// source gives no figure and Firebase drops the null values).
// If only maxDays is stored, minDays falls back to it, same as the impact engine.
function readProcessingDays(processingTime) {
  if (!processingTime || typeof processingTime !== 'object') return null;
  const { minDays, maxDays } = processingTime;
  if (!isWholeDays(maxDays)) return null;
  const min = isWholeDays(minDays) ? minDays : maxDays;
  if (min > maxDays) return null;
  return { minDays: min, maxDays };
}

function isWholeDays(value) {
  return Number.isInteger(value) && value >= 0;
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
    processingTime: null,
    processingTimeNotes: visa.processingTimeNotes ?? null,
    deadlines: [],
    warnings: [],
  };

  const processing = readProcessingDays(visa.processingTime);
  if (processing === null) {
    // No made-up default here: telling someone a specific apply-by date we can't
    // back up is worse than telling them to check the official source.
    result.warnings.push(
      'Could not read the processing time for this visa, so no apply-by deadline was calculated.'
    );
    return result;
  }
  result.processingTime = processing;

  // Count back the longest processing time (worst case), matching the impact engine.
  const applyBy = new Date(arrival.getTime() - processing.maxDays * DAY_MS);
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

module.exports = { getDeadlines, readProcessingDays, DeadlineError };
