const express = require('express');
const request = require('supertest');

// Mock the auth middleware so route tests don't depend on real Firebase
// token verification. Sprint 2's authMiddleware.test.js already covers
// token verification itself.
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

jest.mock('../services/profileService');

const {
  getProfile,
  updateProfile,
  validateProfilePayload,
} = require('../services/profileService');
const profileRoutes = require('../routes/profileRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/profile', profileRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/profile', () => {
  test('returns 401 when no valid token is provided', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/profile');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('missing_token');
    expect(getProfile).not.toHaveBeenCalled();
  });

  test('returns the profile for an authenticated user', async () => {
    getProfile.mockResolvedValueOnce({ firstName: 'Bridgette', destinationCountry: 'Portugal' });
    const app = buildApp();

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({ firstName: 'Bridgette', destinationCountry: 'Portugal' });
    expect(getProfile).toHaveBeenCalledWith('test-uid-123');
  });

  test('returns null profile when the user has not set one up yet', async () => {
    getProfile.mockResolvedValueOnce(null);
    const app = buildApp();

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
  });

  test('returns 500 when the profile fetch fails unexpectedly', async () => {
    getProfile.mockRejectedValueOnce(new Error('firestore unavailable'));
    const app = buildApp();

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('profile_fetch_failed');
  });
});

describe('PATCH /api/profile', () => {
  test('returns 401 when no valid token is provided', async () => {
    const app = buildApp();
    const res = await request(app).patch('/api/profile').send({ firstName: 'Bridgette' });

    expect(res.status).toBe(401);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  test('updates the profile with a valid payload', async () => {
    validateProfilePayload.mockReturnValueOnce({});
    updateProfile.mockResolvedValueOnce({ destinationCountry: 'Canada' });
    const app = buildApp();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ destinationCountry: 'Canada' });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({ destinationCountry: 'Canada' });
    expect(updateProfile).toHaveBeenCalledWith('test-uid-123', { destinationCountry: 'Canada' });
  });

  test('returns 400 when the payload fails validation', async () => {
    validateProfilePayload.mockReturnValueOnce({
      relocationGoal: 'Relocation goal must be one of the allowed values.',
    });
    const app = buildApp();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ relocationGoal: 'vacation' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
    expect(res.body.fields.relocationGoal).toBeDefined();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  test('returns 400 when the request body is empty', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('empty_payload');
  });

  test('creates a profile via upsert when the user has none yet', async () => {
    validateProfilePayload.mockReturnValueOnce({});
    updateProfile.mockResolvedValueOnce({ firstName: 'New', lastName: 'User' });
    const app = buildApp();

    const res = await request(app)
      .patch('/api/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'New', lastName: 'User' });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({ firstName: 'New', lastName: 'User' });
  });
});

describe('PUT /api/profile', () => {
  test('behaves the same as PATCH for a valid payload', async () => {
    validateProfilePayload.mockReturnValueOnce({});
    updateProfile.mockResolvedValueOnce({ plannedArrivalDate: '2027-01-01' });
    const app = buildApp();

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ plannedArrivalDate: '2027-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({ plannedArrivalDate: '2027-01-01' });
  });

  test('returns 401 when no valid token is provided', async () => {
    const app = buildApp();
    const res = await request(app).put('/api/profile').send({ firstName: 'Bridgette' });

    expect(res.status).toBe(401);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
