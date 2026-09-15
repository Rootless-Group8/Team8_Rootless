/**
 * scraper.js
 *
 * Orchestrates scraping for a list of country pairs:
 *   - looks up the right source adapter for each destination
 *   - calls it, catching and logging errors per-pair (never lets one
 *     failure kill the whole run)
 *   - validates/normalizes the result into a status (ok/missing/unclear/error)
 *   - hands results off to writeResults() for output
 */

const fs = require("fs");
const path = require("path");
const { findAdapterFor } = require("./sources");
const { createVisaRequirement, RecordStatus, toDbRow } = require("./models");
const { logger, logPairError } = require("./logger");

/**
 * Runs the scraper for every {origin, destination} pair given.
 * @param {Array<{origin: string, destination: string}>} pairs
 * @returns {Promise<Array>} list of VisaRequirement-shaped records
 */
async function runScrape(pairs) {
  const results = [];

  for (const { origin, destination } of pairs) {
    const adapter = findAdapterFor(destination);

    if (!adapter) {
      logger.warn(`No source adapter registered for destination "${destination}"`, {
        origin,
        destination,
      });
      results.push(
        createVisaRequirement({
          originCountry: origin,
          destinationCountry: destination,
          status: RecordStatus.MISSING,
          notes: `No adapter registered for destination "${destination}". Add one in sources/.`,
        })
      );
      continue; // move on to the next pair -- do not stop the run
    }

    try {
      const record = await adapter.fetch(origin, destination);
      results.push(record);
      logger.info(`Scraped ${origin} -> ${destination} via ${adapter.name}`, {
        status: record.status,
      });
    } catch (err) {
      // Adapter threw (network error, unexpected page structure, etc.)
      // Log it against this specific pair/source and keep going.
      logPairError(origin, destination, adapter.name, err);
      results.push(
        createVisaRequirement({
          originCountry: origin,
          destinationCountry: destination,
          sourceName: adapter.name,
          status: RecordStatus.ERROR,
          notes: err.message,
        })
      );
    }
  }

  return results;
}

/**
 * Stand-in for "write to database." Right now this just writes a
 * timestamped JSON file to output/, in the exact shape toDbRow()
 * produces. Once Dani's schema is finalized, replace the inside of
 * this function with real INSERT/UPSERT calls against her .db file --
 * the rest of the pipeline (runScrape, adapters, models) doesn't
 * need to change at all.
 */
function writeResults(results) {
  const rows = results.map(toDbRow);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(__dirname, "output", `visa_data_${timestamp}.json`);

  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  logger.info(`Wrote ${rows.length} record(s) to ${outPath}`);

  // TODO (post-meeting, once Dani's schema exists):
  //   const db = require('better-sqlite3')('path/to/dani/schema.db');
  //   const stmt = db.prepare(`INSERT OR REPLACE INTO visa_requirements (...) VALUES (...)`);
  //   for (const row of rows) stmt.run(row);

  return outPath;
}

module.exports = { runScrape, writeResults };
