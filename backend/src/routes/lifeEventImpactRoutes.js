const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const { LifeEventError } = require('../services/lifeEventService');
const {
  getLifeEventImpacts,
  previewLifeEventImpacts,
} = require('../services/lifeEventImpactService');

// Takes the Realtime Database handle (for visa processing times) like the
// deadline and ranking routers, so tests can pass in a mocked one. Mounted at
// /api/life-events/impacts, before the life event router, so "impacts" isn't
// read as a life event ID.
module.exports = (db) => {
  const router = express.Router();

  // The UID always comes from the verified token.
  router.use(verifyFirebaseToken);

  function sendError(res, err) {
    if (err instanceof LifeEventError) {
      const body = { error: err.code, message: err.message };
      if (err.details) body.details = err.details;
      return res.status(err.status).json(body);
    }
    console.error('Life event impact route error:', err);
    return res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  }

  // GET /api/life-events/impacts: impacts for the caller's saved events
  router.get('/', async (req, res) => {
    try {
      const result = await getLifeEventImpacts(db, req.firebaseUser.uid);
      return res.status(200).json(result);
    } catch (err) {
      return sendError(res, err);
    }
  });

  // POST /api/life-events/impacts/preview: what-if for an unsaved event
  router.post('/preview', async (req, res) => {
    try {
      const result = await previewLifeEventImpacts(db, req.firebaseUser.uid, req.body);
      return res.status(200).json(result);
    } catch (err) {
      return sendError(res, err);
    }
  });

  return router;
};
