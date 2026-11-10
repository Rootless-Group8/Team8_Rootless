'use strict';

const express = require('express');
const request = require('supertest');

// The real verifyFirebaseToken is covered by the Sprint 2 auth tests. Here it
// is replaced with a stand-in (same as the Sprint 6 notification tests) that
// rejects requests without a Bearer token. It also rejects any token other
// than "valid-token" so the invalid token path can be tested.
jest.mock('../middleware/authMiddleware', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required.',
      });
    }
    if (header.slice(7) !== 'valid-token') {
      return res.status(401).json({
        error: 'token_invalid',
        message: 'Invalid or expired authentication token.',
      });
    }
    req.firebaseUser = { uid: 'test-user' };
    return next();
  },
}));

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: jest.fn(),
}));

const createCostOfLivingRoutes = require('../routes/costOfLivingRoutes');
const costOfLivingService = require('../services/costOfLivingService');

// Mocked Realtime Database handle, passed in the same way app.js passes db to
// eligibilityRoutes. once and ref are jest.fn so calls can be counted.
const mockOnce = jest.fn();
const mockRef = jest.fn(() => ({ once: mockOnce }));
const db = { ref: mockRef };

const FIXTURE = {
  canada: {
    name: 'Canada',
    currency: 'CAD',
    lastUpdated: '2026-10-27',
    monthly: { housing: 2100, groceries: 450, transport: 130, utilities: 180, diningOut: 300 },
  },
  uk: {
    name: 'UK',
    currency: 'GBP',
    lastUpdated: '2026-10-27',
    monthly: { housing: 1300, groceries: 300, transport: 100, utilities: 190, diningOut: 220 },
  },
  'new-zealand': {
    name: 'New Zealand',
    currency: 'NZD',
    lastUpdated: '2026-10-27',
    monthly: { housing: 2300, groceries: 550, transport: 180, utilities: 250, diningOut: 300 },
  },
};

function snapshotOf(value) {
  return { val: () => value, exists: () => value !== null };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cost-of-living', createCostOfLivingRoutes(db));
  return app;
}

const AUTH = { Authorization: 'Bearer valid-token' };

describe('Cost of living API', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    costOfLivingService.clearCache();
    mockOnce.mockResolvedValue(snapshotOf(FIXTURE));
    app = buildApp();
  });

  test('returns the record for a supported location', async () => {
    const res = await request(app).get('/api/cost-of-living/canada').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      location: 'Canada',
      slug: 'canada',
      currency: 'CAD',
      lastUpdated: '2026-10-27',
      monthlyEstimates: { housing: 2100, groceries: 450, transport: 130, utilities: 180, diningOut: 300 },
    });
  });

  test('lookup is case insensitive and handles multi word names', async () => {
    const upper = await request(app).get('/api/cost-of-living/CANADA').set(AUTH);
    const mixed = await request(app).get('/api/cost-of-living/New%20Zealand').set(AUTH);
    const uk = await request(app).get('/api/cost-of-living/uK').set(AUTH);
    expect(upper.status).toBe(200);
    expect(upper.body.location).toBe('Canada');
    expect(mixed.status).toBe(200);
    expect(mixed.body.location).toBe('New Zealand');
    expect(uk.status).toBe(200);
    expect(uk.body.currency).toBe('GBP');
  });

  test('aliases resolve to the stored slug', async () => {
    const res = await request(app).get('/api/cost-of-living/United%20Kingdom').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('uk');
  });

  test('list endpoint returns all supported locations', async () => {
    const res = await request(app).get('/api/cost-of-living').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.locations).toEqual([
      { name: 'Canada', slug: 'canada', currency: 'CAD' },
      { name: 'New Zealand', slug: 'new-zealand', currency: 'NZD' },
      { name: 'UK', slug: 'uk', currency: 'GBP' },
    ]);
  });

  test('unsupported location returns 404 with a clear message', async () => {
    const res = await request(app).get('/api/cost-of-living/atlantis').set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('location_not_found');
    expect(res.body.message).toMatch(/atlantis/i);
  });

  test('missing token returns 401 and never touches the database', async () => {
    const res = await request(app).get('/api/cost-of-living/canada');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('missing_token');
    expect(mockOnce).not.toHaveBeenCalled();
  });

  test('invalid token returns 401', async () => {
    const res = await request(app).get('/api/cost-of-living/canada').set({ Authorization: 'Bearer nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('token_invalid');
    expect(mockOnce).not.toHaveBeenCalled();
  });

  test('repeated requests are served from the in-memory cache', async () => {
    await request(app).get('/api/cost-of-living/canada').set(AUTH);
    await request(app).get('/api/cost-of-living/canada').set(AUTH);
    await request(app).get('/api/cost-of-living/uk').set(AUTH);
    await request(app).get('/api/cost-of-living').set(AUTH);
    expect(mockOnce).toHaveBeenCalledTimes(1);
    expect(mockRef).toHaveBeenCalledWith('costOfLivingEstimates');
  });

  test('missing database node returns the handled not found response', async () => {
    mockOnce.mockResolvedValue(snapshotOf(null));
    const one = await request(app).get('/api/cost-of-living/canada').set(AUTH);
    const list = await request(app).get('/api/cost-of-living').set(AUTH);
    expect(one.status).toBe(404);
    expect(one.body.error).toBe('cost_of_living_data_not_found');
    expect(list.status).toBe(404);
  });

  test('missing node is not cached, so seeding fixes it without a restart', async () => {
    mockOnce.mockResolvedValueOnce(snapshotOf(null));
    const first = await request(app).get('/api/cost-of-living/canada').set(AUTH);
    const second = await request(app).get('/api/cost-of-living/canada').set(AUTH);
    expect(first.status).toBe(404);
    expect(second.status).toBe(200);
  });

  test('database failure returns a handled 500 and the server keeps working', async () => {
    mockOnce.mockRejectedValueOnce(new Error('database offline'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await request(app).get('/api/cost-of-living/canada').set(AUTH);
    const recovered = await request(app).get('/api/cost-of-living/canada').set(AUTH);
    spy.mockRestore();
    expect(failed.status).toBe(500);
    expect(failed.body.error).toBe('cost_of_living_unavailable');
    expect(recovered.status).toBe(200);
  });
});
