// In-memory stand-in for the parts of Firestore the service uses.
const mockStore = new Map();
let mockIdCounter = 0;

function mockSnapshot(id) {
  const data = mockStore.get(id);
  return {
    id,
    exists: data !== undefined,
    data: () => (data === undefined ? undefined : { ...data }),
  };
}

function mockQuery(filters) {
  return {
    where: (field, op, value) => mockQuery([...filters, { field, op, value }]),
    get: async () => ({
      docs: [...mockStore.entries()]
        .filter(([, data]) => filters.every((f) => f.op === '==' && data[f.field] === f.value))
        .map(([id]) => mockSnapshot(id)),
    }),
  };
}

const mockCollection = {
  ...mockQuery([]),
  add: async (data) => {
    mockIdCounter += 1;
    const id = `tip-${mockIdCounter}`;
    mockStore.set(id, { ...data });
    return { id };
  },
  doc: (id) => ({
    get: async () => mockSnapshot(id),
    update: async (updates) => {
      mockStore.set(id, { ...mockStore.get(id), ...updates });
    },
    delete: async () => {
      mockStore.delete(id);
    },
  }),
};

const mockCollectionNames = [];

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: () => ({
    firestore: () => ({
      collection: (name) => {
        mockCollectionNames.push(name);
        return mockCollection;
      },
    }),
  }),
}));

const {
  createCommunityTip,
  listCommunityTips,
  getCommunityTip,
  updateCommunityTip,
  deleteCommunityTip,
  validateTipInput,
  validateTipFilters,
  resolveAuthorName,
  CommunityTipError,
  SUPPORTED_COUNTRIES,
  TIP_TOPICS,
} = require('../services/communityTipService');

const ALICE = { uid: 'uid-alice', name: 'Alice Smith' };
const BOB = { uid: 'uid-bob', name: 'Bob Jones' };

const validInput = {
  title: 'Open a bank account early',
  content: 'Most banks need proof of address, so bring a rental contract.',
  destinationCountry: 'Germany',
  city: 'Berlin',
  topic: 'banking',
};

// Creates a tip with a fixed server clock so ordering tests are deterministic.
async function createAt(iso, author, overrides = {}) {
  jest.setSystemTime(new Date(iso));
  return createCommunityTip(author, { ...validInput, ...overrides });
}

function problemsFor(fn) {
  try {
    fn();
  } catch (err) {
    return { status: err.status, code: err.code, details: err.details };
  }
  throw new Error('Expected a CommunityTipError to be thrown.');
}

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-11-01T12:00:00.000Z') });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  mockStore.clear();
  mockIdCounter = 0;
  mockCollectionNames.length = 0;
  jest.setSystemTime(new Date('2026-11-01T12:00:00.000Z'));
});

describe('supported values', () => {
  test('lists the 10 supported destination countries', () => {
    expect(SUPPORTED_COUNTRIES).toEqual([
      'Canada',
      'UK',
      'Germany',
      'Portugal',
      'Mexico',
      'Spain',
      'Australia',
      'Japan',
      'Netherlands',
      'New Zealand',
    ]);
  });

  test('lists the supported topics', () => {
    expect(TIP_TOPICS).toEqual([
      'housing',
      'transportation',
      'healthcare',
      'banking',
      'language',
      'culture',
      'jobs',
      'other',
    ]);
  });
});

