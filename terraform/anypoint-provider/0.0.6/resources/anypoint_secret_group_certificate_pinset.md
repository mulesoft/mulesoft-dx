---
page_title: "anypoint_secret_group_certificate_pinset Resource - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Manages a certificate pinset within a secret group in Anypoint Secrets Manager. A certificate pinset is used for certificate pinning validation.
---

# anypoint_secret_group_certificate_pinset (Resource)

Manages a certificate pinset within a secret group in Anypoint Secrets Manager. A certificate pinset is used for certificate pinning validation.

~> **Delete behaviour:** The Anypoint Secrets Manager API does not expose individual DELETE endpoints for sub-resources. `terraform destroy` removes this resource from Terraform state only — the certificate pinset is deleted on the Platform when the parent `anypoint_secret_group` is destroyed.

## Example Usage

```terraform
resource "anypoint_secret_group_certificate_pinset" "example" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "my-cert-pinset"

  certificate_pinset_base64 = base64encode(file("${path.module}/certs/cert.pem"))
}
```

## Schema

### Required

- `environment_id` (String) Environment ID.
- `secret_group_id` (String) Secret group ID that this certificate pinset belongs to.
- `name` (String) Name of the certificate pinset.
- `certificate_pinset_base64` (String, Sensitive) Base64-encoded certificate file for pinning. For PEM: `base64encode(file("cert.pem"))`.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.

### Read-Only

- `id` (String) Unique identifier of the certificate pinset.
- `expiration_date` (String) Expiration date of the pinned certificate.
- `algorithm` (String) Signature algorithm of the pinned certificate.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_secret_group_certificate_pinset.example organization_id/environment_id/secret_group_id/certificate_pinset_id
```
