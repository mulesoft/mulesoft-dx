---
page_title: "anypoint_api_policy_idle_timeout Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Idle Timeout policy on an Anypoint API instance.
---

# anypoint_api_policy_idle_timeout (Resource)

Manages a Idle Timeout policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_idle_timeout" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    timeout = 30000
  }

  upstream_ids = [anypoint_api_upstream.example.id]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `api_instance_id` (String) The API instance ID.
- `configuration` (Block) The policy configuration. See [Configuration](#nestedschema--configuration) below.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `label` (String) A human-readable label for this policy instance.
- `asset_version` (String) The policy asset version. Defaults to `1.0.1`.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `timeout` (Number) Timeout value in milliseconds.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_idle_timeout.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