describe('validateTipInput', () => {
  test('accepts valid input and trims every value', () => {
    const cleaned = validateTipInput({
      title: '  Open a bank account early  ',
      content: '\n Bring a rental contract. \t',
      destinationCountry: ' Germany ',
      city: '  Berlin ',
      topic: ' banking ',
    });

    expect(cleaned).toEqual({
      title: 'Open a bank account early',
      content: 'Bring a rental contract.',
      destinationCountry: 'Germany',
      city: 'Berlin',
      topic: 'banking',
    });
  });

  test('drops fields the client must not set', () => {
    const cleaned = validateTipInput({
      ...validInput,
      ownerUid: 'hacker',
      authorName: 'Someone Else',
      createdAt: '2000-01-01',
      updatedAt: '2000-01-01',
    });

    expect(Object.keys(cleaned).sort()).toEqual(
      ['city', 'content', 'destinationCountry', 'title', 'topic']
    );
  });

  test('reports every missing required field', () => {
    expect(problemsFor(() => validateTipInput({}))).toEqual({
      status: 400,
      code: 'invalid_community_tip',
      details: [
        'title is required.',
        'content is required.',
        'destinationCountry is required.',
        'city is required.',
        'topic is required.',
      ],
    });
  });

  test.each(['title', 'content', 'destinationCountry', 'city', 'topic'])(
    'rejects a missing %s',
    (field) => {
      const input = { ...validInput };
      delete input[field];
      expect(problemsFor(() => validateTipInput(input)).details).toEqual([
        `${field} is required.`,
      ]);
    }
  );

  test.each(['title', 'content', 'destinationCountry', 'city', 'topic'])(
    'rejects an empty %s',
    (field) => {
      expect(
        problemsFor(() => validateTipInput({ ...validInput, [field]: '' })).details
      ).toEqual([`${field} cannot be empty.`]);
    }
  );

  test.each(['title', 'content', 'destinationCountry', 'city', 'topic'])(
    'rejects a whitespace only %s',
    (field) => {
      expect(
        problemsFor(() => validateTipInput({ ...validInput, [field]: ' \n\t ' })).details
      ).toEqual([`${field} cannot be empty.`]);
    }
  );

  test.each(['title', 'content', 'destinationCountry', 'city', 'topic'])(
    'rejects a null %s',
    (field) => {
      expect(
        problemsFor(() => validateTipInput({ ...validInput, [field]: null })).details
      ).toEqual([`${field} is required.`]);
    }
  );

  test('rejects non-string values', () => {
    expect(problemsFor(() => validateTipInput({ ...validInput, title: 42 })).details).toEqual([
      'title must be a string.',
    ]);
  });

  test('accepts a title of exactly 100 characters and rejects 101', () => {
    expect(validateTipInput({ ...validInput, title: 'a'.repeat(100) }).title).toHaveLength(100);
    expect(
      problemsFor(() => validateTipInput({ ...validInput, title: 'a'.repeat(101) })).details
    ).toEqual(['title must be 100 characters or fewer.']);
  });

  test('accepts content of exactly 1000 characters and rejects 1001', () => {
    expect(validateTipInput({ ...validInput, content: 'b'.repeat(1000) }).content).toHaveLength(
      1000
    );
    expect(
      problemsFor(() => validateTipInput({ ...validInput, content: 'b'.repeat(1001) })).details
    ).toEqual(['content must be 1000 characters or fewer.']);
  });

  test('measures length after trimming', () => {
    const padded = `   ${'a'.repeat(100)}   `;
    expect(validateTipInput({ ...validInput, title: padded }).title).toHaveLength(100);
  });

  test('rejects a city longer than 100 characters', () => {
    expect(
      problemsFor(() => validateTipInput({ ...validInput, city: 'c'.repeat(101) })).details
    ).toEqual(['city must be 100 characters or fewer.']);
  });

  test.each(['France', 'canada', 'United Kingdom', 'new zealand', 'US'])(
    'rejects the unsupported destinationCountry %p',
    (destinationCountry) => {
      const result = problemsFor(() => validateTipInput({ ...validInput, destinationCountry }));
      expect(result.status).toBe(400);
      expect(result.details[0]).toMatch(/^destinationCountry must be one of: Canada, UK/);
    }
  );

  test.each(['food', 'Housing', 'visa'])('rejects the unsupported topic %p', (topic) => {
    const result = problemsFor(() => validateTipInput({ ...validInput, topic }));
    expect(result.status).toBe(400);
    expect(result.details[0]).toMatch(/^topic must be one of: housing, transportation/);
  });

  test('partial mode checks only the fields sent', () => {
    expect(validateTipInput({ topic: 'housing' }, { partial: true })).toEqual({
      topic: 'housing',
    });
    expect(
      problemsFor(() => validateTipInput({ title: '   ' }, { partial: true })).details
    ).toEqual(['title cannot be empty.']);
  });

  test('partial mode requires at least one valid field', () => {
    expect(problemsFor(() => validateTipInput({ ownerUid: 'x' }, { partial: true }))).toMatchObject(
      { status: 400, code: 'no_valid_fields' }
    );
  });
});

describe('validateTipFilters', () => {
  test('returns no filters for an empty query', () => {
    expect(validateTipFilters({})).toEqual({});
    expect(validateTipFilters(undefined)).toEqual({});
  });

  test('trims values and ignores empty filters', () => {
    expect(
      validateTipFilters({ destinationCountry: ' Japan ', city: '  ', topic: '' })
    ).toEqual({ destinationCountry: 'Japan' });
  });

  test('rejects an invalid destinationCountry or topic', () => {
    expect(problemsFor(() => validateTipFilters({ destinationCountry: 'France' }))).toMatchObject({
      status: 400,
      code: 'invalid_filter',
    });
    expect(problemsFor(() => validateTipFilters({ topic: 'food' }))).toMatchObject({
      status: 400,
      code: 'invalid_filter',
    });
  });

  test('rejects a repeated filter parameter', () => {
    expect(problemsFor(() => validateTipFilters({ topic: ['housing', 'jobs'] })).details).toEqual([
      'topic filter must be a single value.',
    ]);
  });
});

