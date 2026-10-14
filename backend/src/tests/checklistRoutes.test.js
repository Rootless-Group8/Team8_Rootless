const request = require('supertest');
const express = require('express');

// Fake auth: any "Bearer <uid>" header is accepted and the token text is
// used as the uid. No header means 401, like the real verifyFirebaseToken.
jest.mock('../middleware/authMiddleware', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.firebaseUser = { uid: header.slice('Bearer '.length) };
    return next();
  },
}));

jest.mock('../services/checklistService', () => ({
  generateChecklist: jest.fn(),
  getChecklist: jest.fn(),
  setItemCompleted: jest.fn(),
}));

const {
  generateChecklist,
  getChecklist,
  setItemCompleted,
} = require('../services/checklistService');
const { ChecklistError } = require('../services/checklistError');
const checklistRoutes = require('../routes/checklistRoutes');

const app = express();
app.use(express.json());
app.use('/api/checklist', checklistRoutes);

const AUTH = { Authorization: 'Bearer user-1' };

beforeEach(() => {
  generateChecklist.mockReset();
  getChecklist.mockReset();
  setItemCompleted.mockReset();
});

describe('unauthorized access', () => {
  test('POST /generate returns 401 without a token', async () => {
    const res = await request(app).post('/api/checklist/generate');
    expect(res.status).toBe(401);
    expect(generateChecklist).not.toHaveBeenCalled();
  });

  test('GET / returns 401 without a token', async () => {
    const res = await request(app).get('/api/checklist');
    expect(res.status).toBe(401);
    expect(getChecklist).not.toHaveBeenCalled();
  });

  test('PATCH /items/:itemId returns 401 without a token', async () => {
    const res = await request(app)
      .patch('/api/checklist/items/a')
      .send({ completed: true });
    expect(res.status).toBe(401);
    expect(setItemCompleted).not.toHaveBeenCalled();
  });
});

describe('POST /api/checklist/generate', () => {
  test('returns 201 with the new checklist', async () => {
    generateChecklist.mockResolvedValueOnce({
      checklist: { uid: 'user-1', items: [] },
      created: true,
    });

    const res = await request(app).post('/api/checklist/generate').set(AUTH);

    expect(res.status).toBe(201);
    expect(res.body.checklist.uid).toBe('user-1');
    expect(generateChecklist).toHaveBeenCalledWith('user-1');
  });

  test('returns 200 when an existing checklist is regenerated', async () => {
    generateChecklist.mockResolvedValueOnce({
      checklist: { uid: 'user-1', items: [] },
      created: false,
    });

    const res = await request(app).post('/api/checklist/generate').set(AUTH);

    expect(res.status).toBe(200);
  });

  test('returns 400 with a clear message when the profile is missing', async () => {
    generateChecklist.mockRejectedValueOnce(
      new ChecklistError('PROFILE_NOT_FOUND', 'No relocation profile found.', 400)
    );

    const res = await request(app).post('/api/checklist/generate').set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile/i);
  });

  test('returns 400 with field details when the arrival date is missing', async () => {
    generateChecklist.mockRejectedValueOnce(
      new ChecklistError(
        'PROFILE_INCOMPLETE',
        'Your profile is missing required information: Planned arrival date is required.',
        400,
        { plannedArrivalDate: 'Planned arrival date is required.' }
      )
    );

    const res = await request(app).post('/api/checklist/generate').set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/arrival date/i);
    expect(res.body.details.plannedArrivalDate).toBeDefined();
  });

  test('returns 500 for unexpected errors', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    generateChecklist.mockRejectedValueOnce(new Error('firestore down'));

    const res = await request(app).post('/api/checklist/generate').set(AUTH);

    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/firestore/);
    spy.mockRestore();
  });
});

describe('GET /api/checklist', () => {
  test('returns the current user checklist', async () => {
    getChecklist.mockResolvedValueOnce({ uid: 'user-1', items: [{ id: 'a' }] });

    const res = await request(app).get('/api/checklist').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.checklist.items).toHaveLength(1);
    expect(getChecklist).toHaveBeenCalledWith('user-1');
  });

  test('returns 404 with a clear message when none has been generated', async () => {
    getChecklist.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/checklist').set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/generate/i);
  });

  test('only ever reads the checklist of the authenticated user', async () => {
    getChecklist.mockResolvedValue({ items: [] });

    await request(app)
      .get('/api/checklist?uid=someone-else')
      .set({ Authorization: 'Bearer user-2' });

    expect(getChecklist).toHaveBeenCalledWith('user-2');
    expect(getChecklist).not.toHaveBeenCalledWith('someone-else');
  });
});

describe('PATCH /api/checklist/items/:itemId', () => {
  test('marks an item complete and returns the updated item', async () => {
    setItemCompleted.mockResolvedValueOnce({ id: 'a', completed: true });

    const res = await request(app)
      .patch('/api/checklist/items/a')
      .set(AUTH)
      .send({ completed: true });

    expect(res.status).toBe(200);
    expect(res.body.item).toEqual({ id: 'a', completed: true });
    expect(setItemCompleted).toHaveBeenCalledWith('user-1', 'a', true);
  });

  test('marks an item incomplete', async () => {
    setItemCompleted.mockResolvedValueOnce({ id: 'a', completed: false });

    const res = await request(app)
      .patch('/api/checklist/items/a')
      .set(AUTH)
      .send({ completed: false });

    expect(res.status).toBe(200);
    expect(setItemCompleted).toHaveBeenCalledWith('user-1', 'a', false);
  });

  test('returns 404 for an unknown item id', async () => {
    setItemCompleted.mockRejectedValueOnce(
      new ChecklistError('ITEM_NOT_FOUND', 'Checklist item "zzz" was not found.', 404)
    );

    const res = await request(app)
      .patch('/api/checklist/items/zzz')
      .set(AUTH)
      .send({ completed: true });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('returns 404 when no checklist has been generated', async () => {
    setItemCompleted.mockRejectedValueOnce(
      new ChecklistError('CHECKLIST_NOT_FOUND', 'No checklist found.', 404)
    );

    const res = await request(app)
      .patch('/api/checklist/items/a')
      .set(AUTH)
      .send({ completed: true });

    expect(res.status).toBe(404);
  });

  test('returns 400 when completed is missing or not a boolean', async () => {
    const missing = await request(app)
      .patch('/api/checklist/items/a')
      .set(AUTH)
      .send({});
    const wrongType = await request(app)
      .patch('/api/checklist/items/a')
      .set(AUTH)
      .send({ completed: 'yes' });

    expect(missing.status).toBe(400);
    expect(wrongType.status).toBe(400);
    expect(setItemCompleted).not.toHaveBeenCalled();
  });
});
