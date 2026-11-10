"""
One-time bootstrap: imports the open-source passport-index-dataset
(https://github.com/ilyankou/passport-index-dataset, MIT licensed) to get
full requirement-type coverage across all ~37,000 country pairs BEFORE
your Wikipedia scraper has run. This gives you a complete, if less
detailed, matrix on day one; the Wikipedia pipeline then enriches it with
duration + notes and eventually supersedes each cell as it's re-checked.

Usage:
    1. Download passport-index-matrix-iso2.csv from that repo (a matrix:
       rows = passport/nationality, columns = destination, cells = either
       a visa-free day count, or a code like "visa required", "eVisa",
       "visa on arrival", "-1" for no admission, or "3" (a same-country
       cell)).
    2. Run:  python -m pipeline.bootstrap_passport_index path/to/matrix.csv --db rootless_visa.db

This only fills in rows that don't already exist — it will NOT overwrite
data your Wikipedia pipeline has already collected, since that data is
richer. Run this FIRST, before the first real Wikipedia run.
"""

import argparse
import csv

from data.countries_seed import UN_MEMBERS
from pipeline import db

UN_ISO2_SET = {iso2 for iso2, _, _ in UN_MEMBERS}


def classify_cell(value: str) -> tuple:
    """
    passport-index-dataset cells are one of:
      - a number (visa-free days, e.g. "90"), including "0" (visa-free,
        duration unspecified) and same-country "-1" or "3"
      - "visa required"
      - "visa on arrival"
      - "e-visa"
      - "no admission"
    Returns (requirement_type, max_stay_days)
    """
    v = value.strip().lower()
    if v in ("visa required",):
        return "visa_required", None
    if v in ("visa on arrival",):
        return "voa", None
    if v in ("e-visa", "evisa"):
        return "evisa", None
    if v in ("no admission",):
        return "admission_refused", None
    if v.lstrip("-").isdigit():
        days = int(v)
        if days < 0:
            return None, None  # same-country cell, skip
        return "visa_free", (days if days > 0 else None)
    return "unclassified", None


def import_matrix(csv_path: str, db_path: str):
    conn = db.connect(db_path)
    db.upsert_countries(conn, UN_MEMBERS)

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        destination_isos = header[1:]  # first column is the nationality label

        inserted, skipped_existing, skipped_non_un = 0, 0, 0

        for row in reader:
            nationality_iso = row[0].strip().upper()
            if nationality_iso not in UN_ISO2_SET:
                skipped_non_un += 1
                continue

            for dest_iso, cell_value in zip(destination_isos, row[1:]):
                dest_iso = dest_iso.strip().upper()
                if dest_iso not in UN_ISO2_SET or dest_iso == nationality_iso:
                    continue

                req_type, days = classify_cell(cell_value)
                if req_type is None:
                    continue

                # Don't clobber existing (richer) Wikipedia-sourced rows
                cur = conn.execute(
                    "SELECT 1 FROM visa_requirements WHERE nationality_iso2=? AND destination_iso2=?",
                    (nationality_iso, dest_iso),
                )
                if cur.fetchone():
                    skipped_existing += 1
                    continue

                db.upsert_requirement(
                    conn,
                    nationality_iso2=nationality_iso,
                    destination_iso2=dest_iso,
                    requirement_type=req_type,
                    max_stay_days=days,
                    max_stay_raw=str(days) if days else None,
                    notes=None,
                    source_url="https://github.com/ilyankou/passport-index-dataset",
                )
                inserted += 1

    print(f"Inserted {inserted} rows; skipped {skipped_existing} already-present rows; "
          f"skipped {skipped_non_un} non-UN-member rows in source file.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--db", default="rootless_visa.db")
    args = ap.parse_args()
    import_matrix(args.csv_path, args.db)


if __name__ == "__main__":
    main()
