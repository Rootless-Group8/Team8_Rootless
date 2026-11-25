"""
seed_cost_of_living.py

Seeds Firebase RTDB with cost-of-living data for Canada and the UK
(rent, utilities, transport, healthcare), consumed by the new
Cost-of-Living UI page. Same Admin SDK pattern as
migrate_to_firebase.py / seed_visa_programs.py.

Schema written:
    costOfLiving/{countryIso2}: {
        currency, period,
        categories: {
            rent:       { amount, note, sourceUrl, lastVerifiedAt },
            utilities:  { amount, note, sourceUrl, lastVerifiedAt },
            transport:  { amount, note, sourceUrl, lastVerifiedAt },
            healthcare: { amount, note, sourceUrl, lastVerifiedAt }   // amount may be null
        }
    }

An `amount: null` category (currently only CA/healthcare) means there's
no single defensible figure to show — the UI renders the note instead
of a number rather than inventing one.

`lastVerifiedAt` is a ms-epoch timestamp (TM08-122), one per category —
not one per country record — because each category already carries its
own `sourceUrl`/`note` and can in principle be re-researched and
re-verified independently of the others. It's required per category
(see build_updates below); the UI's shared SourceCitation component
(TM08-112) renders it directly, no amount needed, so it still shows for
a null-amount category like CA/healthcare.

USAGE:
    python seed_cost_of_living.py --data seed_cost_of_living.json \
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


def build_updates(seed_data: dict) -> dict:
    updates = {}
    for country_code, record in seed_data.items():
        if country_code.startswith("_"):
            continue

        categories = record.get("categories", {})
        missing = [
            cat for cat in ("rent", "utilities", "transport", "healthcare") if cat not in categories
        ]
        if missing:
            sys.exit(f"{country_code} is missing categories: {missing}")

        missing_verified_at = [
            cat for cat, data in categories.items() if not isinstance(data.get("lastVerifiedAt"), int)
        ]
        if missing_verified_at:
            sys.exit(
                f"{country_code} categories missing a numeric lastVerifiedAt: {missing_verified_at}"
            )

        updates[f"costOfLiving/{country_code}"] = {
            "currency": record["currency"],
            "period": record["period"],
            "categories": categories,
        }
    return updates


def print_summary(seed_data: dict) -> None:
    print(f"Seeding cost-of-living data (lastVerified={seed_data.get('_meta', {}).get('lastVerified')}):")
    for country_code, record in seed_data.items():
        if country_code.startswith("_"):
            continue
        cats = record.get("categories", {})
        parts = []
        for name, cat in cats.items():
            amt = cat.get("amount")
            parts.append(f"{name}={amt if amt is not None else 'n/a'}")
        print(f"  {country_code} ({record['currency']}/{record['period']}): {', '.join(parts)}")


def main():
    parser = argparse.ArgumentParser(description="Seed cost-of-living data into Firebase RTDB")
    parser.add_argument("--data", required=True, help="Path to seed_cost_of_living.json")
    parser.add_argument("--cred", required=True, help="Path to Firebase service account JSON")
    parser.add_argument("--db-url", required=True, help="Firebase RTDB URL")
    args = parser.parse_args()

    print(f"Loading seed data from {args.data} ...")
    seed_data = load_seed_data(args.data)
    print_summary(seed_data)

    print(f"\nConnecting to Firebase at {args.db_url} ...")
    connect_firebase(args.cred, args.db_url)

    updates = build_updates(seed_data)
    print(f"Writing {len(updates)} country records to costOfLiving/ ...")
    db.reference("/").update(updates)

    print("Seed complete.")


if __name__ == "__main__":
    main()
