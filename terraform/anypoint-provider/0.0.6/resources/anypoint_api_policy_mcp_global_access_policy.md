---
page_title: "anypoint_api_policy_mcp_global_access_policy Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a MCP Global Access Policy policy on an Anypoint API instance.
---

# anypoint_api_policy_mcp_global_access_policy (Resource)

Manages a MCP Global Access Policy policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_mcp_global_access_policy" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    rules = [
      {
        action = "allow"
      }
    ]
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

- `rules` (Dynamic) Array of access control or policy rules.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_mcp_global_access_policy.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
