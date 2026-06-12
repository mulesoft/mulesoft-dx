---
page_title: "anypoint_private_space_associations Data Source - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Reads all private space associations for a given private space.
---

# anypoint_private_space_associations (Data Source)

Reads all private space associations for a given private space.

## Example Usage

```terraform
data "anypoint_private_space_associations" "ps" {
  private_space_id = var.private_space_id
  organization_id  = var.organization_id
}

output "associated_environments" {
  value = [for a in data.anypoint_private_space_associations.ps.associations : a.environment]
}
```

## Schema

### Required

- `private_space_id` (String) The ID of the private space to fetch associations for.

### Optional

- `organization_id` (String) The organization ID. If not provided, the provider's default organization will be used.

### Read-Only

- `id` (String) Identifier for the data source.
- `associations` (List of Object) List of associations for the private space. See [`associations`](#nestedschema--associations) below.

<a id="nestedschema--associations"></a>
### Nested Schema for `associations`

Read-Only:

- `id` (String) The ID of the association.
- `organization_id` (String) The organization ID of the association.
- `environment` (String) The environment of the association.
