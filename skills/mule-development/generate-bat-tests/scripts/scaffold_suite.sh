#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of generate-bat-tests skill.
#
# Step 8 helper — scaffold a runnable BAT suite directory so the agent only has
# to write the per-test .dwl files and the bat.yaml `files:` list. Creates the
# config/ files and run-bat.sh (chmod +x) with the correct JDK-17 JAVA_OPTS.
#
# Idempotent: never overwrites an existing config/local.dwl (it may hold a real
# url/token the user edited). Pass --force to overwrite config + runner.
#
# Usage:  scaffold_suite.sh <suite-dir> [--url <url>] [--token <bearer>] [--force]
# Writes: <suite-dir>/{config/default.dwl,config/local.dwl,run-bat.sh,tests/}
set -euo pipefail

SUITE_DIR="${1:-}"
if [ -z "$SUITE_DIR" ]; then
    echo "❌ usage: scaffold_suite.sh <suite-dir> [--url <url>] [--token <bearer>] [--force]" >&2
    exit 1
fi
shift

URL="http://localhost:8082/api/v1"
TOKEN="Bearer test-token"
FORCE=0
while [ $# -gt 0 ]; do
    case "$1" in
        --url)   URL="$2"; shift 2 ;;
        --token) TOKEN="$2"; shift 2 ;;
        --force) FORCE=1; shift ;;
        *) echo "❌ unknown arg: $1" >&2; exit 1 ;;
    esac
done

mkdir -p "$SUITE_DIR/config" "$SUITE_DIR/tests"

DEFAULT_DWL="$SUITE_DIR/config/default.dwl"
LOCAL_DWL="$SUITE_DIR/config/local.dwl"
RUNNER="$SUITE_DIR/run-bat.sh"

if [ ! -f "$DEFAULT_DWL" ] || [ "$FORCE" = "1" ]; then
    cat >"$DEFAULT_DWL" <<'DWL'
config::local::main({})
DWL
    echo "✅ wrote $DEFAULT_DWL"
else
    echo "↩️  kept existing $DEFAULT_DWL"
fi

if [ ! -f "$LOCAL_DWL" ] || [ "$FORCE" = "1" ]; then
    cat >"$LOCAL_DWL" <<DWL
%dw 2.0
---
{
  url: '$URL',
  env: 'local',
  token: '$TOKEN'
}
DWL
    echo "✅ wrote $LOCAL_DWL"
else
    echo "↩️  kept existing $LOCAL_DWL (use --force to overwrite)"
fi

if [ ! -f "$RUNNER" ] || [ "$FORCE" = "1" ]; then
    cat >"$RUNNER" <<'SH'
#!/usr/bin/env bash
# Run the generated BAT suite against the live runtime under test.
#
# Prereqs:
#   - BAT CLI installed at $HOME/.bat/bat
#   - the app under test is running and reachable at config.url
#
# JAVA_OPTS opens java.base/java.net so PATCH works on JDK 17 (BAT overrides
# HttpURLConnection.method by reflection, which JDK 17 blocks by default).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.bat/bat/bin:$PATH"
export JAVA_OPTS='--add-opens=java.base/java.net=ALL-UNNAMED'
bat --config=local "$@"
SH
    chmod +x "$RUNNER"
    echo "✅ wrote $RUNNER (chmod +x)"
else
    echo "↩️  kept existing $RUNNER"
fi

echo "📁 Suite scaffold ready at $SUITE_DIR — write tests/*.dwl and bat.yaml next."
