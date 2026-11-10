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

const mockCollection = {
  add: async (data) => {
    mockIdCounter += 1;
    const id = `event-${mockIdCounter}`;
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
  where: (field, op, value) => ({
    get: async () => ({
      docs: [...mockStore.entries()]
        .filter(([, data]) => op === '==' && data[field] === value)
        .map(([id]) => mockSnapshot(id)),
    }),
  }),
};

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: () => ({
    firestore: () => ({ collection: () => mockCollection }),
  }),
}));

const {
  createLifeEvent,
  listLifeEvents,
  getLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
  validateLifeEventInput,
  LifeEventError,
} = require('../services/lifeEventService');

const validInput = {
  type: 'visa_expiry',
  title: 'Student visa expires',
  date: '2026-12-01',
  visaType: 'student',
  destinationCountry: 'Canada',
  notes: 'Start renewal two months ahead.',
};

beforeEach(() => {
  mockStore.clear();
  mockIdCounter = 0;
});

describe('validateLifeEventInput', () => {
  test('accepts valid input and normalizes the date to ISO 8601', () => {
    const cleaned = validateLifeEventInput(validInput);

    expect(cleaned.type).toBe('visa_expiry');
    expect(cleaned.title).toBe('Student visa expires');
    expect(cleaned.date).toBe('2026-12-01T00:00:00.000Z');
  });

  test('drops unknown fields', () => {
    const cleaned = validateLifeEventInput({ ...validInput, ownerUid: 'hacker', extra: 1 });

    expect(cleaned.ownerUid).toBeUndefined();
    expect(cleaned.extra).toBeUndefined();
  });

  test('reports every missing required field', () => {
    expect.assertions(3);
    try {
      validateLifeEventInput({});
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('invalid_life_event');
      expect(err.details).toEqual([
        'type is required.',
        'title is required.',
        'date is required.',
      ]);
    }
  });

  test('rejects an unsupported type and status', () => {
    expect(() =>
      validateLifeEventInput({ ...validInput, type: 'party', status: 'maybe' })
    ).toThrow(LifeEventError);
  });

  test.each(['not-a-date', '2026-13-01', '2026-02-30', '12/01/2026', 20261201, ''])(
    'rejects the invalid date %p',
    (date) => {
      expect(() => validateLifeEventInput({ ...validInput, date })).toThrow(LifeEventError);
    }
  );

  test('allows past dates', () => {
    const cleaned = validateLifeEventInput({ ...validInput, date: '2020-01-15' });
    expect(cleaned.date).toBe('2020-01-15T00:00:00.000Z');
  });

  test('accepts a full ISO date-time', () => {
    const cleaned = validateLifeEventInput({ ...validInput, date: '2026-12-01T14:30:00Z' });
    expect(cleaned.date).toBe('2026-12-01T14:30:00.000Z');
  });

  test('rejects an over-long title and non-string optional fields', () => {
    expect(() => validateLifeEventInput({ ...validInput, title: 'x'.repeat(121) })).toThrow(
      LifeEventError
    );
    expect(() => validateLifeEventInput({ ...validInput, notes: 42 })).toThrow(LifeEventError);
  });

  test('partial mode requires at least one valid field', () => {
    expect.assertions(2);
    expect(validateLifeEventInput({ status: 'completed' }, { partial: true })).toEqual({
      status: 'completed',
    });
    try {
      validateLifeEventInput({ unknown: true }, { partial: true });
    } catch (err) {
      expect(err.code).toBe('no_valid_fields');
    }
  });
});

describe('createLifeEvent', () => {
  test('stores the event under the caller and defaults status to upcoming', async () => {
    const event = await createLifeEvent('uid-1', validInput);

    expect(event.id).toBe('event-1');
    expect(event.status).toBe('upcoming');
    expect(event.type).toBe('visa_expiry');
    expect(event.createdAt).toBe(event.updatedAt);
    expect(mockStore.get('event-1').ownerUid).toBe('uid-1');
    expect(event.ownerUid).toBeUndefined();
  });

  test('ignores an ownerUid sent in the body', async () => {
    await createLifeEvent('uid-1', { ...validInput, ownerUid: 'someone-else' });
    expect(mockStore.get('event-1').ownerUid).toBe('uid-1');
  });

  test('rejects invalid data without writing anything', async () => {
    await expect(createLifeEvent('uid-1', { title: 'No type or date' })).rejects.toMatchObject({
      status: 400,
    });
    expect(mockStore.size).toBe(0);
  });
});

