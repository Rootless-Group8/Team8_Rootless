const request = require('supertest');
const express = require('express');
const rankingRoutes = require('../rankingRoutes');
const eligibilityRoutes = require('../eligibilityRoutes');
const { data, makeDb } = require('./rankingFixtures');

function buildApp(db) {
  const app = express();
  // Same mount order as app.js.
  app.use('/api/eligibility/v2', rankingRoutes(db));
  app.use('/api/eligibility', eligibilityRoutes(db));
  return app;
}

const app = buildApp(makeDb(data));

describe('GET /api/eligibility/v2', () => {
  test('200 with ranked results', async () => {
    const res = await request(app)
      .get('/api/eligibility/v2')
      .query({ citizenship: 'IN', destination: 'TT', purpose: 'tourism', arrivalDate: '2099-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.results.map((r) => r.id)).toEqual([
      'fast_visa',
      'fast_visa_slower_min',
      'slow_visa',
      'unknown_time_visa',
    ]);
    expect(res.body.results[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        score: 1,
        breakdown: expect.objectContaining({ met: expect.any(Array), notMet: [], unknown: expect.any(Array) }),
      }),
    );
  });

  test('200 with an empty list and message when nothing matches', async () => {
    const res = await request(app)
      .get('/api/eligibility/v2')
      .query({ citizenship: 'IN', destination: 'DE', purpose: 'study' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('no_match');
    expect(res.body.results).toEqual([]);
    expect(res.body.message).toEqual(expect.any(String));
  });

  test('400 when citizenship is missing', async () => {
    const res = await request(app).get('/api/eligibility/v2').query({ destination: 'GB', purpose: 'tourism' });
    expect(res.status).toBe(400);
    expect(res.body.errors.citizenship).toMatch(/required/);
  });

  test('400 for an unknown country', async () => {
    const res = await request(app)
      .get('/api/eligibility/v2')
      .query({ citizenship: 'IN', destination: 'ZZ', purpose: 'tourism' });
    expect(res.status).toBe(400);
    expect(res.body.errors.destination).toMatch(/isn't a recognized country code/);
  });

  test('400 for an unsupported purpose', async () => {
    const res = await request(app)
      .get('/api/eligibility/v2')
      .query({ citizenship: 'IN', destination: 'GB', purpose: 'work' });
    expect(res.status).toBe(400);
    expect(res.body.errors.purpose).toMatch(/Use tourism or study/);
  });

  test('500 without leaking details when the database fails', async () => {
    const failing = buildApp({
      ref: () => ({ once: async () => { throw new Error('db down'); } }),
    });
    const res = await request(failing)
      .get('/api/eligibility/v2')
      .query({ citizenship: 'IN', destination: 'GB', purpose: 'tourism' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ status: 'error', message: 'Something went wrong.', results: [] });
  });

  test('v1 route still responds alongside v2', async () => {
    const res = await request(app)
      .get('/api/eligibility')
      .query({ passport: 'IN', destination: 'GB', purpose: 'work' });
    expect(res.status).toBe(200);
    expect(res.body.visas.map((v) => v.id)).toEqual(['skilled_worker_visa']);
  });
});
