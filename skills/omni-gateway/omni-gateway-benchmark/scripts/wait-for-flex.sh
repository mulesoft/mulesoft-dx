#!/usr/bin/env bash
# Block until the Flex Gateway deployment finishes rolling out and at least
# one pod is Ready. Called by deploy-flex.sh; safe to run standalone.
set -euo pipefail

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
usage: wait-for-flex.sh [namespace] [deployment] [timeout]

Wait for a Flex Gateway deployment to roll out and report Ready.

Arguments (all optional):
  namespace    Kubernetes namespace            (default: flex)
  deployment   Deployment name                 (default: flex-gateway)
  timeout      kubectl rollout/wait timeout    (default: 180s)
EOF
    exit 0 ;;
esac

ns="${1:-flex}"
deploy="${2:-flex-gateway}"
timeout="${3:-180s}"

echo "Waiting for deployment/$deploy in ns/$ns to roll out..."
kubectl -n "$ns" rollout status deploy/"$deploy" --timeout="$timeout"

echo "Waiting for at least one ready pod..."
# The chart labels pods `app=flex-gateway` (not the app.kubernetes.io/name
# convention). Match the deploy's own selector to stay correct if that changes.
kubectl -n "$ns" wait --for=condition=Ready pod \
  -l app="$deploy" \
  --timeout="$timeout"

echo "Flex is ready."
