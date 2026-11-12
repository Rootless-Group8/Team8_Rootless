const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const {
  createCommunityTip,
  listCommunityTips,
  getCommunityTip,
  updateCommunityTip,
  deleteCommunityTip,
  resolveAuthorName,
  CommunityTipError,
} = require('../services/communityTipService');

const router = express.Router();

// All community tip routes require a valid Firebase ID token. The author UID
// always comes from the verified token, never from the request body or URL.
router.use(verifyFirebaseToken);

function sendError(res, err) {
  if (err instanceof CommunityTipError) {
    const body = { error: err.code, message: err.message };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(err.status).json(body);
  }
  console.error('Community tip route error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong.',
  });
}

// POST /api/community-tips: share a tip
router.post('/', async (req, res) => {
  try {
    const author = {
      uid: req.firebaseUser.uid,
      name: resolveAuthorName(req.firebaseUser, req.localUser),
    };
    const tip = await createCommunityTip(author, req.body);
    return res.status(201).json(tip);
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/community-tips: tips from all users, newest first, with optional
// destinationCountry, city and topic filters
router.get('/', async (req, res) => {
  try {
    const tips = await listCommunityTips(req.query);
    return res.status(200).json({ tips, count: tips.length });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/community-tips/:id: one tip
router.get('/:id', async (req, res) => {
  try {
    const tip = await getCommunityTip(req.params.id);
    return res.status(200).json(tip);
  } catch (err) {
    return sendError(res, err);
  }
});

// PATCH /api/community-tips/:id: author only, updates only the fields sent
router.patch('/:id', async (req, res) => {
  try {
    const tip = await updateCommunityTip(req.firebaseUser.uid, req.params.id, req.body);
    return res.status(200).json(tip);
  } catch (err) {
    return sendError(res, err);
  }
});

// DELETE /api/community-tips/:id: author only
router.delete('/:id', async (req, res) => {
  try {
    await deleteCommunityTip(req.firebaseUser.uid, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return sendError(res, err);
  }
});

module.exports = router;
