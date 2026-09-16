# Kubernetes Installation

## Execution Paths

- **Standard Kubernetes** (Steps 1 → 2 → 3 → 4 → 5): Gather prerequisites, add the Helm repo,
generate `values.yaml`, install via Helm, and verify.
- **OpenShift** (Steps 1 → 2 → 3-ocp → 4 → 5): Same flow, but add OpenShift-specific security
context settings to `values.yaml` in Step 3-ocp before running the Helm install.

---

## Step 1 — Gather prerequisites

Confirm the tooling is in place and the cluster context is correct:

```bash
helm version
kubectl cluster-info
```

Before proceeding, collect:

- **Namespace**: The recommended namespace is `gateway` (it will be created if it does not exist).
- **Registration YAML**: For connected mode, generate it using the Docker `flexctl` one-shot command
  below before running the Helm install. Store the output file in your working directory.
- **Image tag**: Defaults to `latest`; pin to a specific version for production.
- **Service type**: `ClusterIP` (internal only), `NodePort`, or `LoadBalancer` (external).

**To generate `registration.yaml` from your workstation (connected mode only):**

```bash
docker run --entrypoint flexctl -u $UID \
  -v "$(pwd)":/registration mulesoft/flex-gateway \
  registration create \
  --organization=<orgID> \
  --token=<token> \
  --output-directory=/registration \
  --connected=true \
  --anypoint-url=https://anypoint.mulesoft.com \
  <gateway-name>
```

Registration parameters: `<orgID>` from Anypoint Platform → Admin Settings → Organization;
`<token>` from Runtime Manager → Add Gateway → Self-managed → Copy token (expires 24 hours);
`<gateway-name>` is the display name in Runtime Manager.

---

## Step 2 — Add the Flex Gateway Helm repository

```bash
helm repo add flex-gateway https://flex-packages.anypoint.mulesoft.com/helm
helm repo update
```

---

## Step 3 — Generate values.yaml

Create a `values.yaml` file that configures the Helm release:

```yaml
gateway:
  mode: connected      # Use "local" for local mode
replicaCount: 1
image:
  tag: latest
service:
  type: ClusterIP
```

For production deployments, set `replicaCount` to 2 or more for high availability, and pin
`image.tag` to a specific version.

---

## Step 3-ocp — OpenShift variant

If deploying on OpenShift, add the following to `values.yaml` before running the Helm install.
These settings satisfy OpenShift's default Security Context Constraints (SCCs):

```yaml
podSecurityContext:
  runAsNonRoot: true
serviceAccount:
  annotations:
    openshift.io/scc: nonroot
```

Merge these fields into the `values.yaml` from Step 3 above.

---

## Step 4 — Install via Helm

For connected mode (with a `registration.yaml` file in the current directory):

```bash
helm -n gateway upgrade -i --create-namespace ingress flex-gateway/flex-gateway \
  --set-file registration.content=registration.yaml \
  --set gateway.mode=connected
```

For local mode, omit `--set gateway.mode=connected` or explicitly set `--set gateway.mode=local`.
The `--create-namespace` flag creates the `gateway` namespace if it does not already exist.
The release name `ingress` is the conventional name for a gateway Helm release; change it if
your organization uses a different naming convention.

To apply your custom values file:

```bash
helm -n gateway upgrade -i --create-namespace ingress flex-gateway/flex-gateway \
  -f values.yaml \
  --set-file registration.content=registration.yaml
```

---

## Step 5 — Monitor and verify

Wait for the rollout to complete, then inspect pods and logs:

```bash
kubectl rollout status deployment/ingress -n gateway
kubectl get pods -n gateway
kubectl logs -n gateway deployment/ingress --tail=50
```

A successful rollout shows all pods in `Running` state. In the logs, look for a line containing
`STARTED` to confirm the gateway is fully initialized. For connected mode, the gateway will appear
in Anypoint Runtime Manager within a few seconds of startup.

**Common issues:**

- `**ImagePullBackOff`**: The node cannot reach the Docker Hub registry, or the image tag does
not exist. Check network egress rules and confirm the tag with `docker pull mulesoft/flex-gateway:<tag>`.
- `**CrashLoopBackOff**`: Run `kubectl logs -n gateway deployment/ingress` to inspect the
startup failure. Common causes: missing `registration.yaml` secret, malformed YAML in a
ConfigMap, or an OpenShift SCC violation.
- `**Pending` pods`: Check for resource quota or node affinity issues with
`kubectl describe pod -n gateway`.

For connected-mode verification in Anypoint Runtime Manager, return to `SKILL.md` →
"Confirm in Anypoint Runtime Manager".
