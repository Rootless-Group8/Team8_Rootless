const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const {
  createLifeEvent,
  listLifeEvents,
  getLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
  LifeEventError,
} = require('../services/lifeEventService');

const router = express.Router();

// All life event routes require a valid Firebase ID token. The UID always
// comes from the verified token, never from the request body or URL.
router.use(verifyFirebaseToken);

function sendError(res, err) {
  if (err instanceof LifeEventError) {
    const body = { error: err.code, message: err.message };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(err.status).json(body);
  }
  console.error('Life event route error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong.',
  });
}

// POST /api/life-events: create a life event
router.post('/', async (req, res) => {
  try {
    const event = await createLifeEvent(req.firebaseUser.uid, req.body);
    return res.status(201).json(event);
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/life-events: the caller's life events in date order
router.get('/', async (req, res) => {
  try {
    const events = await listLifeEvents(req.firebaseUser.uid);
    return res.status(200).json({ events, count: events.length });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/life-events/:id: one of the caller's life events
router.get('/:id', async (req, res) => {
  try {
    const event = await getLifeEvent(req.firebaseUser.uid, req.params.id);
    return res.status(200).json(event);
  } catch (err) {
    return sendError(res, err);
  }
});

// PATCH /api/life-events/:id: update only the fields that were sent
router.patch('/:id', async (req, res) => {
  try {
    const event = await updateLifeEvent(
      req.firebaseUser.uid,
      req.params.id,
      req.body
    );
    return res.status(200).json(event);
  } catch (err) {
    return sendError(res, err);
  }
});

// DELETE /api/life-events/:id: remove one of the caller's life events
router.delete('/:id', async (req, res) => {
  try {
    await deleteLifeEvent(req.firebaseUser.uid, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return sendError(res, err);
  }
});

module.exports = router;
