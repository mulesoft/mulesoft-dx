# Flex Local-mode YAML schema — notes

**Verified against:** `mulesoft/flex-gateway:1.13.0`

**Important:** The exact field names below were taken from MuleSoft's published
documentation for the **1.13.x** Local-mode declarative config format. They were
**not** captured from a running container in this scaffold (Docker daemon was
unavailable at scaffold time). Before deploying for real, regenerate examples by
running:

```bash
docker run --rm -e FLEX_DISABLE_ANALYTICS=1 \
  mulesoft/flex-gateway:1.13.0 flexctl --help
docker run --rm -e FLEX_DISABLE_ANALYTICS=1 \
  mulesoft/flex-gateway:1.13.0 flexctl config init --output yaml
```

Reconcile any field-name drift in `flex-config-header.yaml`, `snippets/api-instance.yaml`,
and the policy snippets under `policies/`. The renderer test suite catches drift
between the templates and the goldens; the deployment dry-run in Task 10 catches
drift between the rendered config and the cluster's CRDs.

## Resource kinds used

| Kind            | apiVersion                            | Purpose                                   |
|-----------------|---------------------------------------|-------------------------------------------|
| `Service`       | `gateway.mulesoft.com/v1alpha1`       | Declares the upstream backend             |
| `ApiInstance`   | `gateway.mulesoft.com/v1alpha1`       | Declares one routed API + its upstream    |
| `PolicyBinding` | `gateway.mulesoft.com/v1alpha1`       | Attaches a policy to an `ApiInstance`     |

All resources are stamped with `metadata.namespace: flex` to match the canonical
declarative-config examples shipped under `/resources/examples/`.

## `Service` (one per upstream)

```yaml
apiVersion: gateway.mulesoft.com/v1alpha1
kind: Service
metadata:
  name: upstream
  namespace: flex
spec:
  address: http://upstream.default.svc.cluster.local:80
```

## `ApiInstance` (N per run)

```yaml
apiVersion: gateway.mulesoft.com/v1alpha1
kind: ApiInstance
metadata:
  name: api-1
  namespace: flex
spec:
  address: /api-1/
  services:
    upstream:
      address: http://upstream.default.svc.cluster.local:80
```

## `PolicyBinding` (one per ApiInstance per policy)

```yaml
apiVersion: gateway.mulesoft.com/v1alpha1
kind: PolicyBinding
metadata:
  name: api-1-rate-limit
  namespace: flex
spec:
  targetRef:
    kind: ApiInstance
    name: api-1
  policyRef:
    kind: Extension
    name: rate-limiting-flex
  config:
    rateLimits:
      - maximumRequests: 1000
        timePeriodInMilliseconds: 1000
```

## Policy reference names

The `policyRef.name` values used by this benchmark — verified against the
canonical examples in `/resources/examples/demo-policy-ordering` and
`/resources/examples/demo-soap-failure`:

| Policy file                          | `policyRef.kind` | `policyRef.name`         |
|--------------------------------------|------------------|--------------------------|
| `policies/rate-limit.yaml`           | `Extension`      | `rate-limiting-flex`     |
| `policies/client-id-enforcement.yaml`| `Extension`      | `client-id-enforcement`  |

Note: `client-id-enforcement` is the value used in this benchmark; no
`kind: PolicyBinding` example for client-id-enforcement was found in
`/resources/examples`. Verify against `flexctl` output before customer release.
