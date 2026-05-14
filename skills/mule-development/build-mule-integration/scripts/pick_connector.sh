#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of mule-dev skill
#
# Step 3 helper — record the agent's (or user's) connector choice as a draft.
# Runs once the agent has decided which row from get_latest_connector.sh's
# ranked list is the right fit — either because the list had one row, the
# user's stated system made the choice obvious, or an AskUserQuestion
# prompt resolved a variant ambiguity.
#
# Usage:
#   scripts/pick_connector.sh <nickname> <groupId:assetId:version>
#
# Writes {groupId, assetId, version} JSON to:
#   tmp/connector-choices/<nickname>.json
#
# Idempotent: re-running with a different GAV overwrites the draft. That's
# intentional — the agent may revise a pick after Step 4 metadata or Step 5
# trigger selection reveals a better fit. Drafts stay in tmp/connector-choices/
# throughout Phase 1; only commit_connectors.sh promotes them to the
# tmp/connector-versions/ directory that Phase 2 reads.
#
# Exit code:
#   0  draft written
#   1  bad arguments / malformed GAV
set -u

NICKNAME="${1:-}"
GAV="${2:-}"

if [ -z "$NICKNAME" ] || [ -z "$GAV" ]; then
    echo "Usage: $0 <nickname> <groupId:assetId:version>" >&2
    echo "  e.g. $0 slack com.mulesoft.connectors:mule4-slack-connector:2.0.1" >&2
    exit 1
fi

# Require exactly three non-empty colon-separated fields. Using awk avoids
# the split-with-trailing-colons footgun that Bash's IFS read introduces
# (where "a:b:c:d" puts "c:d" in the third variable instead of failing).
NF=$(printf '%s' "$GAV" | awk -F: '{print NF}')
if [ "$NF" != "3" ]; then
    echo "Bad GAV format: '$GAV'" >&2
    echo "Expected exactly 3 non-empty colon-separated parts: groupId:assetId:version" >&2
    exit 1
fi

GROUP_ID=$(printf '%s' "$GAV" | awk -F: '{print $1}')
ASSET_ID=$(printf '%s' "$GAV" | awk -F: '{print $2}')
VERSION=$(printf '%s' "$GAV" | awk -F: '{print $3}')

if [ -z "$GROUP_ID" ] || [ -z "$ASSET_ID" ] || [ -z "$VERSION" ]; then
    echo "Bad GAV format: '$GAV' (one or more fields empty)" >&2
    exit 1
fi

OUT_DIR="${CONNECTOR_CHOICES_DIR:-tmp/connector-choices}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/${NICKNAME}.json"

jq -n --arg g "$GROUP_ID" --arg a "$ASSET_ID" --arg v "$VERSION" \
    '{groupId: $g, assetId: $a, version: $v}' >"$OUT_FILE"

echo "Drafted: $NICKNAME → $GROUP_ID:$ASSET_ID:$VERSION"
echo "Saved to $OUT_FILE"
