const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');

const router = express.Router();

// Protected: returns the caller's own synced local user record.
// Also demonstrates how any other feature route should be protected -
// just add `verifyFirebaseToken` as middleware and read req.localUser.
router.get('/me', verifyFirebaseToken, (req, res) => {
  res.status(200).json({ user: req.localUser });
});

// Optional: force-logout across all devices by revoking the user's
// refresh tokens. Firebase ID tokens are short-lived and stateless, so
// this is the backend's only real lever over "logout" - normal sign-out
// happens client-side via the Firebase client SDK.
router.post('/logout-all-devices', verifyFirebaseToken, async (req, res) => {
  try {
    const admin = initializeFirebaseAdmin();
    await admin.auth().revokeRefreshTokens(req.firebaseUser.uid);
    res.status(200).json({ message: 'All sessions revoked.' });
  } catch (err) {
    res.status(500).json({
      error: 'revoke_failed',
      message: 'Could not revoke sessions.',
    });
  }
});

module.exports = router;
