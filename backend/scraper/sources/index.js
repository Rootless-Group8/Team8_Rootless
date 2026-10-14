/**
 * sources/index.js
 *
 * Registry of every source adapter. To add support for a new
 * destination country's government site:
 *   1. Create sources/yourCountry.js following the pattern in govUk.js
 *   2. Import and add it to the array below
 * Nothing else in the codebase needs to change.
 */

const govUkAdapter = require("./govUk");
const canadaAdapter = require("./canada");
const newZealandAdapter = require("./newZealand");
const japanAdapter = require("./japan");
const australiaAdapter = require("./australia");
const schengenAdapter = require("./schengen");
const mexicoAdapter = require("./mexico");

const adapters = [govUkAdapter, canadaAdapter, newZealandAdapter, japanAdapter, australiaAdapter, schengenAdapter, mexicoAdapter];

/**
 * Finds the first adapter that supports scraping data for a given
 * destination country.
 */
function findAdapterFor(destinationCountry) {
  return adapters.find((adapter) => adapter.supports(destinationCountry)) || null;
}

module.exports = { adapters, findAdapterFor };