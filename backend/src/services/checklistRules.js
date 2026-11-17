/**
 * Data driven rules for the Checklist Generator.
 *
 * Turns the Rootless visa data (src/data/checklistData.json, generated from
 * the Realtime Database export) into checklist template items:
 *   - entry requirement items for tourists, based on the user's passport
 *     country and destination
 *   - visa program items (eligibility, documents, fees, applying, tracking,
 *     validity) for destinations that have program data
 *
 * Every function here is pure. The data object is passed in so tests can use
 * a small fixture instead of the real file.
 */
const {
  CATEGORIES,
  VISA_TYPES,
  STUDENT_GENERIC_VISA_ITEMS,
  TOURIST_GENERIC_VISA_ITEMS,
} = require('./checklistTemplates');

// Common names and demonyms that do not match the country list exactly.
const COUNTRY_ALIASES = {
  usa: 'US',
  us: 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  america: 'US',
  american: 'US',
  'united states of america': 'US',
  uk: 'GB',
  'u.k.': 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  british: 'GB',
  canadian: 'CA',
  holland: 'NL',
  'the netherlands': 'NL',
  nz: 'NZ',
};

/**
 * Resolves a free text country (name, ISO2, ISO3, or common alias) to
 * { iso2, name } using the country list in the data. Returns null if unknown.
 */
function resolveCountry(value, data) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const text = value.trim();
  const lower = text.toLowerCase();
  const countries = data.countries || {};

  const upper = text.toUpperCase();
  if (countries[upper]) {
    return { iso2: upper, name: countries[upper].name };
  }

  const aliasIso = COUNTRY_ALIASES[lower];
  if (aliasIso && countries[aliasIso]) {
    return { iso2: aliasIso, name: countries[aliasIso].name };
  }

  const match = Object.entries(countries).find(
    ([, c]) => c.name.toLowerCase() === lower || c.iso3 === upper
  );
  return match ? { iso2: match[0], name: match[1].name } : null;
}

