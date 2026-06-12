---
page_title: "anypoint_privatespace_advanced_config Resource - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Manages advanced configuration for an Anypoint Private Space.
---

# anypoint_privatespace_advanced_config (Resource)

Manages advanced configuration for an Anypoint Private Space.

## Example Usage

```terraform
resource "anypoint_privatespace_advanced_config" "example" {
  private_space_id = var.private_space_id

  ingress_configuration = {
    read_response_timeout = "600"
    protocol              = "https-redirect"

    logs = {
      port_log_level = "INFO"
      filters        = []
    }

    deployment = {
      status              = "APPLIED"
      last_seen_timestamp = 1753719215000
    }
  }

  enable_iam_role = true
}
```

## Schema

### Required

- `private_space_id` (String) The ID of the private space to configure.

### Optional

- `organization_id` (String) The organization ID where the private space is located. If not provided, the organization ID will be inferred from the connected app credentials.
- `ingress_configuration` (Block) Ingress configuration for the private space. See [below for nested schema](#nestedschema--ingress_configuration).
- `enable_iam_role` (Boolean) Whether to enable IAM role for the private space. Defaults to `false`.

### Read-Only

- `id` (String) The unique identifier of the advanced configuration.

<a id="nestedschema--ingress_configuration"></a>
### Nested Schema for `ingress_configuration`

Optional:

- `read_response_timeout` (String) Read response timeout in seconds. Defaults to `"300"`.
- `protocol` (String) Protocol for ingress configuration. Defaults to `"https-redirect"`.
- `logs` (Block) Logs configuration for ingress. See [below for nested schema](#nestedschema--ingress_configuration--logs).
- `deployment` (Block) Deployment configuration for ingress. See [below for nested schema](#nestedschema--ingress_configuration--deployment).

<a id="nestedschema--ingress_configuration--logs"></a>
### Nested Schema for `ingress_configuration.logs`

Optional:

- `port_log_level` (String) Port log level. Defaults to `"ERROR"`.
- `filters` (Block List) List of log filters. Defaults to `[]`. See [below for nested schema](#nestedschema--ingress_configuration--logs--filters).

<a id="nestedschema--ingress_configuration--logs--filters"></a>
### Nested Schema for `ingress_configuration.logs.filters`

Required:

- `ip` (String) IP address for the filter.
- `level` (String) Log level for the filter.

<a id="nestedschema--ingress_configuration--deployment"></a>
### Nested Schema for `ingress_configuration.deployment`

Optional:

- `status` (String) Deployment status. Defaults to `"APPLIED"`.
- `last_seen_timestamp` (Number) Last seen timestamp. Defaults to `1753719215000`.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_privatespace_advanced_config.example <private_space_id>
```
