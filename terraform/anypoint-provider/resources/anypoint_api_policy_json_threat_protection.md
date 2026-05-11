---
page_title: "anypoint_api_policy_json_threat_protection Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a JSON Threat Protection policy on an Anypoint API instance.
---

# anypoint_api_policy_json_threat_protection (Resource)

Manages a JSON Threat Protection policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_json_threat_protection" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    max_container_depth          = 10
    max_string_value_length      = 256
    max_object_entry_name_length = 128
    max_object_entry_count       = 50
    max_array_element_count      = 50
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
- `asset_version` (String) The policy asset version. Defaults to `1.2.1`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Optional:

- `max_array_element_count` (Number) Maximum number of elements in a JSON array.
- `max_container_depth` (Number) Maximum nesting depth for JSON containers.
- `max_object_entry_count` (Number) Maximum number of entries in a JSON object.
- `max_object_entry_name_length` (Number) Maximum length for JSON object entry names.
- `max_string_value_length` (Number) Maximum length for JSON string values.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_json_threat_protection.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
