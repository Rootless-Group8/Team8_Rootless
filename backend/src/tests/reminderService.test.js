// Minimal in-memory stand-in for the parts of Firestore the reminder service
// uses: collection('checklists').get() and
// collection('deadline_reminders').doc(id).create / update / delete / get
function createFakeDb(checklists = {}) {
  const reminders = new Map();

  const reminderRef = (id) => ({
    id,
    get: async () => ({ exists: reminders.has(id), data: () => reminders.get(id) }),
    create: async (data) => {
      if (reminders.has(id)) {
        const err = new Error('Document already exists');
        err.code = 6;
        throw err;
      }
      reminders.set(id, { ...data });
    },
    update: async (patch) => {
      reminders.set(id, { ...reminders.get(id), ...patch });
    },
    delete: async () => {
      reminders.delete(id);
    },
  });

  const collection = (name) => {
    if (name === 'checklists') {
      return {
        get: async () => ({
          docs: Object.entries(checklists).map(([id, data]) => ({ id, data: () => data })),
        }),
      };
    }
    return { doc: (id) => reminderRef(id) };
  };

  return { db: { collection }, reminders };
}

let mockDb;

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: () => ({ firestore: () => mockDb }),
}));

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn(),
}));

const { createNotification } = require('../services/notificationService');
const {
  runReminderScan,
  getReminderWindows,
  parseDueDate,
  daysUntil,
  selectWindow,
  buildReminderKey,
} = require('../services/reminderService');

// Fixed clock: Saturday 17 October 2026, midday UTC.
const NOW = new Date('2026-10-17T12:00:00Z');

function item(id, dueDate, extra = {}) {
  return { id, title: `Task ${id}`, dueDate, completed: false, completedAt: null, ...extra };
}

let notificationCounter;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  notificationCounter = 0;
  createNotification.mockImplementation(async (input) => {
    notificationCounter += 1;
    return { id: `n${notificationCounter}`, ...input };
  });
  delete process.env.REMINDER_WINDOWS_DAYS;
});

afterEach(() => {
  console.error.mockRestore();
});

describe('window logic', () => {
  it('parses only real YYYY-MM-DD dates', () => {
    expect(parseDueDate('2026-10-24').toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(parseDueDate('2026-02-31')).toBeNull();
    expect(parseDueDate('Before you apply')).toBeNull();
    expect(parseDueDate('2026-10-24T00:00:00Z')).toBeNull();
    expect(parseDueDate(undefined)).toBeNull();
    expect(parseDueDate(null)).toBeNull();
  });

  it('counts whole UTC days until the deadline', () => {
    expect(daysUntil(parseDueDate('2026-10-24'), NOW)).toBe(7);
    expect(daysUntil(parseDueDate('2026-10-18'), NOW)).toBe(1);
    expect(daysUntil(parseDueDate('2026-10-17'), NOW)).toBe(0);
    expect(daysUntil(parseDueDate('2026-10-16'), NOW)).toBe(-1);
  });

  it('picks the smallest window that contains the deadline', () => {
    const windows = [1, 7];
    expect(selectWindow(0, windows)).toBe(1);
    expect(selectWindow(1, windows)).toBe(1);
    expect(selectWindow(2, windows)).toBe(7);
    expect(selectWindow(7, windows)).toBe(7);
    expect(selectWindow(8, windows)).toBeNull();
    expect(selectWindow(-1, windows)).toBeNull();
  });

  it('defaults to 7 and 1 day windows and reads REMINDER_WINDOWS_DAYS', () => {
    expect(getReminderWindows(undefined)).toEqual([1, 7]);
    expect(getReminderWindows('14, 3,3')).toEqual([3, 14]);
    expect(getReminderWindows('abc')).toEqual([1, 7]);
  });

  it('creates 7 day and 1 day reminders with the right messages', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': {
        uid: 'user-a',
        items: [
          item('apply', '2026-10-24'),
          item('book', '2026-10-18'),
          item('mid', '2026-10-20'),
          item('far', '2026-10-30'),
        ],
      },
    }));

    const summary = await runReminderScan({ now: NOW });

    expect(summary.remindersCreated).toBe(3);
    expect(summary.skipped.outsideWindow).toBe(1);
    expect(createNotification).toHaveBeenCalledWith({
      recipientUid: 'user-a',
      type: 'deadline_reminder',
      message: 'Reminder: "Task apply" is due in 7 days (2026-10-24).',
    });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Reminder: "Task book" is due tomorrow (2026-10-18).' })
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Reminder: "Task mid" is due in 3 days (2026-10-20).' })
    );
  });

  it('uses configured windows when passed in', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': { items: [item('far', '2026-10-30')] },
    }));

    const summary = await runReminderScan({ now: NOW, windows: [14] });

    expect(summary.remindersCreated).toBe(1);
  });

  it('reminds on the checklist arrivalDate', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': { items: [], arrivalDate: '2026-10-24', destinationCountry: 'Portugal' },
    }));

    const summary = await runReminderScan({ now: NOW });

    expect(summary.remindersCreated).toBe(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Reminder: your planned arrival in Portugal is in 7 days (2026-10-24).',
      })
    );
  });
});

