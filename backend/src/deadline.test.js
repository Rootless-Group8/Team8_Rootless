const express = require('express');
const request = require('supertest');
const { getDeadlines, readProcessingDays } = require('./deadlineService');
const createDeadlineRoutes = require('./deadlineRoutes');

// Mocked Firebase, same style as eligibility.test.js. Processing times use the
// structured { minDays, maxDays } shape from the seed data (TM08-57). CA study_permit
// has no processingTime at all, like the real record (the source gives no number and
// Firebase drops nulls).
const data = {
  countryVisaPrograms: {
    CA: {
      visitor_visa: {
        name: 'Visitor Visa',
        processingTime: { minDays: 28, maxDays: 84 },
        processingTimeNotes: 'Roughly 4 to 12 weeks',
      },
      study_permit: { name: 'Study Permit', processingTimeNotes: 'Varies by country' },
    },
    GB: {
      standard_visitor_visa: {
        name: 'Standard Visitor Visa',
        processingTime: { minDays: 21, maxDays: 21 },
        processingTimeNotes: 'Usually within 3 weeks',
      },
      old_text_visa: { name: 'Old Text Visa', processingTime: '3 weeks' },
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
const NOW = new Date('2026-10-12T15:00:00Z');

describe('readProcessingDays', () => {
  test('reads a min/max range', () => {
    expect(readProcessingDays({ minDays: 28, maxDays: 84 })).toEqual({ minDays: 28, maxDays: 84 });
  });

  test('reads a range where min and max are the same', () => {
    expect(readProcessingDays({ minDays: 21, maxDays: 21 })).toEqual({ minDays: 21, maxDays: 21 });
  });

  test('uses maxDays for minDays when only maxDays is stored', () => {
    expect(readProcessingDays({ maxDays: 30 })).toEqual({ minDays: 30, maxDays: 30 });
  });

  test('returns null when there are no usable numbers', () => {
    expect(readProcessingDays(undefined)).toBeNull();
    expect(readProcessingDays(null)).toBeNull();
    expect(readProcessingDays({})).toBeNull();
    expect(readProcessingDays({ minDays: 10 })).toBeNull();
    expect(readProcessingDays({ minDays: 10, maxDays: 'soon' })).toBeNull();
    expect(readProcessingDays({ minDays: 1, maxDays: -5 })).toBeNull();
    expect(readProcessingDays({ minDays: 1, maxDays: 2.5 })).toBeNull();
  });

  test('returns null when minDays is greater than maxDays', () => {
    expect(readProcessingDays({ minDays: 60, maxDays: 30 })).toBeNull();
  });

  test('no longer reads the old text format', () => {
    expect(readProcessingDays('4 to 12 weeks')).toBeNull();
  });
});

describe('getDeadlines', () => {
  test('works backward from the arrival date', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2027-03-01', country: 'CA', visaType: 'visitor_visa' },
      NOW
    );
    expect(result.deadlines).toEqual([{ name: 'Latest date to apply', date: '2026-12-07' }]);
    expect(result.warnings).toEqual([]);
    expect(result.arrivalDate).toBe('2027-03-01');
  });

  test('returns the min/max range and the source wording', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2027-03-01', country: 'CA', visaType: 'visitor_visa' },
      NOW
    );
    expect(result.processingTime).toEqual({ minDays: 28, maxDays: 84 });
    expect(result.processingTimeNotes).toBe('Roughly 4 to 12 weeks');
  });

  test('works when min and max are the same', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2027-03-01', country: 'GB', visaType: 'standard_visitor_visa' },
      NOW
    );
    expect(result.processingTime).toEqual({ minDays: 21, maxDays: 21 });
    expect(result.deadlines[0].date).toBe('2027-02-08');
  });

  test('flags it when arrival is sooner than the longest processing time', async () => {
    // 2026-12-01 is 50 days after NOW, and the CA visitor visa can take up to 84 days
    const result = await getDeadlines(
      db,
      { arrivalDate: '2026-12-01', country: 'CA', visaType: 'visitor_visa' },
      NOW
    );
    expect(result.deadlines[0].date).toBe('2026-09-08');
    expect(result.warnings[0]).toMatch(/already passed/);
  });

  test('accepts lowercase country and spaces in the visa type', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2027-03-01', country: ' gb ', visaType: 'Standard Visitor Visa' },
      NOW
    );
    expect(result.country).toBe('GB');
    expect(result.deadlines[0].date).toBe('2027-02-08');
  });

  test('flags it when the apply date has already passed', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2026-10-20', country: 'GB', visaType: 'standard_visitor_visa' },
      NOW
    );
    expect(result.deadlines[0].date).toBe('2026-09-29');
    expect(result.warnings[0]).toMatch(/already passed/);
  });

  test('gives no apply-by date when the visa has no processing time', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2027-03-01', country: 'CA', visaType: 'study_permit' },
      NOW
    );
    expect(result.deadlines).toEqual([]);
    expect(result.processingTime).toBeNull();
    expect(result.processingTimeNotes).toBe('Varies by country');
    expect(result.warnings[0]).toMatch(/Could not read the processing time/);
  });

  test('gives no apply-by date for an old text-only processing time', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2027-03-01', country: 'GB', visaType: 'old_text_visa' },
      NOW
    );
    expect(result.deadlines).toEqual([]);
    expect(result.processingTimeNotes).toBeNull();
    expect(result.warnings[0]).toMatch(/Could not read the processing time/);
  });

  test.each([
    ['missing arrival date', { country: 'CA', visaType: 'visitor_visa' }, 400],
    ['badly formatted arrival date', { arrivalDate: '03/01/2027', country: 'CA', visaType: 'visitor_visa' }, 400],
    ['arrival date in the past', { arrivalDate: '2026-10-01', country: 'CA', visaType: 'visitor_visa' }, 400],
    ['missing country', { arrivalDate: '2027-03-01', visaType: 'visitor_visa' }, 400],
    ['missing visa type', { arrivalDate: '2027-03-01', country: 'CA' }, 400],
    ['unknown country', { arrivalDate: '2027-03-01', country: 'ZZ', visaType: 'visitor_visa' }, 404],
    ['unknown visa type', { arrivalDate: '2027-03-01', country: 'CA', visaType: 'work_visa' }, 404],
  ])('throws the right status for %s', async (_label, input, status) => {
    await expect(getDeadlines(db, input, NOW)).rejects.toMatchObject({ status });
  });
});

