const { getEligibleVisas } = require('./eligibilityService');

const data = {
  countries: { IN: { name: 'India' }, US: { name: 'United States' } },
  countryVisaPrograms: {
    CA: {
      study_permit: {
        name: 'Study Permit',
        category: 'student',
        fees: 'CAD $150',
        processingTime: 'Varies',
        validityDuration: 'Program length + 90 days',
        sourceUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html',
        eligibilityCriteria: ['Have an acceptance letter from a DLI'],
      },
      visitor_visa: {
        name: 'Visitor Visa (Temporary Resident Visa)',
        category: 'tourist_visitor',
        fees: 'CAD $100',
        processingTime: 'Varies',
        validityDuration: 'Up to 10 years',
        sourceUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/visitor-visa.html',
        eligibilityCriteria: ['Hold a valid passport'],
      },
    },
    GB: {
      skilled_worker_visa: {
        name: 'Skilled Worker Visa',
        category: 'work',
        fees: 'Varies',
        processingTime: '3 weeks',
        validityDuration: 'Up to 5 years',
        sourceUrl: 'https://www.gov.uk/skilled-worker-visa',
        eligibilityCriteria: ['Job offer from a licensed sponsor'],
      },
      standard_visitor_visa: {
        name: 'Standard Visitor Visa',
        category: 'tourist_visitor',
        fees: '£135',
        processingTime: '3 weeks',
        validityDuration: 'Up to 6 months',
        sourceUrl: 'https://www.gov.uk/standard-visitor',
        eligibilityCriteria: ['Valid passport'],
      },
    },
  },
};

function makeDb(d) {
  return {
    ref: (path) => ({
      once: async () => {
        const val = path.split('/').reduce((o, k) => (o ? o[k] : undefined), d);
        return { val: () => (val === undefined ? null : val), exists: () => val != null };
      },
    }),
  };
}

const db = makeDb(data);

describe('getEligibleVisas', () => {
  test('CA: returns all visa types with full fields', async () => {
    const res = await getEligibleVisas(db, 'IN', 'CA');
    expect(res.status).toBe('ok');
    expect(res.visas.map((v) => v.id).sort()).toEqual(['study_permit', 'visitor_visa']);
    expect(res.visas[0]).toHaveProperty('sourceUrl');
    expect(res.visas[0]).toHaveProperty('eligibilityCriteria');
  });

  test('CA: study purpose returns only the study permit', async () => {
    const res = await getEligibleVisas(db, 'IN', 'CA', 'study');
    expect(res.visas.map((v) => v.id)).toEqual(['study_permit']);
  });

  test('GB: work purpose returns only the skilled worker visa', async () => {
    const res = await getEligibleVisas(db, 'IN', 'GB', 'work');
    expect(res.visas.map((v) => v.id)).toEqual(['skilled_worker_visa']);
  });

  test('destination with no data returns no_data', async () => {
    const res = await getEligibleVisas(db, 'IN', 'ZZ');
    expect(res.status).toBe('no_data');
    expect(res.visas).toEqual([]);
  });

  test('unknown passport code returns unknown_passport', async () => {
    const res = await getEligibleVisas(db, 'XX', 'CA');
    expect(res.status).toBe('unknown_passport');
  });

  test('missing input returns invalid_input', async () => {
    const res = await getEligibleVisas(db, '', 'CA');
    expect(res.status).toBe('invalid_input');
  });
});
