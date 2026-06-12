---
page_title: "anypoint_secret_group_keystores Data Source - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Lists all keystores within a secret group.
---

# anypoint_secret_group_keystores (Data Source)

Lists all keystores within a secret group.

## Example Usage

```terraform
data "anypoint_secret_group_keystores" "ks" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  secret_group_id = var.secret_group_id
}

output "keystore_names" {
  value = [for k in data.anypoint_secret_group_keystores.ks.keystores : k.name]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `secret_group_id` (String) The secret group ID.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider organization.

### Read-Only

- `keystores` (List of Object) List of keystores. See [`keystores`](#nestedschema--keystores) below.

<a id="nestedschema--keystores"></a>
### Nested Schema for `keystores`

Read-Only:

- `id` (String) The keystore ID.
- `name` (String) The name of the keystore.
- `type` (String) The keystore type (`PEM`, `JKS`, `PKCS12`, `JCEKS`).
- `expiration_date` (String) The expiration date of the keystore.
- `algorithm` (String) The algorithm used by the keystore.
