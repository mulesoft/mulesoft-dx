#!/usr/bin/env bash
# Lightweight per-run path. Assumes Flex + upstream are already deployed
# (via deploy-flex.sh / deploy-upstream.sh). Just creates a fresh k6
# TestRun for $RUN_ID, waits for it to finish, and exports the snapshot.
#
# This is the script users / agents call to "re-run with the same config".
# It does NOT touch Flex or upstream — see deploy-flex.sh / deploy-upstream.sh
# for those.
#
# Inputs (env, all required unless noted):
#   RUN_ID       — identifier for this run (e.g. timestamp)
#   N_APIS       — passed to scenario.js so requests fan out across APIs
#   RPS, VUS, DURATION
#   CLIENT_ID, CLIENT_SECRET (optional — empty if no client-id-enforcement)
#   FLEX_URL (optional — defaults to in-cluster service DNS)
set -euo pipefail

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
usage: run-bench.sh

Run a single k6 load test against the already-deployed Flex + upstream, wait
for it to finish, export the Grafana snapshot, and generate the run report.
Does NOT (re)deploy Flex or upstream.

Reads from .env / environment:
  RUN_ID            (required)  identifier for this run (e.g. a timestamp)
  N_APIS            (required)  API fan-out passed to scenario.js
  RPS               (required)  target requests per second
  VUS               (required)  pre-allocated k6 virtual users
  DURATION          (required)  k6 test duration (e.g. 2m)
  CLIENT_ID         (optional)  empty unless client-id-enforcement is active
  CLIENT_SECRET     (optional)  empty unless client-id-enforcement is active
  FLEX_URL          (optional)  defaults to the in-cluster service DNS
  GRAFANA_PORT      (optional)  port for the printed live URLs (default: 3000)

Fails if a TestRun with this RUN_ID already exists — clean it up or pick a
fresh RUN_ID first.
EOF
    exit 0 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${RUN_ID:?required}"
: "${N_APIS:?required}"
: "${RPS:?required}"
: "${VUS:?required}"
: "${DURATION:?required}"
: "${CLIENT_ID:=}"
: "${CLIENT_SECRET:=}"
: "${POLICIES:=}"
: "${FLEX_VERSION:=unknown}"
: "${FLEX_URL:=http://flex-gateway.flex.svc.cluster.local:8080}"

# RUN_ID is a human-readable timestamp (e.g. 20260611T163209Z) and can contain
# uppercase T/Z, which are illegal in Kubernetes resource names (RFC 1123).
# RUN_SLUG is the lowercased form used for all k8s object names; RUN_ID stays
# as-is for report directories and the Prometheus testid tag.
RUN_SLUG="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
export RUN_ID RUN_SLUG N_APIS RPS VUS DURATION CLIENT_ID CLIENT_SECRET FLEX_URL POLICIES FLEX_VERSION

RUN_DIR="$ROOT/.run/$RUN_ID"
mkdir -p "$RUN_DIR"

# 1. Render the k6 scenario script.
"$ROOT/scripts/render-k6-script.sh" "$RUN_DIR/scenario.js"

# 2. Create the per-run script ConfigMap.
kubectl -n k6-operator-system create configmap "k6-script-$RUN_SLUG" \
  --from-file="scenario.js=$RUN_DIR/scenario.js" \
  --dry-run=client -o yaml | kubectl apply -f -

# 2b. Create the per-run client-credentials Secret. The TestRun env references
# it via secretKeyRef with optional=true so an empty POLICIES set still works
# without this Secret existing — but when client-id-enforcement is in play we
# always materialize it here so the credentials never live in the TestRun
# spec (which would put them in plaintext in the k8s API server).
kubectl -n k6-operator-system create secret generic "bench-client-creds-$RUN_SLUG" \
  --from-literal="client_id=$CLIENT_ID" \
  --from-literal="client_secret=$CLIENT_SECRET" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Apply the TestRun. Fail fast if a TestRun with this name already exists —
# `kubectl apply` would otherwise overwrite the previous run's spec and the
# in-flight metrics for that run would be lost. Use `make clean-deployment`
# (or `kubectl delete testrun flex-bench-$RUN_SLUG -n k6-operator-system`)
# before re-running with the same RUN_ID.
testrun_name="flex-bench-$RUN_SLUG"
if kubectl -n k6-operator-system get testrun "$testrun_name" >/dev/null 2>&1; then
  echo "run-bench: TestRun $testrun_name already exists in k6-operator-system." >&2
  echo "  Delete it first or re-run with a fresh RUN_ID." >&2
  exit 1
fi
envsubst < "$ROOT/assets/k8s/k6/testrun-template.yaml" | kubectl apply -f -

# Print live Grafana URLs so the user can watch the run in flight. Requires
# `make watch` (or any kubectl port-forward to kps-grafana) in another shell.
GRAFANA_PORT="${GRAFANA_PORT:-3000}"
range="from=now-10m&to=now&refresh=5s"
cat <<EOF

Live dashboards (run \`make watch\` in another shell to open the tunnel):
  k6 / Driver    http://localhost:${GRAFANA_PORT}/d/k6-driver/k6-driver?${range}&var-testid=${RUN_ID}
  Flex / Envoy   http://localhost:${GRAFANA_PORT}/d/flex-envoy/flex-envoy?${range}
  Flex / Pods    http://localhost:${GRAFANA_PORT}/d/flex-pods/flex-pods?${range}

EOF

# 4. Wait for the run to finish, then snapshot Grafana.
"$ROOT/scripts/wait-for-testrun.sh" "$RUN_SLUG"
"$ROOT/scripts/export-grafana-snapshot.sh" "$ROOT/reports/$RUN_ID"

# 5. Generate the human-readable run report (markdown + Grafana deep links).
"$ROOT/scripts/generate-report.sh" "$ROOT/reports/$RUN_ID"

echo "run-bench: report at $ROOT/reports/$RUN_ID"