/** Ends text with a full stop, and returns '' for empty input. */
function sentence(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return '';
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinSentences(...parts) {
  return parts.map(sentence).filter(Boolean).join(' ');
}

/** Looks up the tourist entry rule for a passport country and destination. */
function getEntryRequirement(passportIso2, destinationIso2, data) {
  if (!passportIso2 || !destinationIso2) {
    return null;
  }
  const byDestination = (data.requirements || {})[passportIso2];
  return (byDestination && byDestination[destinationIso2]) || null;
}

/**
 * Builds the tourist entry requirement item (and the stay limit item) for a
 * passport and destination. Without data for the passport country, a generic
 * "confirm entry requirements" item is returned instead.
 */
function entryRequirementItems(requirement, ctx) {
  const who = ctx.passportName
    ? `${ctx.passportName} passport holders`
    : 'Travellers with your passport';
  const stay = requirement && requirement.maxStayDays
    ? ` for up to ${requirement.maxStayDays} days`
    : '';
  const notes = requirement ? requirement.notes : '';
  const type = requirement ? requirement.requirementType : 'unknown';
  const dest = ctx.destinationName;

  const byType = {
    visa_free: {
      title: `Confirm visa-free entry to ${dest}`,
      priority: 'medium',
      offsetDays: -30,
      description: joinSentences(
        `${who} can generally visit ${dest} without a visa${stay}`,
        notes,
        'Confirm the current rules on the official government website before you travel'
      ),
    },
    eta: {
      title: 'Apply for your electronic travel authorization',
      priority: 'high',
      offsetDays: -45,
      description: joinSentences(
        `${who} need an electronic travel authorization (eTA or ETA) to visit ${dest}${stay}`,
        notes,
        'Apply only through the official government channel, and apply early in case of delays'
      ),
    },
    evisa: {
      title: 'Apply for your e-Visa',
      priority: 'high',
      offsetDays: -60,
      description: joinSentences(
        `${who} need an e-Visa to visit ${dest}${stay}`,
        notes,
        'Apply only through the official government site, and apply early in case of delays'
      ),
    },
    evisa_or_voa: {
      title: 'Apply for an e-Visa or plan for visa on arrival',
      priority: 'high',
      offsetDays: -45,
      description: joinSentences(
        `${who} can get either an e-Visa or a visa on arrival for ${dest}${stay}`,
        notes,
        'An e-Visa usually saves time at the border, so check the official site for current options'
      ),
    },
    voa: {
      title: 'Prepare for your visa on arrival',
      priority: 'high',
      offsetDays: -21,
      description: joinSentences(
        `${who} can get a visa on arrival in ${dest}${stay}`,
        notes,
        'Have your passport, a photo, proof of your plans, and a way to pay the fee ready'
      ),
    },
    visa_required: {
      title: `Apply for your ${dest} visa before you travel`,
      priority: 'high',
      offsetDays: -90,
      description: joinSentences(
        `${who} need a visa in advance to visit ${dest}${stay}`,
        notes,
        'Start early, as visa processing can take weeks'
      ),
    },
    admission_refused: {
      title: `Check entry restrictions for ${dest} before you plan`,
      priority: 'high',
      offsetDays: -120,
      description: joinSentences(
        `Entry to ${dest} is listed as refused for ${ctx.passportName ? `${ctx.passportName} passport holders` : 'your passport'}`,
        notes,
        `Contact the ${dest} embassy or consulate before you book anything`
      ),
    },
    special_privilege: {
      title: 'Review your special entry arrangements',
      priority: 'medium',
      offsetDays: -30,
      description: joinSentences(
        `${who} have special entry arrangements for ${dest}${stay}`,
        notes,
        'Check the official government website for how they apply to your trip'
      ),
    },
  };

  const known = byType[type];
  const entryItem = known
    ? { key: `visa-entry-${type}`, category: CATEGORIES.VISA, ...known }
    : {
        key: 'visa-entry-confirm',
        category: CATEGORIES.VISA,
        title: `Confirm entry requirements for ${dest}`,
        priority: 'high',
        offsetDays: -90,
        description: joinSentences(
          `Entry rules for your passport are not in the Rootless data yet. Check the official ${dest} government website to see whether you need a visa or an electronic travel authorization`,
          'Note the fees, processing times, and how long you may stay'
        ),
      };

  const stayItem = {
    key: 'visa-stay-limit',
    category: CATEGORIES.VISA,
    title: 'Note your maximum stay',
    priority: 'medium',
    offsetDays: -14,
    description:
      requirement && requirement.maxStayDays
        ? joinSentences(
            `You may stay up to ${requirement.maxStayDays} days in ${dest} on this basis`,
            'Write down your arrival date and your latest departure date so you do not overstay'
          )
        : joinSentences(
            `Find out how long you may stay in ${dest}`,
            'Write down your arrival date and your latest departure date so you do not overstay'
          ),
  };

  return [entryItem, stayItem];
}

/**
 * Builds the visa application items for one visa program (for example the
 * UK Student Visa). Student applications start earlier than tourist ones.
 */
function programItems(program, visaType, destinationName) {
  const student = visaType === VISA_TYPES.STUDENT;
  const offsets = student
    ? { eligibility: -150, documents: -135, fees: -130, apply: -120, track: -75, validity: -14 }
    : { eligibility: -90, documents: -75, fees: -75, apply: -60, track: -30, validity: -14 };
  const prefix = `visa-${program.key}`;
  const verified = program.lastVerified
    ? `This information was last verified on ${program.lastVerified}, so check the official page for the latest.`
    : '';

  const items = [];

  if (program.eligibilityCriteria.length) {
    items.push({
      key: `${prefix}-eligibility`,
      category: CATEGORIES.VISA,
      title: `Check you meet the ${program.name} requirements`,
      priority: 'high',
      offsetDays: offsets.eligibility,
      description: `Requirements for the ${program.name} for ${destinationName}: ${program.eligibilityCriteria
        .map((c) => c.trim().replace(/[.;]+$/, ''))
        .join('; ')}.`,
    });
  }

  if (program.requiredDocuments.length) {
    items.push({
      key: `${prefix}-documents`,
      category: CATEGORIES.VISA,
      title: `Gather your ${program.name} documents`,
      priority: 'high',
      offsetDays: offsets.documents,
      description: `Documents needed: ${program.requiredDocuments
        .map((d) => d.trim().replace(/[.;]+$/, ''))
        .join('; ')}.`,
    });
  }

  if (program.fees) {
    items.push({
      key: `${prefix}-fees`,
      category: CATEGORIES.FINANCE,
      title: `Budget for ${program.name} fees`,
      priority: 'medium',
      offsetDays: offsets.fees,
      description: joinSentences(`Fees: ${program.fees}`, verified),
    });
  }

  items.push({
    key: `${prefix}-apply`,
    category: CATEGORIES.VISA,
    title: `Submit your ${program.name} application`,
    priority: 'high',
    offsetDays: offsets.apply,
    description: joinSentences(
      program.sourceUrl
        ? `Apply through the official page: ${program.sourceUrl}`
        : 'Apply through the official government site',
      program.processingTime ? `Processing time: ${program.processingTime}` : '',
      'Keep a copy of your confirmation'
    ),
  });

  items.push({
    key: `${prefix}-track`,
    category: CATEGORIES.VISA,
    title: 'Track your application and respond to requests',
    priority: 'medium',
    offsetDays: offsets.track,
    description:
      'Check your application status and respond quickly to any request for extra documents, biometrics, or an interview.',
  });

  items.push({
    key: `${prefix}-validity`,
    category: CATEGORIES.VISA,
    title: `Check your ${program.name} approval and validity`,
    priority: 'medium',
    offsetDays: offsets.validity,
    description: joinSentences(
      'Once approved, confirm that your name, passport number, and dates are correct',
      program.validityDuration ? `Validity: ${program.validityDuration}` : ''
    ),
  });

  return items;
}

/**
 * Picks the visa specific template items for a profile context.
 *
 * ctx: { visaType, destinationIso2, destinationName, passportIso2, passportName }
 */
function visaItemsFor(ctx, data) {
  const category = ctx.visaType === VISA_TYPES.STUDENT ? 'student' : 'tourist_visitor';
  const destPrograms = ((data.programs || {})[ctx.destinationIso2] || {})[category] || [];
  const programs = destPrograms.flatMap((program) =>
    programItems(program, ctx.visaType, ctx.destinationName)
  );

  if (ctx.visaType === VISA_TYPES.STUDENT) {
    return programs.length ? programs : STUDENT_GENERIC_VISA_ITEMS;
  }

  const requirement = getEntryRequirement(ctx.passportIso2, ctx.destinationIso2, data);
  const entry = entryRequirementItems(requirement, ctx);

  // A visa application is only needed when the rules say so, or are unknown.
  const type = requirement ? requirement.requirementType : 'unknown';
  const needsApplication = type === 'visa_required' || !requirement;
  if (!needsApplication) {
    return entry;
  }
  return [...entry, ...(programs.length ? programs : TOURIST_GENERIC_VISA_ITEMS)];
}

module.exports = {
  resolveCountry,
  getEntryRequirement,
  entryRequirementItems,
  programItems,
  visaItemsFor,
};
