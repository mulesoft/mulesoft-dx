---
page_title: "anypoint_secret_group_truststore Resource - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Manages a truststore within a secret group in Anypoint Secrets Manager. Supports PEM, JKS, PKCS12, and JCEKS formats.
---

# anypoint_secret_group_truststore (Resource)

Manages a truststore within a secret group in Anypoint Secrets Manager. Supports PEM, JKS, PKCS12, and JCEKS formats. Use `base64encode(file(...))` for PEM text files or `filebase64(...)` for binary JKS/PKCS12 files.

~> **Delete behaviour:** The Anypoint Secrets Manager API does not expose individual DELETE endpoints for sub-resources. `terraform destroy` removes this resource from Terraform state only — the truststore is deleted on the Platform when the parent `anypoint_secret_group` is destroyed.

## Example Usage

### PEM Truststore

```terraform
resource "anypoint_secret_group_truststore" "pem" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "ca-truststore"
  type            = "PEM"

  truststore_base64 = base64encode(file("${path.module}/certs/truststore.pem"))
}
```

### JKS Truststore

```terraform
resource "anypoint_secret_group_truststore" "jks" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "ca-truststore-jks"
  type            = "JKS"

  truststore_base64 = filebase64("${path.module}/certs/truststore.jks")
  passphrase        = var.jks_passphrase
}
```

## Schema

### Required

- `environment_id` (String) Environment ID.
- `secret_group_id` (String) Secret group ID that this truststore belongs to.
- `name` (String) Name of the truststore.
- `truststore_base64` (String, Sensitive) Base64-encoded truststore file content. For PEM: `base64encode(file("truststore.pem"))`. For JKS/PKCS12: `filebase64("truststore.jks")`.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `type` (String) Truststore format: `PEM`, `JKS`, `PKCS12`, or `JCEKS`. Defaults to `PEM`.
- `passphrase` (String, Sensitive) Passphrase for the truststore. Required for JKS, PKCS12, and JCEKS formats.

### Read-Only

- `id` (String) Unique identifier of the truststore.
- `expiration_date` (String) Expiration date of the certificate in the truststore.
- `algorithm` (String) Signature algorithm of the certificate.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_secret_group_truststore.example organization_id/environment_id/secret_group_id/truststore_id
```
