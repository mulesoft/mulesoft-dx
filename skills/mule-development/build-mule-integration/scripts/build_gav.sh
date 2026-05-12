#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of mule-dev skill
#
# Read a connector JSON file produced by get_latest_connector.sh and emit
# its GAV (groupId:assetId:version) on stdout.
#
# This exists as a separate script so SKILL.md can show the agent a
# one-liner at the command site — e.g.
#
#   --dependencies "$(scripts/build_gav.sh tmp/connector-versions/sfdc.json),$(scripts/build_gav.sh tmp/connector-versions/slack.json)"
#
# which turns GAV construction from a mental exercise (prone to version
# hallucination) into a mechanical `jq` extraction from a file on disk.
set -u

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "Usage: $0 <connector-json-file>" >&2
    echo "  e.g. $0 tmp/connector-versions/sfdc.json" >&2
    exit 1
fi

jq -er '"\(.groupId):\(.assetId):\(.version)"' "$FILE" || {
    echo "❌ $FILE is not a valid connector JSON (expected {groupId, assetId, version})" >&2
    exit 1
}
