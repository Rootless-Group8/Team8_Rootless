"""
Resolves each UN member's ISO code to its actual Wikipedia page title
under Category:Visa requirements by nationality.

Why not just guess "Visa requirements for {Country} citizens"? Because
that pattern is wrong for a large minority of pages (demonym forms,
"citizens of X" forms, disambiguation for Congo/Korea/Dominica vs.
Dominican Republic, etc.). Guessing produces silent 404s or, worse,
silently fetches the wrong page. Resolving against the real category
listing catches that instead of hiding it.
"""

import csv
import os
import re

from data.demonyms import resolve_demonym
from data.aliases import resolve as resolve_alias

CATEGORY_TITLE = "Category:Visa requirements by nationality"
OVERRIDES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "title_overrides.csv")

_TITLE_PATTERNS = [
    re.compile(r"^Visa requirements for (?P<demonym>.+?) citizens$", re.IGNORECASE),
    re.compile(r"^Visa requirements for citizens of (?P<country>.+)$", re.IGNORECASE),
]


def load_overrides():
    """
    Manual overrides for titles the automatic matcher gets wrong or can't
    resolve. CSV columns: iso2,wikipedia_title
    File is optional — if absent, returns {}.
    """
    overrides = {}
    if not os.path.exists(OVERRIDES_PATH):
        return overrides
    with open(OVERRIDES_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            iso2 = row["iso2"].strip().upper()
            title = row["wikipedia_title"].strip()
            if iso2 and title:
                overrides[iso2] = title
    return overrides


def match_title_to_iso(title: str):
    """
    Given a Wikipedia page title from the category listing, try to resolve
    it to an ISO alpha-2 code. Returns None if no confident match.
    """
    for pattern in _TITLE_PATTERNS:
        m = pattern.match(title.strip())
        if not m:
            continue
        if "demonym" in m.groupdict() and m.group("demonym"):
            iso = resolve_demonym(m.group("demonym"))
            if iso:
                return iso
        if "country" in m.groupdict() and m.group("country"):
            iso = resolve_alias(m.group("country"))
            if iso:
                return iso
    return None


def build_title_map(category_member_titles):
    """
    category_member_titles: list[str] of page titles returned by the
    Wikipedia API for Category:Visa requirements by nationality.

    Returns:
        title_map: dict[iso2] -> wikipedia page title
        unmatched: list[str] of titles that couldn't be resolved
                   (manually review these and add to title_overrides.csv)
    """
    overrides = load_overrides()
    title_map = dict(overrides)  # overrides win
    unmatched = []

    for title in category_member_titles:
        iso = match_title_to_iso(title)
        if iso and iso not in title_map:
            title_map[iso] = title
        elif not iso:
            unmatched.append(title)

    return title_map, unmatched
