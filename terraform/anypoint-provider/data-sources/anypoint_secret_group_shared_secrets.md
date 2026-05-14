---
page_title: "anypoint_secret_group_shared_secrets Data Source - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Lists all shared secrets within a secret group. Sensitive values are not returned by the API.
---

# anypoint_secret_group_shared_secrets (Data Source)

Lists all shared secrets within a secret group.

-> **Note:** Sensitive values (passwords, secret keys) are **not** returned by the Anypoint Platform API. Only metadata such as name, type, and expiration is available.

## Example Usage

```terraform
data "anypoint_secret_group_shared_secrets" "ss" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  secret_group_id = var.secret_group_id
}

output "shared_secret_names" {
  value = [for s in data.anypoint_secret_group_shared_secrets.ss.shared_secrets : s.name]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `secret_group_id` (String) The secret group ID.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider organization.

### Read-Only

- `shared_secrets` (List of Object) List of shared secrets. See [`shared_secrets`](#nestedschema--shared_secrets) below.

<a id="nestedschema--shared_secrets"></a>
### Nested Schema for `shared_secrets`

Read-Only:

- `id` (String) The shared secret ID.
- `name` (String) The name of the shared secret.
- `type` (String) The shared secret type (`UsernamePassword`, `S3Credential`, `SymmetricKey`, `Blob`).
- `expiration_date` (String) The expiration date of the shared secret.
- `username` (String) Username, returned only for `UsernamePassword` type.
- `access_key_id` (String) Access key ID, returned only for `S3Credential` type.