describe('duplicate prevention', () => {
  it('builds a deterministic key per user, item, and window', () => {
    expect(buildReminderKey('user-a', 'apply', 7)).toBe('user-a_apply_7d');
    expect(buildReminderKey('user-a', 'a/b', 1)).toBe('user-a_a_b_1d');
  });

  it('never sends the same reminder twice across scans', async () => {
    let reminders;
    ({ db: mockDb, reminders } = createFakeDb({
      'user-a': { items: [item('apply', '2026-10-24')] },
    }));

    const first = await runReminderScan({ now: NOW });
    const second = await runReminderScan({ now: NOW });

    expect(first.remindersCreated).toBe(1);
    expect(second.remindersCreated).toBe(0);
    expect(second.duplicatesSkipped).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(reminders.get('user-a_apply_7d')).toEqual(
      expect.objectContaining({ status: 'sent', notificationId: 'n1', windowDays: 7 })
    );
  });

  it('still sends the 1 day reminder after the 7 day one', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': { items: [item('apply', '2026-10-24')] },
    }));

    await runReminderScan({ now: NOW });
    const later = await runReminderScan({ now: new Date('2026-10-23T12:00:00Z') });

    expect(later.remindersCreated).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it('does not let two overlapping scans both send', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': { items: [item('apply', '2026-10-24')] },
    }));

    const [a, b] = await Promise.all([
      runReminderScan({ now: NOW }),
      runReminderScan({ now: NOW }),
    ]);

    expect(a.remindersCreated + b.remindersCreated).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});

describe('skipped items', () => {
  it('skips completed items, missing or unparseable deadlines, and past deadlines', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': {
        items: [
          item('done', '2026-10-18', { completed: true }),
          item('none', undefined),
          item('text', 'At least 30 days before arrival'),
          item('past', '2026-10-10'),
          item('due', '2026-10-18'),
        ],
      },
    }));

    const summary = await runReminderScan({ now: NOW });

    expect(summary.skipped).toEqual({
      completed: 1,
      noDeadline: 2,
      pastDeadline: 1,
      outsideWindow: 0,
    });
    expect(summary.remindersCreated).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('handles a checklist with no items or arrivalDate', async () => {
    ({ db: mockDb } = createFakeDb({ 'user-a': { uid: 'user-a' } }));

    const summary = await runReminderScan({ now: NOW });

    expect(summary.usersChecked).toBe(1);
    expect(summary.itemsChecked).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('per item error handling', () => {
  it('logs a failed item and keeps scanning other items and users', async () => {
    let reminders;
    ({ db: mockDb, reminders } = createFakeDb({
      'user-a': { items: [item('bad', '2026-10-18'), item('good', '2026-10-24')] },
      'user-b': { items: [item('other', '2026-10-18')] },
    }));
    createNotification.mockImplementation(async (input) => {
      if (input.message.includes('Task bad')) {
        throw new Error('Firestore unavailable');
      }
      notificationCounter += 1;
      return { id: `n${notificationCounter}` };
    });

    const summary = await runReminderScan({ now: NOW });

    expect(summary.errors).toBe(1);
    expect(summary.remindersCreated).toBe(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('user user-a, item bad'),
      expect.any(Error)
    );
    // The claim is released so the next scan can retry the failed reminder.
    expect(reminders.has('user-a_bad_1d')).toBe(false);
  });

  it('retries a failed reminder on the next scan', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': { items: [item('flaky', '2026-10-18')] },
    }));
    createNotification.mockRejectedValueOnce(new Error('temporary'));

    const first = await runReminderScan({ now: NOW });
    const second = await runReminderScan({ now: NOW });

    expect(first.errors).toBe(1);
    expect(second.remindersCreated).toBe(1);
  });

  it('logs a user whose checklist data cannot be read and moves on', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-b': { items: [item('ok', '2026-10-18')] },
    }));
    const realCollection = mockDb.collection;
    mockDb.collection = (name) => {
      if (name !== 'checklists') return realCollection(name);
      return {
        get: async () => ({
          docs: [
            { id: 'user-a', data: () => { throw new Error('corrupt'); } },
            { id: 'user-b', data: () => ({ items: [item('ok', '2026-10-18')] }) },
          ],
        }),
      };
    };

    const summary = await runReminderScan({ now: NOW });

    expect(summary.usersChecked).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.remindersCreated).toBe(1);
  });
});

describe('summary counts', () => {
  it('reports users checked, items checked, and reminders created', async () => {
    ({ db: mockDb } = createFakeDb({
      'user-a': { items: [item('a1', '2026-10-18'), item('a2', '2026-11-30')] },
      'user-b': { items: [item('b1', '2026-10-24')], arrivalDate: '2026-12-01' },
      'user-c': { items: [] },
    }));

    const summary = await runReminderScan({ now: NOW });

    expect(summary).toEqual({
      usersChecked: 3,
      itemsChecked: 4,
      remindersCreated: 2,
      duplicatesSkipped: 0,
      skipped: { completed: 0, noDeadline: 0, pastDeadline: 0, outsideWindow: 2 },
      errors: 0,
      windows: [1, 7],
      ranAt: NOW.toISOString(),
    });
  });
});
