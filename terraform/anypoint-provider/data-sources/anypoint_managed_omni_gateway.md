---
page_title: "anypoint_managed_omni_gateway Data Source - terraform-provider-anypoint"
subcategory: "API Management"
description: |-
  Fetches the full details of a single managed Omni Gateway by ID.
---

# anypoint_managed_omni_gateway (Data Source)

Fetches the full details of a single managed Omni Gateway by ID.

## Example Usage

```terraform
data "anypoint_managed_omni_gateway" "gw" {
  id              = var.gateway_id
  environment_id  = var.environment_id
  organization_id = var.organization_id
}

output "gateway_public_url" {
  value = data.anypoint_managed_omni_gateway.gw.ingress.public_url
}
```

## Schema

### Required

- `id` (String) The managed Omni Gateway ID.
- `environment_id` (String) The environment ID where the gateway is deployed.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider credentials organization.

### Read-Only

- `name` (String) The name of the gateway.
- `target_id` (String) The target (private space) ID.
- `target_name` (String) The name of the target (private space).
- `target_type` (String) The type of the target (e.g., `private-space`).
- `runtime_version` (String) The runtime version of the gateway.
- `release_channel` (String) The release channel (`lts` or `edge`).
- `size` (String) The gateway size (`small`, `large`).
- `status` (String) The current status of the gateway (e.g., `APPLIED`).
- `desired_status` (String) The desired status of the gateway (e.g., `STARTED`).
- `status_message` (String) Additional status message from the gateway.
- `date_created` (String) Timestamp when the gateway was created.
- `last_updated` (String) Timestamp of the last update to the gateway.
- `api_limit` (Number) Maximum number of APIs that can be deployed to this gateway.
- `ingress` (Object) Ingress network configuration. See [`ingress`](#nestedschema--ingress) below.
- `properties` (Object) Runtime properties. See [`properties`](#nestedschema--properties) below.
- `logging` (Object) Logging configuration. See [`logging`](#nestedschema--logging) below.
- `port_configuration` (Object) Port configuration for ingress and egress traffic. See [`port_configuration`](#nestedschema--port_configuration) below.

<a id="nestedschema--ingress"></a>
### Nested Schema for `ingress`

Read-Only:

- `public_url` (String) The primary public URL.
- `internal_urls` (List of String) All internal URLs.
- `forward_ssl_session` (Boolean) Whether SSL session forwarding is enabled.
- `last_mile_security` (Boolean) Whether last-mile security (TLS to upstream) is enabled.

<a id="nestedschema--properties"></a>
### Nested Schema for `properties`

Read-Only:

- `upstream_response_timeout` (Number) Upstream response timeout in seconds.
- `connection_idle_timeout` (Number) Connection idle timeout in seconds.

<a id="nestedschema--logging"></a>
### Nested Schema for `logging`

Read-Only:

- `level` (String) Log level (`debug`, `info`, `warn`, `error`).
- `forward_logs` (Boolean) Whether logs are forwarded to Anypoint Monitoring.

<a id="nestedschema--port_configuration"></a>
### Nested Schema for `port_configuration`

Read-Only:

- `ingress` (Object) Ingress port settings. See [`port_configuration.ingress`](#nestedschema--port_configuration--ingress) below.
- `egress` (Object) Egress port settings. See [`port_configuration.egress`](#nestedschema--port_configuration--egress) below.

<a id="nestedschema--port_configuration--ingress"></a>
### Nested Schema for `port_configuration.ingress`

Read-Only:

- `port` (Number) The port number.
- `protocol` (String) The protocol (e.g., `TCP`).

<a id="nestedschema--port_configuration--egress"></a>
### Nested Schema for `port_configuration.egress`

Read-Only:

- `port` (Number) The port number.
- `protocol` (String) The protocol (e.g., `TCP`).
