#!/usr/bin/env bash
# Tear down per-run workloads while keeping the cluster + observability +
# k6-operator alive. Use between sessions when you want a fresh slate but
# don't want to pay for a full `terraform destroy` + recreate.
#
# Removes:
#   - Flex Helm release (flex-gateway, ns flex)
#   - Flex declarative resources (ApiInstance, PolicyBinding, Service CRDs in ns flex)
#   - bench-upstream Deployment + service in ns default
#   - All k6 TestRun resources in k6-operator-system
#   - All k6-script-* ConfigMaps and bench-client-creds-* Secrets
#
# Keeps:
#   - EKS cluster
#   - kube-prometheus-stack, flex-bench-extras, k6-operator (Terraform-owned)
#   - ECR repository
#   - Reports under benchmark/reports/ (use clean-runs.sh for those)
set -euo pipefail

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
usage: clean-deployment.sh

Tear down per-run workloads while keeping the cluster, observability stack,
and k6-operator alive. Use between sessions for a fresh slate without paying
for a full terraform destroy + recreate.

Removes: Flex Helm release + declarative CRDs (ns flex), bench-upstream
Deployment + Service (ns default), all k6 TestRuns, and the k6-script-* /
bench-client-creds-* ConfigMaps/Secrets (ns k6-operator-system).

Keeps: EKS cluster, kube-prometheus-stack, k6-operator, ECR repo, and reports.

Takes no arguments or environment configuration.
EOF
    exit 0 ;;
esac

NS_FLEX="flex"
NS_DEFAULT="default"
NS_K6="k6-operator-system"

# Helm release will fail to delete if it's already gone; tolerate that.
echo "==> uninstalling Flex Helm release"
helm uninstall flex-gateway -n "$NS_FLEX" 2>/dev/null || true

# deploy-flex.sh applies CRDs (ApiInstance / PolicyBinding / Service from
# gateway.mulesoft.com/v1alpha1) directly via `kubectl apply -f flex-config.yaml`,
# not through a ConfigMap. Delete the actual CRDs so they don't survive into
# the next deploy and pollute its baseline. The CRDs themselves are owned by
# the Helm chart and disappear when the release is uninstalled (rendering
# these deletes no-ops on a clean install) — `--ignore-not-found` covers that.
echo "==> deleting Flex declarative resources"
if kubectl get crd apiinstances.gateway.mulesoft.com >/dev/null 2>&1; then
  kubectl -n "$NS_FLEX" delete apiinstance.gateway.mulesoft.com --all --ignore-not-found
fi
if kubectl get crd policybindings.gateway.mulesoft.com >/dev/null 2>&1; then
  kubectl -n "$NS_FLEX" delete policybinding.gateway.mulesoft.com --all --ignore-not-found
fi
if kubectl get crd services.gateway.mulesoft.com >/dev/null 2>&1; then
  kubectl -n "$NS_FLEX" delete service.gateway.mulesoft.com --all --ignore-not-found
fi

echo "==> deleting upstream Deployment + Service"
kubectl -n "$NS_DEFAULT" delete deploy bench-upstream --ignore-not-found
kubectl -n "$NS_DEFAULT" delete svc upstream --ignore-not-found

echo "==> deleting all k6 TestRuns + script ConfigMaps + client-creds Secrets"
kubectl -n "$NS_K6" delete testrun --all --ignore-not-found
# delete --all on configmaps would nuke the operator's own CMs; filter by name prefix.
mapfile -t cms < <(kubectl -n "$NS_K6" get configmap \
  -o jsonpath='{.items[?(@.metadata.name)].metadata.name}' \
  | tr ' ' '\n' | grep '^k6-script-' || true)
if [[ ${#cms[@]} -gt 0 ]]; then
  kubectl -n "$NS_K6" delete configmap "${cms[@]}" --ignore-not-found
fi
mapfile -t secs < <(kubectl -n "$NS_K6" get secret \
  -o jsonpath='{.items[?(@.metadata.name)].metadata.name}' \
  | tr ' ' '\n' | grep '^bench-client-creds-' || true)
if [[ ${#secs[@]} -gt 0 ]]; then
  kubectl -n "$NS_K6" delete secret "${secs[@]}" --ignore-not-found
fi

echo "clean-deployment: done. Cluster + observability + k6-operator are still up."
