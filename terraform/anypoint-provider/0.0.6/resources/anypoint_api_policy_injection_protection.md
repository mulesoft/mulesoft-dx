---
page_title: "anypoint_api_policy_injection_protection Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Injection Protection policy on an Anypoint API instance.
---

# anypoint_api_policy_injection_protection (Resource)

Manages a Injection Protection policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_injection_protection" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    protect_path_and_query = true
    protect_headers        = true
    protect_body           = true
    reject_requests        = true
    built_in_protections   = ["sql-injection", "script-injection"]
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

Optional:

- `built_in_protections` (Dynamic) Array of built-in injection protection types to enable.
- `custom_protections` (Dynamic) Array of custom injection protection regex patterns.
- `protect_body` (Boolean) Whether to apply injection protection to the request body.
- `protect_headers` (Boolean) Whether to apply injection protection to headers.
- `protect_path_and_query` (Boolean) Whether to apply injection protection to path and query parameters.
- `reject_requests` (Boolean) Whether to reject requests that match injection patterns.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_injection_protection.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
