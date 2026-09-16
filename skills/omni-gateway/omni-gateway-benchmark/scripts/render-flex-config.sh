#!/usr/bin/env bash
set -euo pipefail

: "${N_APIS:?required}"
: "${UPSTREAM_HOST:?required}"
: "${UPSTREAM_PORT:?required}"
# POLICIES is optional. Empty / unset = APIs are rendered with no PolicyBindings.
: "${POLICIES:=}"

# Per-policy defaults; envsubst can't expand `${VAR:-default}` syntax,
# so we materialize defaults here before substitution.
: "${RATE_LIMIT_RPS:=1000}"
export RATE_LIMIT_RPS

# Port the Flex (Envoy) listener binds for every ApiInstance. Must match the
# chart Service targetPort and the FLEX_URL k6 hits (both 8080).
: "${FLEX_LISTEN_PORT:=8080}"
export FLEX_LISTEN_PORT

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <output-path>" >&2
  exit 2
fi
out="$1"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Empty POLICIES would yield a one-element array containing "" with the
# default IFS read pattern; skip the read entirely to keep plist truly empty.
plist=()
if [[ -n "$POLICIES" ]]; then
  IFS=',' read -ra plist <<< "$POLICIES"
fi

# Validate every policy file exists BEFORE truncating the output. Otherwise
# `: > "$out"` clobbers a previously valid flex-config.yaml and leaves the
# next `kubectl apply` to fail with a cryptic YAML parse error instead of
# this clear "unknown policy" message.
for p in "${plist[@]+"${plist[@]}"}"; do
  if [[ ! -f "assets/config/policies/${p}.yaml" ]]; then
    echo "unknown policy: $p" >&2; exit 1
  fi
done

: > "$out"
envsubst < assets/config/flex-config-header.yaml >> "$out"

for i in $(seq 1 "$N_APIS"); do
  API_INDEX=$i UPSTREAM_HOST=$UPSTREAM_HOST UPSTREAM_PORT=$UPSTREAM_PORT \
    envsubst < assets/config/snippets/api-instance.yaml >> "$out"
  for p in "${plist[@]+"${plist[@]}"}"; do
    API_INDEX=$i envsubst < "assets/config/policies/${p}.yaml" >> "$out"
  done
done

# Example output (N_APIS=2, POLICIES=rate-limit, RATE_LIMIT_RPS=1000):
#
#   apiVersion: gateway.mulesoft.com/v1alpha1
#   kind: Service
#   metadata:
#     name: upstream
#     namespace: flex
#   spec:
#     address: http://upstream.default.svc.cluster.local:80
#   ---
#   apiVersion: gateway.mulesoft.com/v1alpha1
#   kind: ApiInstance
#   metadata:
#     name: api-1
#     namespace: flex
#   spec:
#     address: http://0.0.0.0:8080/api-1/
#     services:
#       upstream:
#         address: http://upstream.default.svc.cluster.local:80
#   ---
#   apiVersion: gateway.mulesoft.com/v1alpha1
#   kind: PolicyBinding
#   metadata:
#     name: api-1-rate-limit
#     namespace: flex
#   spec:
#     targetRef: { kind: ApiInstance, name: api-1 }
#     policyRef: { kind: Extension, name: rate-limiting-flex }
#     config:
#       rateLimits:
#         - maximumRequests: 1000
#           timePeriodInMilliseconds: 1000
#   ---
#   # ... api-2 + its PolicyBinding follow the same pattern ...
