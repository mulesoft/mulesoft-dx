#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of mule-dev skill
#
# Step 4 helper — run `anypoint-cli-v4 dx mule describe-connector` for the
# drafted GAV and persist the full response to
# tmp/connector-metadata/<nickname>.json. Echo a human-readable digest
# (namespace, sources[], operations, configs) to stdout so the agent
# sees the key fields in tool output and cannot plausibly ignore them
# when choosing a trigger.
#
# Usage:
#   scripts/describe_connector.sh <nickname>
#
# Where <nickname> matches the filename used in Step 3 — e.g. 'sfdc'.
# The GAV is read from the draft tmp/connector-choices/<nick>.json
# (written by pick_connector.sh). Drafts are promoted to the pinned
# tmp/connector-versions/<nick>.json by commit_connectors.sh after the
# Technical Design Summary is approved; describe_connector.sh falls back
# to that location so Phase-2 re-describes still work.
#
# Pre-conditions:
#   - tmp/connector-choices/<nickname>.json exists (from Step 3 pick_connector.sh)
#     OR tmp/connector-versions/<nickname>.json exists (post-commit / Phase 2).
#
# Rationale: Step 4's output is what Step 5 (trigger selection)
# actually branches on. If the agent writes describe output to disk
# but never reads it back, it falls back to prompt-text intuition
# about triggers — an observed failure mode in earlier iterations.
# Echoing sources[] and configs[] to stdout puts those fields in the
# tool-output stream where the agent re-reads them naturally.
#
# Exit code:
#   0  describe succeeded; JSON saved; digest echoed
#   1  missing arg / missing GAV file / CLI failure
set -u

NICKNAME="${1:-}"
if [ -z "$NICKNAME" ]; then
    echo "Usage: $0 <nickname>" >&2
    echo "  e.g. $0 sfdc" >&2
    exit 1
fi

CHOICES_DIR="${CONNECTOR_CHOICES_DIR:-tmp/connector-choices}"
VERSIONS_DIR="${CONNECTOR_VERSIONS_DIR:-tmp/connector-versions}"
METADATA_DIR="${CONNECTOR_METADATA_DIR:-tmp/connector-metadata}"

METADATA_JSON="$METADATA_DIR/${NICKNAME}.json"

# Drafts (Step 3 pick_connector.sh) take precedence over commits
# (commit_connectors.sh, post-TDD). This lets the agent re-pick through
# Steps 3–5 while keeping Phase-2 re-describes working after commit.
if [ -f "$CHOICES_DIR/${NICKNAME}.json" ]; then
    GAV_JSON="$CHOICES_DIR/${NICKNAME}.json"
elif [ -f "$VERSIONS_DIR/${NICKNAME}.json" ]; then
    GAV_JSON="$VERSIONS_DIR/${NICKNAME}.json"
else
    echo "❌ No GAV file for '$NICKNAME' in $CHOICES_DIR/ or $VERSIONS_DIR/" >&2
    echo "   Run get_latest_connector.sh $NICKNAME, then pick_connector.sh $NICKNAME <gav>" >&2
    exit 1
fi

GAV="$(jq -r '"\(.groupId):\(.assetId):\(.version)"' "$GAV_JSON")"

mkdir -p "$METADATA_DIR"

# Run describe and save the full response. On failure the CLI
# prints to stderr; forward its exit status so the agent sees the
# real error rather than a truncated JSON.
if ! anypoint-cli-v4 dx mule describe-connector \
        --connector "$GAV" \
        --output json > "$METADATA_JSON" 2>/tmp/mule-dev-describe-err.$$; then
    cat /tmp/mule-dev-describe-err.$$ >&2
    rm -f /tmp/mule-dev-describe-err.$$
    echo "❌ describe-connector failed for $GAV" >&2
    exit 1
fi
rm -f /tmp/mule-dev-describe-err.$$

# Echo the key fields so the agent has them in tool output without
# needing a separate jq/cat round-trip. This is the content Step 5
# branches on — particularly sources[], which is the list of real
# native triggers the connector supports.
echo "✅ $NICKNAME → $METADATA_JSON"
echo "   GAV:        $GAV"
echo ""
echo "--- describe digest ---"
# Operations can run into the hundreds on OpenAPI-derived connectors;
# show a count and a short head-sample rather than spraying them all.
# sources[] and configs[] are always emitted in full — those are what
# Step 5 (trigger selection) and Step 6 (provider selection) need.
jq -r '{
  namespace_prefix: .namespace.prefix,
  sources: .sources,
  configs: [.configs[] | {name: .name, providers: [.connectionProviders[]?]}],
  operations_count: (.operations | length),
  operations_sample: (.operations | if length > 20 then .[0:20] + ["... (see tmp/connector-metadata/'"$NICKNAME"'.json for full list)"] else . end)
}' "$METADATA_JSON"
