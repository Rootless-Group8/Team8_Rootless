"""
Exercises parser -> normalize -> db against the synthetic fixture, end to
end, entirely offline. This is the closest thing to a real pipeline run
that's possible without network access — it proves the pieces fit
together correctly, independent of whether wiki_client's network calls
work (that part can only be verified by actually running it against
live Wikipedia, which you'll do locally).
"""

import os
import tempfile
import unittest

from pipeline import parser, normalize, db
from data.aliases import resolve as resolve_alias
from data.countries_seed import UN_MEMBERS
from tests.fixture_page import SAMPLE_PAGE_HTML


class TestOfflineIntegration(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.conn = db.connect(self.tmp.name)
        db.upsert_countries(self.conn, UN_MEMBERS)

    def tearDown(self):
        self.conn.close()
        os.unlink(self.tmp.name)

    def test_full_row_processing(self):
        nationality_iso = "US"  # pretend Testlandia == US for this test
        rows = parser.parse_rows(SAMPLE_PAGE_HTML)
        unresolved = []

        for row in rows:
            dest_iso = resolve_alias(row["destination_raw"])
            if not dest_iso:
                unresolved.append(row["destination_raw"])
                continue
            req_type = normalize.classify_requirement(row["requirement_raw"])
            days, raw_stay = normalize.parse_stay_duration(row["stay_raw"])
            notes = normalize.paraphrase_note_stub(row["notes_raw"])
            db.upsert_requirement(
                self.conn, nationality_iso, dest_iso, req_type,
                days, raw_stay, notes, "https://example.org/test",
            )

        # One row ("Fake Nonexistent Country") should be unresolved
        self.assertEqual(unresolved, ["Fake Nonexistent Country"])

        # 5 resolvable destinations, minus Canada->CA is fine (nationality is US)
        cur = self.conn.execute(
            "SELECT destination_iso2, requirement_type, max_stay_days FROM visa_requirements "
            "WHERE nationality_iso2 = 'US' ORDER BY destination_iso2"
        )
        results = {row[0]: (row[1], row[2]) for row in cur.fetchall()}

        self.assertEqual(results["AL"], ("visa_free", 365))       # Albania, 1 year
        self.assertEqual(results["AU"], ("eta", 90))              # Australia
        self.assertEqual(results["BS"], ("visa_free", 240))       # Bahamas, 8 months
        self.assertEqual(results["CA"], ("visa_free", 180))       # Canada, 6 months
        self.assertEqual(results["CD"], ("evisa", 7))             # DRC

    def test_rerun_with_no_changes_does_not_log_changelog(self):
        db.upsert_requirement(self.conn, "US", "AL", "visa_free", 365, "1 year", "note", "url")
        db.upsert_requirement(self.conn, "US", "AL", "visa_free", 365, "1 year", "note", "url")
        cur = self.conn.execute("SELECT COUNT(*) FROM changelog")
        self.assertEqual(cur.fetchone()[0], 0)

    def test_rerun_with_changed_value_logs_changelog(self):
        db.upsert_requirement(self.conn, "US", "AL", "visa_free", 365, "1 year", "note", "url")
        db.upsert_requirement(self.conn, "US", "AL", "visa_required", None, "N/A", "note", "url")
        cur = self.conn.execute("SELECT field, old_value, new_value FROM changelog")
        changes = cur.fetchall()
        fields_changed = {row[0] for row in changes}
        self.assertIn("requirement_type", fields_changed)

    def test_export_csv(self):
        db.upsert_requirement(self.conn, "US", "AL", "visa_free", 365, "1 year", "note", "url")
        out_path = self.tmp.name + ".csv"
        n = db.export_csv(self.conn, out_path)
        self.assertEqual(n, 1)
        with open(out_path) as f:
            content = f.read()
        self.assertIn("United States", content)
        self.assertIn("Albania", content)
        os.unlink(out_path)


if __name__ == "__main__":
    unittest.main()
