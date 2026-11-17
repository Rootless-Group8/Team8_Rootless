/**
 * copyToFirestoreDraft.js
 *
 * Copies Australia, Japan, Netherlands, and New Zealand's student visa
 * program data from Realtime Database (countryVisaPrograms) into a
 * Firestore collection, as a clearly-labeled DRAFT for review.
 *
 * This does NOT touch or delete anything in Realtime Database -- the
 * Checklist Generator keeps reading from there exactly as it does now,
 * for every country, with zero risk of breaking anything. This is
 * purely an additional copy, meant as a starting point for independent
 * verification against the real government sites, the same process
 * already used for Mexico and Spain.
 *
 * Deliberately NOT written into the existing "visaRequirements"
 * Firestore collection, since that holds tourist visa data in a
 * completely different schema -- mixing them would be confusing.
 *
 * USAGE:
 *   export FIREBASE_SERVICE_ACCOUNT=$(cat ../src/config/secrets/serviceAccountKey.json)
 *   export FIREBASE_DATABASE_URL=https://daab-fcc5c-default-rtdb.firebaseio.com
 *   node copyToFirestoreDraft.js
 */

const admin = require("firebase-admin");
const axios = require("axios");

const COUNTRIES_TO_COPY = ["AU", "JP", "NL", "NZ"];
const FIRESTORE_COLLECTION = "studentVisaDraftsForReview";

async function getAccessToken(serviceAccount) {
  const credential = admin.credential.cert(serviceAccount);
  const { access_token: accessToken } = await credential.getAccessToken();
  return accessToken;
}

async function fetchCountryPrograms(databaseURL, accessToken, countryCode) {
  const url = `${databaseURL.replace(/\/$/, "")}/countryVisaPrograms/${countryCode}.json?access_token=${accessToken}`;
  const response = await axios.get(url, { timeout: 15000 });
  return response.data;
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

  const accessToken = await getAccessToken(serviceAccount);

  for (const code of COUNTRIES_TO_COPY) {
    console.log(`Fetching ${code} from Realtime Database...`);
    const programs = await fetchCountryPrograms(databaseURL, accessToken, code);
    if (!programs) {
      console.warn(`  No data found for ${code} in Realtime Database, skipping.`);
      continue;
    }

    await firestore.collection(FIRESTORE_COLLECTION).doc(code).set({
      programs,
      note: "Draft copy from countryVisaPrograms in Realtime Database, researched by Aramata. For review/verification before being reseeded by Adi into Realtime Database following the team's established schema.",
      copiedAt: new Date().toISOString(),
      status: "needs_review",
    });
    console.log(`  Copied ${code} into Firestore collection "${FIRESTORE_COLLECTION}".`);
  }

  console.log("\nDone. Realtime Database was not modified -- this was an additional copy only.");
}

main().catch((err) => {
  console.error("Failed to copy data to Firestore:", err.message);
  process.exitCode = 1;
});
