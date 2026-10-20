#!/usr/bin/env python3
"""Before a site built with --poem-list published goes out: can it read its list, and reach every poem on it?

Usage: check_published_list.py <poems url> [--listing <listing.json> [--keys-to <path>]]
       <poems url> is the site's POEMS_URL, ending in /poems/.

The site fetches <poems url>published.json once when it starts, and then fetches each entry's RECORDED keys
(midst-web #110). This asks the same questions first: the list is there, has version 1 and a list of poems,
every entry has a poemId, title and author (no poemId twice), any date is YYYY-MM-DD, every timelapse key (and every process note
that is not null) is a key under poems/, and each one answers. One bad entry refuses the list, as the site does.
A list with no poems is reported, not refused: the publisher may have unpublished everything.

With --listing, it also asks the other direction (midst-web #41): the publishing bucket holds nothing under poems/ that
the list does not name. <listing.json> is the whole output of
    aws s3api list-objects-v2 --bucket <publishing bucket> --prefix poems/
(the CLI follows every page itself). Every key there must be a recorded key or published.json, and every recorded key
must be there. A copy left behind by a failed delete, or put there by hand, is served to anyone who knows its id, so a
key present but unlisted fails the check as a missing one does. A listing that says it is truncated is refused: a
partial listing cannot show that something is absent.

--keys-to <path> writes the keys behind those two counts, one "missing<TAB>key" or "unlisted<TAB>key" per line, to a
new file created with mode 600. The path must be outside this repository, and an existing file is never overwritten.

Exit 0 when all of that holds, 1 when anything does not. Prints counts only, never a poem id, name or key.
"""

import os

import http.client
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

KEY_ROOT = "poems/"
LIST_KEY = KEY_ROOT + "published.json"
TIMEOUT = 20


def repository_root(start):
    """The repository this file is in: the nearest folder above it holding .git. midst-web keeps a copy at
    deploy/beta/, one level deeper than midst-infra's beta/, so a fixed number of parents would be wrong in one of them."""
    for folder in Path(start).resolve().parents:
        if (folder / ".git").exists():
            return folder
    return Path(start).resolve().parent.parent


REPOSITORY = repository_root(__file__)
USAGE = "usage: check_published_list.py <poems url ending in /poems/> [--listing <listing.json> [--keys-to <path>]]"


def is_text(value):
    return isinstance(value, str) and len(value) > 0


# The site's stored date (midst-web src/poems/canonical-date.js, midst-infra #81): exactly YYYY-MM-DD, ASCII digits, and
# a real Gregorian date, by arithmetic for every four-digit year.
ISO_DATE = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})")


def is_real_date(y, m, d):
    if m < 1 or m > 12 or d < 1:
        return False
    leap = (y % 4 == 0 and y % 100 != 0) or y % 400 == 0
    return d <= [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]


def is_absent_or_date(value):
    """The site's isAbsentOrDate: null, absent, or a canonical date. Anything else refuses the list."""
    if value is None:
        return True
    match = ISO_DATE.fullmatch(value) if isinstance(value, str) else None
    return match is not None and is_real_date(*(int(g) for g in match.groups()))


def is_key(value):
    """The site's own rule (midst-web src/poems/poem-list.js): "poems/<something>", nothing climbing out of it."""
    return (
        isinstance(value, str)
        and value.startswith(KEY_ROOT)
        and len(value) > len(KEY_ROOT)
        and not any(part in ("..", ".") for part in value.split("/"))
    )


def _not_json(constant):
    raise ValueError(f"{constant} is not JSON")


def read_listing(raw):
    """Parse published.json as the site's response.json() does: UTF-8 (one leading BOM dropped), and no NaN or
    Infinity, which Python's json accepts and JSON.parse refuses. Raises ValueError if it is not JSON.

    One difference, on purpose: invalid UTF-8 is refused here, while the site replaces each bad byte with U+FFFD
    and reads the list. The check is the stricter of the two, never the looser."""
    return json.loads(raw.decode("utf-8-sig"), parse_constant=_not_json)


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
        if not (is_absent_or_date(entry.get("publishDate")) and is_absent_or_date(entry.get("date"))):
            raise ValueError("an entry in published.json has a date that is not YYYY-MM-DD")
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


def listed_keys(listing):
    """The keys under poems/ in a parsed list-objects-v2 result; raises ValueError if it is not one, or is partial."""
    if not isinstance(listing, dict):
        raise ValueError("the listing is not a list-objects-v2 result")
    if listing.get("IsTruncated") is True or listing.get("NextToken") or listing.get("NextContinuationToken"):
        raise ValueError("the listing is truncated, so it cannot show what is absent")
    contents = listing.get("Contents", [])
    if not isinstance(contents, list) or not all(
        isinstance(o, dict) and isinstance(o.get("Key"), str) for o in contents
    ):
        raise ValueError("the listing's Contents is not a list of objects with keys")
    return [o["Key"] for o in contents if o["Key"].startswith(KEY_ROOT)]


def compare_keys(recorded, listed):
    """(missing, unlisted): recorded keys the bucket does not hold, and keys it holds that the list does not name,
    published.json itself aside. Both sorted."""
    present = set(listed) - {LIST_KEY}
    wanted = set(recorded)
    return sorted(wanted - present), sorted(present - wanted)


def write_keys(path, missing, unlisted):
    """The keys behind the counts, to a new file with mode 600, outside this repository; never to stdout."""
    target = Path(path).expanduser().resolve()
    if target == REPOSITORY or REPOSITORY in target.parents:
        raise ValueError("--keys-to must be outside this repository")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as out:
        for state, keys in (("missing", missing), ("unlisted", unlisted)):
            for key in keys:
                out.write(f"{state}\t{key}\n")


def parse_args(argv):
    """(url, listing path or None, keys-to path or None), or None when the arguments are wrong."""
    if len(argv) < 2 or not argv[1].endswith("/" + KEY_ROOT):
        return None
    options = {}
    rest = argv[2:]
    while rest:
        if len(rest) < 2 or rest[0] not in ("--listing", "--keys-to") or rest[0] in options:
            return None
        options[rest[0]] = rest[1]
        rest = rest[2:]
    if "--keys-to" in options and "--listing" not in options:
        return None
    return argv[1], options.get("--listing"), options.get("--keys-to")


def answers(url):
    request = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT):
            return True
    except (urllib.error.URLError, http.client.HTTPException, OSError):
        return False


def main(argv):
    args = parse_args(argv)
    if args is None:
        print(USAGE, file=sys.stderr)
        return 1
    base, listing_path, keys_to = args
    listed = None
    if listing_path is not None:
        try:
            listed = listed_keys(json.loads(Path(listing_path).read_text(encoding="utf-8")))
        except (OSError, ValueError) as problem:
            print(f"the listing could not be read: {problem}", file=sys.stderr)
            return 1
    try:
        with urllib.request.urlopen(base + "published.json", timeout=TIMEOUT) as response:
            listing = read_listing(response.read())
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
    if listed is None:
        return 1 if missing else 0
    absent, unlisted = compare_keys(keys, listed)
    print(
        f"bucket listing: {len(listed)} poem objects, {len(absent)} listed but absent, {len(unlisted)} present but unlisted"
    )
    if keys_to is not None:
        try:
            write_keys(keys_to, absent, unlisted)
        except (OSError, ValueError) as problem:
            print(f"the keys could not be written: {problem}", file=sys.stderr)
            return 1
    return 1 if missing or absent or unlisted else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
