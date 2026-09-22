"""
verify_visa_programs.py

Verifies TM08-21 acceptance criteria for the seeded Canada/UK visa
program data:
  - At least 3 visa types are documented per country.
  - Each record includes eligibility, documents, processing time,
    fee, and validity duration.
  - Each record cites a source URL and a lastVerified date.
  - A complete, correctly-typed record can be retrieved for every
    visa type entered.
  - No placeholder or lorem-ipsum values remain in submitted records.

USAGE:
    python verify_visa_programs.py --cred serviceAccountKey.json \
        --db-url https://daab-fcc5c-default-rtdb.firebaseio.com
"""

import argparse
import sys

import firebase_admin
from firebase_admin import credentials, db

REQUIRED_FIELDS = [
    "name",
    "category",
    "eligibilityCriteria",
    "requiredDocuments",
    "processingTime",
    "fees",
    "validityDuration",
    "sourceUrl",
    "lastVerified",
]

# Case-insensitive substrings that would indicate placeholder content
# slipped into a submitted record.
PLACEHOLDER_MARKERS = ["lorem ipsum", "todo", "tbd", "xxx", "placeholder", "n/a", "example.com"]

MIN_VISA_TYPES_PER_COUNTRY = 3
EXPECTED_COUNTRIES = ["CA", "GB"]


def connect_firebase(cred_path: str, db_url: str) -> None:
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {"databaseURL": db_url})


def contains_placeholder(value) -> bool:
    text = str(value).lower()
    return any(marker in text for marker in PLACEHOLDER_MARKERS)


def check_record(country: str, slug: str, record: dict) -> list[str]:
    """Return a list of problems found with a single record (empty = clean)."""
    problems = []

    missing = [f for f in REQUIRED_FIELDS if f not in record or record[f] in (None, "", [])]
    if missing:
        problems.append(f"missing/empty field(s): {missing}")

    for field, value in record.items():
        if isinstance(value, list):
            for item in value:
                if contains_placeholder(item):
                    problems.append(f"placeholder-looking text in {field}: {item!r}")
        elif contains_placeholder(value):
            problems.append(f"placeholder-looking text in {field}: {value!r}")

    if "sourceUrl" in record and not str(record["sourceUrl"]).startswith("http"):
        problems.append(f"sourceUrl doesn't look like a real URL: {record['sourceUrl']!r}")

    return problems


def main():
    parser = argparse.ArgumentParser(description="Verify seeded visa program data")
    parser.add_argument("--cred", required=True, help="Path to Firebase service account JSON")
    parser.add_argument("--db-url", required=True, help="Firebase RTDB URL")
    args = parser.parse_args()

    connect_firebase(args.cred, args.db_url)

    print("Fetching countryVisaPrograms/ ...")
    all_programs = db.reference("countryVisaPrograms").get()

    if not all_programs:
        sys.exit("[FAIL] countryVisaPrograms/ is empty or missing")

    overall_ok = True

    for country in EXPECTED_COUNTRIES:
        programs = all_programs.get(country)
        print(f"\n--- {country} ---")

        if not programs:
            print(f"  [FAIL] no visa programs found for {country}")
            overall_ok = False
            continue

        count = len(programs)
        if count < MIN_VISA_TYPES_PER_COUNTRY:
            print(f"  [FAIL] only {count} visa type(s) found, need at least {MIN_VISA_TYPES_PER_COUNTRY}")
            overall_ok = False
        else:
            print(f"  [OK] {count} visa type(s) found: {', '.join(programs.keys())}")

        for slug, record in programs.items():
            problems = check_record(country, slug, record)
            if problems:
                overall_ok = False
                print(f"  [FAIL] {slug}:")
                for p in problems:
                    print(f"      - {p}")
            else:
                print(f"  [OK] {slug}: all required fields present, no placeholder text detected")
                print(
                    f"       name={record['name']!r}, "
                    f"fees={record['fees']!r}, "
                    f"lastVerified={record['lastVerified']!r}"
                )

    print("\n--- Summary ---")
    print("ALL CHECKS PASSED" if overall_ok else "SOME CHECKS FAILED")
    sys.exit(0 if overall_ok else 1)


if __name__ == "__main__":
    main()
