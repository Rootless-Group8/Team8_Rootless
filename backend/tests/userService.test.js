jest.mock('../src/config/firebaseAdmin');

const { initializeFirebaseAdmin } = require('../src/config/firebaseAdmin');
const { syncUserRecord, getUserByUid } = require('../src/services/userService');

function buildFakeAdmin({ exists, data } = {}) {
  const docSnapshot = { exists: Boolean(exists), data: () => data };
  const set = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue(undefined);
  const get = jest.fn().mockResolvedValue(docSnapshot);
  const doc = jest.fn().mockReturnValue({ get, set, update });
  const collection = jest.fn().mockReturnValue({ doc });
  return { firestore: () => ({ collection }), _mocks: { get, set, update, doc, collection } };
}

describe('syncUserRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a new local user record on first sign-in', async () => {
    const fakeAdmin = buildFakeAdmin({ exists: false });
    initializeFirebaseAdmin.mockReturnValue(fakeAdmin);

    const decodedToken = { uid: 'uid_1', email: 'new@example.com', email_verified: true };
    const result = await syncUserRecord(decodedToken);

    expect(fakeAdmin._mocks.collection).toHaveBeenCalledWith('users');
    expect(fakeAdmin._mocks.doc).toHaveBeenCalledWith('uid_1');
    expect(fakeAdmin._mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'uid_1',
        email: 'new@example.com',
        email_verified: true,
      })
    );
    expect(result.uid).toBe('uid_1');
    expect(result.created_at).toBeDefined();
    expect(result.last_login_at).toBeDefined();
  });

  test('updates last_login_at on an existing user without dropping other fields', async () => {
    const existing = {
      uid: 'uid_2',
      email: 'old@example.com',
      created_at: '2026-01-01T00:00:00.000Z',
      last_login_at: '2026-01-01T00:00:00.000Z',
      favorite_country: 'Portugal',
    };
    const fakeAdmin = buildFakeAdmin({ exists: true, data: existing });
    initializeFirebaseAdmin.mockReturnValue(fakeAdmin);

    const decodedToken = { uid: 'uid_2', email: 'old@example.com' };
    const result = await syncUserRecord(decodedToken);

    expect(fakeAdmin._mocks.set).not.toHaveBeenCalled();
    expect(fakeAdmin._mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_login_at: expect.any(String) })
    );
    expect(result.favorite_country).toBe('Portugal');
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  test('syncs a changed email on an existing user', async () => {
    const existing = { uid: 'uid_3', email: 'old@example.com', created_at: 'x', last_login_at: 'x' };
    const fakeAdmin = buildFakeAdmin({ exists: true, data: existing });
    initializeFirebaseAdmin.mockReturnValue(fakeAdmin);

    const decodedToken = { uid: 'uid_3', email: 'new@example.com' };
    const result = await syncUserRecord(decodedToken);

    expect(fakeAdmin._mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' })
    );
    expect(result.email).toBe('new@example.com');
  });
});

describe('getUserByUid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns null when no local record exists', async () => {
    const fakeAdmin = buildFakeAdmin({ exists: false });
    initializeFirebaseAdmin.mockReturnValue(fakeAdmin);

    const result = await getUserByUid('nope');
    expect(result).toBeNull();
  });

  test('returns the record when it exists', async () => {
    const existing = { uid: 'uid_4', email: 'x@example.com' };
    const fakeAdmin = buildFakeAdmin({ exists: true, data: existing });
    initializeFirebaseAdmin.mockReturnValue(fakeAdmin);

    const result = await getUserByUid('uid_4');
    expect(result).toEqual(existing);
  });
});
