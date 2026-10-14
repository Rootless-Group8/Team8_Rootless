/**
 * sources/japan.js
 *
 * Adapter for Japan's Ministry of Foreign Affairs (MOFA) page listing
 * visa-exemption arrangements:
 * https://www.mofa.go.jp/j_info/visit/visa/short/novisa.html
 *
 * PREVIOUS ATTEMPT: plain axios requests (even with a realistic
 * User-Agent header) got a 403 Forbidden from this site -- likely
 * basic-to-moderate bot filtering. This version uses a headless
 * browser (Puppeteer) instead, which behaves like a real visitor
 * and may get past filtering a simple HTTP client can't.
 *
 * ⚠️ UNVERIFIED: this sandbox has no network access, so this has not
 * been run end-to-end. Test locally -- if it STILL 403s or times
 * out, the site likely has more advanced bot detection (e.g. a
 * Cloudflare/Akamai JS challenge or CAPTCHA) that even a headless
 * browser can't solve without extra tooling, and this destination
 * should stay flagged as blocked for now.
 */

const cheerio = require("cheerio");
const { SourceAdapter } = require("./base");
const { createVisaRequirement, RecordStatus } = require("../models");
const { fetchRenderedHtml } = require("./browserFetch");

const PAGE_URL = "https://www.mofa.go.jp/j_info/visit/visa/short/novisa.html";

// Maps our ISO-alpha-2 codes to the exact display name MOFA uses.
// PLACEHOLDER -- only a handful filled in so far.
const ORIGIN_COUNTRY_NAMES = {
  US: "United States",
  CA: "Canada",
  DE: "Germany",
  PT: "Portugal",
  MX: "Mexico",
  ES: "Spain",
  AU: "Australia",
  NL: "Netherlands",
  NZ: "New Zealand",
  GB: "United Kingdom",
};

let cachedExemptList = null;

async function loadExemptList() {
  if (cachedExemptList) return cachedExemptList;

  const html = await fetchRenderedHtml(PAGE_URL, { waitForSelector: "table" });
  const $ = cheerio.load(html);

  const items = [];
  $("table td").each((_, td) => {
    const text = $(td).text().trim();
    if (text) items.push(text);
  });

  cachedExemptList = items;
  return cachedExemptList;
}

function findMatch(countryName, list) {
  return list.find((entry) => entry.toLowerCase().startsWith(countryName.toLowerCase()));
}

const japanAdapter = new (class extends SourceAdapter {
  get name() {
    return "mofa.go.jp";
  }

  supports(destinationCountry) {
    return destinationCountry === "JP";
  }

  async fetch(originCountry, destinationCountry) {
    const countryName = ORIGIN_COUNTRY_NAMES[originCountry];

    if (!countryName) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        sourceName: this.name,
        status: RecordStatus.MISSING,
        notes: `No MOFA display-name mapping for "${originCountry}" yet. Add it to ORIGIN_COUNTRY_NAMES in sources/japan.js.`,
      });
    }

    let exemptList;
    try {
      exemptList = await loadExemptList();
    } catch (err) {
      throw new Error(`Request to ${PAGE_URL} (via headless browser) failed: ${err.message}`);
    }

    const match = findMatch(countryName, exemptList);

    if (match) {
      return createVisaRequirement({
        originCountry,
        destinationCountry,
        visaRequired: false,
        documentsRequired: ["valid passport", "proof of onward/return travel", "proof of sufficient funds"],
        maxStayDuration: "90 days (15 or 30 days for a few specific countries -- see source notes)",
        sourceUrl: PAGE_URL,
        sourceName: this.name,
        status: RecordStatus.OK,
        notes: `Listed as visa-exempt: "${match}". Some countries have passport-type conditions (e.g. ePassport, MRP) noted on the source page -- not yet parsed into structured data.`,
      });
    }

    return createVisaRequirement({
      originCountry,
      destinationCountry,
      sourceUrl: PAGE_URL,
      sourceName: this.name,
      status: RecordStatus.UNCLEAR,
      notes: `"${countryName}" not found on Japan's visa-exemption list. A visa is likely required, but this page only enumerates exempt countries, so that's not directly confirmed from this source.`,
    });
  }
})();

module.exports = japanAdapter;