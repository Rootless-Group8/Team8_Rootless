import unittest

from pipeline import parser
from tests.fixture_page import SAMPLE_PAGE_HTML


class TestParser(unittest.TestCase):

    def test_finds_main_table_not_territories_table(self):
        table = parser.find_main_table(SAMPLE_PAGE_HTML)
        self.assertIsNotNone(table)
        header_text = table.find_all("tr")[0].get_text()
        self.assertIn("Country", header_text)

    def test_parses_expected_row_count(self):
        rows = parser.parse_rows(SAMPLE_PAGE_HTML)
        # 6 rows in the main table body (Hong Kong is in the territories
        # table and must NOT show up here)
        self.assertEqual(len(rows), 6)
        destinations = [r["destination_raw"] for r in rows]
        self.assertNotIn("Hong Kong", destinations)

    def test_strips_footnote_markers_from_notes(self):
        rows = parser.parse_rows(SAMPLE_PAGE_HTML)
        albania_row = next(r for r in rows if r["destination_raw"] == "Albania")
        self.assertNotIn("[1]", albania_row["notes_raw"])
        self.assertIn("reset", albania_row["notes_raw"])

        australia_row = next(r for r in rows if r["destination_raw"] == "Australia")
        self.assertNotIn("[2]", australia_row["notes_raw"])

    def test_raises_on_page_with_no_matching_table(self):
        with self.assertRaises(ValueError):
            parser.parse_rows("<div>no tables here</div>")


if __name__ == "__main__":
    unittest.main()
