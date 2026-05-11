---
page_title: "anypoint_api_policy_dataweave_body_transformation Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a DataWeave Body Transformation policy on an Anypoint API instance.
---

# anypoint_api_policy_dataweave_body_transformation (Resource)

Manages a DataWeave Body Transformation policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_dataweave_body_transformation" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    script       = "%%dw 2.0\noutput application/json\n---\npayload"
    request_flow = "request"
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

- `script` (String) The DataWeave or transformation script.

Optional:

- `request_flow` (String) Which flow to apply the transformation to (`request` or `response`).

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_dataweave_body_transformation.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
