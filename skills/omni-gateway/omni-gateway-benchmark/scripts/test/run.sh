#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
fail=0
for t in scripts/test/*_test.sh; do
  echo "== $t"
  if bash "$t"; then echo "PASS"; else echo "FAIL"; fail=1; fi
done
exit "$fail"
