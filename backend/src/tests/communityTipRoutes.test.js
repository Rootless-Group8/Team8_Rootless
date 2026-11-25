const express = require('express');
const request = require('supertest');

// In-memory stand-in for Firestore, one Map per collection. The real
// verifyFirebaseToken middleware and userService run against it, so these
// tests cover the full path from token check to stored tip.
const mockCollections = new Map();
let mockIdCounter = 0;

function mockStoreFor(name) {
  if (!mockCollections.has(name)) {
    mockCollections.set(name, new Map());
  }
  return mockCollections.get(name);
}

function mockSnapshot(store, id) {
  const data = store.get(id);
  return {
    id,
    exists: data !== undefined,
    data: () => (data === undefined ? undefined : { ...data }),
  };
}

function mockQuery(store, filters) {
  return {
    where: (field, op, value) => mockQuery(store, [...filters, { field, op, value }]),
    get: async () => ({
      docs: [...store.entries()]
        .filter(([, data]) => filters.every((f) => f.op === '==' && data[f.field] === f.value))
        .map(([id]) => mockSnapshot(store, id)),
    }),
  };
}

function mockCollection(name) {
  const store = mockStoreFor(name);
  return {
    ...mockQuery(store, []),
    add: async (data) => {
      mockIdCounter += 1;
      const id = `tip-${mockIdCounter}`;
      store.set(id, { ...data });
      return { id };
    },
    doc: (id) => ({
      get: async () => mockSnapshot(store, id),
      set: async (data) => {
        store.set(id, { ...data });
      },
      update: async (updates) => {
        store.set(id, { ...store.get(id), ...updates });
      },
      delete: async () => {
        store.delete(id);
      },
    }),
  };
}

// Tokens the mocked Admin SDK accepts. Anything else fails verification.
const mockTokens = {
  'token-alice': { uid: 'uid-alice', name: 'Alice Smith', email: 'alice@example.com' },
  'token-bob': { uid: 'uid-bob', email: 'bob@example.com' },
  'token-carol': { uid: 'uid-carol', email: 'carol@example.com' },
};

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: () => ({
    auth: () => ({
      verifyIdToken: async (token) => {
        if (mockTokens[token]) {
          return { ...mockTokens[token] };
        }
        const err = new Error('invalid token');
        err.code = 'auth/invalid-id-token';
        throw err;
      },
    }),
    firestore: () => ({ collection: (name) => mockCollection(name) }),
  }),
}));

const communityTipRoutes = require('../routes/communityTipRoutes');

const app = express();
app.use(express.json());
app.use('/api/community-tips', communityTipRoutes);

const AS_ALICE = { Authorization: 'Bearer token-alice' };
const AS_BOB = { Authorization: 'Bearer token-bob' };
const AS_CAROL = { Authorization: 'Bearer token-carol' };

const validBody = {
  title: 'Get a transit pass',
  content: 'A monthly pass is much cheaper than single tickets.',
  destinationCountry: 'Japan',
  city: 'Tokyo',
  topic: 'transportation',
};

const tips = () => mockStoreFor('communityTips');

function seedTip(id, overrides = {}) {
  const createdAt = new Date(overrides.createdAt || '2026-10-01T00:00:00.000Z');
  tips().set(id, {
    ...validBody,
    ownerUid: 'uid-alice',
    authorName: 'Alice Smith',
    ...overrides,
    createdAt,
    updatedAt: createdAt,
  });
}

beforeEach(() => {
  mockCollections.clear();
  mockIdCounter = 0;
  // Bob has no name on his token but has filled in his profile.
  mockStoreFor('users').set('uid-bob', {
    uid: 'uid-bob',
    email: 'bob@example.com',
    profile: { firstName: 'Bob', lastName: 'Jones' },
  });
});

