---
page_title: "anypoint_private_space_upgrade Resource - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Schedules an upgrade for a CloudHub 2.0 private space. Scheduled upgrades can be cancelled by deleting this resource.
---

# anypoint_private_space_upgrade (Resource)

Schedules an upgrade for a CloudHub 2.0 private space. Scheduled upgrades can be cancelled by deleting this resource.

## Example Usage

```terraform
resource "anypoint_private_space_upgrade" "example" {
  private_space_id = var.private_space_id
  organization_id  = var.organization_id
  date             = "2025-09-12"
  opt_in           = true
}
```

## Schema

### Required

- `private_space_id` (String) The ID of the private space to upgrade.
- `date` (String) The date when the upgrade should be scheduled (format: YYYY-MM-DD).
- `opt_in` (Boolean) Whether to opt in to the upgrade.

### Optional

- `organization_id` (String) The organization ID where the private space is located. If not provided, the organization ID will be inferred from the connected app credentials.

### Read-Only

- `id` (String) The unique identifier for the upgrade operation.
- `scheduled_update_time` (String) The scheduled update time returned by the API.
- `status` (String) The status of the upgrade operation.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_private_space_upgrade.example <private_space_id>:<date>:<opt_in>
```
