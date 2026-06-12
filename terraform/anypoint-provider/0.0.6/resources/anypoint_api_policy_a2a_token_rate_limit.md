---
page_title: "anypoint_api_policy_a2a_token_rate_limit Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a A2A Token Rate Limit policy on an Anypoint API instance.
---

# anypoint_api_policy_a2a_token_rate_limit (Resource)

Manages a A2A Token Rate Limit policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_a2a_token_rate_limit" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    maximum_tokens              = 10000
    time_period_in_milliseconds = 60000
    key_selector                = "#[attributes.headers['Authorization']]"
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
- `asset_version` (String) The policy asset version. Defaults to `1.0.0`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `maximum_tokens` (Number) Maximum number of tokens allowed in the time period.
- `time_period_in_milliseconds` (Number) The time period in milliseconds for the rate limit or quota window.

Optional:

- `key_selector` (String) Expression to extract the rate limit key from the request.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_a2a_token_rate_limit.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
