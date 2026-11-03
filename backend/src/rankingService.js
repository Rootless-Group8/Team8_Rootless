// Matching Engine v2: ranks a destination's tourist and student visa programs
// by how many of their eligibility criteria the user's profile satisfies.
//
// Eligibility criteria are still free text in the seed data, so most of them
// can't be checked against a profile. Those are reported as "unknown" for the
// user to confirm and never count toward the score in either direction.

// Accepts both the v1 query values and the profile's relocationGoal values.
const PURPOSE_TO_CATEGORY = {
  tourism: 'tourist_visitor',
  tourist_visit: 'tourist_visitor',
  study: 'student',
  student: 'student',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const UNKNOWN_REASON = "Can't be checked from your profile. Please confirm this yourself.";

// Free-text criteria we know how to evaluate. Anything that doesn't match a
// rule here is reported as unknown.
const CRITERION_RULES = [
  {
    // e.g. "Germany must be your sole or main destination for a German mission..."
    pattern: /must be your (sole or )?main destination/i,
    evaluate: (profile) => ({
      status: 'met',
      reason: `Your destination is ${profile.destination}.`,
    }),
  },
];

function invalid(errors) {
  return {
    status: 'invalid_input',
    message: Object.values(errors).join(' '),
    errors,
    results: [],
  };
}

function parseArrivalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Rejects dates like 2027-02-30 that Date silently rolls over.
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function startOfUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function evaluateCriterion(text, profile) {
  const rule = CRITERION_RULES.find((r) => r.pattern.test(text));
  if (!rule) return { criterion: text, status: 'unknown', reason: UNKNOWN_REASON };
  return { criterion: text, ...rule.evaluate(profile) };
}

// Derived check, not from the seed text: can the visa realistically be
// processed before the user's arrival date?
function evaluateProcessingTime(processingTime, profile, now) {
  const criterion = 'Visa can be processed before your planned arrival date';
  const { minDays, maxDays } = processingTime || {};

  if (!profile.arrivalDate) {
    return { criterion, status: 'unknown', reason: 'No arrival date given.' };
  }
  if (minDays == null || maxDays == null) {
    return { criterion, status: 'unknown', reason: 'No published processing time for this visa.' };
  }

  const daysUntilArrival = Math.round((profile.arrivalDate.getTime() - startOfUtcDay(now)) / DAY_MS);
  if (daysUntilArrival >= maxDays) {
    return { criterion, status: 'met', reason: `${daysUntilArrival} days until arrival; processing takes up to ${maxDays} days.` };
  }
  if (daysUntilArrival < minDays) {
    return { criterion, status: 'not_met', reason: `${daysUntilArrival} days until arrival; processing takes at least ${minDays} days.` };
  }
  return {
    criterion,
    status: 'unknown',
    reason: `${daysUntilArrival} days until arrival; processing takes ${minDays} to ${maxDays} days, so it may be tight.`,
  };
}

function scoreProgram(id, program, profile, now) {
  const checks = (program.eligibilityCriteria || []).map((text) => evaluateCriterion(text, profile));
  checks.push(evaluateProcessingTime(program.processingTime, profile, now));

  const breakdown = { met: [], notMet: [], unknown: [] };
  checks.forEach(({ status, ...check }) => {
    if (status === 'met') breakdown.met.push(check);
    else if (status === 'not_met') breakdown.notMet.push(check);
    else breakdown.unknown.push(check);
  });

  return {
    id,
    name: program.name,
    category: program.category,
    processingTime: program.processingTime || null,
    processingTimeNotes: program.processingTimeNotes || null,
    fees: program.fees,
    validityDuration: program.validityDuration,
    sourceUrl: program.sourceUrl,
    score: breakdown.met.length,
    totalCriteria: checks.length,
    breakdown,
  };
}

// Missing processing times sort after every known one.
function compareProcessingDays(a, b, key) {
  const x = a.processingTime ? a.processingTime[key] : null;
  const y = b.processingTime ? b.processingTime[key] : null;
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return x - y;
}

function compareResults(a, b) {
  return (
    b.score - a.score ||
    compareProcessingDays(a, b, 'maxDays') ||
    compareProcessingDays(a, b, 'minDays') ||
    a.id.localeCompare(b.id)
  );
}

async function getRankedVisas(db, input = {}, { now = new Date() } = {}) {
  const citizenship = String(input.citizenship || '').trim().toUpperCase();
  const destination = String(input.destination || '').trim().toUpperCase();
  const purpose = String(input.purpose || '').trim().toLowerCase();
  const arrivalInput = String(input.arrivalDate || '').trim();

  const errors = {};
  if (!citizenship) errors.citizenship = 'Citizenship is required.';
  if (!destination) errors.destination = 'Destination country is required.';
  if (!purpose) {
    errors.purpose = 'Purpose of visit is required. Use tourism or study.';
  } else if (!PURPOSE_TO_CATEGORY[purpose]) {
    errors.purpose = `Unsupported purpose "${purpose}". Use tourism or study.`;
  }

  let arrivalDate = null;
  if (arrivalInput) {
    arrivalDate = parseArrivalDate(arrivalInput);
    if (!arrivalDate) {
      errors.arrivalDate = 'Arrival date must be a valid date in YYYY-MM-DD format.';
    } else if (arrivalDate.getTime() < startOfUtcDay(now)) {
      errors.arrivalDate = 'Arrival date cannot be in the past.';
    }
  }
  if (Object.keys(errors).length) return invalid(errors);

  const [citizenSnap, destSnap] = await Promise.all([
    db.ref(`countries/${citizenship}`).once('value'),
    db.ref(`countries/${destination}`).once('value'),
  ]);
  if (!citizenSnap.exists()) errors.citizenship = `"${citizenship}" isn't a recognized country code.`;
  if (!destSnap.exists()) errors.destination = `"${destination}" isn't a recognized country code.`;
  if (Object.keys(errors).length) return invalid(errors);

  const profile = { citizenship, destination, purpose, arrivalDate };
  const base = {
    citizenship,
    destination,
    purpose,
    arrivalDate: arrivalDate ? arrivalInput : null,
  };

  if (citizenship === destination) {
    return { ...base, status: 'no_visa_needed', message: 'Citizens do not need a visa for their own country.', results: [] };
  }

  const snap = await db.ref(`countryVisaPrograms/${destination}`).once('value');
  const category = PURPOSE_TO_CATEGORY[purpose];
  // Programs outside the stated purpose are excluded rather than ranked last.
  const results = Object.entries(snap.val() || {})
    .filter(([, program]) => program.category === category)
    .map(([id, program]) => scoreProgram(id, program, profile, now))
    .sort(compareResults)
    .map((result, i) => ({ rank: i + 1, ...result }));

  if (results.length === 0) {
    return {
      ...base,
      status: 'no_match',
      message: `We don't have any ${purpose} visas for ${destination} yet.`,
      results: [],
    };
  }

  const ruleSnap = await db.ref(`visaRequirements/${citizenship}/${destination}`).once('value');
  return { ...base, status: 'ok', entryRule: ruleSnap.val() || null, results };
}

module.exports = { getRankedVisas, PURPOSE_TO_CATEGORY };
