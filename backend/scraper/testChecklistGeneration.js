/**
 * testChecklistGeneration.js
 *
 * Calls buildChecklistItems() directly -- a pure function per its own
 * doc comment in checklistService.js, no Firestore/RTDB access needed --
 * to confirm real, country-specific student checklist items generate
 * correctly for the newly seeded countries, without needing the full
 * backend server running (which currently hangs on startup for an
 * unrelated reason: initializeFirebaseAdmin().database() in server.js
 * hits the same Node v24 Realtime Database issue found earlier tonight).
 *
 * USAGE (from backend/scraper/):
 *   node testChecklistGeneration.js
 */

const { buildChecklistItems } = require("../src/services/checklistService");

const testProfiles = [
  { label: "Mexico (student)", profile: { destinationCountry: "MX", visaType: "student", plannedArrivalDate: "2027-03-01" } },
  { label: "Japan (student)", profile: { destinationCountry: "JP", visaType: "student", plannedArrivalDate: "2027-03-01" } },
  { label: "Spain (student)", profile: { destinationCountry: "ES", visaType: "student", plannedArrivalDate: "2027-03-01" } },
];

for (const { label, profile } of testProfiles) {
  console.log(`\n=== ${label} ===`);
  try {
    const items = buildChecklistItems(profile);
    console.log(`${items.length} item(s) generated.`);
    const realItems = items.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(profile.destinationCountry.toLowerCase()) ||
      (item.title && !/generic|default|fallback/i.test(item.title))
    );
    items.slice(0, 5).forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.title || item.name || JSON.stringify(item).slice(0, 80)}`);
    });
  } catch (err) {
    console.error(`  Failed: ${err.message}`);
  }
}
