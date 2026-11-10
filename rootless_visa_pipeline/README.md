# Rootless Visa Requirements Pipeline

Builds and maintains a SQLite database of visa requirements for every
pair of UN member states (193 × 192 = 37,056 directed pairs), sourced
from Wikipedia's per-nationality visa requirement pages, bootstrapped
from the open [passport-index-dataset](https://github.com/ilyankou/passport-index-dataset)
for instant full coverage.

## Why it's built this way

- **No paid API.** Free sources only, per project constraints. That
  means the "live-updating" part is a scraper you run on a schedule,
  not a push feed.
- **ISO codes as keys everywhere**, never country name strings. Country
  names are spelled differently across sources ("Czechia" vs "Czech
  Republic", "The Bahamas" vs "Bahamas", "Cote d'Ivoire" vs "Ivory
  Coast") and will silently break joins if you key on names.
- **Wikipedia page titles are resolved, not guessed.** The "Visa
  requirements for X citizens" pages are titled by demonym
  ("Afghan citizens") or occasionally "citizens of X" (for awkward
  demonyms like Botswana), and there's no reliable formula to construct
  these titles from a country name. This pipeline fetches the real
  category listing and matches titles to ISO codes, rather than
  constructing URLs and hoping they resolve.
- **The parser only touches the main destinations table.** Each
  Wikipedia page also has smaller tables for territories/disputed
  areas and "pre-approved visa pickup" notes, in a different shape.
  The parser identifies the right table by header content, not by
  position on the page.
- **Diffs, not blind overwrites.** Every re-run compares new values to
  what's stored and only logs + updates when something actually
  changed. This gives you a changelog for free and makes scraper bugs
  visible (a sudden change across 50 countries at once is a parsing
  bug, not real policy news).

## Setup

```bash
pip install -r requirements.txt
```

No other dependencies — SQLite is built into Python.

## Step 1: Bootstrap full coverage (do this first)

1. Download `passport-index-matrix-iso2.csv` from
   https://github.com/ilyankou/passport-index-dataset (MIT license).
2. Run:

```bash
python -m pipeline.bootstrap_passport_index path/to/passport-index-matrix-iso2.csv --db rootless_visa.db
```

This fills every resolvable cell with at least a requirement type
(visa-free / visa required / eVisa / visa on arrival). It will **not**
overwrite anything already in the database, so it's safe to run before
or interleaved with the Wikipedia pipeline.

## Step 2: Enrich with duration + notes from Wikipedia

```bash
python -m pipeline.run --db rootless_visa.db --report-unmatched
```

First run will take a few minutes (one request per country page, rate
limited to 1/second — see `pipeline/wiki_client.py` for why not to
turn this up). Subsequent runs use the on-disk HTML cache in `cache/`
unless you pass `--no-cache`.

Useful flags:
- `--limit 10` — process only the first 10 countries (sanity check before
  committing to a full run)
- `--report-unmatched` — print any category page titles that couldn't
  be auto-resolved to a country
- `--export-csv out.csv` — dump the full matrix to CSV after running

### Fixing unmatched titles

The demonym table in `data/demonyms.py` was built from general
knowledge, not verified against live Wikipedia (this was built in an
offline dev environment). After your first real run:

1. Check the console output / `unmatched_titles` table for anything
   that didn't resolve.
2. Check `missing_isos` output for UN members whose page wasn't found
   at all.
3. Add corrections to `data/title_overrides.csv`:
   ```
   iso2,wikipedia_title
   CG,Visa requirements for Congolese (Republic of the Congo) citizens
   ```
4. Re-run — overrides always take priority over the automatic matcher.

Do the same for unresolved **destination** names printed per-country
during the run — add missing spellings to `data/aliases.py`.

## Step 3: Schedule it

Visa policy doesn't move fast enough in aggregate to need more than a
weekly refresh. Options, in order of how little you have to think about
it afterward:

- **GitHub Actions** (recommended): a scheduled workflow that runs
  `python -m pipeline.run`, then commits the updated `.db` file or
  CSV export back to the repo, or pushes it wherever Rootless reads
  from.
- **Cron job** on any machine that's on a schedule anyway.
- **Cloud function** (AWS Lambda / GCP Cloud Function) on a timer, if
  Rootless's backend already lives there.

Whichever you pick, alert yourself (email/Slack webhook) if a run logs
an unusually large number of changes at once — that's almost always a
scraper break (Wikipedia changed its table markup), not real news.

## Licensing note on notes text

Wikipedia content is CC BY-SA — reusable with attribution, but storing
its sentences verbatim in a product database isn't a great long-term
choice for tone consistency or licensing cleanliness. `normalize.paraphrase_note_stub()`
is currently a placeholder that just truncates; before shipping notes
to end users, replace it with an actual rewrite step.

## Database schema

See `pipeline/db.py` for the full schema. Four tables:
- `countries` — the 193 UN members
- `visa_requirements` — one row per (nationality, destination) pair
- `changelog` — every detected change, with old/new values and timestamp
- `unmatched_titles` — category pages that couldn't be auto-matched

## Testing

Everything except `pipeline/wiki_client.py` (the only file that touches
the network) is tested offline against a synthetic fixture modeled on
real Wikipedia page structure:

```bash
python -m unittest discover -v tests
```

36 tests, covering: table parsing (and correctly ignoring the
territories sub-table), footnote-marker stripping, requirement
classification, duration parsing, country alias resolution, demonym
resolution, Wikipedia title matching, and full offline pipeline
integration including changelog behavior.

## Known gaps / things to verify once you have network access

- The demonym table (`data/demonyms.py`) has a handful of flagged
  ambiguous entries (Congo, Dominica vs. Dominican Republic, Korea)
  that need verification against real Wikipedia titles.
- `paraphrase_note_stub()` needs a real implementation before notes
  reach end users.
- No handling yet for pages that split a single visa type across two
  different stay lengths in one cell (e.g. "eVisa / Visa on arrival"
  with "14 days / 30 days") beyond taking the first number — the raw
  text is preserved in `max_stay_raw` so this is recoverable later if
  you want to model it more precisely.
