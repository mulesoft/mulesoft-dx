---
page_title: "anypoint_private_space_upgrade Data Source - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Retrieves upgrade status information for a CloudHub 2.0 private space.
---

# anypoint_private_space_upgrade (Data Source)

Retrieves upgrade status information for a CloudHub 2.0 private space.

## Example Usage

```terraform
data "anypoint_private_space_upgrade" "status" {
  private_space_id = var.private_space_id
  organization_id  = var.organization_id
}

output "upgrade_status" {
  value = data.anypoint_private_space_upgrade.status.status
}
```

## Schema

### Required

- `private_space_id` (String) The ID of the private space to get upgrade status for.

### Optional

- `organization_id` (String) The organization ID where the private space is located. If not specified, uses the organization from provider credentials.

### Read-Only

- `id` (String) Identifier for this data source.
- `scheduled_update_time` (String) The scheduled update time for the upgrade.
- `status` (String) The current status of the upgrade (e.g., `QUEUED`, `IN_PROGRESS`, `COMPLETED`).
