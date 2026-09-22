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
const { writeToFirestore } = require("./firestoreWriter");

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
 * Writes results to two places:
 *   1. A timestamped local JSON file in output/ (useful for local
 *      debugging, and works even without Firebase credentials set up)
 *   2. Firestore, so the whole team can see results without running
 *      the scraper themselves (skipped automatically if
 *      FIREBASE_SERVICE_ACCOUNT isn't set -- see firestoreWriter.js)
 */
async function writeResults(results) {
  const rows = results.map(toDbRow);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(__dirname, "output");
  const outPath = path.join(outputDir, `visa_data_${timestamp}.json`);

  // Empty folders don't survive git clones/manual copies, so make sure
  // this exists rather than assuming it does.
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  logger.info(`Wrote ${rows.length} record(s) to ${outPath}`);

  try {
    await writeToFirestore(rows);
  } catch (err) {
    // Don't let a Firestore hiccup erase the local JSON output that
    // already succeeded -- log it and move on.
    logger.error("Firestore write failed -- local JSON output is still saved", { error: err.message });
  }

  return outPath;
}

module.exports = { runScrape, writeResults };
