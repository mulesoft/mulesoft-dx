---
page_title: "anypoint_api_policy_intask_authentication_policy Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a InTask Authentication policy on an Anypoint API instance.
---

# anypoint_api_policy_intask_authentication_policy (Resource)

Manages a InTask Authentication policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_intask_authentication_policy" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    secondary_auth_provider = "example-provider"
    authorization_endpoint  = "https://auth.example.com/authorize"
    token_endpoint          = "https://auth.example.com/token"
    redirect_uri            = "https://app.example.com/callback"
    scopes                  = "openid profile"
    response_type           = "code"
    token_timeout           = 3600
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
- `asset_version` (String) The policy asset version. Defaults to `1.0.0-20260113204639`.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `authorization_endpoint` (String) URL of the OAuth 2.0 authorization endpoint.
- `redirect_uri` (String) The redirect URI for the OAuth 2.0 flow.
- `secondary_auth_provider` (String) Name of the secondary authentication provider.
- `token_endpoint` (String) URL of the OAuth 2.0 token endpoint.

Optional:

- `body_encoding` (String) Encoding for the token request body.
- `challenge_response_status_code` (Number) HTTP status code for the challenge response.
- `code_challenge_method` (String) The PKCE code challenge method (e.g. `S256`).
- `response_type` (String) The OAuth 2.0 response type (e.g. `code`).
- `scopes` (String) Space-separated list of required OAuth scopes.
- `token_audience` (String) Expected audience value for the token.
- `token_timeout` (Number) Token validity timeout in seconds.
- `user_email_header` (String) Header name to extract the user email from.
- `user_id_header` (String) Header name to extract the user ID from.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_intask_authentication_policy.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