describe('listLifeEvents', () => {
  test('returns only the caller\'s events in date order', async () => {
    await createLifeEvent('uid-1', { ...validInput, title: 'Later', date: '2027-03-01' });
    await createLifeEvent('uid-1', { ...validInput, title: 'Sooner', date: '2026-12-01' });
    await createLifeEvent('uid-2', { ...validInput, title: 'Not mine', date: '2026-01-01' });

    const events = await listLifeEvents('uid-1');

    expect(events.map((e) => e.title)).toEqual(['Sooner', 'Later']);
  });

  test('returns an empty list when the user has no events', async () => {
    expect(await listLifeEvents('uid-1')).toEqual([]);
  });
});

describe('getLifeEvent', () => {
  test('returns the caller\'s event', async () => {
    const created = await createLifeEvent('uid-1', validInput);
    expect(await getLifeEvent('uid-1', created.id)).toEqual(created);
  });

  test('returns 404 for a missing id', async () => {
    await expect(getLifeEvent('uid-1', 'nope')).rejects.toMatchObject({
      status: 404,
      code: 'life_event_not_found',
    });
  });

  test('returns the same 404 for another user\'s event', async () => {
    const created = await createLifeEvent('uid-1', validInput);
    await expect(getLifeEvent('uid-2', created.id)).rejects.toMatchObject({
      status: 404,
      code: 'life_event_not_found',
    });
  });
});

describe('updateLifeEvent', () => {
  test('changes only the fields sent and keeps createdAt', async () => {
    const created = await createLifeEvent('uid-1', validInput);

    const updated = await updateLifeEvent('uid-1', created.id, { status: 'completed' });

    expect(updated.status).toBe('completed');
    expect(updated.title).toBe(validInput.title);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime()
    );
  });

  test('cannot change the owner', async () => {
    const created = await createLifeEvent('uid-1', validInput);
    await updateLifeEvent('uid-1', created.id, { ownerUid: 'uid-2', title: 'Renamed' });
    expect(mockStore.get(created.id).ownerUid).toBe('uid-1');
  });

  test('rejects invalid updates and leaves the event unchanged', async () => {
    const created = await createLifeEvent('uid-1', validInput);

    await expect(updateLifeEvent('uid-1', created.id, { date: 'bad' })).rejects.toMatchObject({
      status: 400,
    });
    expect(mockStore.get(created.id).date).toBe('2026-12-01T00:00:00.000Z');
  });

  test('returns 404 for a missing event and for another user\'s event', async () => {
    const created = await createLifeEvent('uid-1', validInput);

    await expect(updateLifeEvent('uid-1', 'nope', { title: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(updateLifeEvent('uid-2', created.id, { title: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    expect(mockStore.get(created.id).title).toBe(validInput.title);
  });
});

describe('deleteLifeEvent', () => {
  test('removes the caller\'s event', async () => {
    const created = await createLifeEvent('uid-1', validInput);

    await deleteLifeEvent('uid-1', created.id);

    expect(mockStore.has(created.id)).toBe(false);
    await expect(getLifeEvent('uid-1', created.id)).rejects.toMatchObject({ status: 404 });
  });

  test('cannot delete another user\'s event', async () => {
    const created = await createLifeEvent('uid-1', validInput);

    await expect(deleteLifeEvent('uid-2', created.id)).rejects.toMatchObject({ status: 404 });
    expect(mockStore.has(created.id)).toBe(true);
  });

  test('returns 404 for a missing id', async () => {
    await expect(deleteLifeEvent('uid-1', 'nope')).rejects.toMatchObject({ status: 404 });
  });
});
