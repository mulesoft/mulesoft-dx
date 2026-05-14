---
page_title: "anypoint_api_policy_external_oauth2_access_token_enforcement Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a External OAuth 2.0 Access Token Enforcement policy on an Anypoint API instance. This policy is only supported on mule4 API instances.
---

# anypoint_api_policy_external_oauth2_access_token_enforcement (Resource)

Manages a External OAuth 2.0 Access Token Enforcement policy on an Anypoint API instance. This policy is only supported on mule4 API instances.

## Example Usage

```terraform
resource "anypoint_api_policy_external_oauth2_access_token_enforcement" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    token_url                 = "https://auth.example.com/oauth2/token"
    scope_validation_criteria = "AND"
    scopes                    = "read write"
    expose_headers            = false
    skip_client_id_validation = true
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
- `asset_version` (String) The policy asset version. Defaults to `1.6.0`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `token_url` (String) URL of the OAuth 2.0 token endpoint.

Optional:

- `authentication_timeout` (Number) Authentication request timeout in milliseconds.
- `expose_headers` (Boolean) Whether to expose rate-limit headers in the response.
- `max_cache_entries` (Number) Maximum number of entries in the cache.
- `scope_validation_criteria` (String) How scopes are validated (`AND` or `OR`).
- `scopes` (String) Space-separated list of required OAuth scopes.
- `secure_trust_store` (Boolean) Whether to use a secure trust store for token validation.
- `skip_client_id_validation` (Boolean) Whether to skip client ID validation.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_external_oauth2_access_token_enforcement.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
