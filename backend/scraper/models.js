/**
 * models.js
 *
 * Defines the shape of a single scraped visa-requirement record.
 *
 * IMPORTANT: This is a STAND-IN schema. Once Dani's database schema is
 * finalized, update `createVisaRequirement()`'s fields (and, if needed,
 * `toDbRow()`) to match her column names exactly. Everything downstream
 * (scraper.js, run.js) just passes this object around, so this is the
 * ONE place you should need to edit when the real schema lands.
 */

const RecordStatus = Object.freeze({
  OK: "ok", // Data pulled and parsed successfully
  MISSING: "missing", // Source had no relevant info for this pair
  UNCLEAR: "unclear", // Source had info but it was ambiguous / couldn't be parsed confidently
  ERROR: "error", // Request/parsing failed (network error, page structure changed, etc.)
});

/**
 * @param {Object} fields
 * @param {string} fields.originCountry - citizenship of the traveler, e.g. "US"
 * @param {string} fields.destinationCountry - country being visited, e.g. "GB"
 */
function createVisaRequirement({
  originCountry,
  destinationCountry,
  visaRequired = null,
  documentsRequired = [],
  fee = null,
  processingTime = null,
  maxStayDuration = null,
  sourceUrl = null,
  sourceName = null,
  status = RecordStatus.OK,
  notes = null,
}) {
  return {
    originCountry,
    destinationCountry,
    visaRequired,
    documentsRequired,
    fee,
    processingTime,
    maxStayDuration,
    sourceUrl,
    sourceName,
    lastChecked: new Date().toISOString(),
    status,
    notes,
  };
}

/**
 * Placeholder mapping to a future DB row. Rename keys here once
 * Dani's schema is finalized -- this is the seam between our JSON
 * output and her actual table columns.
 */
function toDbRow(record) {
  return {
    origin_country: record.originCountry,
    destination_country: record.destinationCountry,
    visa_required: record.visaRequired,
    documents_required: JSON.stringify(record.documentsRequired),
    fee: record.fee,
    processing_time: record.processingTime,
    max_stay_duration: record.maxStayDuration,
    source_url: record.sourceUrl,
    source_name: record.sourceName,
    last_checked: record.lastChecked,
    status: record.status,
    notes: record.notes,
  };
}

module.exports = { RecordStatus, createVisaRequirement, toDbRow };
