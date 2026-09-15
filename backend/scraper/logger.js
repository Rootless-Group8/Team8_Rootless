/**
 * logger.js
 *
 * Central logger. Writes to console + a rotating-by-run log file so
 * failures for one country/source are visible without stopping or
 * hiding failures from the rest of the run (acceptance criteria:
 * "Logs errors/failures per country/source rather than failing
 * silently on the whole run").
 */

const winston = require("winston");
const path = require("path");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "scraper.log"),
    }),
  ],
});

/**
 * Convenience helper so every failure is tagged with which country
 * pair / source it came from, per the acceptance criteria.
 */
function logPairError(originCountry, destinationCountry, sourceName, err) {
  logger.error(
    `Failed to scrape ${originCountry} -> ${destinationCountry} from ${sourceName}`,
    { originCountry, destinationCountry, sourceName, error: err.message }
  );
}

module.exports = { logger, logPairError };