describe('resolveAuthorName', () => {
  test('prefers the name on the verified token', () => {
    expect(
      resolveAuthorName(
        { uid: 'u', name: '  Alice Smith ' },
        { profile: { firstName: 'Other', lastName: 'Name' } }
      )
    ).toBe('Alice Smith');
  });

  test('falls back to the profile first and last name', () => {
    expect(
      resolveAuthorName({ uid: 'u' }, { profile: { firstName: ' Bob ', lastName: 'Jones' } })
    ).toBe('Bob Jones');
    expect(resolveAuthorName({ uid: 'u' }, { profile: { firstName: 'Bob' } })).toBe('Bob');
  });

  test('falls back to Anonymous and never uses the email', () => {
    expect(resolveAuthorName({ uid: 'u', email: 'a@example.com' }, { email: 'a@example.com' })).toBe(
      'Anonymous'
    );
    expect(resolveAuthorName(undefined, undefined)).toBe('Anonymous');
  });
});

describe('createCommunityTip', () => {
  test('stores the tip in the flat communityTips collection and returns it with its ID', async () => {
    const tip = await createCommunityTip(ALICE, validInput);

    expect(mockCollectionNames).toContain('communityTips');
    expect(tip).toEqual({
      id: 'tip-1',
      ...validInput,
      ownerUid: 'uid-alice',
      authorName: 'Alice Smith',
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    });
    expect(mockStore.get('tip-1').ownerUid).toBe('uid-alice');
  });

  test('ignores ownerUid, authorName and timestamps sent in the body', async () => {
    await createCommunityTip(ALICE, {
      ...validInput,
      ownerUid: 'someone-else',
      authorName: 'Fake Name',
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    const stored = mockStore.get('tip-1');
    expect(stored.ownerUid).toBe('uid-alice');
    expect(stored.authorName).toBe('Alice Smith');
    expect(stored.createdAt.toISOString()).toBe('2026-11-01T12:00:00.000Z');
  });

  test('rejects invalid data without writing anything', async () => {
    await expect(createCommunityTip(ALICE, { title: 'Only a title' })).rejects.toBeInstanceOf(
      CommunityTipError
    );
    expect(mockStore.size).toBe(0);
  });
});

describe('listCommunityTips', () => {
  async function seed() {
    await createAt('2026-10-01T00:00:00Z', ALICE, { title: 'Oldest', city: 'Berlin' });
    await createAt('2026-10-03T00:00:00Z', BOB, {
      title: 'Newest',
      destinationCountry: 'Japan',
      city: 'Tokyo',
      topic: 'housing',
    });
    await createAt('2026-10-02T00:00:00Z', BOB, {
      title: 'Middle',
      city: 'Munich',
      topic: 'housing',
    });
    await createAt('2026-09-15T00:00:00Z', ALICE, {
      title: 'Berlin housing',
      city: 'berlin',
      topic: 'housing',
    });
  }

  const titles = (tips) => tips.map((t) => t.title);

  test('returns tips from all users, newest first', async () => {
    await seed();

    const tips = await listCommunityTips({});

    expect(titles(tips)).toEqual(['Newest', 'Middle', 'Oldest', 'Berlin housing']);
    expect(new Set(tips.map((t) => t.ownerUid))).toEqual(new Set(['uid-alice', 'uid-bob']));
  });

  test('filters by destinationCountry', async () => {
    await seed();
    expect(titles(await listCommunityTips({ destinationCountry: 'Japan' }))).toEqual(['Newest']);
  });

  test('filters by topic', async () => {
    await seed();
    expect(titles(await listCommunityTips({ topic: 'housing' }))).toEqual([
      'Newest',
      'Middle',
      'Berlin housing',
    ]);
  });

  test('filters by city without regard to case', async () => {
    await seed();
    expect(titles(await listCommunityTips({ city: 'BERLIN' }))).toEqual([
      'Oldest',
      'Berlin housing',
    ]);
    expect(titles(await listCommunityTips({ city: ' tokyo ' }))).toEqual(['Newest']);
  });

  test('combines filters', async () => {
    await seed();
    expect(
      titles(
        await listCommunityTips({ destinationCountry: 'Germany', city: 'Berlin', topic: 'housing' })
      )
    ).toEqual(['Berlin housing']);
    expect(
      titles(await listCommunityTips({ destinationCountry: 'Germany', topic: 'housing' }))
    ).toEqual(['Middle', 'Berlin housing']);
  });

  test('returns an empty list when nothing matches', async () => {
    await seed();
    expect(await listCommunityTips({ destinationCountry: 'Spain' })).toEqual([]);
    expect(await listCommunityTips({ city: 'Nowhere' })).toEqual([]);
  });

  test('returns an empty list when there are no tips at all', async () => {
    expect(await listCommunityTips({})).toEqual([]);
  });

  test('rejects invalid filter values', async () => {
    await expect(listCommunityTips({ destinationCountry: 'France' })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_filter',
    });
    await expect(listCommunityTips({ topic: 'food' })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_filter',
    });
  });
});

