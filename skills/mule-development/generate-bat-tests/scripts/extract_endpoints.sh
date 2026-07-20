#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of generate-bat-tests skill.
#
# Step 2 helper — scan a Mule app's source for the raw material the agent needs
# to build the test inventory:
#   - HTTP listener paths declared in the flow XML (the endpoint allowlist)
#   - raise-error types declared in the source (the error-type coverage list)
#
# This is a best-effort grep-based digest to ANCHOR the agent, not a parser.
# The agent still reads the OpenAPI contract and the flow XML itself to decide
# verbs, bodies, and expected statuses. The endpoint allowlist it writes is what
# validate_bat_suite.sh later checks generated test paths against.
#
# Usage:  extract_endpoints.sh <mule-app-dir>
# Writes: tmp/bat-gen/source-digest.json  ({ listener_paths[], raise_error_types[], api_specs[] })
# Also echoes the digest to stdout so the agent sees it in-turn.
set -euo pipefail

APP_DIR="${1:-}"
if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
    echo "❌ usage: extract_endpoints.sh <mule-app-dir>" >&2
    exit 1
fi

OUT_DIR="${BAT_GEN_DIR:-tmp/bat-gen}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/source-digest.json"

MULE_DIR="$APP_DIR/src/main/mule"
[ -d "$MULE_DIR" ] || MULE_DIR="$APP_DIR"

# HTTP listener paths: path="..." on <http:listener .../> elements.
LISTENER_PATHS=$(grep -rhoE '<http:listener[^>]*path="[^"]*"' "$MULE_DIR" 2>/dev/null \
    | grep -oE 'path="[^"]*"' | sed -E 's/path="([^"]*)"/\1/' | sort -u || true)

# APIkit / listener-config base paths (helps the agent build full URLs).
BASE_PATHS=$(grep -rhoE 'basePath="[^"]*"' "$MULE_DIR" 2>/dev/null \
    | sed -E 's/basePath="([^"]*)"/\1/' | sort -u || true)

# raise-error types: <raise-error type="NS:ID" .../>
RAISE_ERRORS=$(grep -rhoE '<raise-error[^>]*type="[^"]*"' "$MULE_DIR" 2>/dev/null \
    | grep -oE 'type="[^"]*"' | sed -E 's/type="([^"]*)"/\1/' | sort -u || true)

# OpenAPI / RAML spec files under the app (for the agent to read next).
API_SPECS=$(find "$APP_DIR" -type f \( -name "*.yaml" -o -name "*.yml" -o -name "*.raml" -o -name "*.json" \) \
    -path "*api*" 2>/dev/null | sort -u || true)

to_json_array() {
    if [ -z "$1" ]; then echo "[]"; else printf '%s\n' "$1" | jq -R . | jq -s .; fi
}

LISTENER_JSON=$(to_json_array "$LISTENER_PATHS")
BASE_JSON=$(to_json_array "$BASE_PATHS")
RAISE_JSON=$(to_json_array "$RAISE_ERRORS")
SPECS_JSON=$(to_json_array "$API_SPECS")

jq -n \
    --argjson listener_paths "$LISTENER_JSON" \
    --argjson base_paths "$BASE_JSON" \
    --argjson raise_error_types "$RAISE_JSON" \
    --argjson api_specs "$SPECS_JSON" \
    '{listener_paths: $listener_paths, base_paths: $base_paths, raise_error_types: $raise_error_types, api_specs: $api_specs}' \
    | tee "$OUT_FILE"

echo "📝 Wrote $OUT_FILE" >&2
