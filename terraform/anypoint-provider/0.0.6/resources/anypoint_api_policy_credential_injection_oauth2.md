---
page_title: "anypoint_api_policy_credential_injection_oauth2 Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Credential Injection OAuth2 policy on an Anypoint API instance.
---

# anypoint_api_policy_credential_injection_oauth2 (Resource)

Manages a Credential Injection OAuth2 policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_credential_injection_oauth2" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    oauth_service                    = "https://auth.example.com/oauth2/token"
    client_id                        = "my-client-id"
    client_secret                    = "my-client-secret"
    scope                            = ["read", "write"]
    overwrite                        = true
    token_fetch_timeout              = 5000
    allow_request_without_credential = false
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

- `oauth_service` (String) URL of the OAuth 2.0 token service.
- `client_id` (String) The OAuth 2.0 client ID.
- `client_secret` (String) The OAuth 2.0 client secret.

Optional:

- `scope` (Dynamic) Array of OAuth 2.0 scopes.
- `token_fetch_timeout` (Number) Timeout in milliseconds for fetching the OAuth token. Defaults to `10000`. The provider always sends this field (defaulting to `10000`) — omitting it does not cause HTTP 400.
- `overwrite` (Boolean) Whether to overwrite an existing credential header on the request. Defaults to `false`. The provider always sends this field.
- `allow_request_without_credential` (Boolean) Whether to allow requests to pass through without injected credentials. Defaults to `false`. The provider always sends this field.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_credential_injection_oauth2.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
