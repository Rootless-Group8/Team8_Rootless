"""
Maps alternate spellings/names of countries (as they show up in Wikipedia
tables, other datasets, or user input) to ISO alpha-2 codes.

This is the thing that will actually break your joins if you skip it —
Wikipedia alone uses several different spellings for the same country
depending on which page you're on.

Keys are lowercased for matching. Extend this file as you hit new variants
rather than special-casing them in parser code.
"""

from .countries_seed import UN_MEMBERS

# Start with the canonical names themselves
ALIASES = {name.lower(): iso2 for iso2, iso3, name in UN_MEMBERS}

# Known alternate spellings / historical names / common variants
_EXTRA = {
    "the bahamas": "BS",
    "bahamas, the": "BS",
    "the gambia": "GM",
    "gambia, the": "GM",
    "czech republic": "CZ",
    "cape verde": "CV",
    "ivory coast": "CI",
    "côte d'ivoire": "CI",
    "cote d ivoire": "CI",
    "swaziland": "SZ",
    "burma": "MM",
    "myanmar (burma)": "MM",
    "republic of the congo": "CG",
    "congo-brazzaville": "CG",
    "congo (brazzaville)": "CG",
    "congo": "CG",  # ambiguous — DRC entries should say "democratic" explicitly
    "democratic republic of congo": "CD",
    "dr congo": "CD",
    "drc": "CD",
    "congo-kinshasa": "CD",
    "congo (kinshasa)": "CD",
    "federated states of micronesia": "FM",
    "micronesia, federated states of": "FM",
    "east timor": "TL",
    "timor leste": "TL",
    "macedonia": "MK",
    "former yugoslav republic of macedonia": "MK",
    "republic of korea": "KR",
    "korea, south": "KR",
    "korea south": "KR",
    "south korea (republic of korea)": "KR",
    "democratic people's republic of korea": "KP",
    "korea, north": "KP",
    "korea north": "KP",
    "dprk": "KP",
    "united states of america": "US",
    "usa": "US",
    "u.s.": "US",
    "u.s.a.": "US",
    "united kingdom of great britain and northern ireland": "GB",
    "great britain": "GB",
    "uk": "GB",
    "united arab emirates (uae)": "AE",
    "uae": "AE",
    "russian federation": "RU",
    "syrian arab republic": "SY",
    "lao pdr": "LA",
    "lao people's democratic republic": "LA",
    "brunei darussalam": "BN",
    "holy see": None,       # not a UN member — deliberately unmapped
    "vatican city": None,   # not a UN member — deliberately unmapped
    "kosovo": None,         # not a UN member — deliberately unmapped
    "taiwan": None,         # not a UN member — deliberately unmapped
    "palestine": None,      # UN observer, not a member — deliberately unmapped
    "cabo verde, republic of": "CV",
    "saint kitts & nevis": "KN",
    "st kitts and nevis": "KN",
    "st. kitts and nevis": "KN",
    "saint vincent & the grenadines": "VC",
    "st vincent and the grenadines": "VC",
    "são tomé and príncipe": "ST",
    "sao tome & principe": "ST",
    "bosnia & herzegovina": "BA",
    "trinidad & tobago": "TT",
    "antigua & barbuda": "AG",
}

for k, v in _EXTRA.items():
    if v is None:
        continue
    ALIASES[k] = v


def resolve(name: str):
    """
    Resolve a free-text country name to an ISO alpha-2 code.
    Returns None if unresolved (caller should log these for manual review
    rather than guessing).
    """
    if not name:
        return None
    key = name.strip().lower()
    # Strip common footnote/markup artifacts that show up when scraping
    # rendered Wikipedia tables, e.g. "Australia[note 1]"
    key = key.split("[")[0].strip()
    return ALIASES.get(key)
