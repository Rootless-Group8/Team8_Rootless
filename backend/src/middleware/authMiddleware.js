const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');
const { syncUserRecord } = require('../services/userService');

/**
 * Express middleware that verifies a Firebase ID token sent as:
 *   Authorization: Bearer <token>
 *
 * On success:
 *   - req.firebaseUser = decoded token (uid, email, email_verified, ...)
 *   - req.localUser    = the synced local Firestore user record
 *
 * On failure, responds 401 with one of a small set of clear error codes.
 * We deliberately don't leak raw Firebase error internals to the client -
 * that would hand an attacker a token-forging debugging oracle.
 */
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      error: 'missing_token',
      message: 'Authorization header must be "Bearer <Firebase ID token>".',
    });
  }

  let decodedToken;
  try {
    const admin = initializeFirebaseAdmin();
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({
      error: mapFirebaseAuthError(err),
      message: 'Invalid or expired authentication token.',
    });
  }

  req.firebaseUser = decodedToken;

  try {
    req.localUser = await syncUserRecord(decodedToken);
  } catch (err) {
    // The token itself was valid - this is a server-side sync failure,
    // not an auth failure, so it gets a 500 rather than a 401.
    return res.status(500).json({
      error: 'user_sync_failed',
      message: 'Authenticated, but failed to load or create your user record.',
    });
  }

  return next();
}

function mapFirebaseAuthError(err) {
  switch (err && err.code) {
    case 'auth/id-token-expired':
      return 'token_expired';
    case 'auth/id-token-revoked':
      return 'token_revoked';
    case 'auth/argument-error':
    case 'auth/invalid-id-token':
      return 'token_invalid';
    default:
      return 'token_verification_failed';
  }
}

module.exports = { verifyFirebaseToken, mapFirebaseAuthError };
