---
page_title: "anypoint_api_policy_semantic_routing_policy_huggingface Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Semantic Routing (HuggingFace) policy on an Anypoint API instance.
---

# anypoint_api_policy_semantic_routing_policy_huggingface (Resource)

Manages a Semantic Routing (HuggingFace) policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_semantic_routing_policy_huggingface" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    huggingface_url     = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2"
    huggingface_api_key = "hf_xxxxxxxxxxxx"
    timeout             = 5000
    routes = [
      {
        description = "Route for customer queries"
        upstream_id = "upstream-1"
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
- `asset_version` (String) The policy asset version. Defaults to `1.0.0-20260130095514`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `huggingface_api_key` (String) API key for the HuggingFace service.
- `huggingface_url` (String) URL of the HuggingFace inference API.
- `routes` (Dynamic) Array of routing rules.

Optional:

- `fallback_route` (Dynamic) Fallback route configuration when no semantic match is found.
- `threshold` (Dynamic) Threshold configuration object for similarity scoring.
- `timeout` (Number) Timeout value in milliseconds.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_semantic_routing_policy_huggingface.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
