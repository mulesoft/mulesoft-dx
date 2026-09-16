#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of manage-api-version skill.
#
# Version Discovery helper (Steps 5, 6, 7b) — resolves the full set of
# published versions for one or more API dependencies in a SINGLE script
# invocation, firing one `exchange asset list` call per API IN PARALLEL,
# rather than the agent looping and running `anypoint-cli-v4` once per API
# sequentially. Each `anypoint-cli-v4` invocation pays full Node CLI
# cold-start plus a network round trip; for a project with N API
# dependencies, sequential calls cost N times that overhead where this
# script costs roughly 1x (wall-clock bound by the slowest single call).
#
# Usage:
#   scripts/fetch_versions.sh <groupId>:<artifactId>:<currentVersion> [...]
#
# Primary lookup per API: `exchange asset list <artifactId> --output json`,
# filtered to rows matching the exact groupId/assetId. This is NOT anchored
# to a version, so it doesn't suffer the empty-otherVersions bug that
# `exchange asset describe <gav>` has when queried with a non-latest
# version (see SKILL.md "Version Discovery" section for the full story).
#
# Fallback per API (only when `list` returns zero matching rows or fails):
# `exchange asset describe <groupId>/<artifactId>/<currentVersion>`,
# parsing `otherVersions`. Flagged with a `warning` field in the output
# since this fallback may under-report versions newer than currentVersion.
#
# Stdout: a single JSON array, one object per input API, in input order:
#   [
#     {
#       "groupId": "68ef9520-24e9-4cf2-b2f5-620025690913",
#       "artifactId": "covid19-data-tracking-api",
#       "currentVersion": "1.0.0",
#       "versions": ["3.0.0", "2.0.0", "1.0.0"],
#       "source": "list"
#     },
#     ...
#   ]
#
# A row may also carry:
#   "source": "describe-fallback", "warning": "<explanation>"   — degraded fallback used
#   "source": "error", "versions": [], "error": "<explanation>" — both lookups failed
#
# Exit code:
#   0  always, as long as JSON could be assembled — per-API failures are
#      reported as rows with source == "error", not via a non-zero exit.
#      The caller (agent) must check each row's "source"/"error" field.
#   1  usage error (no arguments) or JSON assembly itself failed.
set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <groupId>:<artifactId>:<currentVersion> [<groupId>:<artifactId>:<currentVersion> ...]" >&2
    echo "  e.g. $0 68ef9520-24e9-4cf2-b2f5-620025690913:covid19-data-tracking-api:1.0.0" >&2
    exit 1
fi

# Same auth-conflict workaround as the sibling Exchange-search scripts
# (search_templates.sh, get_latest_connector.sh): the CLI rejects the call
# when more than one auth method is "active" via env vars, and also
# sometimes has ANYPOINT_ENV set to a deployment short-name it doesn't
# recognize (Exchange search/list/describe are org-scoped, not env-scoped).
CLI_ENV_FILTER=(env -u ANYPOINT_ENV)
if [ -n "${ANYPOINT_BEARER:-}" ]; then
    CLI_ENV_FILTER+=(-u ANYPOINT_CLIENT_ID -u ANYPOINT_CLIENT_SECRET -u ANYPOINT_USERNAME -u ANYPOINT_PASSWORD)
fi

mkdir -p tmp
TMPDIR_="$(mktemp -d tmp/manage-api-version-XXXXXX)"
trap 'rm -rf "$TMPDIR_"' EXIT

declare -a GIDS AIDS CURS
COUNT=0
for arg in "$@"; do
    # Require exactly two colons (groupId:artifactId:currentVersion). Relying
    # only on emptiness checks after splitting lets malformed 2-field input
    # (e.g. "gid:aid") slip through silently, with CUR ending up equal to AID.
    COLONS=$(awk -F: '{print NF-1}' <<<"$arg")
    if [ "$COLONS" -ne 2 ]; then
        echo "Malformed argument '$arg' — expected <groupId>:<artifactId>:<currentVersion>" >&2
        exit 1
    fi
    GID="${arg%%:*}"
    rest="${arg#*:}"
    AID="${rest%%:*}"
    CUR="${rest#*:}"
    if [ -z "$GID" ] || [ -z "$AID" ] || [ -z "$CUR" ]; then
        echo "Malformed argument '$arg' — expected <groupId>:<artifactId>:<currentVersion>" >&2
        exit 1
    fi
    GIDS[$COUNT]="$GID"
    AIDS[$COUNT]="$AID"
    CURS[$COUNT]="$CUR"
    COUNT=$((COUNT + 1))
