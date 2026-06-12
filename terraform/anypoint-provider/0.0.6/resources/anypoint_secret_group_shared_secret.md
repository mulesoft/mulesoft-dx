---
page_title: "anypoint_secret_group_shared_secret Resource - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Manages a shared secret within a secret group in Anypoint Secrets Manager. Supports four types: UsernamePassword, S3Credential, SymmetricKey, and Blob.
---

# anypoint_secret_group_shared_secret (Resource)

Manages a shared secret within a secret group in Anypoint Secrets Manager. Supports four types: UsernamePassword, S3Credential, SymmetricKey, and Blob. Provide the type-specific fields based on the chosen type.

~> **Delete behaviour:** The Anypoint Secrets Manager API does not expose individual DELETE endpoints for sub-resources. `terraform destroy` removes this resource from Terraform state only — the shared secret is deleted on the Platform when the parent `anypoint_secret_group` is destroyed.

## Example Usage

### UsernamePassword

```terraform
resource "anypoint_secret_group_shared_secret" "db_creds" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "db-credentials"
  type            = "UsernamePassword"

  username = "admin"
  password = var.db_password
}
```

### S3Credential

```terraform
resource "anypoint_secret_group_shared_secret" "s3" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "s3-backup-creds"
  type            = "S3Credential"

  access_key_id     = var.aws_access_key
  secret_access_key = var.aws_secret_key
  expiration_date   = "2026-12-31"
}
```

### SymmetricKey

```terraform
resource "anypoint_secret_group_shared_secret" "symmetric" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "encryption-key"
  type            = "SymmetricKey"

  key = base64encode("my-256-bit-secret-key-value-here")
}
```

### Blob

```terraform
resource "anypoint_secret_group_shared_secret" "blob" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "api-token"
  type            = "Blob"

  content = var.api_token
}
```

## Schema

### Required

- `environment_id` (String) Environment ID.
- `secret_group_id` (String) Secret group ID that this shared secret belongs to.
- `name` (String) Name of the shared secret.
- `type` (String) Type of shared secret: `UsernamePassword`, `S3Credential`, `SymmetricKey`, or `Blob`.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `expiration_date` (String) Optional expiration date (e.g. `2026-03-31`).
- `username` (String) Username (for UsernamePassword type).
- `password` (String, Sensitive) Password (for UsernamePassword type).
- `access_key_id` (String) AWS access key ID (for S3Credential type).
- `secret_access_key` (String, Sensitive) AWS secret access key (for S3Credential type).
- `key` (String, Sensitive) Base64-encoded symmetric key (for SymmetricKey type).
- `content` (String, Sensitive) Secret content string (for Blob type).

### Read-Only

- `id` (String) Unique identifier of the shared secret.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_secret_group_shared_secret.example organization_id/environment_id/secret_group_id/shared_secret_id
```
