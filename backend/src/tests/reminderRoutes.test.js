const request = require('supertest');
const express = require('express');

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: jest.fn(),
}));

jest.mock('../services/reminderService', () => ({
  runReminderScan: jest.fn(),
}));

const { runReminderScan } = require('../services/reminderService');
const reminderRoutes = require('../routes/reminderRoutes');

const app = express();
app.use(express.json());
app.use('/api/reminders', reminderRoutes);

const INTERNAL_KEY = 'test-internal-key';
const fakeSummary = {
  usersChecked: 2,
  itemsChecked: 5,
  remindersCreated: 1,
  duplicatesSkipped: 0,
  skipped: { completed: 1, noDeadline: 0, pastDeadline: 1, outsideWindow: 2 },
  errors: 0,
  windows: [1, 7],
  ranAt: '2026-10-17T12:00:00.000Z',
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
  runReminderScan.mockResolvedValue(fakeSummary);
});

describe('POST /api/reminders/run authorization', () => {
  it('returns 403 without the internal key header', async () => {
    const res = await request(app).post('/api/reminders/run');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('forbidden');
    expect(runReminderScan).not.toHaveBeenCalled();
  });

  it('returns 403 with a wrong internal key', async () => {
    const res = await request(app)
      .post('/api/reminders/run')
      .set('x-internal-api-key', 'wrong-key');

    expect(res.status).toBe(403);
    expect(runReminderScan).not.toHaveBeenCalled();
  });

  it('returns 403 when INTERNAL_API_KEY is not configured', async () => {
    delete process.env.INTERNAL_API_KEY;

    const res = await request(app)
      .post('/api/reminders/run')
      .set('x-internal-api-key', INTERNAL_KEY);

    expect(res.status).toBe(403);
    expect(runReminderScan).not.toHaveBeenCalled();
  });
});

describe('POST /api/reminders/run', () => {
  it('runs the scan and returns the summary', async () => {
    const res = await request(app)
      .post('/api/reminders/run')
      .set('x-internal-api-key', INTERNAL_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: fakeSummary });
    expect(runReminderScan).toHaveBeenCalledTimes(1);
  });

  it('returns 500 without internals when the scan throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    runReminderScan.mockRejectedValue(new Error('Firestore down'));

    const res = await request(app)
      .post('/api/reminders/run')
      .set('x-internal-api-key', INTERNAL_KEY);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong.' });
    console.error.mockRestore();
  });
});
