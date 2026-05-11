---
page_title: "anypoint_secret_group_truststores Data Source - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Lists all truststores within a secret group.
---

# anypoint_secret_group_truststores (Data Source)

Lists all truststores within a secret group.

## Example Usage

```terraform
data "anypoint_secret_group_truststores" "ts" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  secret_group_id = var.secret_group_id
}

output "truststore_names" {
  value = [for t in data.anypoint_secret_group_truststores.ts.truststores : t.name]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `secret_group_id` (String) The secret group ID.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider organization.

### Read-Only

- `truststores` (List of Object) List of truststores. See [`truststores`](#nestedschema--truststores) below.

<a id="nestedschema--truststores"></a>
### Nested Schema for `truststores`

Read-Only:

- `id` (String) The truststore ID.
- `name` (String) The name of the truststore.
- `type` (String) The truststore type (`PEM`, `JKS`, `PKCS12`, `JCEKS`).
- `expiration_date` (String) The expiration date of the truststore.
- `algorithm` (String) The algorithm used by the truststore.
