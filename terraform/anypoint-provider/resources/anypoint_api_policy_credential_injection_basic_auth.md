---
page_title: "anypoint_api_policy_credential_injection_basic_auth Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Credential Injection Basic Auth policy on an Anypoint API instance.
---

# anypoint_api_policy_credential_injection_basic_auth (Resource)

Manages a Credential Injection Basic Auth policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_credential_injection_basic_auth" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    username  = "service-account"
    password  = "service-password"
    overwrite = true
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

- `password` (String) The password for authentication.
- `username` (String) The username for authentication.

Optional:

- `custom_header` (String) Custom header name to use for injecting credentials instead of the standard `Authorization` header.
- `overwrite` (Boolean) Whether to overwrite an existing credential header on the request. Defaults to `false`. The provider always sends this field — omitting it does not cause HTTP 400.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_credential_injection_basic_auth.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
