const express = require('express');
const request = require('supertest');
const { getDeadlines, parseProcessingTime } = require('./deadlineService');
const createDeadlineRoutes = require('./deadlineRoutes');

// Mocked Firebase, same style as eligibility.test.js. CA visitor_visa uses a range
// here on purpose so the range parsing gets tested; study_permit is "Varies" like the real seed data.
const data = {
  countryVisaPrograms: {
    CA: {
      visitor_visa: { name: 'Visitor Visa', processingTime: '4 to 12 weeks' },
      study_permit: { name: 'Study Permit', processingTime: 'Varies' },
    },
    GB: {
      standard_visitor_visa: { name: 'Standard Visitor Visa', processingTime: '3 weeks' },
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

describe('parseProcessingTime', () => {
  test('uses the longest end of a range', () => {
    expect(parseProcessingTime('4 to 12 weeks')).toBe(84);
    expect(parseProcessingTime('2-3 months')).toBe(90);
  });

  test('reads a single value', () => {
    expect(parseProcessingTime('3 weeks')).toBe(21);
    expect(parseProcessingTime('15 days')).toBe(15);
  });

  test('returns null when it cannot read the text', () => {
    expect(parseProcessingTime('Varies')).toBeNull();
    expect(parseProcessingTime(undefined)).toBeNull();
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

  test('handles unreadable processing time without crashing', async () => {
    const result = await getDeadlines(
      db,
      { arrivalDate: '2027-03-01', country: 'CA', visaType: 'study_permit' },
      NOW
    );
    expect(result.deadlines).toEqual([]);
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
