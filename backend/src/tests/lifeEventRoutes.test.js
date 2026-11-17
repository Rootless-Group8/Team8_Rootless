const express = require('express');
const request = require('supertest');

// Route tests do not depend on real Firebase. Token verification itself is
// covered by the Sprint 2 authMiddleware tests.
jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: jest.fn(),
}));

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

// Keep the real LifeEventError so the route's error handling is exercised,
// and replace only the service functions.
jest.mock('../services/lifeEventService', () => {
  const actual = jest.requireActual('../services/lifeEventService');
  return {
    ...actual,
    createLifeEvent: jest.fn(),
    listLifeEvents: jest.fn(),
    getLifeEvent: jest.fn(),
    updateLifeEvent: jest.fn(),
    deleteLifeEvent: jest.fn(),
  };
});

const service = require('../services/lifeEventService');
const lifeEventRoutes = require('../routes/lifeEventRoutes');

const app = express();
app.use(express.json());
app.use('/api/life-events', lifeEventRoutes);

const AUTH = { Authorization: 'Bearer valid-token' };

const sampleEvent = {
  id: 'event-1',
  type: 'visa_expiry',
  title: 'Student visa expires',
  date: '2026-12-01T00:00:00.000Z',
  status: 'upcoming',
  visaType: 'student',
  destinationCountry: 'Canada',
  notes: null,
  createdAt: '2026-11-03T12:00:00.000Z',
  updatedAt: '2026-11-03T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('authentication', () => {
  test.each([
    ['post', '/api/life-events'],
    ['get', '/api/life-events'],
    ['get', '/api/life-events/event-1'],
    ['patch', '/api/life-events/event-1'],
    ['delete', '/api/life-events/event-1'],
  ])('%s %s returns 401 without a token', async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(service.createLifeEvent).not.toHaveBeenCalled();
    expect(service.listLifeEvents).not.toHaveBeenCalled();
    expect(service.getLifeEvent).not.toHaveBeenCalled();
    expect(service.updateLifeEvent).not.toHaveBeenCalled();
    expect(service.deleteLifeEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/life-events', () => {
  test('creates an event for the UID from the token and returns 201', async () => {
    service.createLifeEvent.mockResolvedValueOnce(sampleEvent);

    const res = await request(app)
      .post('/api/life-events')
      .set(AUTH)
      .send({ type: 'visa_expiry', title: 'Student visa expires', date: '2026-12-01' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(sampleEvent);
    expect(service.createLifeEvent).toHaveBeenCalledWith(
      'test-uid-123',
      expect.objectContaining({ type: 'visa_expiry' })
    );
  });

  test('returns 400 with details when the data is invalid', async () => {
    service.createLifeEvent.mockRejectedValueOnce(
      new service.LifeEventError(400, 'invalid_life_event', 'The life event data is not valid.', [
        'date must be a valid ISO 8601 date, for example 2026-12-01.',
      ])
    );

    const res = await request(app).post('/api/life-events').set(AUTH).send({ date: 'bad' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_life_event');
    expect(res.body.details).toHaveLength(1);
  });
});

describe('GET /api/life-events', () => {
  test('lists the caller\'s events', async () => {
    service.listLifeEvents.mockResolvedValueOnce([sampleEvent]);

    const res = await request(app).get('/api/life-events').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [sampleEvent], count: 1 });
    expect(service.listLifeEvents).toHaveBeenCalledWith('test-uid-123');
  });

  test('returns an empty list when there are no events', async () => {
    service.listLifeEvents.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/life-events').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [], count: 0 });
  });
});

describe('GET /api/life-events/:id', () => {
  test('returns one event', async () => {
    service.getLifeEvent.mockResolvedValueOnce(sampleEvent);

    const res = await request(app).get('/api/life-events/event-1').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(sampleEvent);
    expect(service.getLifeEvent).toHaveBeenCalledWith('test-uid-123', 'event-1');
  });

  test('returns 404 for a missing or other user\'s event', async () => {
    service.getLifeEvent.mockRejectedValueOnce(
      new service.LifeEventError(404, 'life_event_not_found', 'Life event not found.')
    );

    const res = await request(app).get('/api/life-events/other').set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('life_event_not_found');
  });
});

describe('PATCH /api/life-events/:id', () => {
  test('updates the event and returns it', async () => {
    const updated = { ...sampleEvent, status: 'completed' };
    service.updateLifeEvent.mockResolvedValueOnce(updated);

    const res = await request(app)
      .patch('/api/life-events/event-1')
      .set(AUTH)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(service.updateLifeEvent).toHaveBeenCalledWith('test-uid-123', 'event-1', {
      status: 'completed',
    });
  });

  test('returns 400 for invalid updates', async () => {
    service.updateLifeEvent.mockRejectedValueOnce(
      new service.LifeEventError(400, 'invalid_life_event', 'The life event data is not valid.', [
        'status must be one of: upcoming, completed, cancelled.',
      ])
    );

    const res = await request(app)
      .patch('/api/life-events/event-1')
      .set(AUTH)
      .send({ status: 'maybe' });

    expect(res.status).toBe(400);
  });

  test('returns 404 when the event is not the caller\'s', async () => {
    service.updateLifeEvent.mockRejectedValueOnce(
      new service.LifeEventError(404, 'life_event_not_found', 'Life event not found.')
    );

    const res = await request(app)
      .patch('/api/life-events/other')
      .set(AUTH)
      .send({ title: 'x' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/life-events/:id', () => {
  test('deletes the event and returns 204', async () => {
    service.deleteLifeEvent.mockResolvedValueOnce();

    const res = await request(app).delete('/api/life-events/event-1').set(AUTH);

    expect(res.status).toBe(204);
    expect(service.deleteLifeEvent).toHaveBeenCalledWith('test-uid-123', 'event-1');
  });

  test('returns 404 when the event is not the caller\'s', async () => {
    service.deleteLifeEvent.mockRejectedValueOnce(
      new service.LifeEventError(404, 'life_event_not_found', 'Life event not found.')
    );

    const res = await request(app).delete('/api/life-events/other').set(AUTH);

    expect(res.status).toBe(404);
  });
});

describe('unexpected errors', () => {
  test('returns a generic 500 without leaking details', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    service.listLifeEvents.mockRejectedValueOnce(new Error('firestore exploded'));

    const res = await request(app).get('/api/life-events').set(AUTH);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong.' });
    spy.mockRestore();
  });
});
