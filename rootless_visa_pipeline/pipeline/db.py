"""
SQLite storage for the visa requirements matrix.

Design choice: SQLite, not Postgres/MySQL, because this needs to run
from a laptop or a scheduled script with zero setup. If Rootless's main
app already uses a different database, export from here (it's one
`SELECT *` — see export_csv()) rather than re-architecting the pipeline
around your app's DB.
"""

import sqlite3
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS countries (
    iso2 TEXT PRIMARY KEY,
    iso3 TEXT NOT NULL,
    name TEXT NOT NULL,
    un_member INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS visa_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nationality_iso2 TEXT NOT NULL REFERENCES countries(iso2),
    destination_iso2 TEXT NOT NULL REFERENCES countries(iso2),
    requirement_type TEXT NOT NULL,
    max_stay_days INTEGER,
    max_stay_raw TEXT,
    notes TEXT,
    source_url TEXT,
    last_checked_at TEXT NOT NULL,
    last_changed_at TEXT NOT NULL,
    UNIQUE(nationality_iso2, destination_iso2)
);

CREATE TABLE IF NOT EXISTS changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nationality_iso2 TEXT NOT NULL,
    destination_iso2 TEXT NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unmatched_titles (
    title TEXT PRIMARY KEY,
    first_seen_at TEXT NOT NULL
);
"""


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_countries(conn, un_members):
    now = _now()
    for iso2, iso3, name in un_members:
        conn.execute(
            """
            INSERT INTO countries (iso2, iso3, name, un_member)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(iso2) DO UPDATE SET iso3=excluded.iso3, name=excluded.name
            """,
            (iso2, iso3, name),
        )
    conn.commit()


def upsert_requirement(conn, nationality_iso2, destination_iso2, requirement_type,
                        max_stay_days, max_stay_raw, notes, source_url):
    """
    Upserts one (nationality, destination) row. If a field changed versus
    the existing row, logs it to `changelog` and bumps last_changed_at.
    If nothing changed, only last_checked_at is touched — this is what
    makes the changelog meaningful (a burst of real changes vs. routine
    re-checks stay distinguishable).
    """
    now = _now()
    cur = conn.execute(
        """
        SELECT requirement_type, max_stay_days, max_stay_raw, notes
        FROM visa_requirements
        WHERE nationality_iso2 = ? AND destination_iso2 = ?
        """,
        (nationality_iso2, destination_iso2),
    )
    existing = cur.fetchone()

    if existing is None:
        conn.execute(
            """
            INSERT INTO visa_requirements
                (nationality_iso2, destination_iso2, requirement_type,
                 max_stay_days, max_stay_raw, notes, source_url,
                 last_checked_at, last_changed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (nationality_iso2, destination_iso2, requirement_type,
             max_stay_days, max_stay_raw, notes, source_url, now, now),
        )
        conn.commit()
        return

    old_type, old_days, old_raw, old_notes = existing
    changed_fields = []
    if old_type != requirement_type:
        changed_fields.append(("requirement_type", old_type, requirement_type))
    if old_days != max_stay_days:
        changed_fields.append(("max_stay_days", old_days, max_stay_days))
    if (old_notes or "") != (notes or ""):
        changed_fields.append(("notes", old_notes, notes))

    if changed_fields:
        for field, old_value, new_value in changed_fields:
            conn.execute(
                """
                INSERT INTO changelog
                    (nationality_iso2, destination_iso2, field, old_value, new_value, changed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (nationality_iso2, destination_iso2, field,
                 str(old_value) if old_value is not None else None,
                 str(new_value) if new_value is not None else None,
                 now),
            )
        conn.execute(
            """
            UPDATE visa_requirements
            SET requirement_type = ?, max_stay_days = ?, max_stay_raw = ?,
                notes = ?, source_url = ?, last_checked_at = ?, last_changed_at = ?
            WHERE nationality_iso2 = ? AND destination_iso2 = ?
            """,
            (requirement_type, max_stay_days, max_stay_raw, notes, source_url,
             now, now, nationality_iso2, destination_iso2),
        )
    else:
        conn.execute(
            """
            UPDATE visa_requirements
            SET last_checked_at = ?
            WHERE nationality_iso2 = ? AND destination_iso2 = ?
            """,
            (now, nationality_iso2, destination_iso2),
        )
    conn.commit()


def record_unmatched_title(conn, title):
    conn.execute(
        """
        INSERT OR IGNORE INTO unmatched_titles (title, first_seen_at)
        VALUES (?, ?)
        """,
        (title, _now()),
    )
    conn.commit()


def export_csv(conn, out_path):
    import csv
    cur = conn.execute(
        """
        SELECT n.name AS nationality, d.name AS destination,
               v.requirement_type, v.max_stay_days, v.max_stay_raw, v.notes,
               v.source_url, v.last_checked_at, v.last_changed_at
        FROM visa_requirements v
        JOIN countries n ON n.iso2 = v.nationality_iso2
        JOIN countries d ON d.iso2 = v.destination_iso2
        ORDER BY nationality, destination
        """
    )
    rows = cur.fetchall()
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([desc[0] for desc in cur.description])
        writer.writerows(rows)
    return len(rows)
