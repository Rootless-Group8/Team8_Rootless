"""
Parses the main "Country / Requirement / Allowed stay / Notes" table out
of a Wikipedia visa-requirements page's rendered HTML.

Design note: each nationality page has ONE main wikitable (destination
countries) followed by separate smaller tables for territories/regions
and pre-approved-visa notes. We only want the main one. We identify it
by header-cell text rather than by position, since position has shifted
between page revisions before.
"""

from bs4 import BeautifulSoup

EXPECTED_HEADER_KEYWORDS = ("country", "requirement", "stay")


def _clean_cell_text(cell) -> str:
    """
    Extract text from a table cell, stripping footnote markers like
    [12] or [citation needed], and collapsing whitespace.
    """
    # Remove <sup> footnote reference tags entirely before extracting text
    for sup in cell.find_all("sup"):
        sup.decompose()
    text = cell.get_text(separator=" ", strip=True)
    return " ".join(text.split())


def _looks_like_main_table(table) -> bool:
    header_cells = table.find_all("th")
    if not header_cells:
        return False
    header_text = " ".join(_clean_cell_text(th).lower() for th in header_cells)
    return all(keyword in header_text for keyword in EXPECTED_HEADER_KEYWORDS)


def find_main_table(html: str):
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table", class_="wikitable")
    for table in tables:
        if _looks_like_main_table(table):
            return table
    return None


def parse_rows(html: str):
    """
    Returns a list of dicts:
        {"destination_raw": str, "requirement_raw": str,
         "stay_raw": str, "notes_raw": str}

    Raises ValueError if no matching table is found — callers should treat
    that as "this page needs manual review", not silently skip it.
    """
    table = find_main_table(html)
    if table is None:
        raise ValueError("No main visa-requirements table found in page HTML")

    rows_out = []
    body_rows = table.find_all("tr")[1:]  # skip header row

    for tr in body_rows:
        cells = tr.find_all(["td", "th"])
        if len(cells) < 3:
            continue  # section divider row or malformed row — skip, don't crash
        texts = [_clean_cell_text(c) for c in cells]
        destination_raw = texts[0]
        requirement_raw = texts[1]
        stay_raw = texts[2] if len(texts) > 2 else ""
        notes_raw = texts[3] if len(texts) > 3 else ""
        if not destination_raw:
            continue
        rows_out.append({
            "destination_raw": destination_raw,
            "requirement_raw": requirement_raw,
            "stay_raw": stay_raw,
            "notes_raw": notes_raw,
        })

    return rows_out
