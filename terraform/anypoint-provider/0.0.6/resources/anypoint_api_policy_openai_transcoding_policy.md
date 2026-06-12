---
page_title: "anypoint_api_policy_openai_transcoding_policy Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a OpenAI Transcoding policy on an Anypoint API instance.
---

# anypoint_api_policy_openai_transcoding_policy (Resource)

Manages a OpenAI Transcoding policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_openai_transcoding_policy" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    api_key = "sk-xxxxxxxxxxxx"
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
- `asset_version` (String) The policy asset version. Defaults to `1.0.0`.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `api_key` (String) API key for the LLM provider.

Optional:

- `model_mapper` (Dynamic) Array of model name mappings.
- `timeout` (Number) Timeout value in milliseconds.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_openai_transcoding_policy.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
