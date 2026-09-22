/**
 * firestoreWriter.js
 *
 * Writes scraper results into the team's shared Firestore database,
 * so everyone can see the data without running the scraper
 * themselves.
 *
 * SETUP (do this once):
 *   1. In the Firebase Console, go to Project Settings > Service
 *      Accounts > Generate new private key. This downloads a JSON
 *      file -- keep it secret, never commit it to the repo.
 *   2. Copy the ENTIRE contents of that JSON file.
 *   3. In your GitHub repo: Settings > Secrets and variables >
 *      Actions > New repository secret. Name it
 *      FIREBASE_SERVICE_ACCOUNT, and paste the JSON as the value.
 *   4. Locally (for testing on your own machine), save the same JSON
 *      file somewhere OUTSIDE the repo and set the environment
 *      variable before running:
 *        export FIREBASE_SERVICE_ACCOUNT=$(cat /path/to/your-key.json)
 *
 * If FIREBASE_SERVICE_ACCOUNT isn't set (e.g. a teammate running
 * locally without Firebase credentials), this module logs a warning
 * and skips the Firestore write rather than crashing -- the local
 * JSON output in scraper.js still works either way.
 */

const admin = require("firebase-admin");
const { logger } = require("./logger");

let firestoreDb = null;
let initAttempted = false;

function getFirestore() {
  if (initAttempted) return firestoreDb;
  initAttempted = true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT environment variable not set -- skipping Firestore write. Results are still saved locally to output/."
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firestoreDb = admin.firestore();
    return firestoreDb;
  } catch (err) {
    logger.error("Failed to initialize Firebase Admin SDK -- check FIREBASE_SERVICE_ACCOUNT is valid JSON", {
      error: err.message,
    });
    return null;
  }
}

/**
 * Writes an array of visa requirement records (already shaped by
 * models.js's toDbRow()) into the "visaRequirements" collection.
 * Each record is stored under a deterministic doc ID
 * (origin_destination) so re-running the scraper updates the same
 * document instead of creating duplicates.
 */
async function writeToFirestore(rows) {
  const db = getFirestore();
  if (!db) return { written: 0, skipped: true };

  const collection = db.collection("visaRequirements");
  const batch = db.batch();

  for (const row of rows) {
    const docId = `${row.origin_country}_${row.destination_country}`;
    batch.set(collection.doc(docId), row, { merge: true });
  }

  await batch.commit();
  logger.info(`Wrote ${rows.length} record(s) to Firestore collection "visaRequirements"`);
  return { written: rows.length, skipped: false };
}

module.exports = { writeToFirestore };
