jest.mock('../src/config/firebaseAdmin');
jest.mock('../src/services/userService');

const { verifyFirebaseToken } = require('../src/middleware/authMiddleware');
const { initializeFirebaseAdmin } = require('../src/config/firebaseAdmin');
const { syncUserRecord } = require('../src/services/userService');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('verifyFirebaseToken middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects requests with no Authorization header', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'missing_token' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a malformed Authorization header (no Bearer scheme)', async () => {
    const req = { headers: { authorization: 'Token abc123' } };
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an expired token with a clear "token_expired" error', async () => {
    const verifyIdToken = jest.fn().mockRejectedValue({ code: 'auth/id-token-expired' });
    initializeFirebaseAdmin.mockReturnValue({ auth: () => ({ verifyIdToken }) });

    const req = { headers: { authorization: 'Bearer expired.token.here' } };
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'token_expired' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an invalid/malformed token', async () => {
    const verifyIdToken = jest.fn().mockRejectedValue({ code: 'auth/argument-error' });
    initializeFirebaseAdmin.mockReturnValue({ auth: () => ({ verifyIdToken }) });

    const req = { headers: { authorization: 'Bearer not-a-real-token' } };
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'token_invalid' }));
  });

  test('accepts a valid token, attaches user info, and calls next()', async () => {
    const decodedToken = { uid: 'user_123', email: 'a@example.com' };
    const verifyIdToken = jest.fn().mockResolvedValue(decodedToken);
    initializeFirebaseAdmin.mockReturnValue({ auth: () => ({ verifyIdToken }) });
    syncUserRecord.mockResolvedValue({ uid: 'user_123', email: 'a@example.com' });

    const req = { headers: { authorization: 'Bearer valid.token.here' } };
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(req.firebaseUser).toEqual(decodedToken);
    expect(req.localUser).toEqual({ uid: 'user_123', email: 'a@example.com' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 500 if the token is valid but user sync fails', async () => {
    const decodedToken = { uid: 'user_123', email: 'a@example.com' };
    const verifyIdToken = jest.fn().mockResolvedValue(decodedToken);
    initializeFirebaseAdmin.mockReturnValue({ auth: () => ({ verifyIdToken }) });
    syncUserRecord.mockRejectedValue(new Error('firestore unavailable'));

    const req = { headers: { authorization: 'Bearer valid.token.here' } };
    const res = mockRes();
    const next = jest.fn();

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'user_sync_failed' }));
    expect(next).not.toHaveBeenCalled();
  });
});
