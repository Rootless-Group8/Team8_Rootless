/**
 * removeFromRealtimeDb.js
 *
 * Removes Australia, Japan, Netherlands, and New Zealand from
 * countryVisaPrograms in Realtime Database, per agreement with Adi:
 * she'll verify and reseed these herself from the Firestore draft
 * copy (studentVisaDraftsForReview), rather than working from a
 * leftover copy sitting in the database she's actively seeding into.
 *
 * SAFETY CHECK: before deleting anything, this script first confirms
 * each country already exists in the Firestore draft collection. If
 * even one is missing there, it stops and deletes nothing, so there's
 * no way to lose this research entirely.
 *
 * USAGE:
 *   export FIREBASE_SERVICE_ACCOUNT=$(cat ../src/config/secrets/serviceAccountKey.json)
 *   export FIREBASE_DATABASE_URL=https://daab-fcc5c-default-rtdb.firebaseio.com
 *   node removeFromRealtimeDb.js
 */

const admin = require("firebase-admin");
const axios = require("axios");

const COUNTRIES_TO_REMOVE = ["AU", "JP", "NL", "NZ"];
const FIRESTORE_COLLECTION = "studentVisaDraftsForReview";

async function getAccessToken(serviceAccount) {
  const credential = admin.credential.cert(serviceAccount);
  const { access_token: accessToken } = await credential.getAccessToken();
  return accessToken;
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccountJson || !databaseURL) {
    console.error("FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL must both be set.");
    process.exitCode = 1;
    return;
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const firestore = admin.firestore();

  console.log("Checking the Firestore draft copy exists before deleting anything...");
  for (const code of COUNTRIES_TO_REMOVE) {
    const doc = await firestore.collection(FIRESTORE_COLLECTION).doc(code).get();
    if (!doc.exists) {
      console.error(`SAFETY STOP: ${code} not found in Firestore collection "${FIRESTORE_COLLECTION}". Deleting nothing. Run copyToFirestoreDraft.js first.`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ${code} confirmed safe in Firestore.`);
  }

  const accessToken = await getAccessToken(serviceAccount);

  for (const code of COUNTRIES_TO_REMOVE) {
    const url = `${databaseURL.replace(/\/$/, "")}/countryVisaPrograms/${code}.json?access_token=${accessToken}`;
    await axios.delete(url, { timeout: 15000 });
    console.log(`Removed ${code} from Realtime Database.`);
  }

  console.log("\nDone. All 4 countries are safely in Firestore and removed from Realtime Database.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exitCode = 1;
});
