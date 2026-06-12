---
page_title: "anypoint_secret_groups Data Source - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Lists all secret groups in a given environment.
---

# anypoint_secret_groups (Data Source)

Lists all secret groups in a given environment.

## Example Usage

```terraform
data "anypoint_secret_groups" "all" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
}

output "secret_group_ids" {
  value = [for sg in data.anypoint_secret_groups.all.secret_groups : sg.id]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider organization.

### Read-Only

- `secret_groups` (List of Object) List of secret groups. See [`secret_groups`](#nestedschema--secret_groups) below.

<a id="nestedschema--secret_groups"></a>
### Nested Schema for `secret_groups`

Read-Only:

- `id` (String) The secret group ID.
- `name` (String) The name of the secret group.
- `downloadable` (Boolean) Whether the secret group is downloadable.
- `current_state` (String) The current state of the secret group (e.g., `Clear`).