done

# ── Pass 1: one `exchange asset list` call per API, ALL in parallel. ───────
i=0
while [ "$i" -lt "$COUNT" ]; do
    AID="${AIDS[$i]}"
    (NODE_NO_WARNINGS=1 "${CLI_ENV_FILTER[@]}" anypoint-cli-v4 exchange asset list \
            "$AID" --limit 200 --offset 0 --output json \
            >"$TMPDIR_/list-$i.json" 2>"$TMPDIR_/list-$i.err") &
    i=$((i + 1))
done
wait

# ── Pass 2: for any API where `list` failed or matched zero rows, fall back
#            to `exchange asset describe` for THAT API only — also parallel.
i=0
while [ "$i" -lt "$COUNT" ]; do
    GID="${GIDS[$i]}"
    AID="${AIDS[$i]}"
    CUR="${CURS[$i]}"
    LISTFILE="$TMPDIR_/list-$i.json"

    MATCH_COUNT=0
    if jq -e 'type == "array"' "$LISTFILE" >/dev/null 2>&1; then
        MATCH_COUNT=$(jq --arg gid "$GID" --arg aid "$AID" \
            '[.[] | select(.groupId == $gid and .assetId == $aid)] | length' "$LISTFILE")
    fi

    if [ "$MATCH_COUNT" = "0" ]; then
        (NODE_NO_WARNINGS=1 "${CLI_ENV_FILTER[@]}" anypoint-cli-v4 exchange asset describe \
                "$GID/$AID/$CUR" --output json \
                >"$TMPDIR_/describe-$i.json" 2>"$TMPDIR_/describe-$i.err" \
                || echo "{}" >"$TMPDIR_/describe-$i.json") &
    fi
    i=$((i + 1))
done
wait

# ── Assemble the final JSON array, one row per input API, in input order. ─
ROWS=()
i=0
while [ "$i" -lt "$COUNT" ]; do
    GID="${GIDS[$i]}"
    AID="${AIDS[$i]}"
    CUR="${CURS[$i]}"
    LISTFILE="$TMPDIR_/list-$i.json"
    DESCFILE="$TMPDIR_/describe-$i.json"

    LIST_JSON="[]"
    if jq -e 'type == "array"' "$LISTFILE" >/dev/null 2>&1; then
        LIST_JSON="$(cat "$LISTFILE")"
    fi

    DESC_JSON="{}"
    if [ -f "$DESCFILE" ] && jq -e 'type == "object"' "$DESCFILE" >/dev/null 2>&1; then
        DESC_JSON="$(cat "$DESCFILE")"
    fi

    ROW=$(jq -n \
        --arg gid "$GID" --arg aid "$AID" --arg cur "$CUR" \
        --argjson list "$LIST_JSON" --argjson desc "$DESC_JSON" '
      ($list | map(select(.groupId == $gid and .assetId == $aid))) as $matches |
      if ($matches | length) > 0 then
        {
          groupId: $gid, artifactId: $aid, currentVersion: $cur,
          versions: ($matches | map(.version) | sort_by(split(".") | map(tonumber? // 0)) | reverse),
          source: "list"
        }
      elif ($desc | type == "object") and ($desc | has("otherVersions")) and (($desc.otherVersions | length) > 0) then
        {
          groupId: $gid, artifactId: $aid, currentVersion: $cur,
          versions: (([$desc.otherVersions[]?.version] + [$cur]) | unique
                     | sort_by(split(".") | map(tonumber? // 0)) | reverse),
          source: "describe-fallback",
          warning: "exchange asset list returned no matches for this groupId/assetId, so this falls back to a version-anchored describe lookup — it may be missing versions newer than the current one."
        }
      else
        {
          groupId: $gid, artifactId: $aid, currentVersion: $cur,
          versions: [],
          source: "error",
          error: "Both exchange asset list and exchange asset describe failed (or returned no data) for this asset. Check anypoint-cli-v4 auth and network access."
        }
      end
    ')
    ROWS+=("$ROW")
    i=$((i + 1))
done

printf '%s\n' "${ROWS[@]}" | jq -s '.'
