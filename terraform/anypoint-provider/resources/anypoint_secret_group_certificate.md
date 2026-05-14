---
page_title: "anypoint_secret_group_certificate Resource - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Manages a certificate within a secret group in Anypoint Secrets Manager. Supports PEM, JKS, PKCS12, and JCEKS formats.
---

# anypoint_secret_group_certificate (Resource)

Manages a certificate within a secret group in Anypoint Secrets Manager. Supports PEM, JKS, PKCS12, and JCEKS formats.

~> **Delete behaviour:** The Anypoint Secrets Manager API does not expose individual DELETE endpoints for sub-resources. `terraform destroy` removes this resource from Terraform state only — the certificate is deleted on the Platform when the parent `anypoint_secret_group` is destroyed.

## Example Usage

```terraform
resource "anypoint_secret_group_certificate" "example" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "my-certificate"
  type            = "PEM"

  certificate_base64 = base64encode(file("${path.module}/certs/cert.pem"))
}
```

## Schema

### Required

- `environment_id` (String) Environment ID.
- `secret_group_id` (String) Secret group ID that this certificate belongs to.
- `name` (String) Name of the certificate.
- `certificate_base64` (String, Sensitive) Base64-encoded certificate file content. For PEM: `base64encode(file("cert.pem"))`. For binary: `filebase64("cert.der")`.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `type` (String) Certificate format: `PEM`, `JKS`, `PKCS12`, or `JCEKS`. Defaults to `PEM`.

### Read-Only

- `id` (String) Unique identifier of the certificate.
- `expiration_date` (String) Expiration date of the certificate.
- `algorithm` (String) Signature algorithm of the certificate.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_secret_group_certificate.example organization_id/environment_id/secret_group_id/certificate_id
```
