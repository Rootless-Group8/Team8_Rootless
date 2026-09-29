const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const {
  getProfile,
  updateProfile,
  validateProfilePayload,
} = require('../services/profileService');

const router = express.Router();

// All profile routes require a valid Firebase ID token.
router.use(verifyFirebaseToken);

/**
 * GET /api/profile
 * Returns the current user's relocation profile, or null if they haven't
 * completed profile setup yet.
 */
router.get('/', async (req, res) => {
  try {
    const profile = await getProfile(req.firebaseUser.uid);
    return res.status(200).json({ profile });
  } catch (err) {
    return res.status(500).json({
      error: 'profile_fetch_failed',
      message: 'Failed to load your profile. Please try again.',
    });
  }
});

/**
 * Shared handler for PATCH and PUT /api/profile.
 * Creates or updates the current user's relocation profile fields.
 * Supports partial updates; only fields present in the request body are
 * validated and written. If no profile document exists yet, one is
 * created via merge upsert. Both verbs are supported since the
 * acceptance criteria allow either, and updateProfile is already a
 * merge upsert so the behavior is identical either way.
 */
async function handleProfileUpdate(req, res) {
  const payload = req.body || {};

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({
      error: 'empty_payload',
      message: 'Request body must include at least one profile field to update.',
    });
  }

  const errors = validateProfilePayload(payload);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'One or more profile fields are invalid.',
      fields: errors,
    });
  }

  try {
    const profile = await updateProfile(req.firebaseUser.uid, payload);
    return res.status(200).json({ profile });
  } catch (err) {
    return res.status(500).json({
      error: 'profile_update_failed',
      message: 'Failed to save your profile. Please try again.',
    });
  }
}

router.patch('/', handleProfileUpdate);
router.put('/', handleProfileUpdate);

module.exports = router;
