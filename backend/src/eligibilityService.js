const PURPOSE_TO_CATEGORY = {
  tourism: 'tourist_visitor',
  study: 'student',
  work: 'work',
};

async function getEligibleVisas(db, passport, destination, purpose) {
  const pass = (passport || '').toUpperCase();
  const dest = (destination || '').toUpperCase();

  if (!pass || !dest) {
    return { status: 'invalid_input', message: 'Passport and destination country are required.', visas: [] };
  }
  if (purpose && !PURPOSE_TO_CATEGORY[purpose]) {
    return { status: 'invalid_input', message: `Unknown purpose "${purpose}". Use tourism, study, or work.`, visas: [] };
  }
  if (pass === dest) {
    return { status: 'no_visa_needed', message: 'Citizens do not need a visa for their own country.', visas: [] };
  }

  const countrySnap = await db.ref(`countries/${pass}`).once('value');
  if (!countrySnap.exists()) {
    return { status: 'unknown_passport', message: `"${pass}" isn't a recognized country code.`, visas: [] };
  }

  const snap = await db.ref(`countryVisaPrograms/${dest}`).once('value');
  const programs = snap.val();
  if (!programs) {
    return { status: 'no_data', message: `We don't have visa data for ${dest} yet.`, visas: [] };
  }

  let visas = Object.entries(programs).map(([id, v]) => ({
    id,
    name: v.name,
    category: v.category,
    processingTime: v.processingTime,
    fees: v.fees,
    validityDuration: v.validityDuration,
    sourceUrl: v.sourceUrl,
    eligibilityCriteria: v.eligibilityCriteria || [],
  }));

  if (purpose) {
    visas = visas.filter((v) => v.category === PURPOSE_TO_CATEGORY[purpose]);
  }
  if (visas.length === 0) {
    return { status: 'no_match', message: 'No visa types match that purpose.', visas: [] };
  }

  const ruleSnap = await db.ref(`visaRequirements/${pass}/${dest}`).once('value');
  const entryRule = ruleSnap.val() || null;

  return { status: 'ok', passport: pass, destination: dest, entryRule, visas };
}

module.exports = { getEligibleVisas };
