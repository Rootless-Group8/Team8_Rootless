"""
Main entry point. Run this from the project root:

    python -m pipeline.run --db rootless_visa.db

This is the piece that needs real network access to Wikipedia, so it
won't run inside a sandboxed/offline environment — see tests/ for the
network-free correctness checks of the parsing/normalization logic.
"""

import argparse
import sys

from data.countries_seed import UN_MEMBERS
from pipeline import wiki_client, parser, normalize, db
from pipeline.title_resolver import build_title_map, CATEGORY_TITLE
from data.aliases import resolve as resolve_alias

WIKI_BASE_URL = "https://en.wikipedia.org/wiki/"


def run(db_path: str, use_cache: bool, report_unmatched: bool, limit: int = None):
    print("Fetching category listing...")
    category_titles = wiki_client.get_category_members(CATEGORY_TITLE)
    print(f"  {len(category_titles)} pages found in category.")

    title_map, unmatched_titles = build_title_map(category_titles)
    print(f"  Resolved {len(title_map)} / {len(UN_MEMBERS)} UN member nationality pages.")

    conn = db.connect(db_path)
    db.upsert_countries(conn, UN_MEMBERS)

    for title in unmatched_titles:
        db.record_unmatched_title(conn, title)

    if report_unmatched:
        print("\nUnmatched category page titles (add to data/title_overrides.csv if relevant):")
        for t in unmatched_titles:
            print(f"  - {t}")

    members_to_process = UN_MEMBERS[:limit] if limit else UN_MEMBERS
    missing_isos = []

    for iso2, iso3, name in members_to_process:
        page_title = title_map.get(iso2)
        if not page_title:
            missing_isos.append((iso2, name))
            continue

        print(f"Processing {name} ({iso2}) -> '{page_title}'")
        try:
            html = wiki_client.get_page_html(page_title, use_cache=use_cache)
            rows = parser.parse_rows(html)
        except Exception as e:
            print(f"  ERROR fetching/parsing {name}: {e}", file=sys.stderr)
            continue

        source_url = WIKI_BASE_URL + page_title.replace(" ", "_")
        unresolved_destinations = []

        for row in rows:
            dest_iso = resolve_alias(row["destination_raw"])
            if not dest_iso:
                unresolved_destinations.append(row["destination_raw"])
                continue
            if dest_iso == iso2:
                continue  # skip self (a country isn't a destination from itself)

            req_type = normalize.classify_requirement(row["requirement_raw"])
            days, raw_stay = normalize.parse_stay_duration(row["stay_raw"])
            notes = normalize.paraphrase_note_stub(row["notes_raw"])

            db.upsert_requirement(
                conn,
                nationality_iso2=iso2,
                destination_iso2=dest_iso,
                requirement_type=req_type,
                max_stay_days=days,
                max_stay_raw=raw_stay,
                notes=notes,
                source_url=source_url,
            )

        if unresolved_destinations:
            print(f"  {len(unresolved_destinations)} destination names unresolved "
                  f"(add to data/aliases.py): {unresolved_destinations[:5]}"
                  f"{'...' if len(unresolved_destinations) > 5 else ''}")

    if missing_isos:
        print("\nUN members with no resolved Wikipedia page (fix in data/title_overrides.csv):")
        for iso2, name in missing_isos:
            print(f"  - {iso2}: {name}")

    print("\nDone.")
    return conn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="rootless_visa.db")
    ap.add_argument("--no-cache", action="store_true",
                     help="Force a live re-fetch instead of using cached HTML")
    ap.add_argument("--report-unmatched", action="store_true",
                     help="Print category page titles that couldn't be auto-matched")
    ap.add_argument("--limit", type=int, default=None,
                     help="Process only the first N countries (useful for a test run)")
    ap.add_argument("--export-csv", default=None,
                     help="After running, export the full matrix to this CSV path")
    args = ap.parse_args()

    conn = run(
        db_path=args.db,
        use_cache=not args.no_cache,
        report_unmatched=args.report_unmatched,
        limit=args.limit,
    )

    if args.export_csv:
        n = db.export_csv(conn, args.export_csv)
        print(f"Exported {n} rows to {args.export_csv}")


if __name__ == "__main__":
    main()
