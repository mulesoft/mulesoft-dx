---
page_title: "anypoint_private_space_association Resource - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Creates and manages associations between a CloudHub 2.0 private space and environments.
---

# anypoint_private_space_association (Resource)

Creates and manages associations between a CloudHub 2.0 private space and environments.

## Example Usage

```terraform
resource "anypoint_private_space_association" "example" {
  private_space_id = var.private_space_id

  associations = [
    {
      organization_id = "080f1918-0096-4cac-85b5-b1cd9cdf9260"
      environment     = "all"
    }
  ]
}
```

## Schema

### Required

- `private_space_id` (String) The ID of the private space.
- `associations` (Block List) List of associations to create between the private space and environments. See [below for nested schema](#nestedschema--associations).

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.

### Read-Only

- `id` (String) The unique identifier for the Private Space Association resource.
- `created_associations` (Block List) List of created associations with their IDs. See [below for nested schema](#nestedschema--created_associations).

<a id="nestedschema--associations"></a>
### Nested Schema for `associations`

Required:

- `organization_id` (String) The organization ID for the association.
- `environment` (String) The environment for the association. Can be an environment UUID, 'all', 'production', or 'sandbox'.

<a id="nestedschema--created_associations"></a>
### Nested Schema for `created_associations`

Read-Only:

- `id` (String) The ID of the created association.
- `organization_id` (String) The organization ID of the association.
- `environment` (String) The environment of the association.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_private_space_association.example <private_space_id>
```