describe('authentication', () => {
  const endpoints = [
    ['post', '/api/community-tips'],
    ['get', '/api/community-tips'],
    ['get', '/api/community-tips/tip-1'],
    ['patch', '/api/community-tips/tip-1'],
    ['delete', '/api/community-tips/tip-1'],
  ];

  test.each(endpoints)('%s %s returns 401 without a token', async (method, path) => {
    seedTip('tip-1');

    const res = await request(app)[method](path).send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('missing_token');
    expect(tips().size).toBe(1);
    expect(tips().get('tip-1').title).toBe(validBody.title);
  });

  test.each(endpoints)('%s %s returns 401 with an invalid token', async (method, path) => {
    seedTip('tip-1');

    const res = await request(app)[method](path)
      .set('Authorization', 'Bearer forged-token')
      .send({ title: 'Changed' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('token_invalid');
    expect(tips().size).toBe(1);
    expect(tips().get('tip-1').title).toBe(validBody.title);
  });

  test('returns 401 for a malformed Authorization header', async () => {
    const res = await request(app).get('/api/community-tips').set('Authorization', 'token-alice');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/community-tips', () => {
  test('creates a tip owned by the token UID and returns 201 with its ID', async () => {
    const res = await request(app)
      .post('/api/community-tips')
      .set(AS_ALICE)
      .send({ ...validBody, title: '  Get a transit pass  ', ownerUid: 'uid-bob' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'tip-1',
      ...validBody,
      ownerUid: 'uid-alice',
      authorName: 'Alice Smith',
    });
    expect(res.body.createdAt).toEqual(expect.any(String));
    expect(res.body.updatedAt).toBe(res.body.createdAt);
    expect(tips().get('tip-1').ownerUid).toBe('uid-alice');
  });

  test('fills authorName from the profile when the token has no name', async () => {
    const res = await request(app).post('/api/community-tips').set(AS_BOB).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.authorName).toBe('Bob Jones');
  });

  test('uses Anonymous when neither the token nor the profile has a name', async () => {
    const res = await request(app).post('/api/community-tips').set(AS_CAROL).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.authorName).toBe('Anonymous');
  });

  test('ignores an authorName sent in the body', async () => {
    const res = await request(app)
      .post('/api/community-tips')
      .set(AS_ALICE)
      .send({ ...validBody, authorName: 'Impostor' });

    expect(res.body.authorName).toBe('Alice Smith');
  });

  test.each(['title', 'content', 'destinationCountry', 'city', 'topic'])(
    'returns 400 when %s is missing',
    async (field) => {
      const body = { ...validBody };
      delete body[field];

      const res = await request(app).post('/api/community-tips').set(AS_ALICE).send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_community_tip');
      expect(res.body.details).toEqual([`${field} is required.`]);
      expect(tips().size).toBe(0);
    }
  );

  test.each(['title', 'content', 'destinationCountry', 'city', 'topic'])(
    'returns 400 when %s is empty or whitespace only',
    async (field) => {
      for (const value of ['', '   ']) {
        const res = await request(app)
          .post('/api/community-tips')
          .set(AS_ALICE)
          .send({ ...validBody, [field]: value });

        expect(res.status).toBe(400);
        expect(res.body.details).toEqual([`${field} cannot be empty.`]);
      }
      expect(tips().size).toBe(0);
    }
  );

  test('returns 400 when the title is over 100 characters', async () => {
    const res = await request(app)
      .post('/api/community-tips')
      .set(AS_ALICE)
      .send({ ...validBody, title: 'a'.repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(['title must be 100 characters or fewer.']);
  });

  test('returns 400 when the content is over 1000 characters', async () => {
    const res = await request(app)
      .post('/api/community-tips')
      .set(AS_ALICE)
      .send({ ...validBody, content: 'b'.repeat(1001) });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(['content must be 1000 characters or fewer.']);
  });

  test('returns 400 for an unsupported destinationCountry', async () => {
    const res = await request(app)
      .post('/api/community-tips')
      .set(AS_ALICE)
      .send({ ...validBody, destinationCountry: 'France' });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/^destinationCountry must be one of:/);
  });

  test('returns 400 for an unsupported topic', async () => {
    const res = await request(app)
      .post('/api/community-tips')
      .set(AS_ALICE)
      .send({ ...validBody, topic: 'food' });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/^topic must be one of:/);
  });
});

describe('GET /api/community-tips', () => {
  function seedMany() {
    seedTip('t-old', { title: 'Old', createdAt: '2026-09-01T00:00:00Z', city: 'Osaka' });
    seedTip('t-new', {
      title: 'New',
      createdAt: '2026-10-20T00:00:00Z',
      ownerUid: 'uid-bob',
      destinationCountry: 'Canada',
      city: 'Toronto',
      topic: 'housing',
    });
    seedTip('t-mid', {
      title: 'Mid',
      createdAt: '2026-10-05T00:00:00Z',
      ownerUid: 'uid-bob',
      city: 'tokyo',
      topic: 'housing',
    });
    seedTip('t-mid2', { title: 'Mid2', createdAt: '2026-10-01T00:00:00Z', city: 'TOKYO' });
  }

  const titlesOf = (res) => res.body.tips.map((t) => t.title);

  test('lists tips from all users, newest first', async () => {
    seedMany();

    const res = await request(app).get('/api/community-tips').set(AS_CAROL);

    expect(res.status).toBe(200);
    expect(titlesOf(res)).toEqual(['New', 'Mid', 'Mid2', 'Old']);
    expect(res.body.count).toBe(4);
  });

  test('filters by destinationCountry', async () => {
    seedMany();
    const res = await request(app)
      .get('/api/community-tips')
      .query({ destinationCountry: 'Canada' })
      .set(AS_ALICE);
    expect(titlesOf(res)).toEqual(['New']);
  });

  test('filters by city without regard to case', async () => {
    seedMany();
    const res = await request(app).get('/api/community-tips').query({ city: 'Tokyo' }).set(AS_ALICE);
    expect(titlesOf(res)).toEqual(['Mid', 'Mid2']);
  });

  test('filters by topic', async () => {
    seedMany();
    const res = await request(app).get('/api/community-tips').query({ topic: 'housing' }).set(AS_ALICE);
    expect(titlesOf(res)).toEqual(['New', 'Mid']);
  });

  test('combines filters', async () => {
    seedMany();
    const res = await request(app)
      .get('/api/community-tips')
      .query({ destinationCountry: 'Japan', city: 'TOKYO', topic: 'housing' })
      .set(AS_ALICE);
    expect(titlesOf(res)).toEqual(['Mid']);
  });

  test('returns an empty list when nothing matches', async () => {
    seedMany();
    const res = await request(app)
      .get('/api/community-tips')
      .query({ destinationCountry: 'Spain' })
      .set(AS_ALICE);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tips: [], count: 0 });
  });

  test('returns an empty list when there are no tips', async () => {
    const res = await request(app).get('/api/community-tips').set(AS_ALICE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tips: [], count: 0 });
  });

  test('returns 400 for an invalid destinationCountry filter', async () => {
    const res = await request(app)
      .get('/api/community-tips')
      .query({ destinationCountry: 'Atlantis' })
      .set(AS_ALICE);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_filter');
  });

  test('returns 400 for an invalid topic filter', async () => {
    const res = await request(app).get('/api/community-tips').query({ topic: 'food' }).set(AS_ALICE);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_filter');
  });
});

