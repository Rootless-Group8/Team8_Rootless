/**
 * sources/schengen.js
 *
 * Adapter for EU Regulation 2018/1806, the single regulation that
 * determines short-stay (≤90 day) visa requirements for ALL Schengen
 * area member states at once -- Germany, Spain, Portugal, and
 * Netherlands don't each have their own separate visa-requirement
 * list; they all follow this one EU-wide list.
 *
 * Source (confirmed via direct fetch -- plain static HTML, not a
 * headless-browser-requiring page): the full regulation text,
 * including Annex I (visa-required countries) and Annex II
 * (visa-exempt countries), at:
 * https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32018R1806
 *
 * SPECIAL CASE: the United Kingdom is NOT listed by name in either
 * Annex of this regulation (it's covered by a separate post-Brexit
 * UK-EU agreement, not this Regulation). UK citizens are, in
 * practice, visa-exempt for short Schengen stays -- handled as a
 * special case below rather than via the Annex lookup.
 *
 * ⚠️ UNVERIFIED PARSING: this sandbox can't run the adapter live, so
 * the extraction logic (slicing the raw HTML between "ANNEX I" /
 * "ANNEX II" / "ANNEX III" markers, then pulling <p> tag text) is a
 * best-effort guess at the real page's HTML structure, similar to
 * the Canada.ca situation we hit before. Test locally; if the counts
 * look wrong (e.g. suspiciously low), inspect the real HTML and
 * adjust the extraction logic in loadLists() below.
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { SourceAdapter } = require("./base");
const { createVisaRequirement, RecordStatus } = require("../models");

const PAGE_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32018R1806";

// Destinations this adapter covers. Any Schengen member state could
// be added here -- the underlying data source is the same for all of
// them.
const SUPPORTED_DESTINATIONS = new Set(["DE", "ES", "PT", "NL"]);

// Maps our ISO-alpha-2 codes to the exact country name used in the
// regulation's Annexes. PLACEHOLDER -- only phase-1 origins filled in.
const ORIGIN_COUNTRY_NAMES = {
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  JP: "Japan",
  NZ: "New Zealand",
  MX: "Mexico",
  // GB handled as a special case, not via this map
};

let cachedLists = null;

function sliceBetween(html, startMarker, endMarker) {
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return "";
  const endIdx = endMarker ? html.indexOf(endMarker, startIdx + startMarker.length) : html.length;
  return html.slice(startIdx, endIdx === -1 ? html.length : endIdx);
}

function extractCountryNames(htmlSlice) {
  // The tag-based approach (looking for <p>/<td>/<li>) found nothing,
  // even though the text is confirmed present -- EUR-Lex uses a
  // specialized legal-document HTML converter with unknown custom
  // tag/class names, not plain semantic HTML. This sidesteps that
  // entirely: treat ANY tag boundary as a line break, strip all tags,
  // then filter the resulting plain-text lines.
  const textOnly = htmlSlice
    .replace(/<\/?(p|div|li|td|tr|br|span)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ");

  const lines = textOnly
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    const looksLikeHeader = /^(annex|[0-9]+\.\s|special administrative|entities and territorial|british citizens who|list of)/i.test(line);
    const tooLong = line.length > 60;
    if (!looksLikeHeader && !tooLong) items.push(line);
  }
  return items;
}

async function loadLists() {
  if (cachedLists) return cachedLists;

  const response = await axios.get(PAGE_URL, { timeout: 15000 });
  const html = response.data;

  const annexISlice = sliceBetween(html, "ANNEX I", "ANNEX II");
  const annexIISlice = sliceBetween(html, "ANNEX II", "ANNEX III");

  cachedLists = {
    visaRequired: extractCountryNames(annexISlice),
    visaExempt: extractCountryNames(annexIISlice),
  };

  return cachedLists;
}

function normalize(text) {
  // Strip everything except letters and lowercase -- sidesteps hidden
  // whitespace, non-breaking spaces, or stray punctuation in the raw
  // legal document HTML that broke a strict equality check (Australia
  // and New Zealand failed to match despite being confirmed present).
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

function findMatch(countryName, list) {
  const target = normalize(countryName);
  return list.find((entry) => normalize(entry) === target);
}

const schengenAdapter = new (class extends SourceAdapter {
  get name() {
    return "eur-lex.europa.eu";
  }

  supports(destinationCountry) {
    return SUPPORTED_DESTINATIONS.has(destinationCountry);
  }

  async fetch(originCountry, destinationCountry) {
    // UK citizens are visa-exempt for short Schengen stays under a
    // separate post-Brexit UK-EU agreement, not this Regulation --
    // they're not listed by name in either Annex here.
    if (originCountry === "GB") {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["valid passport (with at least 3 months validity beyond planned departure)"],
        maxStayDuration: "90 days in any 180-day period",
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: "UK citizens are visa-exempt for short Schengen stays under a separate post-Brexit UK-EU arrangement, not EU Regulation 2018/1806 itself (the UK is not named in either Annex). Confirmed via secondary sources.",
      });
    }

    // EU/Schengen member states have free movement between each
    // other -- no visa, no passport control at all for citizens
    // travelling between Schengen states. This Regulation only
    // governs THIRD (non-EU) countries, so Germany/Spain/Portugal/
    // Netherlands citizens visiting each other aren't covered by it.
    if (SUPPORTED_DESTINATIONS.has(originCountry)) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["valid national ID card or passport"],
        maxStayDuration: "unlimited (EU freedom of movement)",
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: "EU/Schengen member states have freedom of movement between each other -- not governed by this Regulation, which only covers non-EU (third country) nationals.",
      });
    }

    const countryName = ORIGIN_COUNTRY_NAMES[originCountry];

    if (!countryName) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceName: this.name,
        status: RecordStatus.MISSING,
        notes: `No display-name mapping for "${originCountry}" yet. Add it to ORIGIN_COUNTRY_NAMES in sources/schengen.js.`,
      });
    }

    let lists;
    try {
      lists = await loadLists();
    } catch (err) {
      throw new Error(`Request to ${PAGE_URL} failed: ${err.message}`);
    }

    const exemptMatch = findMatch(countryName, lists.visaExempt);
    const requiredMatch = findMatch(countryName, lists.visaRequired);

    if (exemptMatch) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["valid passport (with at least 3 months validity beyond planned departure)"],
        maxStayDuration: "90 days in any 180-day period",
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: `Listed in Annex II (visa-exempt) of EU Regulation 2018/1806, which applies to all Schengen states including ${destinationCountry}.`,
      });
    }

    if (requiredMatch) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: true,
        documentsRequired: ["Schengen (Type C) short-stay visa", "valid passport", "proof of accommodation and funds", "travel/health insurance"],
        maxStayDuration: "90 days in any 180-day period (with a visa)",
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: `Listed in Annex I (visa-required) of EU Regulation 2018/1806, which applies to all Schengen states including ${destinationCountry}.`,
      });
    }

    return createVisaRequirement({
      originCountry,
      destinationCountry,
      sourceUrl: PAGE_URL,
      sourceName: this.name,
      status: RecordStatus.UNCLEAR,
      notes: `"${countryName}" not found in either Annex list. Parsing logic is unverified against the live page -- may be a parsing gap rather than a real gap in the source.`,
    });
  }
})();

module.exports = schengenAdapter;