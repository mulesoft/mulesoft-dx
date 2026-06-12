---
page_title: "anypoint_api_policy_cors Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a CORS policy on an Anypoint API instance.
---

# anypoint_api_policy_cors (Resource)

Manages a CORS policy on an Anypoint API instance.

## Example Usage

### Public resource (simple branch)

```terraform
resource "anypoint_api_policy_cors" "public" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    public_resource     = true
    support_credentials = false
    origin_groups = [
      {
        origins  = ["https://example.com"]
        methods  = ["GET", "POST", "PUT"]
        headers  = ["Content-Type", "Authorization"]
      }
    ]
  }

  order = 1
}
```

### Non-public resource (credentialed branch)

When `public_resource = false` the Platform enforces a stricter schema. Each origin group **must** include a `name` field and `access_control_max_age`. `methods` is mapped to `allowedMethods` objects (with `isAllowed: true`) automatically by the provider. Omitting any of these causes HTTP 400.

```terraform
resource "anypoint_api_policy_cors" "private" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    public_resource     = false
    support_credentials = true

    origin_groups = [
      {
        name                    = "allowed-origins"
        origins                 = ["https://example.com"]
        methods                 = ["GET", "POST", "PUT"]
        headers                 = ["Content-Type", "Authorization"]
        access_control_max_age  = 600
      }
    ]
  }

  order = 1
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `api_instance_id` (String) The API instance ID.
- `configuration` (Block) The policy configuration. See [Configuration](#nestedschema--configuration) below.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `label` (String) A human-readable label for this policy instance.
- `order` (Number) The order of policy execution.
- `asset_version` (String) The policy asset version. Defaults to `1.3.2`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `origin_groups` (Dynamic) Array of origin group configurations for CORS. Structure differs by branch — see below.

Optional:

- `public_resource` (Boolean) Whether the resource is publicly accessible. Defaults to `false`. Controls which Platform schema branch is used.
- `support_credentials` (Boolean) Whether to allow credentials in CORS requests.

#### `origin_groups` — public branch (`public_resource = true`)

Each element accepts:

| Field | Type | Description |
|---|---|---|
| `origins` | list(string) | Allowed origin URLs. |
| `methods` | list(string) | Allowed HTTP methods, e.g. `["GET","POST"]`. |
| `headers` | list(string) | Allowed request headers. |

#### `origin_groups` — non-public branch (`public_resource = false`)

Each element accepts:

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | **yes** | string | Unique label for this origin group. If omitted the provider synthesizes `group-<index>`. |
| `origins` | no | list(string) | Allowed origin URLs. |
| `methods` | no | list(string) | HTTP methods. The provider automatically converts these to `allowedMethods` objects (`[{"methodName":"GET","isAllowed":true}]`) required by the Platform. |
| `headers` | no | list(string) | Allowed request headers. |
| `access_control_max_age` | no | number | Preflight cache duration in seconds. Defaults to `30`. |

> **Note:** Using flat fields like `message` or `level` directly inside `configuration` will be rejected by the Platform with HTTP 400. Always use the `origin_groups` array.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_cors.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
