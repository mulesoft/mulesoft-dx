---
page_title: "anypoint_secret_group_certificates Data Source - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Lists all certificates within a secret group.
---

# anypoint_secret_group_certificates (Data Source)

Lists all certificates within a secret group.

## Example Usage

```terraform
data "anypoint_secret_group_certificates" "certs" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  secret_group_id = var.secret_group_id
}

output "certificate_names" {
  value = [for c in data.anypoint_secret_group_certificates.certs.certificates : c.name]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `secret_group_id` (String) The secret group ID.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider organization.

### Read-Only

- `certificates` (List of Object) List of certificates. See [`certificates`](#nestedschema--certificates) below.

<a id="nestedschema--certificates"></a>
### Nested Schema for `certificates`

Read-Only:

- `id` (String) The certificate ID.
- `name` (String) The name of the certificate.
- `type` (String) The certificate type (`PEM`, `JKS`, `PKCS12`, `JCEKS`).
- `expiration_date` (String) The expiration date of the certificate.
- `algorithm` (String) The algorithm used by the certificate.
