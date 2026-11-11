// Shared mocked Realtime Database for the Matching Engine v2 tests.

const data = {
  countries: {
    IN: { name: 'India' },
    US: { name: 'United States' },
    GB: { name: 'United Kingdom' },
    DE: { name: 'Germany' },
    TT: { name: 'Tie Test Land' },
    NV: { name: 'No Visa Data Land' },
  },
  countryVisaPrograms: {
    GB: {
      standard_visitor_visa: {
        name: 'Standard Visitor Visa',
        category: 'tourist_visitor',
        processingTime: { minDays: 21, maxDays: 21 },
        fees: '£135',
        validityDuration: 'Up to 6 months',
        sourceUrl: 'https://www.gov.uk/standard-visitor',
        eligibilityCriteria: ['Show you will leave the UK at the end of your visit'],
      },
      student_visa: {
        name: 'Student Visa',
        category: 'student',
        processingTime: { minDays: 21, maxDays: 56 },
        fees: '£524',
        validityDuration: 'Length of course',
        sourceUrl: 'https://www.gov.uk/student-visa',
        eligibilityCriteria: ['Be 16 or over', 'Meet the required knowledge of English'],
      },
      skilled_worker_visa: {
        name: 'Skilled Worker Visa',
        category: 'work',
        processingTime: { minDays: 21, maxDays: 56 },
        fees: 'Varies',
        validityDuration: 'Up to 5 years',
        sourceUrl: 'https://www.gov.uk/skilled-worker-visa',
        eligibilityCriteria: ['Job offer from a licensed sponsor'],
      },
    },
    DE: {
      schengen_visitor_visa: {
        name: 'Schengen Visitor Visa',
        category: 'tourist_visitor',
        processingTime: { minDays: 15, maxDays: 15 },
        fees: '€90',
        validityDuration: 'Up to 90 days',
        sourceUrl: 'https://www.auswaertiges-amt.de/en/visa-service',
        eligibilityCriteria: [
          'Germany must be your sole or main destination for a German mission to handle your application',
          'Show you can pay for your stay and your return journey',
        ],
      },
    },
    // Three tourist programs with the same score, differing only in processing time.
    TT: {
      slow_visa: {
        name: 'Slow Visa',
        category: 'tourist_visitor',
        processingTime: { minDays: 10, maxDays: 60 },
        eligibilityCriteria: ['Hold a valid passport'],
      },
      unknown_time_visa: {
        name: 'Unknown Time Visa',
        category: 'tourist_visitor',
        processingTime: { minDays: null, maxDays: null },
        eligibilityCriteria: ['Hold a valid passport'],
      },
      fast_visa: {
        name: 'Fast Visa',
        category: 'tourist_visitor',
        processingTime: { minDays: 5, maxDays: 20 },
        eligibilityCriteria: ['Hold a valid passport'],
      },
      fast_visa_slower_min: {
        name: 'Fast Visa (slower minimum)',
        category: 'tourist_visitor',
        processingTime: { minDays: 15, maxDays: 20 },
        eligibilityCriteria: ['Hold a valid passport'],
      },
    },
  },
  visaRequirements: {
    IN: { GB: { requirement: 'visa_required' } },
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

// Fixed "today" so arrival-date checks are deterministic.
const NOW = new Date('2026-11-01T15:30:00Z');

module.exports = { data, makeDb, NOW };
