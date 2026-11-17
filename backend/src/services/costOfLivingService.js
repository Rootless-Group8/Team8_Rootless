'use strict';

// Kept separate from costOfLiving/{countryCode}, which CostOfLivingPage and
// AffordabilityCalculatorPage read directly in a different shape.
const DB_PATH = 'costOfLivingEstimates';
const CACHE_TTL_MS = Number(process.env.COST_OF_LIVING_CACHE_TTL_MS) || 60 * 60 * 1000;
const CATEGORIES = ['housing', 'groceries', 'transport', 'utilities', 'diningOut'];

// Short alternate spellings only. The dataset itself lives in the database.
const ALIASES = {
  'united-kingdom': 'uk',
  'great-britain': 'uk',
  'the-netherlands': 'netherlands',
};

class CostOfLivingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CostOfLivingError';
    this.status = status;
    this.code = code;
  }
}

let cache = null; // { data, loadedAt }
let inflight = null;

function clearCache() {
  cache = null;
  inflight = null;
}

function normalizeLocation(input) {
  if (typeof input !== 'string') return '';
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  return ALIASES[slug] || slug;
}

function dataUnavailable() {
  return new CostOfLivingError(
    404,
    'cost_of_living_data_not_found',
    'Cost of living data is not available right now.'
  );
}

async function readFromDatabase(db) {
  const snapshot = await db.ref(DB_PATH).once('value');
  const data = snapshot && snapshot.val();
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    throw dataUnavailable();
  }
  return data;
}

// One database read fills the cache for every location until the TTL expires.
// A missing node is never cached, so seeding the data fixes things right away.
async function loadAll(db) {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  if (!inflight) {
    inflight = readFromDatabase(db)
      .then((data) => {
        cache = { data, loadedAt: Date.now() };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function formatRecord(slug, record) {
  const monthly = record.monthly || {};
  const monthlyEstimates = {};
  CATEGORIES.forEach((category) => {
    monthlyEstimates[category] = monthly[category];
  });
  return {
    location: record.name,
    slug,
    currency: record.currency,
    lastUpdated: record.lastUpdated,
    monthlyEstimates,
  };
}

async function getLocation(db, input) {
  const data = await loadAll(db);
  const slug = normalizeLocation(input);
  const record = slug && Object.prototype.hasOwnProperty.call(data, slug) ? data[slug] : null;
  if (!record) {
    const shown = String(input === undefined || input === null ? '' : input).slice(0, 50);
    throw new CostOfLivingError(
      404,
      'location_not_found',
      `No cost of living data for "${shown}". Use GET /api/cost-of-living to see supported locations.`
    );
  }
  return formatRecord(slug, record);
}

async function listLocations(db) {
  const data = await loadAll(db);
  return Object.keys(data)
    .map((slug) => ({
      name: data[slug].name,
      slug,
      currency: data[slug].currency,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  getLocation,
  listLocations,
  normalizeLocation,
  clearCache,
  CostOfLivingError,
  CATEGORIES,
  DB_PATH,
};
