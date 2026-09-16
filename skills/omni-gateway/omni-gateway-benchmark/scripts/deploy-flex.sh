#!/usr/bin/env bash
# Deploy (or re-deploy) the Flex Gateway Helm release.
#
# Idempotent: hashes (flex-config.yaml bytes + FLEX_IMAGE_REPOSITORY +
# FLEX_IMAGE_TAG) and skips the helm upgrade when the live Deployment
# already carries the same hash. The hash lives on the pod template
# annotation so a content change forces a rollout, not just on the
# Deployment metadata where it would be invisible to the controller.
#
# Inputs (all env, all required unless noted):
#   N_APIS                       — passed through to render-flex-config.sh
#   POLICIES (optional)          — comma-list, may be empty
#   FLEX_VERSION                 — fallback for FLEX_IMAGE_TAG
#   FLEX_IMAGE_REPOSITORY (opt)  — defaults to mulesoft/flex-gateway
#   FLEX_IMAGE_TAG        (opt)  — defaults to FLEX_VERSION
#   $1 (optional)                — work dir for rendered files. Defaults to
#                                   $ROOT/.run/last/.
set -euo pipefail

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
usage: deploy-flex.sh [work-dir]

Render the Flex declarative config + Helm values, then deploy (or hash-skip)
the Flex Gateway Helm release and apply the gateway.mulesoft.com CRDs.

Arguments:
  work-dir          (optional)  dir for rendered files   (default: .run/last)

Reads from .env / environment:
  N_APIS                (required)  number of ApiInstance resources
  FLEX_VERSION          (required)  Helm chart version
  POLICIES              (optional)  comma-list of policies (may be empty)
  FLEX_IMAGE_REPOSITORY (optional)  defaults to mulesoft/flex-gateway
  FLEX_IMAGE_TAG        (optional)  defaults to FLEX_VERSION
  REGISTRATION_FILE     (optional)  defaults to .run/registration/registration.yaml

Idempotent: skips helm upgrade when the spec hash matches the live deployment.
EOF
    exit 0 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NS="flex"
NAME="flex-gateway"
HASH_ANNOT="bench/spec-hash"

: "${N_APIS:?required}"
: "${FLEX_VERSION:?required}"
: "${POLICIES:=}"
: "${FLEX_IMAGE_REPOSITORY:=mulesoft/flex-gateway}"
: "${FLEX_IMAGE_TAG:=$FLEX_VERSION}"
export FLEX_IMAGE_REPOSITORY FLEX_IMAGE_TAG

work="${1:-$ROOT/.run/last}"
mkdir -p "$work"

# 1. Render Flex declarative config (Service + ApiInstance + PolicyBindings).
N_APIS="$N_APIS" POLICIES="$POLICIES" \
  UPSTREAM_HOST=upstream.default.svc.cluster.local UPSTREAM_PORT=80 \
  "$ROOT/scripts/render-flex-config.sh" "$work/flex-config.yaml"

# 2. Render the per-run Helm values overlay (image repo/tag + ConfigMap mount).
envsubst < "$ROOT/assets/k8s/flex/values-run.yaml.tpl" > "$work/flex-values.yaml"

# 3. Compute the spec hash. Anything that should trigger a rollout goes in.
new_hash=$(
  {
    cat "$work/flex-config.yaml"
    echo "image=${FLEX_IMAGE_REPOSITORY}:${FLEX_IMAGE_TAG}"
  } | sha256sum | cut -c1-12
)

# Read live hash from pod template annotation (forces rollout on change).
# kubectl jsonpath's dot accessor can't address keys with '/' or '.' in their
# name; bracket+single-quote notation is the documented escape that survives
# annotation keys like `bench/spec-hash` without any shell-level escaping.
live_hash=$(kubectl -n "$NS" get deploy "$NAME" \
  -o jsonpath="{.spec.template.metadata.annotations['${HASH_ANNOT}']}" 2>/dev/null || true)

if [[ "$new_hash" == "$live_hash" && -n "$live_hash" ]]; then
  echo "deploy-flex: spec unchanged (hash=$new_hash), skipping helm upgrade"
  exit 0
fi

# 4. Namespace.
kubectl apply -f "$ROOT/assets/k8s/flex/namespace.yaml"

# 4b. Flex registration. The chart requires a registration secret to obtain
# its gateway certificate from Anypoint. Generate it once (local mode) with:
#   flexctl registration create ... --connected=false --output-directory=.run/registration
# then point REGISTRATION_FILE at the resulting registration.yaml. The secret
# key MUST be `registration.yaml` — that's what the chart's registration.secretName
# path mounts.
REGISTRATION_FILE="${REGISTRATION_FILE:-$ROOT/.run/registration/registration.yaml}"
if [[ ! -f "$REGISTRATION_FILE" ]]; then
  echo "deploy-flex: registration file not found at $REGISTRATION_FILE" >&2
  echo "  generate it with flexctl (see comment above) or set REGISTRATION_FILE." >&2
  exit 1
fi
kubectl -n "$NS" create secret generic flex-registration \
  --from-file=registration.yaml="$REGISTRATION_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

# 5. Add the public Flex Gateway Helm repo. The chart lives at the classic
# HTTP repo https://flex-packages.anypoint.mulesoft.com/helm (the same one
# ArtifactHub points to), which serves index.yaml and the .tgz anonymously.
# Note the OCI endpoint (oci://.../flex-gateway) is NOT public and 403s —
# don't switch back to it.
REPO_URL="https://flex-packages.anypoint.mulesoft.com/helm"
helm repo add flex-gateway "$REPO_URL" >/dev/null
helm repo update flex-gateway >/dev/null

# 6. helm upgrade. This also installs the gateway.mulesoft.com CRDs that the
# declarative config in step 6b depends on, so it must run first.
helm upgrade --install flex-gateway flex-gateway/flex-gateway \
  --version "$FLEX_VERSION" \
  -n "$NS" --create-namespace \
  -f "$ROOT/assets/k8s/flex/values.yaml" \
  -f "$work/flex-values.yaml"

# 6b. Apply the declarative API config. The chart runs Flex with
# FLEX_DATASOURCE_K8S_ENABLED=true, so the gateway reads ApiInstance /
# PolicyBinding / Service as Kubernetes custom resources (NOT from a mounted
# ConfigMap). Apply them after the CRDs exist; the controller reconciles them
# into Envoy config without a pod restart.
kubectl -n "$NS" apply -f "$work/flex-config.yaml"

# 7. Stamp the spec hash on the pod template. Annotating after helm upgrade
# (instead of via --set podAnnotations.*) avoids depending on the chart
# exposing a `podAnnotations` value, and the patch itself triggers a rollout
# whenever the hash changes — which is exactly what we want.
kubectl -n "$NS" patch deploy "$NAME" \
  --type=merge \
  -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"$HASH_ANNOT\":\"$new_hash\"}}}}}"

# 8. Wait for the rollout to complete.
"$ROOT/scripts/wait-for-flex.sh"

echo "deploy-flex: applied (hash=$new_hash, was=${live_hash:-<none>})"