describe('GET /api/community-tips/:id', () => {
  test('returns one tip to any signed in user', async () => {
    seedTip('tip-1');

    const res = await request(app).get('/api/community-tips/tip-1').set(AS_BOB);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'tip-1', ...validBody, ownerUid: 'uid-alice' });
  });

  test('returns 404 for an unknown ID', async () => {
    const res = await request(app).get('/api/community-tips/missing').set(AS_ALICE);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'community_tip_not_found',
      message: 'Community tip not found.',
    });
  });
});

describe('PATCH /api/community-tips/:id', () => {
  test('lets the author update only the fields sent', async () => {
    seedTip('tip-1');

    const res = await request(app)
      .patch('/api/community-tips/tip-1')
      .set(AS_ALICE)
      .send({ content: '  Buy a Suica card at the airport.  ', ownerUid: 'uid-bob' });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Buy a Suica card at the airport.');
    expect(res.body.title).toBe(validBody.title);
    expect(res.body.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(res.body.createdAt).getTime()
    );
    expect(tips().get('tip-1').ownerUid).toBe('uid-alice');
  });

  test('returns 400 for invalid updates and leaves the tip unchanged', async () => {
    seedTip('tip-1');
    const before = { ...tips().get('tip-1') };

    for (const body of [{ title: '   ' }, { topic: 'food' }, { content: 'x'.repeat(1001) }, {}]) {
      const res = await request(app).patch('/api/community-tips/tip-1').set(AS_ALICE).send(body);
      expect(res.status).toBe(400);
    }
    expect(tips().get('tip-1')).toEqual(before);
  });

  test('returns 403 for a different user and leaves the tip unchanged', async () => {
    seedTip('tip-1');
    const before = { ...tips().get('tip-1') };

    const res = await request(app)
      .patch('/api/community-tips/tip-1')
      .set(AS_BOB)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(tips().get('tip-1')).toEqual(before);
  });

  test('returns 404 for an unknown ID', async () => {
    const res = await request(app)
      .patch('/api/community-tips/missing')
      .set(AS_ALICE)
      .send({ title: 'x' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('community_tip_not_found');
  });
});

describe('DELETE /api/community-tips/:id', () => {
  test('lets the author delete, and a later GET returns 404', async () => {
    seedTip('tip-1');

    const res = await request(app).delete('/api/community-tips/tip-1').set(AS_ALICE);
    expect(res.status).toBe(204);

    const after = await request(app).get('/api/community-tips/tip-1').set(AS_ALICE);
    expect(after.status).toBe(404);
  });

  test('returns 403 for a different user and keeps the tip', async () => {
    seedTip('tip-1');
    const before = { ...tips().get('tip-1') };

    const res = await request(app).delete('/api/community-tips/tip-1').set(AS_BOB);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(tips().get('tip-1')).toEqual(before);

    const after = await request(app).get('/api/community-tips/tip-1').set(AS_BOB);
    expect(after.status).toBe(200);
  });

  test('returns 404 for an unknown ID', async () => {
    const res = await request(app).delete('/api/community-tips/missing').set(AS_ALICE);
    expect(res.status).toBe(404);
  });
});

describe('unexpected errors', () => {
  test('returns a generic 500 without leaking details', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    tips().get = () => {
      throw new Error('firestore exploded');
    };

    const res = await request(app).get('/api/community-tips/tip-1').set(AS_ALICE);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong.' });
    spy.mockRestore();
  });
});
