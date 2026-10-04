/**
 * sources/canada.js
 *
 * Adapter for Canada's "What you need to enter Canada" page:
 * https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/entry-requirements-country.html
 *
 * Unlike gov.uk (a per-pair branching wizard), this is a SINGLE
 * STATIC PAGE listing every country under one of a few headings:
 *   #need-visa   -> countries whose citizens need a visitor visa
 *   #need-eta    -> countries whose citizens need an eTA instead
 *   #eta-x       -> visa-required countries that MAY qualify for an
 *                   eTA instead, if they meet extra conditions
 *   #no-visa-eta -> situational exemptions (not a country list)
 *
 * So instead of one request per country pair, we fetch this page
 * ONCE, cache the parsed lists in memory for this process, and look
 * up each requested origin country against those lists. Much
 * cheaper than gov.uk's per-pair wizard walk.
 *
 * ⚠️ Built from a real fetch of the live page (confirmed structure/
 * headings/anchors), but the DOM traversal for pulling <li> items
 * out from under each heading is a best-effort guess at the nesting
 * -- verify once you can run this against the live page.
 *
 * KNOWN LIMITATION: country name matching is done against the exact
 * display names Canada.ca uses (e.g. "Korea, Republic of" not "South
 * Korea"), via a small ISO-code -> Canada.ca-name map below. This
 * only covers the handful of countries relevant to Rootless's phase-1
 * list. Expand ORIGIN_COUNTRY_NAMES as you add more.
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { SourceAdapter } = require("./base");
const { createVisaRequirement, RecordStatus } = require("../models");

const PAGE_URL =
  "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/entry-requirements-country.html";

// Maps our ISO-alpha-2 codes to the exact display name Canada.ca uses
// in its lists. PLACEHOLDER -- only the countries needed for early
// testing / the phase-1 country list are filled in.
const ORIGIN_COUNTRY_NAMES = {
  GB: "British citizen", // NOT "United Kingdom" -- confirmed via direct inspection of the raw page
  MX: "Mexico",
  DE: "Germany",
  JP: "Japan",
  AU: "Australia",
  NZ: "New Zealand",
  NL: "Netherlands",
  ES: "Spain",
  PT: "Portugal",
  TW: "Taiwan",
};

// In-memory cache so multiple fetch() calls in the same run don't
// re-request this page for every country pair.
let cachedLists = null;

function sliceBetweenIds(html, startId, endId) {
  const startIdx = html.indexOf(`id="${startId}"`);
  if (startIdx === -1) return "";
  const endIdx = endId ? html.indexOf(`id="${endId}"`, startIdx + 1) : html.length;
  return html.slice(startIdx, endIdx === -1 ? html.length : endIdx);
}

function extractLisFromSlice(htmlSlice) {
  const $slice = cheerio.load(htmlSlice);
  const items = [];
  $slice("li").each((_, li) => {
    const text = $slice(li).text().trim();
    if (text) items.push(text);
  });
  return items;
}

async function loadLists() {
  if (cachedLists) return cachedLists;

  const response = await axios.get(PAGE_URL, { timeout: 10000 });
  const html = response.data;

  // Confirmed via debug: the huge visa-required list isn't a plain
  // DOM sibling of its <h2>, so sibling-walking (nextUntil) came back
  // empty for that section even though the heading itself was found.
  // Slicing the raw HTML text between known id="..." markers sidesteps
  // that entirely -- it doesn't care how the content is nested.
  cachedLists = {
    visaRequired: extractLisFromSlice(sliceBetweenIds(html, "need-visa", "need-eta")),
    etaRequired: extractLisFromSlice(sliceBetweenIds(html, "need-eta", "eta-x")),
    etaInsteadOfVisa: extractLisFromSlice(sliceBetweenIds(html, "eta-x", "no-visa-eta")),
  };

  return cachedLists;
}

function findMatch(countryName, list) {
  // Country entries often have trailing notes in parentheses, e.g.
  // "Mexico (Some citizens of Mexico may be eligible for an eTA...)"
  // -- match on whether the entry STARTS WITH the country name.
  return list.find((entry) => entry.toLowerCase().startsWith(countryName.toLowerCase()));
}

const canadaAdapter = new (class extends SourceAdapter {
  get name() {
    return "canada.ca";
  }

  supports(destinationCountry) {
    return destinationCountry === "CA";
  }

  async fetch(originCountry, destinationCountry) {
    // US citizens are handled in a completely separate section of
    // Canada's page ("US travellers") -- they don't appear in either
    // the visa-required or eTA-required lists at all, and need
    // neither: just a valid passport. Special-case this rather than
    // letting it fall through to "not found in either list" (which
    // would incorrectly read as UNCLEAR).
    if (originCountry === "US") {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["valid passport (recommended even though not strictly required for land/sea travel)"],
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: "US citizens are exempt from Canada's visa and eTA requirements entirely (handled in the page's separate 'US travellers' section, not the visa/eTA lists).",
      });
    }

    const countryName = ORIGIN_COUNTRY_NAMES[originCountry];

    if (!countryName) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceName: this.name,
        status: RecordStatus.MISSING,
        notes: `No Canada.ca display-name mapping for "${originCountry}" yet. Add it to ORIGIN_COUNTRY_NAMES in sources/canada.js.`,
      });
    }

    let lists;
    try {
      lists = await loadLists();
    } catch (err) {
      throw new Error(`Request to ${PAGE_URL} failed: ${err.message}`);
    }

    const visaEntry = findMatch(countryName, lists.visaRequired);
    const etaEntry = findMatch(countryName, lists.etaRequired);
    const etaInsteadEntry = findMatch(countryName, lists.etaInsteadOfVisa);

    if (etaEntry) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["Electronic Travel Authorization (eTA)", "valid passport"],
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: `Listed under eTA-required countries: "${etaEntry}"`,
      });
    }

    if (visaEntry) {
      const documents = ["Temporary Resident (Visitor) Visa", "valid passport"];
      const notesParts = [`Listed under visa-required countries: "${visaEntry}"`];
      if (etaInsteadEntry) {
        documents.push("may qualify for eTA instead if flying and meeting extra conditions");
        notesParts.push(`Also listed as eTA-eligible-instead-of-visa: "${etaInsteadEntry}"`);
      }
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: true,
        documentsRequired: documents,
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: notesParts.join(" "),
      });
    }

    // Not found in either list -- could be a US/Canadian-specific
    // rule (handled in separate page sections we don't parse yet),
    // or the name mapping doesn't match Canada.ca's exact wording.
    return createVisaRequirement({
      originCountry,
      destinationCountry,
      sourceUrl: PAGE_URL,
      sourceName: this.name,
      status: RecordStatus.UNCLEAR,
      notes: `"${countryName}" not found in visa-required or eTA-required lists. May need special handling (e.g. US travellers have their own rules) or the name may not match Canada.ca's exact wording -- check lists.visaRequired/etaRequired manually.`,
    });
  }
})();

module.exports = canadaAdapter;