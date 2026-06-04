---
page_title: "anypoint_managed_omni_gateway Resource - terraform-provider-anypoint"
subcategory: "API Management"
description: |-
  Manages a CloudHub 2.0 Managed Omni Gateway instance in Anypoint Platform.
---

# anypoint_managed_omni_gateway (Resource)

Manages a CloudHub 2.0 Managed Omni Gateway instance in Anypoint Platform.

-> **Tracing note:** The Gateway Manager API does not echo back `configuration.tracing` in POST/PUT responses. The provider retains the plan-requested value in state after create/update so that `tracing.enabled = true` works correctly. On the next `terraform refresh` or `plan`, the provider reads the live value from the API for accurate drift detection.

## Example Usage

```terraform
resource "anypoint_managed_omni_gateway" "example" {
  name           = "my-omni-gateway"
  environment_id = "env-id-here"
  target_id      = "target-private-space-id"

  release_channel = "lts"
  size            = "small"

  ingress = {
    forward_ssl_session = true
    last_mile_security  = true
  }

  properties = {
    upstream_response_timeout = 15
    connection_idle_timeout   = 60
  }

  logging = {
    level        = "info"
    forward_logs = true
  }

  tracing = {
    enabled = false
  }
}
```

## Schema

### Required

- `name` (String) The name of the managed Omni Gateway.
- `environment_id` (String) The environment ID where the gateway will be deployed.
- `target_id` (String) The target (private space) ID for the gateway deployment.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `runtime_version` (String) The Omni Gateway runtime version (e.g., '1.9.9'). If omitted, the provider auto-selects the latest version for the chosen release_channel.
- `release_channel` (String) The release channel for the gateway. Valid values: `lts`, `edge`. Defaults to `lts`.
- `size` (String) The size of the gateway instance. Valid values: `small`, `large`. Defaults to `small`.
- `ingress` (Block) Ingress configuration for the gateway. See [below for nested schema](#nestedschema--ingress).
- `properties` (Block) Runtime properties for the gateway. See [below for nested schema](#nestedschema--properties).
- `logging` (Block) Logging configuration for the gateway. See [below for nested schema](#nestedschema--logging).
- `tracing` (Block) Distributed tracing configuration for the gateway. See [below for nested schema](#nestedschema--tracing).

### Read-Only

- `id` (String) The unique identifier of the managed Omni Gateway.
- `status` (String) The current status of the managed Omni Gateway.

<a id="nestedschema--ingress"></a>
### Nested Schema for `ingress`

Optional:

- `public_url` (String) The public URL for the gateway ingress. Auto-derived from the target domain when empty.
- `internal_url` (String) The internal URL for the gateway ingress. Auto-derived from the target domain when empty.
- `forward_ssl_session` (Boolean) Whether to forward SSL sessions to upstream services. Defaults to `true`.
- `last_mile_security` (Boolean) Whether to enable last-mile security (TLS between gateway and upstream). Defaults to `true`.

<a id="nestedschema--properties"></a>
### Nested Schema for `properties`

Optional:

- `upstream_response_timeout` (Number) Timeout in seconds for upstream service responses. Defaults to `15`.
- `connection_idle_timeout` (Number) Timeout in seconds for idle connections. Defaults to `60`.

<a id="nestedschema--logging"></a>
### Nested Schema for `logging`

Optional:

- `level` (String) The log level. Valid values: `debug`, `info`, `warn`, `error`. Defaults to `info`.
- `forward_logs` (Boolean) Whether to forward logs to Anypoint Monitoring. Defaults to `true`.

<a id="nestedschema--tracing"></a>
### Nested Schema for `tracing`

Optional:

- `enabled` (Boolean) Whether distributed tracing is enabled. Defaults to `false`.
