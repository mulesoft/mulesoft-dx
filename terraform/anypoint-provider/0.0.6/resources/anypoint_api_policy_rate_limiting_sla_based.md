---
page_title: "anypoint_api_policy_rate_limiting_sla_based Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Rate Limiting SLA Based policy on an Anypoint API instance.
---

# anypoint_api_policy_rate_limiting_sla_based (Resource)

Manages a Rate Limiting SLA Based policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_rate_limiting_sla_based" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    client_id_expression     = "#[attributes.headers['client_id']]"
    client_secret_expression = "#[attributes.headers['client_secret']]"
    expose_headers           = false
    clusterizable            = true
  }

  order = 1
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `api_instance_id` (String) The API instance ID.
- `configuration` (Block) The policy configuration. See [Configuration](#nestedschema--configuration) below.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `label` (String) A human-readable label for this policy instance.
- `order` (Number) The order of policy execution.
- `asset_version` (String) The policy asset version. Defaults to `1.3.1`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Optional:

- `client_id_expression` (String) Expression to extract the client ID from the request.
- `client_secret_expression` (String) Expression to extract the client secret from the request.
- `expose_headers` (Boolean) Whether to expose rate-limit headers in the response.
- `clusterizable` (Boolean) Whether the rate limit counters are shared across a cluster.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_rate_limiting_sla_based.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
