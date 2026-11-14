const express = require('express');
const request = require('supertest');

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: jest.fn(),
}));

// Keep the real MonitoringError so the route's error handling is exercised,
// and replace only the service functions. Nothing here runs a scrape.
jest.mock('../services/scraperService', () => {
  const actual = jest.requireActual('../services/scraperService');
  return {
    ...actual,
    runMonitoring: jest.fn(),
    listChanges: jest.fn(),
    markChangeReviewed: jest.fn(),
  };
});

const service = require('../services/scraperService');
const monitoringRoutes = require('../routes/monitoringRoutes');

const { MonitoringError } = service;

const app = express();
app.use(express.json());
app.use('/api/monitoring', monitoringRoutes);

const INTERNAL_KEY = 'test-internal-key';
const KEY_HEADER = { 'x-internal-api-key': INTERNAL_KEY };

const sampleChange = {
  id: 'c1',
  sourceId: 'uk-student-visa',
  status: 'pending_review',
  addedLines: ['new'],
  removedLines: ['old'],
};

let originalKey;

beforeAll(() => {
  originalKey = process.env.INTERNAL_API_KEY;
});

afterAll(() => {
  if (originalKey === undefined) {
    delete process.env.INTERNAL_API_KEY;
  } else {
    process.env.INTERNAL_API_KEY = originalKey;
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  // Route tests never reach the network.
  global.fetch = jest.fn(() => {
    throw new Error('Unexpected real fetch in tests');
  });
});

describe('authorization', () => {
  const endpoints = [
    ['post', '/api/monitoring/run'],
    ['get', '/api/monitoring/changes'],
    ['patch', '/api/monitoring/changes/c1'],
  ];

  function expectNoServiceCalls() {
    expect(service.runMonitoring).not.toHaveBeenCalled();
    expect(service.listChanges).not.toHaveBeenCalled();
    expect(service.markChangeReviewed).not.toHaveBeenCalled();
  }

  it.each(endpoints)('%s %s returns 403 without the internal key', async (method, url) => {
    const res = await request(app)[method](url);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expectNoServiceCalls();
  });

  it.each(endpoints)('%s %s returns 403 with the wrong internal key', async (method, url) => {
    const res = await request(app)[method](url).set('x-internal-api-key', 'wrong-key');

    expect(res.status).toBe(403);
    expectNoServiceCalls();
  });

  it.each(endpoints)('%s %s returns 403 when INTERNAL_API_KEY is not set', async (method, url) => {
    delete process.env.INTERNAL_API_KEY;

    const res = await request(app)[method](url).set(KEY_HEADER);

    expect(res.status).toBe(403);
    expectNoServiceCalls();
  });

  it('does not accept a Firebase bearer token instead of the key', async () => {
    const res = await request(app)
      .get('/api/monitoring/changes')
      .set('Authorization', 'Bearer some-user-token');

    expect(res.status).toBe(403);
    expectNoServiceCalls();
  });
});

describe('POST /api/monitoring/run', () => {
  it('runs now and returns the summary', async () => {
    const summary = {
      id: 'run-1',
      status: 'completed',
      counts: { baseline: 4, unchanged: 0, changed: 0, failed: 0 },
      results: [],
    };
    service.runMonitoring.mockResolvedValue(summary);

    const res = await request(app).post('/api/monitoring/run').set(KEY_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
    expect(service.runMonitoring).toHaveBeenCalledWith({ trigger: 'manual' });
  });

  it('returns 409 when a run is already in progress', async () => {
    service.runMonitoring.mockRejectedValue(
      new MonitoringError(409, 'run_in_progress', 'A monitoring run is already in progress.')
    );

    const res = await request(app).post('/api/monitoring/run').set(KEY_HEADER);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('run_in_progress');
  });

  it('hides unexpected errors behind a 500', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    service.runMonitoring.mockRejectedValue(new Error('firestore exploded'));

    const res = await request(app).post('/api/monitoring/run').set(KEY_HEADER);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong.' });
    console.error.mockRestore();
  });
});

describe('GET /api/monitoring/changes', () => {
  it('lists changes', async () => {
    service.listChanges.mockResolvedValue([sampleChange]);

    const res = await request(app).get('/api/monitoring/changes').set(KEY_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ changes: [sampleChange], count: 1 });
    expect(service.listChanges).toHaveBeenCalledWith({ status: undefined });
  });

  it('passes the status filter through', async () => {
    service.listChanges.mockResolvedValue([sampleChange]);

    await request(app).get('/api/monitoring/changes?status=pending_review').set(KEY_HEADER);

    expect(service.listChanges).toHaveBeenCalledWith({ status: 'pending_review' });
  });

  it('returns 400 for an invalid status', async () => {
    service.listChanges.mockRejectedValue(
      new MonitoringError(400, 'invalid_status', 'status must be one of: pending_review, reviewed.')
    );

    const res = await request(app).get('/api/monitoring/changes?status=bogus').set(KEY_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_status');
  });
});

describe('PATCH /api/monitoring/changes/:id', () => {
  it('marks the change as reviewed', async () => {
    const reviewed = { ...sampleChange, status: 'reviewed', reviewNote: 'Done' };
    service.markChangeReviewed.mockResolvedValue(reviewed);

    const res = await request(app)
      .patch('/api/monitoring/changes/c1')
      .set(KEY_HEADER)
      .send({ note: 'Done' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(reviewed);
    expect(service.markChangeReviewed).toHaveBeenCalledWith('c1', { note: 'Done' });
  });

  it('returns 404 for an unknown ID', async () => {
    service.markChangeReviewed.mockRejectedValue(
      new MonitoringError(404, 'change_not_found', 'Change record not found.')
    );

    const res = await request(app).patch('/api/monitoring/changes/nope').set(KEY_HEADER);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'change_not_found', message: 'Change record not found.' });
  });
});
