/**
 * sources/newZealand.js
 *
 * Adapter for Immigration New Zealand's "Visa waiver countries and
 * territories" page:
 * https://www.immigration.govt.nz/visit/what-you-need-to-visit-new-zealand/visa-waiver-countries-and-territories/
 *
 * Simplest source so far: ONE flat static list under one heading.
 * If a country is on it, its citizens only need an NZeTA (not a
 * full visa). If a country is NOT on the list, NZ's own logic
 * implies a visa is required -- but since this page doesn't
 * explicitly enumerate visa-required countries (unlike Canada's
 * page, which lists both), we report that case as UNCLEAR rather
 * than asserting visaRequired: true with no direct source backing.
 *
 * Built from a real fetch of the live page (confirmed heading text
 * and flat list structure) -- not yet run end-to-end against the
 * live site from this environment.
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { SourceAdapter } = require("./base");
const { createVisaRequirement, RecordStatus } = require("../models");

const PAGE_URL =
  "https://www.immigration.govt.nz/visit/what-you-need-to-visit-new-zealand/visa-waiver-countries-and-territories/";

// Maps our ISO-alpha-2 codes to the exact display name immigration.govt.nz
// uses. PLACEHOLDER -- only a handful filled in so far.
const ORIGIN_COUNTRY_NAMES = {
  US: "United States of America (USA)",
  GB: "United Kingdom (UK)",
  DE: "Germany",
  JP: "Japan",
  MX: "Mexico",
  NL: "Netherlands",
  ES: "Spain",
  PT: "Portugal",
  AU: "Australia", // handled separately on the page (no visa/NZeTA needed at all)
  CA: "Canada",
};

let cachedWaiverList = null;

async function loadWaiverList() {
  if (cachedWaiverList) return cachedWaiverList;

  const response = await axios.get(PAGE_URL, { timeout: 10000 });
  const $ = cheerio.load(response.data);

  // The list sits directly under the "List of visa waiver countries
  // and territories" h2 -- unlike Canada's page, this one IS a plain
  // sibling <ul>, confirmed from the real fetched page structure.
  let heading = null;
  $("h2").each((_, el) => {
    if (heading) return;
    if (/list of visa waiver countries/i.test($(el).text())) heading = $(el);
  });

  if (!heading) {
    cachedWaiverList = [];
    return cachedWaiverList;
  }

  const items = [];
  heading.nextUntil("h2").each((_, el) => {
    $(el)
      .find("li")
      .addBack("li")
      .each((_, li) => {
        const text = $(li).text().trim();
        if (text) items.push(text);
      });
  });

  cachedWaiverList = items;
  return cachedWaiverList;
}

function findMatch(countryName, list) {
  return list.find((entry) => entry.toLowerCase().startsWith(countryName.toLowerCase()));
}

const newZealandAdapter = new (class extends SourceAdapter {
  get name() {
    return "immigration.govt.nz";
  }

  supports(destinationCountry) {
    return destinationCountry === "NZ";
  }

  async fetch(originCountry, destinationCountry) {
    // Australian citizens are exempt from NZeTA entirely under the
    // Trans-Tasman Travel Arrangement -- a different, more generous
    // exemption than the standard visa-waiver-list countries, which
    // still need an NZeTA. Handle this before the normal list lookup,
    // same pattern as Canada's US special case.
    if (originCountry === "AU") {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["valid Australian passport", "New Zealand Traveller Declaration (NZTD, separate from NZeTA)"],
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: "Australian citizens are exempt from NZeTA under the Trans-Tasman Travel Arrangement (a separate, more generous exemption than the standard visa-waiver list) -- confirmed via secondary sources, not directly from this page.",
      });
    }

    const countryName = ORIGIN_COUNTRY_NAMES[originCountry];

    if (!countryName) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceName: this.name,
        status: RecordStatus.MISSING,
        notes: `No immigration.govt.nz display-name mapping for "${originCountry}" yet. Add it to ORIGIN_COUNTRY_NAMES in sources/newZealand.js.`,
      });
    }

    let waiverList;
    try {
      waiverList = await loadWaiverList();
    } catch (err) {
      throw new Error(`Request to ${PAGE_URL} failed: ${err.message}`);
    }

    const match = findMatch(countryName, waiverList);

    if (match) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["New Zealand Electronic Travel Authority (NZeTA)", "valid passport", "onward travel ticket"],
        maxStayDuration: originCountry === "GB" ? "6 months" : "3 months",
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: `Listed as visa waiver: "${match}"`,
      });
    }

    return createVisaRequirement({
      originCountry,
      destinationCountry,
      sourceUrl: PAGE_URL,
      sourceName: this.name,
      status: RecordStatus.UNCLEAR,
      notes: `"${countryName}" not found on the visa waiver list. NZ's own logic implies a visa is required in this case, but this page doesn't explicitly enumerate visa-required countries, so this isn't confirmed directly from this source.`,
    });
  }
})();

module.exports = newZealandAdapter;