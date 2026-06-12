---
page_title: "anypoint_api_policy_credential_injection_oauth2_obo Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Credential Injection OAuth2 On-Behalf-Of policy on an Anypoint API instance.
---

# anypoint_api_policy_credential_injection_oauth2_obo (Resource)

Manages a Credential Injection OAuth2 On-Behalf-Of policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_credential_injection_oauth2_obo" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    flow           = "urn:ietf:params:oauth:grant-type:jwt-bearer"
    client_id      = "my-client-id"
    client_secret  = "my-client-secret"
    token_endpoint = "https://auth.example.com/oauth2/token"
    scope          = "openid profile"
    timeout        = 5000
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
- `asset_version` (String) The policy asset version. Defaults to `1.1.0`.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `client_id` (String) The OAuth 2.0 client ID.
- `client_secret` (String) The OAuth 2.0 client secret.
- `flow` (String) The OAuth 2.0 grant flow type.
- `token_endpoint` (String) URL of the OAuth 2.0 token endpoint.

Optional:

- `ciba_enabled` (Boolean) Whether CIBA (Client-Initiated Backchannel Authentication) is enabled.
- `scope` (String) Array or string of OAuth 2.0 scopes.
- `target_type` (String) The target resource type for on-behalf-of flow.
- `target_value` (String) The target resource value for on-behalf-of flow.
- `timeout` (Number) Timeout value in milliseconds.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_credential_injection_oauth2_obo.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
