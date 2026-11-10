"""
Turns free-text requirement/duration strings into structured values.

Requirement classification is intentionally a small ordered set of rules
checked top-to-bottom (order matters — e.g. "eVisa / Visa on arrival"
must be checked before a bare "visa on arrival" rule, etc., though here
we use substring checks that are robust either way). Anything that
doesn't match falls into "unclassified" rather than being force-fit
into the wrong bucket — unclassified rows should be reviewed, not
silently miscategorized.
"""

import re

REQUIREMENT_TYPES = (
    "visa_free",
    "eta",
    "evisa",
    "voa",
    "evisa_or_voa",
    "visa_required",
    "admission_refused",
    "special_privilege",
    "unclassified",
)

_RULES = [
    # (substring to look for in lowercased text, resulting type)
    ("admission refused", "admission_refused"),
    ("visa issuance suspended", "admission_refused"),
    ("special entry privilege", "special_privilege"),
    ("freedom of movement", "special_privilege"),
    ("electronic travel authori", "eta"),  # covers -ation / -sation
    ("evisa / visa on arrival", "evisa_or_voa"),
    ("e-visa / visa on arrival", "evisa_or_voa"),
    ("evisa / voa", "evisa_or_voa"),
    ("visa on arrival / evisa", "evisa_or_voa"),
    ("e-voa", "evisa_or_voa"),
    ("evisa", "evisa"),
    ("e-visa", "evisa"),
    ("online visa", "evisa"),
    ("visa on arrival", "voa"),
    ("entry permit on arrival", "voa"),
    ("free visa on arrival", "voa"),
    ("electronic border system", "eta"),
    ("visa not required", "visa_free"),
    ("visa-free", "visa_free"),
    ("visa required", "visa_required"),
]


def classify_requirement(raw_text: str) -> str:
    if not raw_text:
        return "unclassified"
    text = raw_text.lower()
    for needle, req_type in _RULES:
        if needle in text:
            return req_type
    return "unclassified"


_DAY_UNIT_MULTIPLIERS = {
    "day": 1,
    "days": 1,
    "week": 7,
    "weeks": 7,
    "month": 30,
    "months": 30,
    "year": 365,
    "years": 365,
}

_DURATION_PATTERN = re.compile(
    r"(?P<number>\d+)\s*(?P<unit>day|days|week|weeks|month|months|year|years)",
    re.IGNORECASE,
)


def parse_stay_duration(raw_text: str):
    """
    Extracts an integer day count from free text like "90 days",
    "3 months", "1 year". If the text contains multiple numbers
    (e.g. "14 days / 30 days" for a two-tier visa), returns the
    FIRST one found and leaves the raw text intact for the caller
    to store alongside it — don't silently pick "the bigger one",
    since which tier applies depends on which visa type it's paired with.

    Returns (days: int | None, raw_text: str)
    """
    if not raw_text or raw_text.upper() in ("N/A", "NONE", ""):
        return None, raw_text

    match = _DURATION_PATTERN.search(raw_text)
    if not match:
        return None, raw_text

    number = int(match.group("number"))
    unit = match.group("unit").lower()
    multiplier = _DAY_UNIT_MULTIPLIERS.get(unit, 1)
    return number * multiplier, raw_text


def paraphrase_note_stub(raw_note: str) -> str:
    """
    Placeholder hook: real note paraphrasing should not just copy
    Wikipedia's sentences verbatim into your database (see README's
    licensing note). For now this truncates to keep notes short;
    swap in an actual rewrite step before shipping notes to end users.
    """
    if not raw_note:
        return ""
    first_sentence = raw_note.split(".")[0].strip()
    return first_sentence[:200]
