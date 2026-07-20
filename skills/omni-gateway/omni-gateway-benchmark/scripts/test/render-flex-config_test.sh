#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

out1="$(mktemp)"
out2="$(mktemp)"
out3="$(mktemp)"
trap 'rm -f "$out1" "$out2" "$out3"' EXIT

# Scenario 1: N_APIS=2, both policies
N_APIS=2 \
  POLICIES=rate-limit,client-id-enforcement \
  UPSTREAM_HOST=upstream.default.svc.cluster.local \
  UPSTREAM_PORT=80 \
  scripts/render-flex-config.sh "$out1"
diff -u scripts/test/testdata/flex-config.n2.rl-cid.golden.yaml "$out1"

# Scenario 2: N_APIS=5, rate-limit only
N_APIS=5 \
  POLICIES=rate-limit \
  UPSTREAM_HOST=upstream.default.svc.cluster.local \
  UPSTREAM_PORT=80 \
  scripts/render-flex-config.sh "$out2"
diff -u scripts/test/testdata/flex-config.n5.rl-only.golden.yaml "$out2"

# Scenario 3: N_APIS=3, no policies (raw APIs with no PolicyBindings)
N_APIS=3 \
  POLICIES='' \
  UPSTREAM_HOST=upstream.default.svc.cluster.local \
  UPSTREAM_PORT=80 \
  scripts/render-flex-config.sh "$out3"
diff -u scripts/test/testdata/flex-config.n3.no-policies.golden.yaml "$out3"
