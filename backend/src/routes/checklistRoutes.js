const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const {
  generateChecklist,
  getChecklist,
  setItemCompleted,
} = require('../services/checklistService');
const { ChecklistError } = require('../services/checklistError');

const router = express.Router();

// All checklist routes require a valid Firebase ID token. The uid always
// comes from the verified token, never from the request, so a user can only
// ever read or change their own checklist.
router.use(verifyFirebaseToken);

function handleError(res, err) {
  if (err instanceof ChecklistError) {
    const body = { error: err.message };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(err.status).json(body);
  }
  console.error('Checklist route error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
}

/**
 * POST /api/checklist/generate
 * Builds the checklist from the saved profile. Regenerating replaces
 * incomplete items and keeps completed status for items that still apply.
 * 201 when first created, 200 when regenerated, 400 for a bad profile.
 */
router.post('/generate', async (req, res) => {
  try {
    const { checklist, created } = await generateChecklist(req.firebaseUser.uid);
    return res.status(created ? 201 : 200).json({ checklist });
  } catch (err) {
    return handleError(res, err);
  }
});

/**
 * GET /api/checklist
 * Returns the current user's checklist, or 404 if none exists yet.
 */
router.get('/', async (req, res) => {
  try {
    const checklist = await getChecklist(req.firebaseUser.uid);
    if (!checklist) {
      return res.status(404).json({
        error: 'No checklist found. Generate your checklist first.',
      });
    }
    return res.status(200).json({ checklist });
  } catch (err) {
    return handleError(res, err);
  }
});

/**
 * PATCH /api/checklist/items/:itemId
 * Body: { "completed": true | false }
 * Returns the updated item, or 404 for an unknown item.
 */
router.patch('/items/:itemId', async (req, res) => {
  const completed = req.body && req.body.completed;
  if (typeof completed !== 'boolean') {
    return res
      .status(400)
      .json({ error: 'Request body must include "completed" as true or false.' });
  }

  try {
    const item = await setItemCompleted(
      req.firebaseUser.uid,
      req.params.itemId,
      completed
    );
    return res.status(200).json({ item });
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
