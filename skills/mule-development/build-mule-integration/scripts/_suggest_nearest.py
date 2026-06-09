#!/usr/bin/env python3
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
"""Fuzzy nearest-match suggester for validate_before_build.sh.

Reads the error-type allowlist (one ``NS:ID`` per line) from stdin and accepts
one or more "miss" tokens as CLI arguments. For each miss, prints

    miss -> suggestion

where ``suggestion`` is the closest entry in the same namespace under a simple
Hamming + length-delta distance. Misses that have no same-namespace entries
print an empty suggestion.

Used by ``skills/build-mule-integration/scripts/validate_before_build.sh``:
the validator collects all misses across its Check-D loop and invokes this
helper once.
"""

from __future__ import annotations

import sys


def _distance(token: str, candidate: str) -> int:
    """Hamming-on-overlap + abs length delta."""
    return sum(1 for a, b in zip(token, candidate, strict=False) if a != b) + abs(len(token) - len(candidate))


def nearest(token: str, candidates: list[str]) -> str:
    """Return the candidate closest to ``token``; empty string if no candidates."""
    if not candidates:
        return ""
    return min(candidates, key=lambda c: _distance(token, c))


def _ns(nsid: str) -> str:
    return nsid.split(":", 1)[0] if ":" in nsid else ""


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(
            "usage: _suggest_nearest.py <miss> [<miss>...]\n"
            "       (allowlist of NS:ID entries piped on stdin, one per line)",
            file=sys.stderr,
        )
        return 0 if (len(argv) >= 2 and argv[1] in ("-h", "--help")) else 1

    misses = argv[1:]
    try:
        allow = [line.strip() for line in sys.stdin if line.strip()]
    except (OSError, KeyboardInterrupt) as exc:
        print(f"_suggest_nearest.py: failed reading stdin: {exc}", file=sys.stderr)
        return 1

    for miss in misses:
        ns = _ns(miss)
        pool = [c for c in allow if _ns(c) == ns] if ns else list(allow)
        print(f"{miss} -> {nearest(miss, pool)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
