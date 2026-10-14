/**
 * sources/base.js
 *
 * Every government-source adapter (one per country/site, e.g. UK,
 * Canada, Australia) must export an object with this shape:
 *
 *   {
 *     name: "gov.uk",                     // human readable source name
 *     supports(destinationCountry): bool, // can this adapter handle this destination?
 *     fetch(originCountry, destinationCountry): Promise<VisaRequirement>
 *   }
 *
 * This is the seam that lets you add a new country's government site
 * without touching scraper.js at all -- just write a new file in this
 * folder and register it in sources/index.js.
 */

class SourceAdapter {
  get name() {
    throw new Error("Adapter must implement `name`");
  }

  supports(_destinationCountry) {
    throw new Error("Adapter must implement supports()");
  }

  async fetch(_originCountry, _destinationCountry) {
    throw new Error("Adapter must implement fetch()");
  }
}

module.exports = { SourceAdapter };
