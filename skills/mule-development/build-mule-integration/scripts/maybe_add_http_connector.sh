#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of mule-dev skill
#
# Step 6.5 helper — if any of the selected connection providers is an OAuth
# flow, ensure the HTTP connector is present in the project's pom.xml.
# OAuth callbacks need an http:listener, which requires the HTTP connector
# dependency.
#
# In v8 get_latest_connector.sh prints a ranked GAV list to stdout and
# writes nothing to disk. HTTP is an unambiguous search (mule-http-connector
# dominates any results), so this helper safely takes the top row without
# prompting — it is not a variant-selection choice.
#
# Usage:
#   scripts/maybe_add_http_connector.sh --project <dir> <provider> [<provider>...]
#
# The --project flag anchors all file work to the project directory:
#   - `pom.xml` is edited inside that directory
#   - `tmp/connector-versions/http.json` is written inside that directory
#
# Anchoring to --project removes the cwd-dependent "../scripts/..." pattern
# that has caused "No such file or directory" turns in real runs: the agent
# can invoke this script from anywhere (repo root, workspace root, anywhere)
# as long as --project points at the Mule project. The HTTP draft lands in
# <project>/tmp/connector-choices/http.json to keep it consistent with
# Step 3's layout, though Phase-2 pom edits use the GAV directly here.
#
# Each provider argument is a connection-provider name (as chosen in Step 6).
# The script is idempotent: if no provider looks like OAuth, or if the HTTP
# connector is already present in pom.xml, it exits 0 without changes.
#
# Exit code:
#   0  no OAuth, or HTTP already present, or HTTP inserted successfully
#   1  OAuth detected but HTTP could not be resolved or pom.xml edit failed
#   2  bad invocation (missing --project or no providers)
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR=""
PROVIDERS=()

while [ "$#" -gt 0 ]; do
    case "$1" in
        --project)
            if [ -z "${2:-}" ]; then
                echo "❌ --project requires a path argument" >&2
                exit 2
            fi
            PROJECT_DIR="$2"
            shift 2
            ;;
        --project=*)
            PROJECT_DIR="${1#--project=}"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 --project <dir> <provider> [<provider>...]"
            exit 0
            ;;
        *)
            PROVIDERS+=("$1")
            shift
            ;;
    esac
done

if [ -z "$PROJECT_DIR" ]; then
    echo "❌ --project <dir> is required" >&2
    echo "   Usage: $0 --project <dir> <provider> [<provider>...]" >&2
    exit 2
fi

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Project directory not found: $PROJECT_DIR" >&2
    exit 1
fi

if [ "${#PROVIDERS[@]}" -eq 0 ]; then
    echo "✅ No connection providers passed — nothing to do."
    exit 0
fi

OAUTH_PROVIDER=""
for provider in "${PROVIDERS[@]}"; do
    if printf '%s' "$provider" | grep -qiE '(oauth|jwt|auth-code|authorization-code)'; then
        OAUTH_PROVIDER="$provider"
        break
    fi
done

if [ -z "$OAUTH_PROVIDER" ]; then
    echo "✅ No OAuth providers detected — HTTP connector not required."
    exit 0
fi

echo "⚠️  OAuth/JWT provider detected: $OAUTH_PROVIDER"
echo "    → HTTP listener required for OAuth callbacks."

cd "$PROJECT_DIR"

if [ ! -f pom.xml ]; then
    echo "❌ pom.xml not found in $PROJECT_DIR" >&2
    echo "   --project must point at a directory created by 'dx project create'." >&2
    exit 1
fi

if grep -q "mule-http-connector" pom.xml; then
    echo "✅ HTTP connector already in pom.xml — nothing to add."
    exit 0
fi

echo "🔍 Resolving latest HTTP connector from Exchange..."
# v8: get_latest_connector.sh emits a ranked GAV list on stdout and writes
# nothing. HTTP is unambiguous — take the top row. If a draft already
# exists (e.g., the agent pre-picked http in Step 3), prefer that to keep
# the Step-2 decision authoritative.
HTTP_CHOICE_JSON="tmp/connector-choices/http.json"
if [ -f "$HTTP_CHOICE_JSON" ]; then
    echo "✅ Using existing HTTP draft at $HTTP_CHOICE_JSON"
    HTTP_GAV="$(jq -r '"\(.groupId):\(.assetId):\(.version)"' "$HTTP_CHOICE_JSON")"
else
    HTTP_LIST="$("$SCRIPT_DIR/get_latest_connector.sh" mule-http-connector http 2>/dev/null || true)"
    if [ -z "$HTTP_LIST" ]; then
        echo "❌ Could not resolve HTTP connector — add it manually." >&2
        exit 1
    fi
    HTTP_GAV="$(printf '%s\n' "$HTTP_LIST" | head -n 1)"
    # Persist as a draft so the rest of the workflow (commit_connectors.sh)
    # promotes it into tmp/connector-versions/http.json alongside the others.
    "$SCRIPT_DIR/pick_connector.sh" http "$HTTP_GAV" >/dev/null
fi

HTTP_GROUP="$(printf '%s' "$HTTP_GAV" | awk -F: '{print $1}')"
HTTP_ARTIFACT="$(printf '%s' "$HTTP_GAV" | awk -F: '{print $2}')"
HTTP_VERSION="$(printf '%s' "$HTTP_GAV" | awk -F: '{print $3}')"

if [ -z "$HTTP_GROUP" ] || [ -z "$HTTP_ARTIFACT" ] || [ -z "$HTTP_VERSION" ]; then
    echo "❌ HTTP GAV parse failed: '$HTTP_GAV'" >&2
    exit 1
fi

cp pom.xml pom.xml.bak
awk -v g="$HTTP_GROUP" -v a="$HTTP_ARTIFACT" -v v="$HTTP_VERSION" '
    /<\/dependencies>/ {
        print "        <dependency>"
        print "            <groupId>" g "</groupId>"
        print "            <artifactId>" a "</artifactId>"
        print "            <version>" v "</version>"
        print "            <classifier>mule-plugin</classifier>"
        print "        </dependency>"
    }
    { print }
' pom.xml.bak > pom.xml

if ! grep -q "$HTTP_ARTIFACT" pom.xml; then
    echo "❌ Failed to insert HTTP connector — restoring pom.xml backup." >&2
    mv pom.xml.bak pom.xml
    exit 1
fi

rm -f pom.xml.bak
echo "✅ Added $HTTP_GROUP:$HTTP_ARTIFACT:$HTTP_VERSION to pom.xml"
