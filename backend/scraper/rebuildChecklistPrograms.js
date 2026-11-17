/**
 * rebuildChecklistPrograms.js
 *
 * Reads countryVisaPrograms from Realtime Database (the live source) and
 * converts any country NOT already present in checklistData.json's
 * "programs" section into the array-grouped-by-category shape
 * backend/src/services/checklistRules.js actually reads
 * (data.programs[iso2][category] -> array of program objects).
 *
 * Deliberately only ADDS missing countries -- it never touches or
 * overwrites a country already present in checklistData.json (e.g. CA,
 * GB), since those already work correctly and this script has no way
 * to know whether their current content was hand-adjusted after the
 * last real build.
 *
 * Conversion notes:
 *   - countryVisaPrograms/{iso2}/{programKey} is a flat object with a
 *     "category" field inside it; checklistData.json instead groups
 *     programs INTO an array under that category name, with the
 *     programKey moved to a "key" field on each array entry.
 *   - "processingTimeNotes" (live DB) becomes "processingTime"
 *     (checklistData.json's actual field name, confirmed directly from
 *     Canada's existing entry).
 *   - "minimumRequiredFunds" is carried over as-is; checklistRules.js
 *     doesn't currently read it, but nothing breaks by it being there,
 *     and it's available for a future feature (e.g. the Affordability
 *     Calculator) to use.
 *
 * USAGE:
 *   export FIREBASE_SERVICE_ACCOUNT=$(cat ../src/config/secrets/serviceAccountKey.json)
 *   export FIREBASE_DATABASE_URL=https://daab-fcc5c-default-rtdb.firebaseio.com
 *   node rebuildChecklistPrograms.js
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const axios = require("axios");

// This script lives in backend/scraper/, alongside writeStudentPrograms.js,
// so it can reuse the same firebase-admin/axios dependencies already
// installed there.
const CHECKLIST_DATA_PATH = path.join(__dirname, "../src/data/checklistData.json");

async function getAccessToken(serviceAccount) {
  const credential = admin.credential.cert(serviceAccount);
  const { access_token: accessToken } = await credential.getAccessToken();
  return accessToken;
}

async function fetchCountryVisaPrograms(databaseURL, accessToken) {
  const url = `${databaseURL.replace(/\/$/, "")}/countryVisaPrograms.json?access_token=${accessToken}`;
  const response = await axios.get(url, { timeout: 15000 });
  return response.data || {};
}

/**
 * Converts one country's flat countryVisaPrograms entry into the
 * array-grouped-by-category shape checklistData.json uses.
 */
function convertCountryProgramsFlatToGrouped(countryPrograms) {
  const grouped = {};
  for (const [programKey, program] of Object.entries(countryPrograms)) {
    const category = program.category;
    if (!category) {
      console.warn(`  Skipping "${programKey}": no category field found.`);
      continue;
    }
    const converted = {
      key: programKey,
      name: program.name,
      eligibilityCriteria: program.eligibilityCriteria,
      requiredDocuments: program.requiredDocuments,
      fees: program.fees,
      processingTime: program.processingTimeNotes,
      validityDuration: program.validityDuration,
      sourceUrl: program.sourceUrl,
      lastVerified: program.lastVerified,
    };
    if (program.minimumRequiredFunds) {
      converted.minimumRequiredFunds = program.minimumRequiredFunds;
    }
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(converted);
  }
  return grouped;
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccountJson || !databaseURL) {
    console.error("FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL must both be set.");
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(CHECKLIST_DATA_PATH)) {
    console.error(`checklistData.json not found at ${CHECKLIST_DATA_PATH}`);
    process.exitCode = 1;
    return;
  }

  const checklistData = JSON.parse(fs.readFileSync(CHECKLIST_DATA_PATH, "utf-8"));
  const existingCountries = Object.keys(checklistData.programs || {});
  console.log("Countries already in checklistData.json:", existingCountries.join(", "));

  const serviceAccount = JSON.parse(serviceAccountJson);
  const accessToken = await getAccessToken(serviceAccount);
  const liveData = await fetchCountryVisaPrograms(databaseURL, accessToken);
  const liveCountries = Object.keys(liveData);
  console.log("Countries live in the database:", liveCountries.join(", "));

  const missingCountries = liveCountries.filter((c) => !existingCountries.includes(c));
  if (missingCountries.length === 0) {
    console.log("Nothing to add -- every live country is already in checklistData.json.");
    return;
  }
  console.log("Adding missing countries:", missingCountries.join(", "));

  for (const code of missingCountries) {
    console.log(`Converting ${code}...`);
    checklistData.programs[code] = convertCountryProgramsFlatToGrouped(liveData[code]);
  }

  fs.writeFileSync(CHECKLIST_DATA_PATH, JSON.stringify(checklistData, null, 4));
  console.log(`\nDone. checklistData.json now includes: ${Object.keys(checklistData.programs).join(", ")}`);
}

main().catch((err) => {
  console.error("Failed to rebuild checklist programs:", err.message);
  process.exitCode = 1;
});
