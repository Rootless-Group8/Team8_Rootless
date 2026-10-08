const { _resetForTests } = require('../config/firebaseAdmin');

// Mock firebase-admin before requiring any module that touches it.
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDoc = jest.fn(() => ({ get: mockGet, set: mockSet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
const mockFirestore = jest.fn(() => ({ collection: mockCollection }));

jest.mock('firebase-admin', () => ({
  credential: { cert: jest.fn() },
  initializeApp: jest.fn(),
  firestore: () => mockFirestore(),
}));

process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test-project' });

const {
  getProfile,
  updateProfile,
  validateProfilePayload,
  RELOCATION_GOALS,
} = require('../services/profileService');

beforeEach(() => {
  jest.clearAllMocks();
  _resetForTests();
});

describe('validateProfilePayload', () => {
  test('returns no errors for a fully valid payload', () => {
    const errors = validateProfilePayload({
      firstName: 'Bridgette',
      lastName: 'Lynch',
      email: 'bridgette@example.com',
      phoneNumber: '+15551234567',
      citizenship: 'United States',
      currentCountry: 'United States',
      destinationCountry: 'Portugal',
      relocationGoal: 'digital_nomad',
      plannedArrivalDate: '2027-01-01',
    });
    expect(errors).toEqual({});
  });

  test('flags a missing first name', () => {
    const errors = validateProfilePayload({ firstName: '' });
    expect(errors.firstName).toBeDefined();
  });

  test('flags an invalid email format', () => {
    const errors = validateProfilePayload({ email: 'not-an-email' });
    expect(errors.email).toBeDefined();
  });

  test('flags an invalid phone number format', () => {
    const errors = validateProfilePayload({ phoneNumber: 'abc123' });
    expect(errors.phoneNumber).toBeDefined();
  });

  test('flags a relocation goal outside the allowed set', () => {
    const errors = validateProfilePayload({ relocationGoal: 'vacation' });
    expect(errors.relocationGoal).toBeDefined();
  });

  test('accepts digital_nomad and student as valid relocation goals', () => {
    expect(RELOCATION_GOALS).toContain('digital_nomad');
    expect(RELOCATION_GOALS).toContain('student');
    expect(validateProfilePayload({ relocationGoal: 'digital_nomad' })).toEqual({});
    expect(validateProfilePayload({ relocationGoal: 'student' })).toEqual({});
  });

  test('flags a planned arrival date in the past', () => {
    const errors = validateProfilePayload({ plannedArrivalDate: '2000-01-01' });
    expect(errors.plannedArrivalDate).toBeDefined();
  });

  test('flags a malformed planned arrival date', () => {
    const errors = validateProfilePayload({ plannedArrivalDate: 'not-a-date' });
    expect(errors.plannedArrivalDate).toBeDefined();
  });

  test('only validates fields present in the payload (partial update)', () => {
    const errors = validateProfilePayload({ destinationCountry: 'Canada' });
    expect(errors).toEqual({});
  });
});

describe('getProfile', () => {
  test('returns the profile map when the user document exists with a profile', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: 'abc123', profile: { firstName: 'Bridgette' } }),
    });

    const profile = await getProfile('abc123');

    expect(mockCollection).toHaveBeenCalledWith('users');
    expect(mockDoc).toHaveBeenCalledWith('abc123');
    expect(profile).toEqual({ firstName: 'Bridgette' });
  });

  test('returns null when the user document does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    const profile = await getProfile('missing-user');

    expect(profile).toBeNull();
  });

  test('returns null when the user document exists but has no profile yet', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: 'abc123' }),
    });

    const profile = await getProfile('abc123');

    expect(profile).toBeNull();
  });
});

describe('updateProfile', () => {
  test('writes only recognized profile fields via a merge upsert', async () => {
    mockSet.mockResolvedValueOnce();
    mockGet.mockResolvedValueOnce({
      data: () => ({
        profile: { destinationCountry: 'Canada', updated_at: '2026-01-01T00:00:00.000Z' },
      }),
    });

    const result = await updateProfile('abc123', {
      destinationCountry: 'Canada',
      notAProfileField: 'should be stripped',
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ destinationCountry: 'Canada' }),
      }),
      { merge: true }
    );

    const writtenProfile = mockSet.mock.calls[0][0].profile;
    expect(writtenProfile.notAProfileField).toBeUndefined();
    expect(result).toEqual({ destinationCountry: 'Canada', updated_at: '2026-01-01T00:00:00.000Z' });
  });

  test('creates a new profile document when none exists yet (upsert)', async () => {
    mockSet.mockResolvedValueOnce();
    mockGet.mockResolvedValueOnce({
      data: () => ({ profile: { firstName: 'New', lastName: 'User' } }),
    });

    const result = await updateProfile('new-user', { firstName: 'New', lastName: 'User' });

    expect(mockSet).toHaveBeenCalledWith(expect.any(Object), { merge: true });
    expect(result).toEqual({ firstName: 'New', lastName: 'User' });
  });
});
