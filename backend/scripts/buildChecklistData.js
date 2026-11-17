/**
 * Builds backend/src/data/checklistData.json from a Realtime Database export.
 *
 * Usage (from the backend folder):
 *   node scripts/buildChecklistData.js path/to/rtdb-export.json
 *
 * To refresh the checklist data, export the Realtime Database as JSON from the
 * Firebase console (Data tab, three dot menu, Export JSON), run this script on
 * the file, and commit the regenerated checklistData.json.
 *
 * Nodes used from the export:
 *   countries              ISO2 -> { name, iso3 }
 *   visaTypes              requirementType -> { label }
 *   requirements           passport ISO2 -> destination ISO2 -> entry rules (tourist)
 *   countryVisaPrograms    destination ISO2 -> program key -> program details
 * Only the tourist_visitor and student programs are kept.
 */
const fs = require('fs');
const path = require('path');

const KEEP_CATEGORIES = ['tourist_visitor', 'student'];

const input = process.argv[2];
const output =
  process.argv[3] || path.join(__dirname, '..', 'src', 'data', 'checklistData.json');

if (!input) {
  console.error('Usage: node scripts/buildChecklistData.js <rtdb-export.json> [output.json]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));

const countries = {};
Object.entries(raw.countries || {}).forEach(([iso2, c]) => {
  countries[iso2] = { name: c.name, iso3: c.iso3 };
});

const requirementTypes = {};
Object.entries(raw.visaTypes || {}).forEach(([key, v]) => {
  requirementTypes[key] = v.label;
});

const requirements = {};
Object.entries(raw.requirements || {}).forEach(([passport, destinations]) => {
  requirements[passport] = {};
  Object.entries(destinations).forEach(([dest, r]) => {
    requirements[passport][dest] = {
      requirementType: r.requirementType,
      maxStayDays: typeof r.maxStayDays === 'number' ? r.maxStayDays : null,
      notes: r.notes || '',
    };
  });
});

const programs = {};
let lastVerified = '';
Object.entries(raw.countryVisaPrograms || {}).forEach(([dest, byKey]) => {
  Object.entries(byKey).forEach(([key, p]) => {
    if (!KEEP_CATEGORIES.includes(p.category)) {
      return;
    }
    programs[dest] = programs[dest] || {};
    programs[dest][p.category] = programs[dest][p.category] || [];
    programs[dest][p.category].push({
      key,
      name: p.name,
      eligibilityCriteria: p.eligibilityCriteria || [],
      requiredDocuments: p.requiredDocuments || [],
      fees: p.fees || '',
      processingTime: p.processingTime || '',
      validityDuration: p.validityDuration || '',
      sourceUrl: p.sourceUrl || '',
      lastVerified: p.lastVerified || '',
    });
    if (p.lastVerified && p.lastVerified > lastVerified) {
      lastVerified = p.lastVerified;
    }
  });
});

const data = {
  meta: {
    source: 'Rootless Realtime Database export',
    programsLastVerified: lastVerified,
    passportCountriesWithRequirements: Object.keys(requirements),
    destinationsWithPrograms: Object.keys(programs),
  },
  countries,
  requirementTypes,
  requirements,
  programs,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Wrote ${output}`);
console.log(`  countries: ${Object.keys(countries).length}`);
console.log(`  passport countries with requirements: ${Object.keys(requirements).join(', ')}`);
console.log(`  destinations with visa programs: ${Object.keys(programs).join(', ')}`);
