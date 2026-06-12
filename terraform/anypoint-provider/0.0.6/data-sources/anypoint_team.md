---
page_title: "anypoint_team Data Source - terraform-provider-anypoint"
subcategory: "Access Management"
description: |-
  Fetches information about an Anypoint Platform team.
---

# anypoint_team (Data Source)

Fetches information about an Anypoint Platform team.

## Example Usage

```terraform
data "anypoint_team" "ops" {
  id              = "team-uuid-here"
  organization_id = var.organization_id
}

output "team_name" {
  value = data.anypoint_team.ops.name
}
```

## Schema

### Required

- `id` (String) The unique identifier for the team.

### Optional

- `organization_id` (String) The organization ID where the team is located. If not specified, uses the organization from provider credentials.

### Read-Only

- `name` (String) The name of the team.
- `parent_team_id` (String) The parent team ID.
- `team_type` (String) The type of the team.
- `created_date` (String) The creation date of the team.
- `updated_date` (String) The last update date of the team.
- `member_count` (Number) The number of members in the team.
- `created_at` (String) The timestamp when the team was created.
- `updated_at` (String) The timestamp when the team was last updated.
