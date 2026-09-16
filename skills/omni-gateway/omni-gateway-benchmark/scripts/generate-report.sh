#!/usr/bin/env bash
# Generate a human-readable run report (markdown) for a finished k6 TestRun.
#
# Parses the k6 summary from the runner pod logs, derives the exact run time
# window from the pod, and emits a self-contained report with Grafana deep
# links (time range pre-set, testid templated). Grafana is ClusterIP-only, so
# the links assume a local `kubectl port-forward` — never an internet URL.
#
# The report filename is intentionally descriptive so back-to-back runs with
# different parameters are easy to tell apart:
#   flex<VERSION>_n<N_APIS>_<POLICIES>_rps<RPS>_<RUN_ID>.md
#
# Inputs (env):
#   RUN_ID, RUN_SLUG (required)   — identifiers from run-bench.sh
#   N_APIS, RPS, VUS, DURATION    — scenario knobs (for header + filename)
#   POLICIES (optional)           — comma-list, "none" if empty
#   FLEX_VERSION (optional)       — defaults to "unknown"
#   $1 (required)                 — output directory (reports/$RUN_ID)
set -euo pipefail

K6_NS="${K6_NS:-k6-operator-system}"
GRAFANA_PORT="${GRAFANA_PORT:-3000}"

: "${RUN_ID:?required}"
: "${RUN_SLUG:?required}"
: "${N_APIS:?required}"
: "${RPS:?required}"
: "${VUS:?required}"
: "${DURATION:?required}"
: "${POLICIES:=}"
: "${FLEX_VERSION:=unknown}"

out_dir="${1:?usage: $0 <out-dir>}"
mkdir -p "$out_dir"

policies_label="${POLICIES:-none}"
[[ -z "$POLICIES" ]] && policies_label="none"
# Filename-safe policies token: commas -> '+'.
policies_slug="${policies_label//,/+}"

report_name="flex${FLEX_VERSION}_n${N_APIS}_${policies_slug}_rps${RPS}_${RUN_ID}.md"
report_path="$out_dir/$report_name"

# --- Locate the k6 runner pod and pull its summary log ----------------------
pod="$(kubectl -n "$K6_NS" get pods --no-headers 2>/dev/null \
  | awk -v r="flex-bench-$RUN_SLUG" '$1 ~ r {print $1; exit}')"

k6log=""
[[ -n "$pod" ]] && k6log="$(kubectl -n "$K6_NS" logs "$pod" 2>/dev/null || true)"

# k6 prints each metric twice: once in the threshold block (label only, no
# data) and once in the final summary (label padded with dots up to a colon,
# e.g. "http_req_failed........: 0.00% ..."). Anchor on the dotted-label form
# so we capture the summary line with the actual numbers, not the empty one.
field() { printf '%s\n' "$k6log" | grep -m1 -E "$1"'\.*:' || true; }

http_reqs_line="$(field 'http_reqs')"
http_fail_line="$(field 'http_req_failed')"
dur_line="$(field 'http_req_duration')"
checks_line="$(field 'checks_succeeded')"

# --- Time window from the pod (UTC), padded 30s each side -------------------
start_iso="$(kubectl -n "$K6_NS" get pod "$pod" -o jsonpath='{.status.startTime}' 2>/dev/null || true)"
end_iso="$(kubectl -n "$K6_NS" get pod "$pod" \
  -o jsonpath='{.status.containerStatuses[0].state.terminated.finishedAt}' 2>/dev/null || true)"

epoch_ms() { # ISO8601 -> epoch millis, with +/- pad seconds; empty on failure
  python3 - "$1" "$2" <<'PY' 2>/dev/null || true
import sys, datetime
iso, pad = sys.argv[1], int(sys.argv[2])
if not iso: sys.exit(1)
# K8s container terminated.finishedAt sometimes carries fractional seconds
# (e.g. "2026-06-16T12:34:56.789012Z") and sometimes doesn't ("…:56Z").
# fromisoformat handles both once the trailing 'Z' is rewritten as +00:00.
dt = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
print(int(dt.timestamp()*1000) + pad*1000)
PY
}
from_ms="$(epoch_ms "$start_iso" -30)"
to_ms="$(epoch_ms "$end_iso" 30)"
# Fall back to a relative window if the pod is already gone.
range_q="from=${from_ms:-now-15m}&to=${to_ms:-now}"

g="http://localhost:${GRAFANA_PORT}"

# --- Emit the report --------------------------------------------------------
{
  echo "# Flex Gateway Benchmark — run report"
  echo
  echo "**Run ID:** \`$RUN_ID\`  "
  echo "**Flex version:** $FLEX_VERSION  "
  echo "**Window (UTC):** ${start_iso:-?} → ${end_iso:-?}"
  echo
  echo "## Scenario"
  echo
  echo "| Parameter | Value |"
  echo "|-----------|-------|"
  echo "| APIs | $N_APIS (\`/api-1/echo\` … \`/api-$N_APIS/echo\`) |"
  echo "| Policies | $policies_label |"
  echo "| Target rate | $RPS req/s (constant-arrival-rate) |"
  echo "| VUs | $VUS (max $((VUS*2))) |"
  echo "| Duration | $DURATION |"
  echo
  echo "## Results"
  echo
  echo '```'
  for line in "$http_reqs_line" "$http_fail_line" "$dur_line" "$checks_line"; do
    [[ -n "$line" ]] && echo "${line#"${line%%[![:space:]]*}"}"
  done
  [[ -z "$k6log" ]] && echo "(k6 runner pod logs unavailable — pod may have been reaped)"
  echo '```'
  echo
  echo "## View in Grafana"
  echo
  echo "Grafana is ClusterIP-only and runs with anonymous Viewer access — no"
  echo "login required. Open a local tunnel first:"
  echo
  echo '```bash'
  echo "make watch    # port-forward + open k6 dashboard, or:"
  echo "kubectl -n monitoring port-forward svc/kps-grafana ${GRAFANA_PORT}:80"
  echo '```'
  echo
  echo "Then open these dashboards (time range pre-set to this run):"
  echo
  echo "- **k6 / Driver** — throughput, latency, VUs:  "
  echo "  $g/d/k6-driver/k6-driver?${range_q}&var-testid=${RUN_ID}"
  echo "- **Flex / Envoy** — gateway RPS, response codes, latency:  "
  echo "  $g/d/flex-envoy/flex-envoy?${range_q}"
  echo "- **Flex / Pods** — gateway CPU / memory under load:  "
  echo "  $g/d/flex-pods/flex-pods?${range_q}"
  echo
  echo "## Snapshots"
  echo
  echo "Dashboard PNGs exported alongside this report in \`$(basename "$out_dir")/\`."
} > "$report_path"

echo "generate-report: wrote $report_path"
