---
page_title: "anypoint_environment Resource - terraform-provider-anypoint"
subcategory: "Access Management"
description: |-
  Manages an Anypoint Platform environment.
---

# anypoint_environment (Resource)

Manages an Anypoint Platform environment.

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

resource "anypoint_environment" "example" {
  provider = anypoint.admin
  name            = "my-sandbox-env"
  type            = "sandbox"
  is_production   = false
  organization_id = "your-org-id"
}
```

## Schema

### Required

- `name` (String) The name of the environment.

### Optional

- `arc_namespace` (String) The ARC namespace for the environment.
- `client_id` (String) The client ID associated with the environment.
- `is_production` (Boolean) Whether this is a production environment. Defaults to `false`.
- `organization_id` (String) The organization ID where the environment will be created. If not provided, the organization ID will be inferred from the connected app credentials.
- `type` (String) The type of the environment (e.g., 'design', 'sandbox', 'production'). Defaults to `"sandbox"`.

### Read-Only

- `id` (String) The unique identifier for the environment.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_environment.example <environment_id>
```
