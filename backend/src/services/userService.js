const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');

const USERS_COLLECTION = 'users';

/**
 * Local user record shape (Firestore document, doc id = Firebase UID):
 * {
 *   uid: string,            // Firebase Auth UID (also the doc id)
 *   email: string | null,
 *   email_verified: boolean,
 *   created_at: ISO string,
 *   last_login_at: ISO string,
 *   // ...any app-specific fields (relocation profile, preferences, etc.)
 *   // get added by other features and are preserved by syncUserRecord.
 * }
 */

function getDb() {
  const admin = initializeFirebaseAdmin();
  return admin.firestore();
}

/**
 * Ensures a local Firestore user record exists for the given decoded
 * Firebase ID token, creating one on first sign-in. On every call it
 * refreshes `last_login_at` and keeps `email` in sync, without touching
 * any other app-specific fields other features may have added.
 *
 * @param {import('firebase-admin').auth.DecodedIdToken} decodedToken
 * @returns {Promise<object>} the resulting local user record
 */
async function syncUserRecord(decodedToken) {
  const db = getDb();
  const userRef = db.collection(USERS_COLLECTION).doc(decodedToken.uid);
  const snapshot = await userRef.get();
  const now = new Date().toISOString();

  if (!snapshot.exists) {
    const newUser = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      email_verified: Boolean(decodedToken.email_verified),
      created_at: now,
      last_login_at: now,
    };
    await userRef.set(newUser);
    return newUser;
  }

  const existing = snapshot.data();
  const updates = { last_login_at: now };

  if (decodedToken.email && decodedToken.email !== existing.email) {
    updates.email = decodedToken.email;
  }

  await userRef.update(updates);
  return { ...existing, ...updates };
}

/**
 * Fetches a local user record by Firebase UID, or null if none exists.
 * @param {string} uid
 */
async function getUserByUid(uid) {
  const db = getDb();
  const snapshot = await db.collection(USERS_COLLECTION).doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}

module.exports = { syncUserRecord, getUserByUid, USERS_COLLECTION };
