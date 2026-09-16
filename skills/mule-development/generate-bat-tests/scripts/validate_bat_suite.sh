#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of generate-bat-tests skill.
#
# Step 9 pre-run static validator. Catches the mechanical BAT-DSL mistakes that
# would otherwise only surface as a parser error after a slow round-trip against
# the live endpoint. Fast, line-numbered diagnostics; exits non-zero on the
# first file with violations so the agent fixes before running ./run-bat.sh.
#
# Checks per tests/*.dwl:
#   C1  imports — bat::BDD and bat::Assertions present; bat::Mutable present
#       IFF the file uses HashMap()/context.
#   C2  describe(...) is a function call (has parens), not a bare string.
#   C3  forbidden matcher mustNotBe is never used.
#   C4  no hardcoded http(s):// URL or literal "Bearer " token — must use
#       $(config.url) / config.token.
#   C5  status codes in `mustEqual <code>` are Number literals, not quoted.
#   C6  (optional) every URL path resolves against an allowlist file, when one
#       is passed via --allowlist <file> (one path per line, e.g. /orders).
#
# Suite-level:
#   C7  bat.yaml has no top-level `config:` key.
#   C8  every tests/*.dwl is listed in bat.yaml `files:` and vice-versa.
#
# Usage:  validate_bat_suite.sh <suite-dir> [--allowlist <paths-file>]
set -euo pipefail

SUITE_DIR="${1:-}"
if [ -z "$SUITE_DIR" ] || [ ! -d "$SUITE_DIR" ]; then
    echo "❌ usage: validate_bat_suite.sh <suite-dir> [--allowlist <paths-file>]" >&2
    exit 1
fi
shift
ALLOWLIST=""
while [ $# -gt 0 ]; do
    case "$1" in
        --allowlist) ALLOWLIST="$2"; shift 2 ;;
        *) echo "❌ unknown arg: $1" >&2; exit 1 ;;
    esac
done

TESTS_DIR="$SUITE_DIR/tests"
BAT_YAML="$SUITE_DIR/bat.yaml"
violations=0

report() { echo "❌ $1" >&2; violations=$((violations + 1)); }

if [ ! -d "$TESTS_DIR" ]; then
    echo "❌ no tests/ dir under $SUITE_DIR" >&2
    exit 1
fi