describe('POST /api/deadlines', () => {
  function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/deadlines', createDeadlineRoutes(db));
    return app;
  }

  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  test('returns 200 with deadlines', async () => {
    const res = await request(makeApp())
      .post('/api/deadlines')
      .send({ arrivalDate: future, country: 'CA', visaType: 'visitor_visa' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.deadlines).toHaveLength(1);
    expect(res.body.deadlines[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.processingTime).toEqual({ minDays: 28, maxDays: 84 });
  });

  test('returns 400 for a missing arrival date', async () => {
    const res = await request(makeApp())
      .post('/api/deadlines')
      .send({ country: 'CA', visaType: 'visitor_visa' });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('invalid_input');
    expect(res.body.message).toMatch(/arrivalDate/);
  });

  test('returns 400 for a date that already passed', async () => {
    const res = await request(makeApp())
      .post('/api/deadlines')
      .send({ arrivalDate: '2020-01-01', country: 'CA', visaType: 'visitor_visa' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for an unknown country', async () => {
    const res = await request(makeApp())
      .post('/api/deadlines')
      .send({ arrivalDate: future, country: 'ZZ', visaType: 'visitor_visa' });
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('not_found');
  });

  test('returns 404 for an unknown visa type', async () => {
    const res = await request(makeApp())
      .post('/api/deadlines')
      .send({ arrivalDate: future, country: 'CA', visaType: 'work_visa' });
    expect(res.status).toBe(404);
  });
});