describe('getCommunityTip', () => {
  test('returns any user\'s tip', async () => {
    const created = await createCommunityTip(ALICE, validInput);
    expect(await getCommunityTip(created.id)).toEqual(created);
  });

  test('returns 404 for an unknown ID', async () => {
    await expect(getCommunityTip('nope')).rejects.toMatchObject({
      status: 404,
      code: 'community_tip_not_found',
      message: 'Community tip not found.',
    });
  });
});

describe('updateCommunityTip', () => {
  test('lets the author change only the fields sent and refreshes updatedAt', async () => {
    const created = await createAt('2026-10-01T00:00:00Z', ALICE);

    jest.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    const updated = await updateCommunityTip('uid-alice', created.id, {
      title: '  Updated title  ',
      topic: 'culture',
    });

    expect(updated).toEqual({
      ...created,
      title: 'Updated title',
      topic: 'culture',
      updatedAt: '2026-10-05T00:00:00.000Z',
    });
    expect(updated.createdAt).toBe('2026-10-01T00:00:00.000Z');
  });

  test('never changes ownerUid, authorName or createdAt', async () => {
    const created = await createCommunityTip(ALICE, validInput);

    await updateCommunityTip('uid-alice', created.id, {
      ownerUid: 'uid-bob',
      authorName: 'Bob',
      createdAt: '2000-01-01',
      title: 'Renamed',
    });

    const stored = mockStore.get(created.id);
    expect(stored.ownerUid).toBe('uid-alice');
    expect(stored.authorName).toBe('Alice Smith');
    expect(stored.createdAt.toISOString()).toBe(created.createdAt);
  });

  test('validates with the same rules as create and leaves the tip unchanged', async () => {
    const created = await createCommunityTip(ALICE, validInput);
    const before = { ...mockStore.get(created.id) };

    await expect(
      updateCommunityTip('uid-alice', created.id, { title: 'a'.repeat(101) })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateCommunityTip('uid-alice', created.id, { destinationCountry: 'France' })
    ).rejects.toMatchObject({ status: 400 });
    await expect(updateCommunityTip('uid-alice', created.id, { city: '  ' })).rejects.toMatchObject(
      { status: 400 }
    );
    await expect(updateCommunityTip('uid-alice', created.id, {})).rejects.toMatchObject({
      status: 400,
      code: 'no_valid_fields',
    });

    expect(mockStore.get(created.id)).toEqual(before);
  });

  test('returns 403 for a different user and leaves the tip unchanged', async () => {
    const created = await createCommunityTip(ALICE, validInput);
    const before = { ...mockStore.get(created.id) };

    await expect(
      updateCommunityTip('uid-bob', created.id, { title: 'Hijacked' })
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });

    expect(mockStore.get(created.id)).toEqual(before);
  });

  test('returns 404 for an unknown ID', async () => {
    await expect(updateCommunityTip('uid-alice', 'nope', { title: 'x' })).rejects.toMatchObject({
      status: 404,
      code: 'community_tip_not_found',
    });
  });
});

describe('deleteCommunityTip', () => {
  test('lets the author delete, after which the tip is not found', async () => {
    const created = await createCommunityTip(ALICE, validInput);

    await deleteCommunityTip('uid-alice', created.id);

    expect(mockStore.has(created.id)).toBe(false);
    await expect(getCommunityTip(created.id)).rejects.toMatchObject({ status: 404 });
  });

  test('returns 403 for a different user and keeps the tip', async () => {
    const created = await createCommunityTip(ALICE, validInput);
    const before = { ...mockStore.get(created.id) };

    await expect(deleteCommunityTip('uid-bob', created.id)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(mockStore.get(created.id)).toEqual(before);
  });

  test('returns 404 for an unknown ID', async () => {
    await expect(deleteCommunityTip('uid-alice', 'nope')).rejects.toMatchObject({ status: 404 });
  });
});
