#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of generate-bat-tests skill.
#
# Step 1 helper — validates the toolchain needed to author AND run a BAT suite,
# and emits a machine-readable env report so later steps can consume it.
#
# Validation-ONLY: never installs or modifies anything.
#
# Output path: ${BAT_ENV_FILE} when set, otherwise tmp/bat-gen-env.json
# (workspace-relative, so parallel sessions in different workspaces can't
# overwrite each other).
#
# Output JSON shape:
#   {"ok": true/false, "errors": [...], "warnings": [...],
#    "bat_cli": "...", "java_version": "..."}
# Exit code: 0 all checks passed · 1 a fatal check failed (act on errors[])
set -euo pipefail

OUT_FILE="${BAT_ENV_FILE:-tmp/bat-gen-env.json}"
mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null || true

ERRORS=()
WARNINGS=()
BAT_CLI=""
JAVA_VERSION=""

echo "Validating BAT generation prerequisites..."

# 0. jq — required by the skill scripts for JSON I/O.
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

# 1. BAT CLI — installed at $HOME/.bat/bat/bin by the official wrapper installer.
BAT_BIN="$HOME/.bat/bat/bin/bat"
if command -v bat >/dev/null 2>&1 && bat --version >/dev/null 2>&1; then
    BAT_CLI="$(command -v bat)"
    echo "✅ bat CLI on PATH: $BAT_CLI"
elif [ -x "$BAT_BIN" ]; then
    BAT_CLI="$BAT_BIN"
    echo "✅ bat CLI found: $BAT_BIN"
else
    echo "❌ bat CLI not found"
    ERRORS+=("BAT CLI not installed. Install with: curl -s https://s3.amazonaws.com/bat-wrapper/install.sh | bash  (installs to \$HOME/.bat/bat). run-bat.sh adds \$HOME/.bat/bat/bin to PATH.")
fi

# 2. Java 17+ — BAT runs on the JVM; PATCH support needs the JDK 17 add-opens flag.
if ! command -v java >/dev/null 2>&1; then
    echo "❌ java not found"
    ERRORS+=("Java 17+ required to run BAT. Install a JDK 17 and ensure 'java' is on PATH.")
else
    JAVA_VERSION_STRING=$(java -version 2>&1 | head -n 1 | awk -F '"' '{print $2}' || true)
    JAVA_VERSION=$(printf '%s\n' "$JAVA_VERSION_STRING" | awk -F. '{ if ($1 == "1") print $2; else print $1 }')
    if [ -z "$JAVA_VERSION" ] || ! [[ "$JAVA_VERSION" =~ ^[0-9]+$ ]]; then
        echo "⚠️  Could not parse Java version (found: ${JAVA_VERSION_STRING:-unknown})"
        WARNINGS+=("Could not parse Java version: ${JAVA_VERSION_STRING:-unknown}. BAT needs Java 17+.")
    elif [ "$JAVA_VERSION" -lt 17 ]; then
        echo "⚠️  Java 17+ recommended for BAT (found: Java $JAVA_VERSION)"
        WARNINGS+=("Java $JAVA_VERSION found; BAT's PATCH support and the run-bat.sh JAVA_OPTS add-opens flag target Java 17+.")
    else
        echo "✅ Java version: $JAVA_VERSION"
    fi
fi

OK="true"
[ ${#ERRORS[@]} -gt 0 ] && OK="false"

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
  "bat_cli": "${BAT_CLI:-}",
  "java_version": "${JAVA_VERSION:-}"
}
JSON

echo "📝 Wrote $OUT_FILE"
[ "$OK" = "false" ] && exit 1
exit 0
