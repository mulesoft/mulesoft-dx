#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of mule-dev skill
#
# Step 8 helper — read every connector pin in tmp/connector-versions/ and
# emit a comma-joined GAV string on stdout, ready to pass as
# `--dependencies "$(build_deps.sh)"` on `dx project create`.
#
# Why this exists: inlining `$(build_gav.sh ...)` once per connector inside
# `--dependencies` produces a command that grows to 1000+ characters when
# absolute script paths are used (per SKILL.md's invocation rule). Terminal
# harnesses in Cline/Dev Agent lose the completion marker on very long
# commands and stall the turn until a 2-minute timeout fires. Pre-joining
# here keeps the `dx project create` line ~250 chars regardless of how many
# connectors are in scope.
#
# Files read:
#   tmp/connector-versions/*.json — connector pins produced by
#   commit_connectors.sh. Each pin is the object shape
#   {groupId, assetId, version, ...} written by get_latest_connector.sh.
#
# Files skipped (silently):
#   tmp/connector-versions/db-driver.json — the Step 6b JDBC driver sidecar
#   has a different schema ({dependencies: [...], driverClass}) and belongs
#   to Step 9, not --dependencies. Any other future sidecar that lacks the
#   three required connector keys is skipped the same way.
#
# Usage:
#   bash <skill-dir>/scripts/build_deps.sh
#   bash <skill-dir>/scripts/build_deps.sh tmp/connector-versions
#
# Exit codes:
#   0  emitted at least one GAV
#   1  no usable pins found (either the directory is missing, empty, or
#      every file was filtered out)
set -u

DIR="${1:-tmp/connector-versions}"

if [ ! -d "$DIR" ]; then
    echo "❌ $DIR does not exist. Did you run commit_connectors.sh?" >&2
    exit 1
fi

shopt -s nullglob
FILES=("$DIR"/*.json)
shopt -u nullglob

if [ ${#FILES[@]} -eq 0 ]; then
    echo "❌ $DIR is empty. Did you run commit_connectors.sh?" >&2
    exit 1
fi

GAVS=()
for f in "${FILES[@]}"; do
    # Only include files with the flat connector-pin shape. jq -e returns
    # non-zero if any of the fields is missing/null, which is exactly the
    # filter we want for skipping driver sidecars and future non-pin files.
    gav=$(jq -er '
        select(has("groupId") and has("assetId") and has("version"))
        | "\(.groupId):\(.assetId):\(.version)"
    ' "$f" 2>/dev/null) || continue
    [ -n "$gav" ] && GAVS+=("$gav")
done

if [ ${#GAVS[@]} -eq 0 ]; then
    echo "❌ No connector pins in $DIR (files present but none had groupId/assetId/version)." >&2
    exit 1
fi

# Comma-join without a trailing comma. printf + sed is portable across the
# bash versions shipped on macOS (3.2) and Linux (5+).
IFS=,; echo "${GAVS[*]}"