shopt -s nullglob
for f in "$TESTS_DIR"/*.dwl; do
    base="$(basename "$f")"

    # C1 — imports
    grep -q 'import \* from bat::BDD' "$f"        || report "$base: missing 'import * from bat::BDD'"
    grep -q 'import \* from bat::Assertions' "$f" || report "$base: missing 'import * from bat::Assertions'"
    uses_state=0
    if grep -qE 'HashMap\(\)|context\.(set|get)' "$f"; then uses_state=1; fi
    has_mutable=0
    if grep -q 'import \* from bat::Mutable' "$f"; then has_mutable=1; fi
    if [ "$uses_state" = "1" ] && [ "$has_mutable" = "0" ]; then
        report "$base: uses HashMap()/context but does not import bat::Mutable"
    fi
    if [ "$uses_state" = "0" ] && [ "$has_mutable" = "1" ]; then
        report "$base: imports bat::Mutable but never uses HashMap()/context (drop the import)"
    fi

    # C2 — describe must be a function call
    if grep -qE '^\s*describe\s*"' "$f"; then
        report "$base: describe must be a function call describe(\"...\") — found a bare string"
    fi
    grep -qE 'describe\s*\(' "$f" || report "$base: no describe(...) block found"

    # C3 — forbidden matcher
    if grep -qE '\bmustNotBe\b' "$f"; then
        ln=$(grep -nE '\bmustNotBe\b' "$f" | head -1 | cut -d: -f1)
        report "$base:$ln: mustNotBe does not exist — use mustMatch /regex/ or assert sizeOf/mustEqual"
    fi

    # C4 — no hardcoded URL or token
    if grep -nE 'https?://' "$f" | grep -vq 'config\.url'; then
        ln=$(grep -nE 'https?://' "$f" | head -1 | cut -d: -f1)
        report "$base:$ln: hardcoded URL — use \$(config.url) instead"
    fi
    if grep -nE '"Bearer ' "$f" >/dev/null 2>&1; then
        ln=$(grep -nE '"Bearer ' "$f" | head -1 | cut -d: -f1)
        report "$base:$ln: hardcoded bearer token — use config.token instead"
    fi

    # C5 — quoted status code in mustEqual
    if grep -nE 'status\s+mustEqual\s+"[0-9]+"' "$f" >/dev/null 2>&1; then
        ln=$(grep -nE 'status\s+mustEqual\s+"[0-9]+"' "$f" | head -1 | cut -d: -f1)
        report "$base:$ln: status code must be a Number literal (200, not \"200\")"
    fi

    # C6 — endpoint allowlist (optional)
    if [ -n "$ALLOWLIST" ] && [ -f "$ALLOWLIST" ]; then
        # Extract the path after `$(config.url)` from each backtick URL, then
        # match it against the allowlist patterns. An allowlist entry's `{}`
        # segment is a wildcard that matches ANY single request segment — a
        # `$(context.get("oid"))` interpolation, a literal id like
        # `ord_missing_1`, or a numeric id all match `{}`. Drop the query string
        # before matching. This is path-pattern matching, not string equality,
        # so a literal id is correctly recognized as the `{id}` segment.
        while IFS= read -r url_path; do
            req="${url_path%%\?*}"          # drop ?query
            req="${req#/}"; req="${req%/}"  # trim leading/trailing slash
            matched=0
            while IFS= read -r pat; do
                [ -z "$pat" ] && continue
                p="${pat#/}"; p="${p%/}"
                # Compare segment by segment; {} in the pattern is a wildcard.
                if awk -v r="$req" -v p="$p" '
                    BEGIN {
                        nr = split(r, ra, "/"); np = split(p, pa, "/");
                        if (nr != np) { exit 1 }
                        for (i = 1; i <= np; i++) {
                            if (pa[i] != "{}" && pa[i] != ra[i]) { exit 1 }
                        }
                        exit 0
                    }'; then
                    matched=1; break
                fi
            done < "$ALLOWLIST"
            if [ "$matched" = "0" ]; then
                report "$base: path '/$req' not in endpoint allowlist ($ALLOWLIST)"
            fi
        done < <(grep -oE '\$\(config\.url\)[^`]*' "$f" | sed -E 's/\$\(config\.url\)//')
    fi
done

# C7 — bat.yaml has no top-level config:
if [ -f "$BAT_YAML" ]; then
    if grep -qE '^\s*config\s*:' "$BAT_YAML"; then
        report "bat.yaml: top-level 'config:' key is not in the schema — select config via --config CLI flag"
    fi
    # C8 — files[] vs tests/*.dwl parity
    listed=$(grep -oE 'tests/[A-Za-z0-9._-]+\.dwl' "$BAT_YAML" | sort -u || true)
    actual=$(cd "$SUITE_DIR" && ls tests/*.dwl 2>/dev/null | sort -u || true)
    if [ "$listed" != "$actual" ]; then
        missing_in_yaml=$(comm -13 <(printf '%s\n' "$listed") <(printf '%s\n' "$actual") || true)
        missing_on_disk=$(comm -23 <(printf '%s\n' "$listed") <(printf '%s\n' "$actual") || true)
        [ -n "$missing_in_yaml" ] && report "bat.yaml: test files on disk not listed in files[]: $(echo $missing_in_yaml)"
        [ -n "$missing_on_disk" ] && report "bat.yaml: files[] entries with no .dwl on disk: $(echo $missing_on_disk)"
    fi
else
    report "no bat.yaml found at $BAT_YAML"
fi

if [ "$violations" -gt 0 ]; then
    echo "" >&2
    echo "❌ $violations violation(s). Fix them, then re-run this validator before ./run-bat.sh." >&2
    exit 1
fi
echo "✅ BAT suite static checks passed — safe to run ./run-bat.sh"
