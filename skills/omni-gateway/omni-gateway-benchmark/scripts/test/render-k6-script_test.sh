#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

out="$(mktemp)"; trap 'rm -f "$out"' EXIT

scripts/render-k6-script.sh "$out"
diff -u scripts/test/testdata/k6-script.n10.golden.js "$out"
