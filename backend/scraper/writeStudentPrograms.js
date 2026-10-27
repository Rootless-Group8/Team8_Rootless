/**
 * writeStudentPrograms.js
 *
 * Writes student visa program data into Realtime Database at
 * countryVisaPrograms/{countryIso2}/{programKey} — the exact live
 * structure already used for Canada (confirmed directly in the
 * Firebase console: countryVisaPrograms/CA/study_permit, etc., each
 * a flat object with a "category" field, not an array grouped by
 * category). buildChecklistData.js transforms this live data into
 * the "programs" array shape backend/src/services/checklistRules.js
 * consumes — that array shape only exists after the build step, it
 * is NOT the live database structure.
 *
 * This is deliberately separate from the existing per-origin/destination
 * scraper adapters (sources/canada.js, sources/govUk.js, etc.), which
 * answer a different question ("does a traveler from X need a visa for
 * Y?") and write to a different store (Firestore's visaRequirements
 * collection, via firestoreWriter.js). Student visa program eligibility,
 * documents, and fees are destination-only (no passport branching) and
 * read from a government consular page, not a machine-checkable
 * yes/no lookup — closer in spirit to how the Relocation Guides data
 * was researched and seeded than to the tourist-visa adapters. Adding
 * a second country only ever requires adding its entry to
 * studentPrograms.json; nothing here needs to change.
 *
 * SETUP: same FIREBASE_SERVICE_ACCOUNT env var as firestoreWriter.js
 * (see that file's header comment for how to set it up), plus
 * FIREBASE_DATABASE_URL, since this writes to Realtime Database
 * rather than Firestore.
 *
 * USAGE:
 *   export FIREBASE_SERVICE_ACCOUNT=$(cat /path/to/your-key.json)
 *   export FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
 *   node writeStudentPrograms.js
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const axios = require("axios");
const { logger } = require("./logger");

const REQUIRED_PROGRAM_FIELDS = [
  "category",
  "name",
  "eligibilityCriteria",
  "requiredDocuments",
  "fees",
  "processingTimeNotes",
  "validityDuration",
  "sourceUrl",
  "lastVerified",
];

function loadSeedData() {
  const dataPath = path.join(__dirname, "studentPrograms.json");
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Seed data file not found: ${dataPath}`);
  }
  return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
}

/** Validates every program entry has the fields the real live data already uses, before writing anything. */
function validate(seedData) {
  for (const [countryCode, programs] of Object.entries(seedData)) {
    if (countryCode.startsWith("_")) continue;

    const programKeys = Object.keys(programs);
    if (programKeys.length === 0) {
      throw new Error(`${countryCode} has no program entries.`);
    }

    programKeys.forEach((programKey) => {
      const program = programs[programKey];
      const missing = REQUIRED_PROGRAM_FIELDS.filter((field) => !(field in program));
      if (missing.length > 0) {
        throw new Error(`${countryCode}.${programKey} is missing field(s): ${missing.join(", ")}`);
      }
    });
  }
}

/**
 * Gets a Google OAuth access token from the service account credential,
 * without going through admin.database() at all. admin.database()'s
 * client uses a persistent websocket-based connection that was found
 * to hang indefinitely in this environment (confirmed via a step-by-step
 * diagnostic: requiring and initializing the SDK both worked, but the
 * actual read/write call never resolved or rejected). getAccessToken()
 * is a plain one-shot HTTPS call to Google's OAuth token endpoint, a
 * completely different code path, and writing via the RTDB REST API
 * with that token sidesteps the hanging client entirely.
 */
async function getAccessToken(serviceAccount) {
  const credential = admin.credential.cert(serviceAccount);
  const { access_token: accessToken } = await credential.getAccessToken();
  return accessToken;
}

async function writeViaRestApi(databaseURL, accessToken, updates) {
  const url = `${databaseURL.replace(/\/$/, "")}/.json?access_token=${accessToken}`;
  await axios.patch(url, updates, { timeout: 15000 });
}

async function main() {
  const seedData = loadSeedData();
  validate(seedData);

  const countryCodes = Object.keys(seedData).filter((k) => !k.startsWith("_"));
  logger.info(`Loaded student program data for: ${countryCodes.join(", ")}`);

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccountJson) {
    logger.warn("FIREBASE_SERVICE_ACCOUNT not set -- cannot write to Realtime Database. See this file's header comment for setup.");
    return;
  }
  if (!databaseURL) {
    logger.warn("FIREBASE_DATABASE_URL not set -- cannot write to Realtime Database.");
    return;
  }

  const updates = {};
  countryCodes.forEach((code) => {
    // Writing countryVisaPrograms/{code} as a merge-style fan-out update
    // (one key per program, not the whole node replaced), so any
    // existing programs for that country (e.g. CA's study_permit,
    // visitor_visa, work_permit) are left untouched.
    Object.entries(seedData[code]).forEach(([programKey, program]) => {
      updates[`countryVisaPrograms/${code}/${programKey}`] = program;
    });
  });

  const serviceAccount = JSON.parse(serviceAccountJson);
  const accessToken = await getAccessToken(serviceAccount);
  await writeViaRestApi(databaseURL, accessToken, updates);
  logger.info(`Wrote student program data to Realtime Database for: ${countryCodes.join(", ")}`);
}

main().catch((err) => {
  logger.error("Failed to write student program data", { error: err.message });
  process.exitCode = 1;
});
