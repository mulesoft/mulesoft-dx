#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of mule-dev skill
#
# Step 8 helper (Phase 2 bootstrap) — promote every connector draft in
# tmp/connector-choices/ to the pinned tmp/connector-versions/ directory
# that Phase 2 scripts read from.
#
# Runs exactly once per session, as the first action after the user
# approves the Technical Design Summary in Step 7. Missing drafts here
# mean the agent skipped Step 3 for some system — Phase 2 will fail fast
# on build_gav.sh when it can't find the pin file, which is the intended
# signal that the design is incomplete.
#
# Usage:
#   scripts/commit_connectors.sh
#
# Exit code:
#   0  one or more drafts promoted
#   1  no drafts found (tmp/connector-choices/ missing or empty)
set -u

CHOICES_DIR="${CONNECTOR_CHOICES_DIR:-tmp/connector-choices}"
VERSIONS_DIR="${CONNECTOR_VERSIONS_DIR:-tmp/connector-versions}"

if [ ! -d "$CHOICES_DIR" ]; then
    echo "No drafts directory at $CHOICES_DIR." >&2
    echo "Run pick_connector.sh for each connector in Step 3 before committing." >&2
    exit 1
fi

shopt -s nullglob
DRAFTS=("$CHOICES_DIR"/*.json)
shopt -u nullglob

if [ ${#DRAFTS[@]} -eq 0 ]; then
    echo "No drafts in $CHOICES_DIR." >&2
    echo "Run pick_connector.sh for each connector in Step 3 before committing." >&2
    exit 1
fi

mkdir -p "$VERSIONS_DIR"

NAMES=()
for draft in "${DRAFTS[@]}"; do
    base=$(basename "$draft")
    cp "$draft" "$VERSIONS_DIR/$base"
    NAMES+=("${base%.json}")
done

# Sort names for a stable summary line; the order of the glob is unspecified.
IFS=$'\n' SORTED=($(printf '%s\n' "${NAMES[@]}" | sort))
unset IFS

echo "Committed ${#DRAFTS[@]} connector pin(s): ${SORTED[*]}"
echo "From: $CHOICES_DIR"
echo "To:   $VERSIONS_DIR"
