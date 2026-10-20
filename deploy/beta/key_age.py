#!/usr/bin/env python3
"""How old the beta deploy key is, against its 90-day rotation (midst-infra #19, #20; DEPLOY_KEY.md).

    key_age.py --created <ISO 8601 time> [--now <ISO 8601 time>]

--created is the access key's CreateDate, as `aws iam list-access-keys` prints it. --now defaults to the
current time and is there for the tests.

Prints the key's age in days and exits:
  0  under WARN_DAYS, or from WARN_DAYS to under ROTATE_DAYS, with a GitHub `::warning::` so the coming
     failure is seen in the deploy log well before it happens (Violet: never a surprise in an urgent deploy)
  1  ROTATE_DAYS or older, with a GitHub `::error::` naming DEPLOY_KEY.md: the deploy stops until it is rotated
  2  called wrongly, or a time that is not ISO 8601 with a time zone, or a key created in the future

Reads only. It never calls AWS and holds no credentials.
"""

import argparse
import sys
from datetime import datetime, timezone

ROTATE_DAYS = 90
WARN_DAYS = 76


def parse(value: str) -> datetime:
    """An ISO 8601 time with a zone ('Z' or an offset); anything else is refused, never read as local time."""
    moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if moment.tzinfo is None:
        raise ValueError(f"{value!r} has no time zone")
    return moment


def verdict(created: datetime, now: datetime) -> tuple[int, str]:
    """(exit status, message) for a key created at `created`, judged at `now`."""
    age = now - created
    if age.total_seconds() < 0:
        return 2, f"::error::the deploy key's creation time {created.isoformat()} is in the future"
    days = age.days
    if days >= ROTATE_DAYS:
        return 1, (
            f"::error::the deploy key is {days} days old; it is rotated every {ROTATE_DAYS} days. "
            "Rotate it (midst-infra beta/DEPLOY_KEY.md), then run this deploy again."
        )
    if days >= WARN_DAYS:
        return 0, (
            f"::warning::the deploy key is {days} days old; deploys stop at {ROTATE_DAYS} days, "
            f"in {ROTATE_DAYS - days}. Rotate it soon (midst-infra beta/DEPLOY_KEY.md)."
        )
    return 0, f"the deploy key is {days} days old (rotated every {ROTATE_DAYS} days)"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--created", required=True)
    parser.add_argument("--now")
    args = parser.parse_args(argv)
    try:
        created = parse(args.created)
        now = parse(args.now) if args.now else datetime.now(timezone.utc)
    except ValueError as err:
        print(f"::error::key_age.py: {err}", file=sys.stderr)
        return 2
    status, message = verdict(created, now)
    print(message)
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
