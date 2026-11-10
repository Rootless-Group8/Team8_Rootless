"""
Thin, polite client for the Wikipedia API. This is the ONLY module that
makes network requests — everything else in the pipeline is pure/testable
without a network connection.

Rate limiting: 1 request/second, which gets you through all 193 nationality
pages in about 3-4 minutes. That's well within polite-use norms for the
API (see https://www.mediawiki.org/wiki/API:Etiquette). Don't lower the
sleep interval — there's no benefit to you and it risks getting rate-limited
or blocked.
"""

import json
import os
import time
import urllib.parse
import urllib.request

API_URL = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "RootlessVisaBot/1.0 (student project; contact: replace-with-your-email)"
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
MIN_INTERVAL_SECONDS = 1.0

_last_request_time = 0.0


def _throttle():
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < MIN_INTERVAL_SECONDS:
        time.sleep(MIN_INTERVAL_SECONDS - elapsed)
    _last_request_time = time.time()


def _api_get(params: dict) -> dict:
    params = dict(params, format="json")
    url = API_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    _throttle()
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_category_members(category_title: str, limit: int = 500) -> list:
    """Returns list of page titles (str) in a Wikipedia category."""
    titles = []
    cmcontinue = None
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category_title,
            "cmlimit": limit,
            "cmtype": "page",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        data = _api_get(params)
        members = data.get("query", {}).get("categorymembers", [])
        titles.extend(m["title"] for m in members)
        cmcontinue = data.get("continue", {}).get("cmcontinue")
        if not cmcontinue:
            break
    return titles


def _cache_path(page_title: str) -> str:
    safe = page_title.replace("/", "_").replace(" ", "_")
    return os.path.join(CACHE_DIR, f"{safe}.html")


def get_page_html(page_title: str, use_cache: bool = True, cache_max_age_seconds=None) -> str:
    """
    Fetches the rendered HTML of a page via action=parse.
    Caches to disk so repeated pipeline runs during development don't
    re-hit the network. Set use_cache=False to force a live fetch.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = _cache_path(page_title)

    if use_cache and os.path.exists(path):
        if cache_max_age_seconds is None or (
            time.time() - os.path.getmtime(path) < cache_max_age_seconds
        ):
            with open(path, encoding="utf-8") as f:
                return f.read()

    data = _api_get({
        "action": "parse",
        "page": page_title,
        "prop": "text",
        "redirects": 1,
    })
    html = data.get("parse", {}).get("text", {}).get("*", "")

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)

    return html
