// Minimal in-memory stand-in for the parts of Firestore the service uses:
// collection().add / doc().get / doc().update / where().get
function createFakeDb() {
  const store = new Map();
  let counter = 0;

  const docRef = (id) => ({
    id,
    get: async () => ({
      exists: store.has(id),
      id,
      data: () => store.get(id),
    }),
    update: async (patch) => {
      store.set(id, { ...store.get(id), ...patch });
    },
  });

  const collection = () => ({
    add: async (data) => {
      counter += 1;
      const id = `n${counter}`;
      store.set(id, { ...data });
      return docRef(id);
    },
    doc: (id) => docRef(id),
    where: (field, op, value) => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([, data]) => data[field] === value)
          .map(([id, data]) => ({ id, data: () => data })),
      }),
    }),
  });

  return { db: { collection }, store };
}

let mockDb;
let mockStore;

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: () => ({ firestore: () => mockDb }),
}));

jest.mock('../services/deliveryService', () => ({
  deliverNotification: jest.fn(),
}));

const { deliverNotification } = require('../services/deliveryService');
const {
  createNotification,
  listNotifications,
  markNotificationAsRead,
  validateNotificationInput,
  NotificationError,
  NOTIFICATION_TYPES,
  MAX_MESSAGE_LENGTH,
} = require('../services/notificationService');

const validInput = {
  recipientUid: 'user-a',
  type: 'deadline_reminder',
  message: 'Your visa form is due soon.',
};

beforeEach(() => {
  ({ db: mockDb, store: mockStore } = createFakeDb());
  jest.clearAllMocks();
  deliverNotification.mockResolvedValue({ email: 'stubbed' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('validateNotificationInput', () => {
  it('accepts valid input', () => {
    expect(validateNotificationInput(validInput)).toEqual({});
  });

  it('accepts every allowed type', () => {
    NOTIFICATION_TYPES.forEach((type) => {
      expect(validateNotificationInput({ ...validInput, type })).toEqual({});
    });
  });

  it('reports every invalid field', () => {
    const errors = validateNotificationInput({
      recipientUid: '  ',
      type: 'nope',
      message: '',
    });

    expect(Object.keys(errors).sort()).toEqual(['message', 'recipientUid', 'type']);
  });

  it('rejects a message over the length limit', () => {
    const errors = validateNotificationInput({
      ...validInput,
      message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1),
    });

    expect(errors.message).toBeDefined();
  });

  it('handles a missing body', () => {
    expect(Object.keys(validateNotificationInput(undefined))).toHaveLength(3);
  });
});

describe('createNotification', () => {
  it('stores the notification with correct metadata and unread status', async () => {
    const result = await createNotification(validInput);

    expect(result.id).toBe('n1');
    expect(result).toMatchObject({
      recipientUid: 'user-a',
      type: 'deadline_reminder',
      message: 'Your visa form is due soon.',
      status: 'unread',
      readAt: null,
      delivery: { email: 'stubbed' },
    });
    expect(new Date(result.createdAt).toString()).not.toBe('Invalid Date');

    const stored = mockStore.get('n1');
    expect(stored.status).toBe('unread');
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(stored.delivery).toEqual({ email: 'stubbed' });
  });

  it('trims the message and recipient', async () => {
    const result = await createNotification({
      ...validInput,
      recipientUid: ' user-a ',
      message: '  hello  ',
    });

    expect(result.recipientUid).toBe('user-a');
    expect(result.message).toBe('hello');
  });

  it('calls the delivery skeleton with the stored notification', async () => {
    await createNotification(validInput);

    expect(deliverNotification).toHaveBeenCalledTimes(1);
    expect(deliverNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', recipientUid: 'user-a', type: 'deadline_reminder' })
    );
  });

  it('throws a 400 with field details and stores nothing for invalid input', async () => {
    await expect(createNotification({ type: 'system' })).rejects.toMatchObject({
      status: 400,
      code: 'validation_error',
      details: expect.objectContaining({ recipientUid: expect.any(String) }),
    });

    expect(mockStore.size).toBe(0);
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('still stores the notification when delivery throws', async () => {
    deliverNotification.mockRejectedValue(new Error('provider down'));

    const result = await createNotification(validInput);

    expect(result.id).toBe('n1');
    expect(result.delivery).toEqual({ error: 'failed' });
    expect(mockStore.get('n1').status).toBe('unread');
  });
});

describe('listNotifications', () => {
  it('returns only the caller notifications, newest first', async () => {
    mockStore.set('old', {
      recipientUid: 'user-a',
      type: 'system',
      message: 'old',
      status: 'unread',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      readAt: null,
    });
    mockStore.set('new', {
      recipientUid: 'user-a',
      type: 'system',
      message: 'new',
      status: 'unread',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      readAt: null,
    });
    mockStore.set('mid', {
      recipientUid: 'user-a',
      type: 'system',
      message: 'mid',
      status: 'read',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      readAt: new Date('2026-02-02T00:00:00Z'),
    });
    mockStore.set('other', {
      recipientUid: 'user-b',
      type: 'system',
      message: 'not yours',
      status: 'unread',
      createdAt: new Date('2026-04-01T00:00:00Z'),
      readAt: null,
    });

    const result = await listNotifications('user-a');

    expect(result.map((n) => n.id)).toEqual(['new', 'mid', 'old']);
    expect(result.find((n) => n.id === 'other')).toBeUndefined();
    expect(result[0].createdAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('returns an empty list when the user has none', async () => {
    expect(await listNotifications('user-a')).toEqual([]);
  });
});

describe('markNotificationAsRead', () => {
  it('marks an unread notification as read and sets readAt', async () => {
    await createNotification(validInput);

    const result = await markNotificationAsRead('user-a', 'n1');

    expect(result.status).toBe('read');
    expect(result.readAt).not.toBeNull();
    expect(mockStore.get('n1').status).toBe('read');
    expect(mockStore.get('n1').readAt).toBeInstanceOf(Date);
  });

  it('keeps the original readAt when already read', async () => {
    const readAt = new Date('2026-02-02T00:00:00Z');
    mockStore.set('n9', {
      recipientUid: 'user-a',
      type: 'system',
      message: 'done',
      status: 'read',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      readAt,
    });

    const result = await markNotificationAsRead('user-a', 'n9');

    expect(result.readAt).toBe('2026-02-02T00:00:00.000Z');
    expect(mockStore.get('n9').readAt).toBe(readAt);
  });

  it('throws 404 when the notification does not exist', async () => {
    await expect(markNotificationAsRead('user-a', 'missing')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('throws 403 and leaves the notification unchanged for another user', async () => {
    await createNotification(validInput);

    await expect(markNotificationAsRead('user-b', 'n1')).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(mockStore.get('n1').status).toBe('unread');
  });

  it('throws NotificationError instances', async () => {
    await expect(markNotificationAsRead('user-a', 'missing')).rejects.toBeInstanceOf(
      NotificationError
    );
  });
});
