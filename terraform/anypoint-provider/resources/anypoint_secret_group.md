---
page_title: "anypoint_secret_group Resource - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Manages a secret group in Anypoint Secrets Manager.
---

# anypoint_secret_group (Resource)

Manages a secret group in Anypoint Secrets Manager.

-> **Lifecycle note:** Deleting this resource also cascade-deletes all sub-resources on the Platform (keystores, truststores, certificates, shared secrets, TLS contexts, certificate pinsets). Sub-resource Terraform resources (`anypoint_secret_group_keystore`, etc.) must be declared as dependents — destroy them first in your config or Terraform will remove them from state automatically when the secret group is destroyed.

## Example Usage

```terraform
resource "anypoint_secret_group" "example" {
  environment_id = var.environment_id
  name           = "terraform-secrets"
  downloadable   = false
}
```

## Schema

### Required

- `environment_id` (String) Environment ID where the secret group is created.
- `name` (String) Name of the secret group.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `downloadable` (Boolean) Whether the secrets in this group can be downloaded. Defaults to `false`.

### Read-Only

- `id` (String) Unique identifier of the secret group.
- `current_state` (String) Current state of the secret group.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_secret_group.example organization_id/environment_id/secret_group_id
```
