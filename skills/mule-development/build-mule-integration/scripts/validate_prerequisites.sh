#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of build-mule-integration skill.
#
# Step 1 helper — validates the toolchain and emits a machine-readable env
# report so later steps can consume it.
#
# Output path: ${MULE_DEV_ENV_FILE} when set, otherwise the workspace-relative
# file tmp/mule-dev-env.json. The default lives inside the current workspace
# so each task gets its own env cache; parallel sessions in different
# workspaces can't overwrite each other.
#
# This script only VALIDATES — it never downloads, installs, or modifies
# anything. If something is missing, the agent decides how to fix it.
#
# Output JSON shape:
#   {"ok": true/false, "errors": [...], "warnings": [...],
#    "mule_version": "...", "runtime_path": "...",
#    "java_home": "...", "java_version": "..."}
# Exit code:
#   0  all checks passed
#   1  one or more fatal checks failed — agent should act on the errors array
set -euo pipefail

OUT_FILE="${MULE_DEV_ENV_FILE:-tmp/mule-dev-env.json}"
mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true

ERRORS=()
WARNINGS=()
MULE_VERSION=""
RUNTIME_PATH=""
JAVA_VERSION=""

echo "Validating prerequisites..."

# 0. jq (required by every skill script for JSON I/O; not bundled with Git Bash on Windows)
if ! command -v jq >/dev/null 2>&1; then
    echo "❌ jq not installed"
    case "$(uname -s)" in
        Darwin*)              ERRORS+=("jq not installed. Fix: brew install jq") ;;
        MINGW*|MSYS*|CYGWIN*) ERRORS+=("jq not installed. Download https://jqlang.github.io/jq/download/ (Windows 64-bit), rename to jq.exe, place on PATH") ;;
        *)                    ERRORS+=("jq not installed. Fix: sudo apt-get install jq (or distro equivalent)") ;;
    esac
else
    echo "✅ jq found: $(jq --version)"
fi

# 1. anypoint-cli-v4
if ! command -v anypoint-cli-v4 >/dev/null 2>&1; then
    echo "❌ anypoint-cli-v4 not installed"
    ERRORS+=("anypoint-cli-v4 not installed. Install: npm install -g @mulesoft/anypoint-cli-v4")
else
    echo "✅ anypoint-cli-v4 found"
fi

# 2. DX plugin
# NODE_NO_WARNINGS suppresses Node DEP0040 noise on stdout/stderr.
if command -v anypoint-cli-v4 >/dev/null 2>&1; then
    if ! NODE_NO_WARNINGS=1 anypoint-cli-v4 dx mule --help >/dev/null 2>&1; then
        echo "❌ DX plugin not installed"
        ERRORS+=("DX plugin not installed. Install: npm install -g @salesforce/anypoint-cli-dx-mule-plugin")
    else
        echo "✅ DX plugin found"
    fi
fi

# 3. JAVA_HOME + Java 11+
if [ -z "${JAVA_HOME:-}" ]; then
    echo "❌ JAVA_HOME not set"
    ERRORS+=("JAVA_HOME not set. Fix: export JAVA_HOME=\$(/usr/libexec/java_home -v 11)")
else
    echo "✅ JAVA_HOME: $JAVA_HOME"
    # Parse Java version. Handles legacy "1.8.0_321" (→ 8) and modern "11.0.21" / "17.0.x" (→ 11 / 17).
    JAVA_VERSION_STRING=$(java -version 2>&1 | head -n 1 | awk -F '"' '{print $2}' || true)
    JAVA_VERSION=$(printf '%s\n' "$JAVA_VERSION_STRING" | awk -F. '{ if ($1 == "1") print $2; else print $1 }')
    if [ -z "$JAVA_VERSION" ] || ! [[ "$JAVA_VERSION" =~ ^[0-9]+$ ]] || [ "$JAVA_VERSION" -lt 11 ]; then
        echo "❌ Java 11+ required (found: Java ${JAVA_VERSION_STRING:-unknown})"
        ERRORS+=("Java 11+ required, found: ${JAVA_VERSION_STRING:-unknown}")
    else
        echo "✅ Java version: $JAVA_VERSION"
    fi
fi

# 4. Mule runtime — check configured path first, then default location
RUNTIME_PATH=""
CONFIG_FILE="$HOME/.mule-dx/config.json"

if [ -f "$CONFIG_FILE" ]; then
    CONFIGURED_PATH=$(jq -r '.runtimePath // empty' "$CONFIG_FILE" 2>/dev/null || true)
    if [ -n "$CONFIGURED_PATH" ] && [ -d "$CONFIGURED_PATH" ]; then
        RUNTIME_PATH="$CONFIGURED_PATH"
    fi
fi

if [ -z "$RUNTIME_PATH" ]; then
    RUNTIME_PATH=$(find ~/AnypointCodeBuilder/runtime -maxdepth 1 -name "mule-*" -type d 2>/dev/null | sort -V | tail -1 || true)
fi

if [ -n "$RUNTIME_PATH" ]; then
    RUNTIME_NAME=$(basename "$RUNTIME_PATH")
    MULE_VERSION=$(echo "$RUNTIME_NAME" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    echo "✅ Runtime detected: $RUNTIME_NAME (Mule $MULE_VERSION)"
else
    echo "❌ No Mule runtime found"
    echo "   ACTION REQUIRED: Run 'anypoint-cli-v4 dx mule runtime download' to download the Mule runtime before proceeding."
    echo "   After download, run 'anypoint-cli-v4 dx mule runtime path --set <path>' to configure the runtime path."
    ERRORS+=("No Mule runtime found. You MUST run 'anypoint-cli-v4 dx mule runtime download' to install it, then 'anypoint-cli-v4 dx mule runtime path --set <path>' to configure. No describe-connector commands will work until this is resolved.")
fi

# Build result JSON
OK="true"
if [ ${#ERRORS[@]} -gt 0 ]; then
    OK="false"
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
    ERRORS_JSON=$(printf '%s\n' "${ERRORS[@]}" | jq -R . | jq -s .)
else
    ERRORS_JSON="[]"
fi
if [ ${#WARNINGS[@]} -gt 0 ]; then
    WARNINGS_JSON=$(printf '%s\n' "${WARNINGS[@]}" | jq -R . | jq -s .)
else
    WARNINGS_JSON="[]"
fi

cat >"$OUT_FILE" <<JSON
{
  "ok": $OK,
  "errors": $ERRORS_JSON,
  "warnings": $WARNINGS_JSON,
  "mule_version": "${MULE_VERSION:-}",
  "runtime_path": "${RUNTIME_PATH:-}",
  "java_home": "${JAVA_HOME:-}",
  "java_version": "${JAVA_VERSION:-}"
}
JSON

echo "📝 Wrote $OUT_FILE"

if [ "$OK" = "false" ]; then
    exit 1
fi
