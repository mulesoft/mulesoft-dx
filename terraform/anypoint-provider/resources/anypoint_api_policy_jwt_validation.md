---
page_title: "anypoint_api_policy_jwt_validation Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a JWT Validation policy on an Anypoint API instance.
---

# anypoint_api_policy_jwt_validation (Resource)

Manages a JWT Validation policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_jwt_validation" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    jwt_origin                = "httpBearerAuthenticationHeader"
    signing_method            = "rsa"
    signing_key_length        = 256
    jwt_key_origin            = "jwks"
    jwks_url                  = "https://example.com/.well-known/jwks.json"
    skip_client_id_validation = true
    validate_aud_claim        = true
    mandatory_exp_claim       = true
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
- `asset_version` (String) The policy asset version. Defaults to `0.12.0`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `jwt_origin` (String) Where the JWT token is extracted from (e.g. `httpBearerAuthenticationHeader`).

Optional:

- `claims_to_headers` (Dynamic) Array mapping JWT claims to response headers.
- `client_id_expression` (String) Expression to extract the client ID from the request.
- `custom_key_expression` (String) Custom expression to resolve the signing key.
- `jwks_service_connection_timeout` (Number) Connection timeout in milliseconds for JWKS endpoint.
- `jwks_service_time_to_live` (Number) TTL in seconds for cached JWKS keys.
- `jwks_url` (String) URL to the JWKS endpoint for key retrieval.
- `jwt_expression` (String) Custom expression to extract the JWT token.
- `jwt_key_origin` (String) Source of the signing key (e.g. `jwks`, `text`).
- `mandatory_aud_claim` (Boolean) Whether the `aud` claim is mandatory.
- `mandatory_custom_claims` (Dynamic) Array of custom claims that must be present.
- `mandatory_exp_claim` (Boolean) Whether the `exp` (expiration) claim is mandatory.
- `mandatory_nbf_claim` (Boolean) Whether the `nbf` (not before) claim is mandatory.
- `non_mandatory_custom_claims` (Dynamic) Array of optional custom claims to validate if present.
- `signing_key_length` (Number) The key length for the signing algorithm.
- `signing_method` (String) The signing algorithm (e.g. `rsa`, `hmac`).
- `skip_client_id_validation` (Boolean) Whether to skip client ID validation.
- `supported_audiences` (String) Comma-separated list of supported audience values.
- `text_key` (String) The inline signing key when `jwt_key_origin` is `text`.
- `validate_aud_claim` (Boolean) Whether to validate the `aud` (audience) claim.
- `validate_custom_claim` (Boolean) Whether to validate custom claims.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_jwt_validation.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
