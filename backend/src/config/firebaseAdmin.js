const admin = require('firebase-admin');

let initialized = false;

/**
 * Lazily initializes the Firebase Admin SDK exactly once.
 *
 * Credentials are NEVER hardcoded or committed. Two supported sources,
 * both driven by environment variables (see .env.example):
 *
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON - the full service account JSON
 *      as a single-line string. Works well with most hosts/CI secret
 *      managers (Render, Railway, GitHub Actions secrets, etc.)
 *
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH - a filesystem path to the
 *      downloaded serviceAccountKey.json, for local dev only. That
 *      file must be .gitignore'd.
 */
function initializeFirebaseAdmin() {
  if (initialized) {
    return admin;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  let credential;

  if (serviceAccountJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Make sure it is set as a ' +
          'single-line string with escaped newlines in the private_key field.'
      );
    }
    credential = admin.credential.cert(serviceAccount);
  } else if (serviceAccountPath) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const serviceAccount = require(serviceAccountPath);
    credential = admin.credential.cert(serviceAccount);
  } else {
    throw new Error(
      'Missing Firebase service account credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON ' +
        'or FIREBASE_SERVICE_ACCOUNT_PATH in your environment (see .env.example).'
    );
  }

  admin.initializeApp({ credential });
  initialized = true;
  return admin;
}

/** Test-only helper to reset module state between test files. */
function _resetForTests() {
  initialized = false;
}

module.exports = { initializeFirebaseAdmin, _resetForTests };
