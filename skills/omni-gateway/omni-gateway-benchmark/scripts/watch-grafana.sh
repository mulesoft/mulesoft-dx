#!/usr/bin/env bash
# Open a port-forward to Grafana and print live dashboard URLs.
#
# Anonymous Viewer access is enabled in assets/k8s/observability/values.yaml, so the
# URLs open straight to the dashboards — no login, no forced-password-change
# page. Useful while a benchmark run is in flight: watch k6 throughput and
# Flex pod resource use update in real time.
#
# Inputs (env, all optional):
#   GRAFANA_PORT    — local port to forward to (default 3000)
#   RUN_ID          — if set, k6 / Driver URL is filtered to this testid
#   OPEN_BROWSER    — set to 0 to skip `open` (default: open the k6 dashboard)
case "${1:-}" in
  -h|--help)
    cat <<'EOF'
usage: watch-grafana.sh

Open a port-forward to Grafana and print live dashboard URLs (anonymous
Viewer — no login). Useful while a benchmark run is in flight. The tunnel
outlives this script; stop it with the printed `kill <pid>` hint.

Reads from .env / environment (all optional):
  GRAFANA_PORT      local port to forward to              (default: 3000)
  GRAFANA_NS        Grafana namespace                     (default: monitoring)
  GRAFANA_SVC       Grafana service name                  (default: kps-grafana)
  RUN_ID            filter the k6 / Driver URL to a testid
  OPEN_BROWSER      set to 0 to skip auto-opening the dashboard (default: 1)
EOF
    exit 0 ;;
esac

set -euo pipefail

PORT="${GRAFANA_PORT:-3000}"
NS="${GRAFANA_NS:-monitoring}"
SVC="${GRAFANA_SVC:-kps-grafana}"
RUN_ID="${RUN_ID:-}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"

if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "watch-grafana: port $PORT already in use — assuming an existing tunnel."
else
  echo "watch-grafana: starting port-forward $NS/$SVC -> localhost:$PORT"
  kubectl -n "$NS" port-forward "svc/$SVC" "$PORT:80" >/tmp/watch-grafana.log 2>&1 &
  pf_pid=$!
  # While we wait for Grafana to answer, kill the kubectl child if the user
  # interrupts the script — otherwise an orphan port-forward holds the port
  # and the next `make watch` falsely sees "an existing tunnel".
  trap 'kill "$pf_pid" 2>/dev/null || true' INT TERM
  # Wait for Grafana to answer on /api/health (max 30s).
  for _ in {1..30}; do
    if curl -sf -o /dev/null "http://localhost:$PORT/api/health"; then
      break
    fi
    sleep 1
  done
  if ! curl -sf -o /dev/null "http://localhost:$PORT/api/health"; then
    echo "watch-grafana: Grafana did not become reachable on :$PORT within 30s" >&2
    kill "$pf_pid" 2>/dev/null || true
    exit 1
  fi
  # Tunnel is healthy; the user wants it to outlive this script (the printed
  # `kill $pf_pid` hint is how they tear it down later). Clear the trap and
  # disown so the bg job keeps running after we exit.
  trap - INT TERM
  disown "$pf_pid" 2>/dev/null || true
  echo "watch-grafana: tunnel ready (pid $pf_pid). Stop with: kill $pf_pid"
fi

# Live window: trailing 10 minutes, refresh every 5s.
range="from=now-10m&to=now&refresh=5s"
testid_q=""
[[ -n "$RUN_ID" ]] && testid_q="&var-testid=${RUN_ID}"

k6_url="http://localhost:${PORT}/d/k6-driver/k6-driver?${range}${testid_q}"
envoy_url="http://localhost:${PORT}/d/flex-envoy/flex-envoy?${range}"
pods_url="http://localhost:${PORT}/d/flex-pods/flex-pods?${range}"

cat <<EOF

Grafana is live (anonymous Viewer — no login required):

  k6 / Driver    $k6_url
  Flex / Envoy   $envoy_url
  Flex / Pods    $pods_url

EOF

if [[ "$OPEN_BROWSER" == "1" ]] && command -v open >/dev/null 2>&1; then
  open "$k6_url" || true
fi
