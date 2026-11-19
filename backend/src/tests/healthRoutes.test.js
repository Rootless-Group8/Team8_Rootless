const request = require('supertest');

// Firebase Admin is mocked, as in earlier sprints, so loading the full app
// never needs real credentials or network access. This also guards against a
// regression where a bad merge leaves app.js unable to load at all.
jest.mock('firebase-admin', () => {
  const firestore = jest.fn(() => ({ collection: jest.fn() }));
  firestore.FieldValue = { serverTimestamp: jest.fn() };
  return {
    credential: { cert: jest.fn() },
    initializeApp: jest.fn(),
    firestore,
    auth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
    storage: jest.fn(() => ({ bucket: jest.fn() })),
    database: jest.fn(),
  };
});

const { createApp } = require('../app');

describe('GET /health', () => {
  const originalCommit = process.env.RENDER_GIT_COMMIT;

  afterEach(() => {
    if (originalCommit === undefined) {
      delete process.env.RENDER_GIT_COMMIT;
    } else {
      process.env.RENDER_GIT_COMMIT = originalCommit;
    }
  });

  test('returns 200 and status ok without any authentication', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  test('reports the deployed commit when the host provides one', async () => {
    process.env.RENDER_GIT_COMMIT = 'abc123def456';
    const res = await request(createApp()).get('/health');

    expect(res.body.commit).toBe('abc123def456');
  });

  test('reports a null commit when running locally', async () => {
    delete process.env.RENDER_GIT_COMMIT;
    const res = await request(createApp()).get('/health');

    expect(res.body.commit).toBeNull();
  });
});
