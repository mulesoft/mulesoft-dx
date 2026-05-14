---
page_title: "anypoint_api_policy_xml_threat_protection Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a XML Threat Protection policy on an Anypoint API instance. This policy is only supported on mule4 API instances.
---

# anypoint_api_policy_xml_threat_protection (Resource)

Manages a XML Threat Protection policy on an Anypoint API instance. This policy is only supported on mule4 API instances.

## Example Usage

```terraform
resource "anypoint_api_policy_xml_threat_protection" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    max_node_depth                  = 10
    max_attribute_count_per_element = 10
    max_child_count                 = 50
    max_text_length                 = 256
    max_attribute_length            = 128
    max_comment_length              = 128
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

- `max_attribute_count_per_element` (Number) Maximum number of attributes per XML element.
- `max_attribute_length` (Number) Maximum length for XML attribute values.
- `max_child_count` (Number) Maximum number of child elements per XML node.
- `max_comment_length` (Number) Maximum length for XML comments.
- `max_node_depth` (Number) Maximum XML node nesting depth.
- `max_text_length` (Number) Maximum length for XML text nodes.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_xml_threat_protection.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
