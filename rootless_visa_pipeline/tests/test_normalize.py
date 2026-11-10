import unittest

from pipeline import normalize
from data.aliases import resolve as resolve_alias
from data.demonyms import resolve_demonym
from pipeline.title_resolver import match_title_to_iso


class TestClassifyRequirement(unittest.TestCase):

    def test_visa_free(self):
        self.assertEqual(normalize.classify_requirement("Visa not required"), "visa_free")

    def test_eta(self):
        self.assertEqual(normalize.classify_requirement("Electronic Travel Authorisation"), "eta")
        self.assertEqual(normalize.classify_requirement("Electronic Travel Authorization"), "eta")

    def test_evisa(self):
        self.assertEqual(normalize.classify_requirement("eVisa"), "evisa")

    def test_voa(self):
        self.assertEqual(normalize.classify_requirement("Visa on arrival"), "voa")

    def test_evisa_or_voa_combo(self):
        self.assertEqual(normalize.classify_requirement("eVisa / Visa on arrival"), "evisa_or_voa")

    def test_visa_required(self):
        self.assertEqual(normalize.classify_requirement("Visa required"), "visa_required")

    def test_admission_refused(self):
        self.assertEqual(normalize.classify_requirement("Admission refused"), "admission_refused")

    def test_special_privilege(self):
        self.assertEqual(normalize.classify_requirement("Freedom of movement"), "special_privilege")

    def test_unclassified_on_empty(self):
        self.assertEqual(normalize.classify_requirement(""), "unclassified")

    def test_unclassified_on_junk(self):
        self.assertEqual(normalize.classify_requirement("asdkjfh"), "unclassified")


class TestParseStayDuration(unittest.TestCase):

    def test_days(self):
        days, raw = normalize.parse_stay_duration("90 days")
        self.assertEqual(days, 90)

    def test_months(self):
        days, raw = normalize.parse_stay_duration("3 months")
        self.assertEqual(days, 90)

    def test_year(self):
        days, raw = normalize.parse_stay_duration("1 year")
        self.assertEqual(days, 365)

    def test_na_returns_none(self):
        days, raw = normalize.parse_stay_duration("N/A")
        self.assertIsNone(days)

    def test_empty_returns_none(self):
        days, raw = normalize.parse_stay_duration("")
        self.assertIsNone(days)

    def test_two_tier_takes_first(self):
        days, raw = normalize.parse_stay_duration("14 days / 30 days")
        self.assertEqual(days, 14)


class TestAliasResolution(unittest.TestCase):

    def test_canonical_name(self):
        self.assertEqual(resolve_alias("Afghanistan"), "AF")

    def test_the_bahamas_variant(self):
        self.assertEqual(resolve_alias("The Bahamas"), "BS")

    def test_cote_divoire_variants(self):
        self.assertEqual(resolve_alias("Cote d'Ivoire"), "CI")
        self.assertEqual(resolve_alias("Ivory Coast"), "CI")

    def test_drc_vs_congo_disambiguation(self):
        self.assertEqual(resolve_alias("Democratic Republic of the Congo"), "CD")
        self.assertEqual(resolve_alias("Republic of the Congo"), "CG")

    def test_footnote_marker_stripped(self):
        self.assertEqual(resolve_alias("Australia[note 1]"), "AU")

    def test_unresolvable_returns_none(self):
        self.assertIsNone(resolve_alias("Fake Nonexistent Country"))

    def test_non_un_member_returns_none(self):
        self.assertIsNone(resolve_alias("Vatican City"))
        self.assertIsNone(resolve_alias("Kosovo"))


class TestDemonymResolution(unittest.TestCase):

    def test_basic_demonym(self):
        self.assertEqual(resolve_demonym("Afghan"), "AF")
        self.assertEqual(resolve_demonym("Canadian"), "CA")

    def test_unknown_demonym(self):
        self.assertIsNone(resolve_demonym("Wakandan"))


class TestTitleMatching(unittest.TestCase):

    def test_demonym_style_title(self):
        self.assertEqual(
            match_title_to_iso("Visa requirements for Afghan citizens"), "AF"
        )

    def test_citizens_of_style_title(self):
        self.assertEqual(
            match_title_to_iso("Visa requirements for citizens of Botswana"), "BW"
        )

    def test_unmatchable_title(self):
        self.assertIsNone(match_title_to_iso("Some unrelated page title"))


if __name__ == "__main__":
    unittest.main()
