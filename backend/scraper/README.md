# Rootless Visa Scraper (Sprint 1 Prototype)

## Setup

```
npm install
node run.js --pairs US:GB
```

Scheduled mode (re-runs on a cron schedule):

```
node run.js --pairs US:GB,BR:GB --schedule "0 0 * * *"
```

## Structure

```
models.js         - VisaRequirement record shape (the schema stand-in)
logger.js         - per-country/source error + info logging (console + logs/scraper.log)
sources/base.js   - interface every government-source adapter implements
sources/govUk.js  - example adapter (UK gov.uk visa checker)
sources/index.js  - registry mapping destination country -> adapter
scraper.js        - orchestrator: loops pairs, calls adapters, catches
                    errors per-pair, writes results
run.js            - CLI entry point (manual or scheduled runs)
output/           - JSON output per run (stand-in for DB writes)
logs/             - scraper.log
```

## What's real vs. stubbed right now

**Real / working logic:**
- Per-pair error handling (one failed country never kills the run)
- Status classification: `ok` / `missing` / `unclear` / `error`
- Logging per country/source
- Scheduling via cron syntax
- Adapter pattern so adding a new government site = one new file

**Stubbed, pending team decisions:**
- `sources/govUk.js` selectors and URL pattern are **best-guess, unverified**
  against the live page (no network access in the dev sandbox this was
  built in). Before the meeting/demo, open https://www.gov.uk/check-uk-visa
  in a real browser, confirm the URL pattern and result-page HTML, and
  update `SELECTORS` and `buildResultUrl()`.
- `scraper.js`'s `writeResults()` currently writes a JSON file to `output/`
  instead of a real database. Once Dani's schema exists, replace the body
  of that function with actual `better-sqlite3` (or whatever her DB lib is)
  insert/upsert calls. Nothing else in the codebase needs to change.
- `models.js`'s `toDbRow()` maps our internal field names to snake_case
  DB column names as a guess (`origin_country`, `destination_country`, etc).
  Update these keys to match Dani's actual column names once known.

## Adding a new government source

1. Copy `sources/govUk.js` as a starting template.
2. Implement `name`, `supports(destinationCountry)`, and
   `fetch(originCountry, destinationCountry)`.
3. Add it to the `adapters` array in `sources/index.js`.

Nothing in `scraper.js` or `run.js` needs to change.
