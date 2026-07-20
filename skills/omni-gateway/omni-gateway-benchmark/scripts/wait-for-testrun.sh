#!/usr/bin/env bash
set -euo pipefail

run="${1:?usage: $0 <run-id> [timeout-seconds]}"
deadline_secs="${2:-1800}"

ns="k6-operator-system"
name="flex-bench-$run"

# Preflight: surface CRD or RBAC failures up front instead of polling silently.
if ! kubectl get crd testruns.k6.io >/dev/null 2>&1; then
  echo "CRD testruns.k6.io not installed; is the k6-operator deployed?" >&2
  exit 1
fi
if ! kubectl -n "$ns" get testrun.k6.io "$name" >/dev/null 2>&1; then
  echo "TestRun $name not found in $ns" >&2
  kubectl -n "$ns" get testrun.k6.io >&2 || true
  exit 1
fi

echo "Waiting for TestRun $name (deadline ${deadline_secs}s)..."
start=$(date +%s)
last=""
while :; do
  phase=$(kubectl -n "$ns" get testrun.k6.io "$name" -o jsonpath='{.status.stage}' 2>/dev/null || echo "")
  if [[ "$phase" != "$last" ]]; then
    echo "  phase=${phase:-<empty>}"
    last="$phase"
  fi
  case "$phase" in
    finished)
      echo "TestRun $name finished."
      exit 0 ;;
    error|stopped)
      echo "TestRun $name ended in $phase" >&2
      kubectl -n "$ns" describe testrun.k6.io "$name" >&2 || true
      exit 1 ;;
  esac
  now=$(date +%s)
  if (( now - start > deadline_secs )); then
    echo "Timed out waiting for TestRun $name (last phase: ${phase:-<unknown>})" >&2
    kubectl -n "$ns" describe testrun.k6.io "$name" >&2 || true
    exit 124
  fi
  sleep 5
done
