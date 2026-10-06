const {
  resolveCountry,
  getEntryRequirement,
  entryRequirementItems,
  programItems,
} = require('../services/checklistRules');

const data = {
  countries: {
    US: { name: 'United States', iso3: 'USA' },
    GB: { name: 'United Kingdom', iso3: 'GBR' },
    NL: { name: 'Netherlands', iso3: 'NLD' },
    CA: { name: 'Canada', iso3: 'CAN' },
  },
  requirements: {
    US: { GB: { requirementType: 'eta', maxStayDays: 180, notes: 'ETA required.' } },
  },
};

describe('resolveCountry', () => {
  test('matches by name, ignoring case and spaces', () => {
    expect(resolveCountry('  canada ', data)).toEqual({ iso2: 'CA', name: 'Canada' });
  });

  test('matches by ISO2 and ISO3 code', () => {
    expect(resolveCountry('US', data).iso2).toBe('US');
    expect(resolveCountry('gb', data).iso2).toBe('GB');
    expect(resolveCountry('NLD', data).iso2).toBe('NL');
  });

  test('matches common aliases and demonyms', () => {
    expect(resolveCountry('USA', data).iso2).toBe('US');
    expect(resolveCountry('American', data).iso2).toBe('US');
    expect(resolveCountry('UK', data).iso2).toBe('GB');
    expect(resolveCountry('Holland', data).iso2).toBe('NL');
  });

  test('returns null for unknown, empty, or non-string values', () => {
    expect(resolveCountry('Narnia', data)).toBeNull();
    expect(resolveCountry('', data)).toBeNull();
    expect(resolveCountry(undefined, data)).toBeNull();
  });
});

describe('getEntryRequirement', () => {
  test('returns the rule for a passport and destination', () => {
    expect(getEntryRequirement('US', 'GB', data).requirementType).toBe('eta');
  });

  test('returns null when the passport or destination has no data', () => {
    expect(getEntryRequirement('CA', 'GB', data)).toBeNull();
    expect(getEntryRequirement('US', 'NL', data)).toBeNull();
    expect(getEntryRequirement(null, 'GB', data)).toBeNull();
  });
});

describe('entryRequirementItems', () => {
  const ctx = { destinationName: 'Japan', passportName: 'Canada' };
  const rule = (requirementType) => ({ requirementType, maxStayDays: 90, notes: '' });

  test.each([
    ['visa_free', 'medium'],
    ['eta', 'high'],
    ['evisa', 'high'],
    ['evisa_or_voa', 'high'],
    ['voa', 'high'],
    ['visa_required', 'high'],
    ['admission_refused', 'high'],
    ['special_privilege', 'medium'],
  ])('%s produces a %s priority entry item', (type, priority) => {
    const [entry] = entryRequirementItems(rule(type), ctx);
    expect(entry.id || entry.key).toBe(`visa-entry-${type}`);
    expect(entry.priority).toBe(priority);
    expect(entry.description).toContain('Japan');
  });

  test('visa required items are due earlier than visa free items', () => {
    const [required] = entryRequirementItems(rule('visa_required'), ctx);
    const [free] = entryRequirementItems(rule('visa_free'), ctx);
    expect(required.offsetDays).toBeLessThan(free.offsetDays);
  });

  test('missing data produces a confirm item', () => {
    const [entry, stay] = entryRequirementItems(null, ctx);
    expect(entry.key).toBe('visa-entry-confirm');
    expect(stay.key).toBe('visa-stay-limit');
  });

  test('descriptions end each sentence with a full stop', () => {
    const [entry] = entryRequirementItems(
      { requirementType: 'visa_free', maxStayDays: 30, notes: 'No trailing stop' },
      ctx
    );
    expect(entry.description).toContain('No trailing stop.');
  });
});

describe('programItems', () => {
  const program = {
    key: 'student_visa',
    name: 'Student Visa',
    eligibilityCriteria: ['Be 16 or over.'],
    requiredDocuments: ['Valid passport', 'CAS number'],
    fees: 'GBP 558',
    processingTime: '3 weeks',
    validityDuration: 'Up to 5 years',
    sourceUrl: 'https://example.gov/student',
    lastVerified: '2026-09-16',
  };

  test('builds eligibility, documents, fees, apply, track, and validity items', () => {
    const keys = programItems(program, 'student', 'United Kingdom').map((i) => i.key);
    expect(keys).toEqual([
      'visa-student_visa-eligibility',
      'visa-student_visa-documents',
      'visa-student_visa-fees',
      'visa-student_visa-apply',
      'visa-student_visa-track',
      'visa-student_visa-validity',
    ]);
  });

  test('includes the data in descriptions and the last verified date', () => {
    const items = programItems(program, 'student', 'United Kingdom');
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey['visa-student_visa-documents'].description).toContain('CAS number');
    expect(byKey['visa-student_visa-fees'].description).toContain('2026-09-16');
    expect(byKey['visa-student_visa-validity'].description).toContain('Up to 5 years');
  });

  test('skips sections that have no data', () => {
    const keys = programItems(
      { ...program, eligibilityCriteria: [], fees: '' },
      'student',
      'United Kingdom'
    ).map((i) => i.key);
    expect(keys).not.toContain('visa-student_visa-eligibility');
    expect(keys).not.toContain('visa-student_visa-fees');
  });
});
