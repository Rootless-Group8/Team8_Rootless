"""
seed_relocation_guides.py

Seeds Firebase RTDB with relocation guide content (housing, healthcare,
banking, transport) for the Relocation Guides UI story. Same Admin SDK
pattern as seed_cost_of_living.py / seed_visa_programs.py.

Schema written:
    relocationGuides/{countryIso2}: {
        housing:    { summary, tips, sourceUrl },
        healthcare: { summary, tips, sourceUrl },
        banking:    { summary, tips, sourceUrl },
        transport:  { summary, tips, sourceUrl }
    }

USAGE:
    python seed_relocation_guides.py --data seed_relocation_guides.json \
        --cred serviceAccountKey.json \
        --db-url https://daab-fcc5c-default-rtdb.firebaseio.com
"""

import argparse
import json
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, db

REQUIRED_SECTIONS = ["housing", "healthcare", "banking", "transport"]


def connect_firebase(cred_path: str, db_url: str) -> None:
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {"databaseURL": db_url})


def load_seed_data(path: str) -> dict:
    if not Path(path).exists():
        sys.exit(f"Seed data file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_updates(seed_data: dict) -> dict:
    updates = {}
    for country_code, record in seed_data.items():
        if country_code.startswith("_"):
            continue

        missing = [s for s in REQUIRED_SECTIONS if s not in record]
        if missing:
            sys.exit(f"{country_code} is missing section(s): {missing}")

        for section in REQUIRED_SECTIONS:
            data = record[section]
            if not data.get("summary") or not data.get("tips"):
                sys.exit(f"{country_code}/{section} is missing summary or tips")

        updates[f"relocationGuides/{country_code}"] = record
    return updates


def print_summary(seed_data: dict) -> None:
    print(f"Seeding relocation guides (lastVerified={seed_data.get('_meta', {}).get('lastVerified')}):")
    for country_code, record in seed_data.items():
        if country_code.startswith("_"):
            continue
        sections = [s for s in REQUIRED_SECTIONS if s in record]
        print(f"  {country_code}: {len(sections)}/4 sections -> {', '.join(sections)}")


def main():
    parser = argparse.ArgumentParser(description="Seed relocation guide data into Firebase RTDB")
    parser.add_argument("--data", required=True, help="Path to seed_relocation_guides.json")
    parser.add_argument("--cred", required=True, help="Path to Firebase service account JSON")
    parser.add_argument("--db-url", required=True, help="Firebase RTDB URL")
    args = parser.parse_args()

    print(f"Loading seed data from {args.data} ...")
    seed_data = load_seed_data(args.data)
    print_summary(seed_data)

    print(f"\nConnecting to Firebase at {args.db_url} ...")
    connect_firebase(args.cred, args.db_url)

    updates = build_updates(seed_data)
    print(f"Writing {len(updates)} country guide(s) to relocationGuides/ ...")
    db.reference("/").update(updates)

    print("Seed complete.")


if __name__ == "__main__":
    main()
