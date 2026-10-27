const request = require('supertest');
const express = require('express');

// The real verifyFirebaseToken is covered by the Sprint 2 auth tests. Here it
// is replaced with a stand-in that rejects requests without a Bearer token and
// otherwise treats the token text as the caller's UID, so tests can act as
// different users.
jest.mock('../middleware/authMiddleware', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'missing_token',
        message: 'Authorization token is required.',
      });
    }
    req.firebaseUser = { uid: header.slice(7) };
    return next();
  },
}));

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: jest.fn(),
}));

jest.mock('../services/notificationService', () => {
  const actual = jest.requireActual('../services/notificationService');
  return {
    ...actual,
    createNotification: jest.fn(),
    listNotifications: jest.fn(),
    markNotificationAsRead: jest.fn(),
  };
});

const notificationService = require('../services/notificationService');
const notificationRoutes = require('../routes/notificationRoutes');

const { NotificationError } = notificationService;

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRoutes);

const INTERNAL_KEY = 'test-internal-key';
const validBody = {
  recipientUid: 'user-a',
  type: 'deadline_reminder',
  message: 'Your visa form is due soon.',
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
});

describe('authentication', () => {
  it.each([
    ['post', '/api/notifications'],
    ['get', '/api/notifications'],
    ['patch', '/api/notifications/n1'],
  ])('%s %s returns 401 without a token', async (method, url) => {
    const res = await request(app)[method](url);

    expect(res.status).toBe(401);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
    expect(notificationService.listNotifications).not.toHaveBeenCalled();
    expect(notificationService.markNotificationAsRead).not.toHaveBeenCalled();
  });
});

describe('POST /api/notifications', () => {
  it('creates a notification for an internal caller and returns 201', async () => {
    notificationService.createNotification.mockResolvedValue({
      id: 'n1',
      ...validBody,
      status: 'unread',
    });

    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', 'Bearer service-account')
      .set('x-internal-api-key', INTERNAL_KEY)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('n1');
    expect(notificationService.createNotification).toHaveBeenCalledWith(validBody);
  });

  it('returns 403 without the internal key', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', 'Bearer user-a')
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('returns 403 with a wrong internal key', async () => {
    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', 'Bearer user-a')
      .set('x-internal-api-key', 'wrong-key')
      .send(validBody);

    expect(res.status).toBe(403);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('stays closed when INTERNAL_API_KEY is not configured', async () => {
    delete process.env.INTERNAL_API_KEY;

    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', 'Bearer user-a')
      .set('x-internal-api-key', 'anything')
      .send(validBody);

    expect(res.status).toBe(403);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('returns 400 with field details for invalid input', async () => {
    notificationService.createNotification.mockRejectedValue(
      new NotificationError(400, 'validation_error', 'Notification input is invalid.', {
        type: 'type must be one of: system.',
      })
    );

    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', 'Bearer service-account')
      .set('x-internal-api-key', INTERNAL_KEY)
      .send({ type: 'bad' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.details.type).toBeDefined();
  });

  it('returns 500 for an unexpected error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    notificationService.createNotification.mockRejectedValue(new Error('boom'));

    const res = await request(app)
      .post('/api/notifications')
      .set('Authorization', 'Bearer service-account')
      .set('x-internal-api-key', INTERNAL_KEY)
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
    console.error.mockRestore();
  });
});

describe('GET /api/notifications', () => {
  it('returns the caller notifications', async () => {
    notificationService.listNotifications.mockResolvedValue([
      { id: 'n2', message: 'newer' },
      { id: 'n1', message: 'older' },
    ]);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.notifications.map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(notificationService.listNotifications).toHaveBeenCalledWith('user-a');
  });

  it('returns an empty list when there are none', async () => {
    notificationService.listNotifications.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notifications: [], count: 0 });
  });
});

describe('PATCH /api/notifications/:id', () => {
  it('marks a notification as read for the owner', async () => {
    notificationService.markNotificationAsRead.mockResolvedValue({
      id: 'n1',
      status: 'read',
    });

    const res = await request(app)
      .patch('/api/notifications/n1')
      .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('read');
    expect(notificationService.markNotificationAsRead).toHaveBeenCalledWith('user-a', 'n1');
  });

  it('returns 404 when the notification does not exist', async () => {
    notificationService.markNotificationAsRead.mockRejectedValue(
      new NotificationError(404, 'not_found', 'Notification not found.')
    );

    const res = await request(app)
      .patch('/api/notifications/missing')
      .set('Authorization', 'Bearer user-a');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 403 for another user notification', async () => {
    notificationService.markNotificationAsRead.mockRejectedValue(
      new NotificationError(403, 'forbidden', 'You do not have access to this notification.')
    );

    const res = await request(app)
      .patch('/api/notifications/n1')
      .set('Authorization', 'Bearer user-b');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
  });
});
