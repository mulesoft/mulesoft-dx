---
page_title: "anypoint_secret_group_certificate_pinsets Data Source - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Lists all certificate pinsets within a secret group.
---

# anypoint_secret_group_certificate_pinsets (Data Source)

Lists all certificate pinsets within a secret group.

## Example Usage

```terraform
data "anypoint_secret_group_certificate_pinsets" "pinsets" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  secret_group_id = var.secret_group_id
}

output "pinset_names" {
  value = [for p in data.anypoint_secret_group_certificate_pinsets.pinsets.certificate_pinsets : p.name]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `secret_group_id` (String) The secret group ID.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider organization.

### Read-Only

- `certificate_pinsets` (List of Object) List of certificate pinsets. See [`certificate_pinsets`](#nestedschema--certificate_pinsets) below.

<a id="nestedschema--certificate_pinsets"></a>
### Nested Schema for `certificate_pinsets`

Read-Only:

- `id` (String) The certificate pinset ID.
- `name` (String) The name of the certificate pinset.
- `expiration_date` (String) The expiration date of the certificate pinset.
- `algorithm` (String) The algorithm used by the certificate pinset.
