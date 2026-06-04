---
page_title: "anypoint_team Resource - terraform-provider-anypoint"
subcategory: "Access Management"
description: |-
  Manages an Anypoint Platform team.
---

# anypoint_team (Resource)

Manages an Anypoint Platform team.

~> **Note:** This is an Access Management resource and requires the **admin provider** (`anypoint.admin`), which uses admin user credentials along with the `client_id` and `client_secret` of a connected app to authenticate on behalf of the user (`auth_type = "user"`). You must set `provider = anypoint.admin` on this resource. The default provider (connected app credentials only) does not have sufficient privileges for Access Management operations.

## Example Usage

```terraform
# Admin provider – authenticates on behalf of a user using connected app credentials
provider "anypoint" {
  alias         = "admin"
  auth_type     = "user"
  client_id     = var.anypoint_admin_client_id
  client_secret = var.anypoint_admin_client_secret
  username      = var.anypoint_admin_username
  password      = var.anypoint_admin_password
  base_url      = var.anypoint_base_url
}

resource "anypoint_team" "example" {
  provider = anypoint.admin
  team_name      = "Development Team"
  parent_team_id = "root-team-id"
  team_type      = "internal"
}

resource "anypoint_team" "sub_team" {
  provider = anypoint.admin
  team_name      = "Frontend Team"
  parent_team_id = anypoint_team.example.id
  team_type      = "internal"
}
```

## Schema

### Required

- `parent_team_id` (String) The ID of the parent team.
- `team_name` (String) The name of the team.
- `team_type` (String) The type of the team.

### Optional

- `organization_id` (String) The organization ID where the team will be created. If not provided, the organization ID will be inferred from the connected app credentials.

### Read-Only

- `created_at` (String) The timestamp when the team was created.
- `id` (String) The unique identifier for the team.
- `updated_at` (String) The timestamp when the team was last updated.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_team.example <team_id>
```
