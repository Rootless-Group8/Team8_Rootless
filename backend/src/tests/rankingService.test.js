const { getRankedVisas } = require('../rankingService');
const { data, makeDb, NOW } = require('./rankingFixtures');

const db = makeDb(data);
const rank = (input) => getRankedVisas(db, input, { now: NOW });

describe('getRankedVisas', () => {
  describe('normal case', () => {
    test('GB tourism returns only the tourist visa with score and breakdown', async () => {
      const res = await rank({ citizenship: 'in', destination: 'gb', purpose: 'tourism', arrivalDate: '2027-01-15' });

      expect(res.status).toBe('ok');
      expect(res.citizenship).toBe('IN');
      expect(res.destination).toBe('GB');
      expect(res.entryRule).toEqual({ requirement: 'visa_required' });
      expect(res.results.map((r) => r.id)).toEqual(['standard_visitor_visa']);

      const [visa] = res.results;
      expect(visa.rank).toBe(1);
      expect(visa.score).toBe(1);
      expect(visa.totalCriteria).toBe(2);
      expect(visa.processingTime).toEqual({ minDays: 21, maxDays: 21 });
      expect(visa.breakdown.met.map((c) => c.criterion)).toEqual([
        'Visa can be processed before your planned arrival date',
      ]);
      expect(visa.breakdown.notMet).toEqual([]);
      expect(visa.breakdown.unknown.map((c) => c.criterion)).toEqual([
        'Show you will leave the UK at the end of your visit',
      ]);
    });

    test('accepts profile relocationGoal values as purpose', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'student' });
      expect(res.results.map((r) => r.id)).toEqual(['student_visa']);
    });

    test('work programs are never returned', async () => {
      const tourism = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'tourism' });
      const study = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'study' });
      const ids = [...tourism.results, ...study.results].map((r) => r.id);
      expect(ids).not.toContain('skilled_worker_visa');
    });

    test('main-destination criterion is evaluated as met', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'DE', purpose: 'tourism' });
      const [visa] = res.results;
      expect(visa.breakdown.met.map((c) => c.criterion)).toEqual([
        'Germany must be your sole or main destination for a German mission to handle your application',
      ]);
      expect(visa.score).toBe(1);
    });

    test('arrival date sooner than minimum processing time is not met', async () => {
      // 10 days from NOW; GB visitor visa takes at least 21.
      const res = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'tourism', arrivalDate: '2026-11-11' });
      const [visa] = res.results;
      expect(visa.score).toBe(0);
      expect(visa.breakdown.notMet).toHaveLength(1);
      expect(visa.breakdown.notMet[0].reason).toMatch(/at least 21 days/);
    });

    test('arrival date inside the processing range is flagged, not scored', async () => {
      // 30 days from NOW; GB student visa takes 21 to 56.
      const res = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'study', arrivalDate: '2026-12-01' });
      const timing = res.results[0].breakdown.unknown.find((c) => c.criterion.startsWith('Visa can be processed'));
      expect(timing.reason).toMatch(/21 to 56 days/);
      expect(res.results[0].score).toBe(0);
    });
  });

  describe('ties', () => {
    test('equal scores are broken by max days, then min days, unknown processing time last', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'TT', purpose: 'tourism' });
      expect(res.results.map((r) => r.score)).toEqual([0, 0, 0, 0]);
      expect(res.results.map((r) => r.id)).toEqual([
        'fast_visa',
        'fast_visa_slower_min',
        'slow_visa',
        'unknown_time_visa',
      ]);
      expect(res.results.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    });

    test('a higher score beats a shorter processing time', async () => {
      // 40 days out: fast visas (max 20) are met; slow (max 60) is only "may be tight".
      const res = await rank({ citizenship: 'IN', destination: 'TT', purpose: 'tourism', arrivalDate: '2026-12-11' });
      expect(res.results.map((r) => [r.id, r.score])).toEqual([
        ['fast_visa', 1],
        ['fast_visa_slower_min', 1],
        ['slow_visa', 0],
        ['unknown_time_visa', 0],
      ]);
    });
  });

  describe('no match', () => {
    test('destination with no programs for the purpose returns an empty list with a message', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'DE', purpose: 'study' });
      expect(res.status).toBe('no_match');
      expect(res.results).toEqual([]);
      expect(res.message).toMatch(/study visas for DE/);
    });

    test('known country with no visa data at all returns no_match', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'NV', purpose: 'tourism' });
      expect(res.status).toBe('no_match');
      expect(res.results).toEqual([]);
    });

    test('citizen of the destination gets no_visa_needed', async () => {
      const res = await rank({ citizenship: 'GB', destination: 'GB', purpose: 'tourism' });
      expect(res.status).toBe('no_visa_needed');
      expect(res.results).toEqual([]);
    });
  });

  describe('unevaluable criteria', () => {
    test('free-text criteria are flagged as unknown and do not count either way', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'study', arrivalDate: '2027-06-01' });
      const [visa] = res.results;

      expect(visa.breakdown.unknown.map((c) => c.criterion)).toEqual([
        'Be 16 or over',
        'Meet the required knowledge of English',
      ]);
      visa.breakdown.unknown.forEach((c) => expect(c.reason).toMatch(/confirm/i));
      expect(visa.breakdown.notMet).toEqual([]);
      // Only the derived processing-time check is met.
      expect(visa.score).toBe(1);
      expect(visa.totalCriteria).toBe(3);
    });

    test('processing time is unknown without an arrival date', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'tourism' });
      const timing = res.results[0].breakdown.unknown.find((c) => c.criterion.startsWith('Visa can be processed'));
      expect(timing.reason).toBe('No arrival date given.');
    });

    test('processing time is unknown when the program has no structured days', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'TT', purpose: 'tourism', arrivalDate: '2027-06-01' });
      const visa = res.results.find((r) => r.id === 'unknown_time_visa');
      const timing = visa.breakdown.unknown.find((c) => c.criterion.startsWith('Visa can be processed'));
      expect(timing.reason).toMatch(/No published processing time/);
    });
  });

  describe('bad input', () => {
    test.each([
      [{ destination: 'GB', purpose: 'tourism' }, 'citizenship', /required/],
      [{ citizenship: 'IN', purpose: 'tourism' }, 'destination', /required/],
      [{ citizenship: 'IN', destination: 'GB' }, 'purpose', /required/],
      [{ citizenship: 'IN', destination: 'GB', purpose: 'work' }, 'purpose', /Unsupported purpose "work"/],
      [{ citizenship: 'XX', destination: 'GB', purpose: 'tourism' }, 'citizenship', /"XX" isn't a recognized/],
      [{ citizenship: 'IN', destination: 'ZZ', purpose: 'tourism' }, 'destination', /"ZZ" isn't a recognized/],
      [{ citizenship: 'IN', destination: 'GB', purpose: 'tourism', arrivalDate: '15/01/2027' }, 'arrivalDate', /YYYY-MM-DD/],
      [{ citizenship: 'IN', destination: 'GB', purpose: 'tourism', arrivalDate: '2027-02-30' }, 'arrivalDate', /YYYY-MM-DD/],
      [{ citizenship: 'IN', destination: 'GB', purpose: 'tourism', arrivalDate: '2026-10-31' }, 'arrivalDate', /past/],
    ])('%j is rejected on %s', async (input, field, message) => {
      const res = await rank(input);
      expect(res.status).toBe('invalid_input');
      expect(res.errors[field]).toMatch(message);
      expect(res.message).toMatch(message);
      expect(res.results).toEqual([]);
    });

    test('reports every missing field at once', async () => {
      const res = await rank({});
      expect(Object.keys(res.errors).sort()).toEqual(['citizenship', 'destination', 'purpose']);
    });

    test('arrival date of today is allowed', async () => {
      const res = await rank({ citizenship: 'IN', destination: 'GB', purpose: 'tourism', arrivalDate: '2026-11-01' });
      expect(res.status).toBe('ok');
    });
  });
});
