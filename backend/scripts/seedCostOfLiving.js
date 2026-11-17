'use strict';

/*
 * One-time seed for the cost of living dataset.
 * Run from the repo root or backend/:  node backend/scripts/seedCostOfLiving.js [--dry-run]
 *
 * Amounts are approximate monthly costs for one person in local currency.
 * They are placeholders for the class project: replace with the team's sourced
 * numbers before the release demo and keep LAST_UPDATED in sync.
 * Writes to /costOfLivingEstimates in the Realtime Database. Safe to re-run.
 * It never touches /costOfLiving, which the frontend pages read.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const LAST_UPDATED = '2026-10-27';

const DATA = {
  canada: { name: 'Canada', currency: 'CAD', monthly: { housing: 2100, groceries: 450, transport: 130, utilities: 180, diningOut: 300 } },
  uk: { name: 'UK', currency: 'GBP', monthly: { housing: 1300, groceries: 300, transport: 100, utilities: 190, diningOut: 220 } },
  germany: { name: 'Germany', currency: 'EUR', monthly: { housing: 1000, groceries: 280, transport: 63, utilities: 260, diningOut: 200 } },
  portugal: { name: 'Portugal', currency: 'EUR', monthly: { housing: 900, groceries: 250, transport: 40, utilities: 130, diningOut: 180 } },
  mexico: { name: 'Mexico', currency: 'MXN', monthly: { housing: 14000, groceries: 4500, transport: 900, utilities: 1200, diningOut: 3500 } },
  spain: { name: 'Spain', currency: 'EUR', monthly: { housing: 950, groceries: 270, transport: 50, utilities: 140, diningOut: 200 } },
  australia: { name: 'Australia', currency: 'AUD', monthly: { housing: 2400, groceries: 550, transport: 200, utilities: 250, diningOut: 350 } },
  japan: { name: 'Japan', currency: 'JPY', monthly: { housing: 90000, groceries: 45000, transport: 12000, utilities: 17000, diningOut: 30000 } },
  netherlands: { name: 'Netherlands', currency: 'EUR', monthly: { housing: 1700, groceries: 320, transport: 100, utilities: 220, diningOut: 250 } },
  'new-zealand': { name: 'New Zealand', currency: 'NZD', monthly: { housing: 2300, groceries: 550, transport: 180, utilities: 250, diningOut: 300 } },
};

function buildPayload() {
  const payload = {};
  Object.keys(DATA).forEach((slug) => {
    payload[slug] = { ...DATA[slug], lastUpdated: LAST_UPDATED };
  });
  return payload;
}

async function main() {
  // Required lazily so the service path matches the backend and --dry-run
  // works without any Firebase credentials.
  const { DB_PATH } = require('../src/services/costOfLivingService');
  const payload = buildPayload();
  const count = Object.keys(payload).length;

  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(payload, null, 2));
    console.log(`Dry run: ${count} locations would be written to /${DB_PATH}`);
    return;
  }

  if (!process.env.FIREBASE_DATABASE_URL) {
    throw new Error('FIREBASE_DATABASE_URL is not set (see backend/.env.example).');
  }

  // Same init and env vars as the server (FIREBASE_SERVICE_ACCOUNT_JSON or
  // FIREBASE_SERVICE_ACCOUNT_PATH, plus FIREBASE_DATABASE_URL).
  const { initializeFirebaseAdmin } = require('../src/config/firebaseAdmin');
  const admin = initializeFirebaseAdmin();
  await admin.database().ref(DB_PATH).set(payload);
  console.log(`Seeded ${count} locations at /${DB_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
