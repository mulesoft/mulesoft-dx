# Per-run Helm values overlay for the Flex chart.
# The orchestrator renders this with envsubst into ${RUN_DIR}/flex-values.yaml
# and passes it to `helm upgrade --install` alongside k8s/flex/values.yaml.
#
# Required env vars at render time:
#   FLEX_IMAGE_REPOSITORY  e.g. mulesoft/flex-gateway (or a private mirror)
#   FLEX_IMAGE_TAG         e.g. 1.13.0 (defaults to FLEX_VERSION in the Makefile)
#
# The ConfigMap name is intentionally stable (not RUN_ID-suffixed) so that
# back-to-back runs with identical Flex inputs reuse the same ConfigMap and
# deploy-flex.sh can skip the helm upgrade. The hash-based skip in
# deploy-flex.sh detects content drift and rolls the pods when needed.
image:
  repository: "${FLEX_IMAGE_REPOSITORY}"
  tag: "${FLEX_IMAGE_TAG}"

# Gateway registration. deploy-flex.sh creates the `flex-registration` secret
# (key registration.yaml) from the flexctl-generated registration file.
registration:
  secretName: flex-registration

# No ConfigMap volume mount: the chart runs Flex with the Kubernetes datasource
# enabled, so API config is delivered as ApiInstance/PolicyBinding/Service
# custom resources (kubectl apply'd by deploy-flex.sh), not a mounted file.
