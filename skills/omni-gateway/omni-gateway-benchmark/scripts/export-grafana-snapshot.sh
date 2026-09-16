#!/usr/bin/env bash
set -euo pipefail

ns="${GRAFANA_NS:-monitoring}"
svc="${GRAFANA_SVC:-kps-grafana}"
local_port="${GRAFANA_PORT:-33000}"
out_dir="${1:?usage: $0 <out-dir> [from] [to]}"
from="${2:-now-15m}"
to="${3:-now}"

mkdir -p "$out_dir"

# Wait for the Grafana service to have endpoints before port-forwarding.
kubectl -n "$ns" wait --for=jsonpath='{.subsets[0].addresses[0].ip}' \
  "endpoints/$svc" --timeout=120s

pf_log="$(mktemp)"
kubectl -n "$ns" port-forward "svc/$svc" "$local_port:80" >"$pf_log" 2>&1 &
pf=$!
trap 'kill $pf 2>/dev/null || true; rm -f "$pf_log"' EXIT

# Poll the local port instead of sleeping. Surface port-forward errors if it
# never binds (port in use, kubeconfig stale, no endpoints, etc.).
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://localhost:$local_port/api/health"; then
    break
  fi
  if ! kill -0 "$pf" 2>/dev/null; then
    echo "kubectl port-forward exited; output:" >&2
    cat "$pf_log" >&2
    exit 1
  fi
  sleep 1
done
if ! curl -sf -o /dev/null "http://localhost:$local_port/api/health"; then
  echo "Grafana not reachable on localhost:$local_port after 30s" >&2
  cat "$pf_log" >&2
  exit 1
fi

# admin/admin defaults from values.yaml
auth='admin:admin'

# List all dashboards, render each as PNG using Grafana image-renderer plugin.
dashboards=$(curl -sf -u "$auth" "http://localhost:$local_port/api/search?type=dash-db" | jq -r '.[] | "\(.uid):\(.title)"')

if [[ -z "$dashboards" ]]; then
  echo "No dashboards found in Grafana; nothing to snapshot." >&2
  exit 0
fi

while IFS= read -r line; do
  uid="${line%%:*}"
  title="${line#*:}"
  safe="$(echo "$title" | tr ' /' '__')"
  url="http://localhost:$local_port/render/d/$uid?from=$from&to=$to&width=1600&height=900&kiosk=tv"
  curl -sf -u "$auth" "$url" -o "$out_dir/${safe}.png"
  echo "Saved $out_dir/${safe}.png"
done <<< "$dashboards"
