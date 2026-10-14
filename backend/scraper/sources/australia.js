/**
 * sources/australia.js
 *
 * Adapter for Australia's ETA (subclass 601) visa page:
 * https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/electronic-travel-authority-601
 *
 * CONFIRMED: this page is a SharePoint site where the actual content
 * (eligible countries, requirements) loads via JavaScript AFTER the
 * initial page load -- a plain HTTP request only gets empty
 * navigation/footer scaffolding. Puppeteer is required.
 *
 * ⚠️ UNVERIFIED SELECTORS: this sandbox can't execute JS or run
 * Puppeteer, so the selector below (#contentBox) is a guess based on
 * the "Skip to main content" link (href="#contentBox") seen in the
 * page's static scaffolding -- that ID is where the real content
 * almost certainly gets injected. TEST THIS LOCALLY: run it, and if
 * the extracted text looks wrong or empty, use your browser's dev
 * tools on the live page (after content loads) to find the real
 * container and update CONTENT_SELECTOR below.
 *
 * SCOPE NOTE: this only covers the ETA (subclass 601), which covers
 * most but not all phase-1 origin countries for short tourism visits.
 * Countries not ETA-eligible would need the eVisitor (651) or
 * Subclass 600 instead -- not covered by this adapter yet.
 */

const cheerio = require("cheerio");
const { SourceAdapter } = require("./base");
const { createVisaRequirement, RecordStatus } = require("../models");
const { fetchRenderedHtml } = require("./browserFetch");

const PAGE_URL =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/electronic-travel-authority-601";

// UNVERIFIED -- see file header. Update once tested against the live,
// JS-rendered page.
const CONTENT_SELECTOR = "#contentBox";

// Maps our ISO-alpha-2 codes to the exact display name this page
// likely uses. PLACEHOLDER -- confirm against real page text once
// loadEligibleCountriesText() output is visible.
const ORIGIN_COUNTRY_NAMES = {
  US: "United States",
  CA: "Canada",
  DE: "Germany",
  PT: "Portugal",
  MX: "Mexico", // NOTE: Mexico is likely NOT ETA-eligible -- expect this to come back UNCLEAR/false, verify
  ES: "Spain",
  JP: "Japan",
  NL: "Netherlands",
  NZ: "New Zealand", // NOTE: NZ citizens have their own special arrangement, may not need this page at all
  GB: "United Kingdom",
};

let cachedContentText = null;

async function loadEligibleCountriesText() {
  if (cachedContentText) return cachedContentText;

  const html = await fetchRenderedHtml(PAGE_URL, { waitForSelector: CONTENT_SELECTOR, timeout: 45000 });
  const $ = cheerio.load(html);

  cachedContentText = $(CONTENT_SELECTOR).text();
  return cachedContentText;
}

const australiaAdapter = new (class extends SourceAdapter {
  get name() {
    return "immi.homeaffairs.gov.au";
  }

  supports(destinationCountry) {
    return destinationCountry === "AU";
  }

  async fetch(originCountry, destinationCountry) {
    // New Zealand citizens get a Special Category visa (subclass 444)
    // automatically on arrival in Australia -- a separate reciprocal
    // arrangement, not the ETA. Handle before the normal page lookup,
    // same pattern as the US/Canada and Australia/NZ special cases.
    if (originCountry === "NZ") {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: true, // technically still a visa, just automatic
        documentsRequired: ["valid New Zealand passport", "Special Category Visa (subclass 444) granted automatically on arrival"],
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: "New Zealand citizens receive a Special Category Visa (subclass 444) automatically on arrival -- a separate reciprocal arrangement, not the ETA covered by this page. Confirmed via secondary sources.",
      });
    }

    const countryName = ORIGIN_COUNTRY_NAMES[originCountry];

    if (!countryName) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceName: this.name,
        status: RecordStatus.MISSING,
        notes: `No display-name mapping for "${originCountry}" yet. Add it to ORIGIN_COUNTRY_NAMES in sources/australia.js.`,
      });
    }

    let pageText;
    try {
      pageText = await loadEligibleCountriesText();
    } catch (err) {
      throw new Error(`Request to ${PAGE_URL} (via headless browser) failed: ${err.message}`);
    }

    if (!pageText || pageText.trim().length < 200) {
      // Suspiciously short -- almost certainly means CONTENT_SELECTOR
      // is wrong and we grabbed empty/near-empty scaffolding again.
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.UNCLEAR,
        notes: `Extracted content was suspiciously short (${pageText ? pageText.trim().length : 0} chars) -- CONTENT_SELECTOR in sources/australia.js is likely wrong. Inspect the live rendered page and update it.`,
      });
    }

    const isEligible = pageText.toLowerCase().includes(countryName.toLowerCase());

    if (isEligible) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: true, // ETA is technically a visa, just electronic/fast
        documentsRequired: ["Electronic Travel Authority (ETA) via the Australian ETA app", "valid passport", "AUD $20 service fee"],
        maxStayDuration: "3 months per visit, valid 12 months multiple entry",
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: `"${countryName}" appears on the ETA-eligible page content.`,
      });
    }

    return createVisaRequirement({
      originCountry,
      destinationCountry,
      sourceUrl: PAGE_URL,
      sourceName: this.name,
      status: RecordStatus.UNCLEAR,
      notes: `"${countryName}" not found in ETA page content. May not be ETA-eligible (could need eVisitor or Subclass 600 instead), or the text-matching approach missed it -- verify manually.`,
    });
  }
})();

module.exports = australiaAdapter;