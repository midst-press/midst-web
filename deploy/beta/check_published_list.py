#!/usr/bin/env python3
"""Before a site built with --poem-list published goes out: can it read its list, and reach every poem on it?

Usage: check_published_list.py <poems url>      (the site's POEMS_URL, ending in /poems/)

The site fetches <poems url>published.json once when it starts, and then fetches each entry's RECORDED keys
(midst-web #110). This asks the same questions first: the list is there, has version 1 and a list of poems,
every entry has a poemId, title and author (no poemId twice), every timelapse key (and every process note
that is not null) is a key under poems/, and each one answers. One bad entry refuses the list, as the site does.
A list with no poems is reported, not refused: the publisher may have unpublished everything.

Exit 0 when all of that holds, 1 when anything does not. Prints counts only, never a poem id, name or key.
"""

import http.client
import json
import sys
import urllib.error
import urllib.request

KEY_ROOT = "poems/"
TIMEOUT = 20


def is_text(value):
    return isinstance(value, str) and len(value) > 0


def is_key(value):
    """The site's own rule (midst-web src/poems/poem-list.js): "poems/<something>", nothing climbing out of it."""
    return (
        isinstance(value, str)
        and value.startswith(KEY_ROOT)
        and len(value) > len(KEY_ROOT)
        and not any(part in ("..", ".") for part in value.split("/"))
    )


def recorded_keys(listing):
    """Every key the site will fetch from a parsed published.json; raises ValueError if it is not well formed."""
    # The site's test is `json.version !== 1`. Python's True == 1, so a boolean is refused by name (alden-ec2221c7);
    # 1.0 stays accepted, as it is by the site.
    version = listing.get("version") if isinstance(listing, dict) else None
    if isinstance(version, bool) or version != 1 or not isinstance(listing.get("poems"), list):
        raise ValueError("published.json does not have version 1 and a list of poems")
    keys = []
    seen = set()
    for entry in listing["poems"]:
        if not isinstance(entry, dict) or not is_key(entry.get("timelapse")):
            raise ValueError("an entry in published.json has no timelapse key under poems/")
        if not all(is_text(entry.get(field)) for field in ("poemId", "title", "author")):
            raise ValueError("an entry in published.json lacks a poemId, title or author")
        if entry["poemId"] in seen:
            raise ValueError("two entries in published.json have the same poemId")
        seen.add(entry["poemId"])
        keys.append(entry["timelapse"])
        note = entry.get("processNote")
        if note is not None:
            if not is_key(note):
                raise ValueError("an entry in published.json has a process note that is not a key under poems/")
            keys.append(note)
    return len(listing["poems"]), keys


def answers(url):
    request = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT):
            return True
    except (urllib.error.URLError, http.client.HTTPException, OSError):
        return False


def main(argv):
    if len(argv) != 2 or not argv[1].endswith("/" + KEY_ROOT):
        print("usage: check_published_list.py <poems url ending in /poems/>", file=sys.stderr)
        return 1
    base = argv[1]
    try:
        with urllib.request.urlopen(base + "published.json", timeout=TIMEOUT) as response:
            listing = json.loads(response.read())
    except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError):
        print("published.json could not be fetched or is not JSON", file=sys.stderr)
        return 1
    try:
        poems, keys = recorded_keys(listing)
    except ValueError as problem:
        print(problem, file=sys.stderr)
        return 1
    missing = sum(1 for key in keys if not answers(base + key[len(KEY_ROOT) :]))
    print(f"published list: {poems} poems, {len(keys) - missing}/{len(keys)} recorded objects reachable")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
