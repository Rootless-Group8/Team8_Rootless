const express = require('express');
const request = require('supertest');

jest.mock('../config/firebaseAdmin', () => ({ initializeFirebaseAdmin: jest.fn() }));

jest.mock('../middleware/authMiddleware', () => ({
  verifyFirebaseToken: jest.fn((req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.firebaseUser = { uid: 'test-uid-123' };
      return next();
    }
    return res.status(401).json({
      error: 'missing_token',
      message: 'Authorization header must be "Bearer <Firebase ID token>".',
    });
  }),
}));

jest.mock('../services/lifeEventImpactService', () => ({
  getLifeEventImpacts: jest.fn(),
  previewLifeEventImpacts: jest.fn(),
}));

jest.mock('../services/lifeEventService', () => {
  const actual = jest.requireActual('../services/lifeEventService');
  return { ...actual, getLifeEvent: jest.fn(), listLifeEvents: jest.fn() };
});

const impactService = require('../services/lifeEventImpactService');
const lifeEventService = require('../services/lifeEventService');
const { LifeEventError } = lifeEventService;
const lifeEventImpactRoutes = require('../routes/lifeEventImpactRoutes');

const db = { ref: jest.fn() };
const app = express();
app.use(express.json());
app.use('/api/life-events/impacts', lifeEventImpactRoutes(db));

const AUTH = { Authorization: 'Bearer valid-token' };

const sampleImpact = {
  ruleId: 'renewal_needed',
  eventId: 'event-1',
  eventType: 'visa_expiry',
  severity: 'critical',
  message: 'student_visa, GB expires on 2027-01-15 and no renewal is planned. Start by 2026-12-02.',
  actionDate: '2026-12-02',
  relatedEventIds: [],
  details: {},
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authentication', () => {
  test.each([
    ['get', '/api/life-events/impacts'],
    ['post', '/api/life-events/impacts/preview'],
  ])('%s %s returns 401 without a token', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
    expect(impactService.getLifeEventImpacts).not.toHaveBeenCalled();
    expect(impactService.previewLifeEventImpacts).not.toHaveBeenCalled();
  });
});

describe('GET /api/life-events/impacts', () => {
  test('returns impacts for the UID from the token', async () => {
    impactService.getLifeEventImpacts.mockResolvedValueOnce({ impacts: [sampleImpact], count: 1 });

    const res = await request(app).get('/api/life-events/impacts').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ impacts: [sampleImpact], count: 1 });
    expect(impactService.getLifeEventImpacts).toHaveBeenCalledWith(db, 'test-uid-123');
  });

  test('returns an empty list when the user has no events', async () => {
    impactService.getLifeEventImpacts.mockResolvedValueOnce({ impacts: [], count: 0 });
    const res = await request(app).get('/api/life-events/impacts').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ impacts: [], count: 0 });
  });

  test('returns 500 without internals when the service fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    impactService.getLifeEventImpacts.mockRejectedValueOnce(new Error('Firestore exploded'));

    const res = await request(app).get('/api/life-events/impacts').set(AUTH);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong.' });
    spy.mockRestore();
  });
});

describe('POST /api/life-events/impacts/preview', () => {
  test('passes the body and UID to the preview and returns its result', async () => {
    const result = { event: { id: 'preview' }, impacts: [], introduced: [], resolved: [sampleImpact] };
    impactService.previewLifeEventImpacts.mockResolvedValueOnce(result);
    const body = { type: 'renewal', title: 'Renew', date: '2026-12-01' };

    const res = await request(app).post('/api/life-events/impacts/preview').set(AUTH).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(impactService.previewLifeEventImpacts).toHaveBeenCalledWith(db, 'test-uid-123', body);
  });

  test('returns 400 with details for an invalid event', async () => {
    impactService.previewLifeEventImpacts.mockRejectedValueOnce(
      new LifeEventError(400, 'invalid_life_event', 'The life event data is not valid.', ['type is required.'])
    );

    const res = await request(app).post('/api/life-events/impacts/preview').set(AUTH).send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_life_event',
      message: 'The life event data is not valid.',
      details: ['type is required.'],
    });
  });
});

describe('mounting in createApp', () => {
  test('/api/life-events/impacts reaches the impact router, not GET /api/life-events/:id', async () => {
    const { createApp } = require('../app');
    impactService.getLifeEventImpacts.mockResolvedValueOnce({ impacts: [], count: 0 });

    const res = await request(createApp({ db })).get('/api/life-events/impacts').set(AUTH);

    expect(res.status).toBe(200);
    expect(impactService.getLifeEventImpacts).toHaveBeenCalled();
    expect(lifeEventService.getLifeEvent).not.toHaveBeenCalled();
  });
});
