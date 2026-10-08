"""
seed_visa_programs.py

Fulfills TM08-21: Seed visa database: Canada & UK.

Loads visa program details (tourist/visitor, work, student) for Canada
and the UK from seed_visa_programs_ca_uk.json — researched from official
sources only (canada.ca / IRCC and gov.uk / UKVI) — and writes them to
Firebase RTDB using the same Admin SDK batching approach as
migrate_to_firebase.py (Sprint 1 seed tooling), rather than hardcoding
this data anywhere else in the app.

Schema written:
    countryVisaPrograms/{countryIso2}/{visaSlug}: {
        name, category, eligibilityCriteria, requiredDocuments,
        processingTime, fees, validityDuration, sourceUrl, lastVerified
    }

USAGE:
    python seed_visa_programs.py --data seed_visa_programs_ca_uk.json \
        --cred serviceAccountKey.json \
        --db-url https://daab-fcc5c-default-rtdb.firebaseio.com
"""

import argparse
import json
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, db


def connect_firebase(cred_path: str, db_url: str) -> None:
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {"databaseURL": db_url})


def load_seed_data(path: str) -> dict:
    if not Path(path).exists():
        sys.exit(f"Seed data file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_updates(seed_data: dict) -> tuple[dict, str]:
    """
    Build a flat {path: value} dict for a multi-path update(), and pull
    the shared lastVerified date to stamp on every record.
    """
    last_verified = seed_data.get("_meta", {}).get("lastVerified")
    if not last_verified:
        sys.exit("seed_visa_programs_ca_uk.json is missing _meta.lastVerified")

    updates: dict = {}
    for country_code, programs in seed_data.items():
        if country_code.startswith("_"):
            continue  # skip _meta / _notes

        for visa_slug, record in programs.items():
            required_keys = [
                "name",
                "category",
                "eligibilityCriteria",
                "requiredDocuments",
                "processingTime",
                "fees",
                "validityDuration",
                "sourceUrl",
            ]
            missing = [k for k in required_keys if k not in record]
            if missing:
                sys.exit(
                    f"{country_code}/{visa_slug} is missing required field(s): {missing}"
                )

            path = f"countryVisaPrograms/{country_code}/{visa_slug}"
            updates[path] = {**record, "lastVerified": last_verified}

    return updates, last_verified


def push_updates(updates: dict) -> None:
    db.reference("/").update(updates)


def print_summary(seed_data: dict, last_verified: str) -> None:
    print(f"Seeding visa programs (lastVerified={last_verified}):")
    for country_code, programs in seed_data.items():
        if country_code.startswith("_"):
            continue
        names = [v["name"] for v in programs.values()]
        print(f"  {country_code}: {len(names)} programs -> {', '.join(names)}")

    notes = seed_data.get("_notes", {}).get("digitalNomad")
    if notes:
        print(f"\nDigital nomad note: {notes}")


def main():
    parser = argparse.ArgumentParser(description="Seed CA/UK visa program data into Firebase RTDB")
    parser.add_argument("--data", required=True, help="Path to seed_visa_programs_ca_uk.json")
    parser.add_argument("--cred", required=True, help="Path to Firebase service account JSON")
    parser.add_argument("--db-url", required=True, help="Firebase RTDB URL")
    args = parser.parse_args()

    print(f"Loading seed data from {args.data} ...")
    seed_data = load_seed_data(args.data)

    print_summary(seed_data, seed_data.get("_meta", {}).get("lastVerified", "unknown"))

    print(f"\nConnecting to Firebase at {args.db_url} ...")
    connect_firebase(args.cred, args.db_url)

    print("Building update payload ...")
    updates, last_verified = build_updates(seed_data)

    print(f"Writing {len(updates)} visa program records to Firebase ...")
    push_updates(updates)

    print("Seed complete.")


if __name__ == "__main__":
    main()
