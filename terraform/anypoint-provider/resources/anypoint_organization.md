---
page_title: "anypoint_organization Resource - terraform-provider-anypoint"
subcategory: "Access Management"
description: |-
  Creates and manages an Anypoint Platform organization (business group).
---

# anypoint_organization (Resource)

Creates and manages an Anypoint Platform organization (business group).

~> **Note:** This is an Access Management resource and requires the **admin provider** (`anypoint.admin`), which uses admin user credentials along with the `client_id` and `client_secret` of a connected app to authenticate on behalf of the user (`auth_type = "user"`). You must set `provider = anypoint.admin` on this resource. The default provider (connected app credentials only) does not have sufficient privileges for Access Management operations.

## Entitlement State Behaviour

The provider honours **user-defined state** for entitlements, not Platform defaults.

- If you declare an entitlement field in your Terraform config, the provider manages it: any Platform-side change will be reverted on the next `apply`.
- If you **omit** an entitlement field, the provider treats it as unmanaged. Platform-side updates to that field are not reflected in the plan and will not be reverted.
- Master-org-only entitlements (`hybrid`, `omni_gateway`, `service_mesh`, `worker_logging_override`, `runtime_fabric`, `design_center`) are inherited on sub-orgs and **cannot** be set via this resource on a business group. They are stripped from API requests to prevent HTTP 403 errors.

> **In short:** only declare entitlement fields you want Terraform to own. Leave everything else out of your config.

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

resource "anypoint_organization" "example" {
  provider = anypoint.admin

  name                   = "my-sub-org"
  parent_organization_id = "parent-org-id"
  owner_id               = "owner-user-id"

  entitlements = {
    create_sub_orgs     = false
    create_environments = true
    global_deployment   = false

    vcores_production = {
      assigned = 0
    }

    vcores_sandbox = {
      assigned = 0
    }

    vcores_design = {
      assigned = 0
    }

    vpcs = {
      assigned = 0
    }

    network_connections = {
      assigned = 0
    }

    managed_gateway_small = {
      assigned = 0
    }

    managed_gateway_large = {
      assigned = 0
    }
  }
}
```

## Schema

### Required

- `name` (String) The name of the organization.
- `owner_id` (String) The ID of the organization owner. Changing this forces a new resource.
- `parent_organization_id` (String) The ID of the parent organization. Changing this forces a new resource.

### Optional

- `entitlements` (Block) Entitlements for the organization. Only declared fields are managed by Terraform — omitted fields are left to the Platform. See [below for nested schema](#nestedschema--entitlements) and the [Entitlement State Behaviour](#entitlement-state-behaviour) section above.

### Read-Only

- `id` (String) The unique identifier for the organization.
- `client_id` (String) The client ID associated with the organization.
- `created_at` (String) The creation timestamp of the organization.
- `deleted_at` (String) The deletion timestamp of the organization.
- `domain` (String) The domain of the organization.
- `environments` (Block List) The environments within the organization. See [below for nested schema](#nestedschema--environments).
- `gdot_id` (String) The GDOT ID of the organization.
- `idprovider_id` (String) The ID provider ID for the organization.
- `is_automatic_admin_promotion_exempt` (Boolean) Whether the organization is exempt from automatic admin promotion.
- `is_federated` (Boolean) Whether the organization is federated.
- `is_master` (Boolean) Whether the organization is a master organization.
- `is_root` (Boolean) Whether the organization is a root organization.
- `mfa_required` (String) Whether MFA is required for the organization.
- `org_type` (String) The type of the organization.
- `parent_organization_ids` (List of String) List of parent organization IDs (ancestor chain).
- `session_timeout` (Number) The session timeout for the organization.
- `sub_organization_ids` (List of String) List of sub-organization IDs.
- `subscription` (Block) The subscription details for the organization. See [below for nested schema](#nestedschema--subscription).
- `tenant_organization_ids` (List of String) List of tenant organization IDs.
- `updated_at` (String) The last update timestamp of the organization.

<a id="nestedschema--entitlements"></a>
### Nested Schema for `entitlements`

Only the fields you declare are managed by Terraform. Fields you omit are not tracked and will not be reverted if the Platform changes them.

Optional:

- `create_environments` (Boolean) Whether environments can be created. Defaults to `false`.
- `create_sub_orgs` (Boolean) Whether sub-organizations can be created. Defaults to `false`.
- `global_deployment` (Boolean) Whether global deployment is enabled. Defaults to `false`.
- `design_center` (Block) Design Center entitlement. **Master-org-only** — ignored on business groups. See [below for nested schema](#nestedschema--entitlements--design_center).
- `omni_gateway` (Block) Omni Gateway entitlement. **Master-org-only** — ignored on business groups. See [below for nested schema](#nestedschema--entitlements--enabled_entitlement).
- `gateways` (Block) Gateways entitlement. See [below for nested schema](#nestedschema--entitlements--assigned_entitlement).
- `hybrid` (Block) Hybrid entitlement. **Master-org-only** — ignored on business groups. See [below for nested schema](#nestedschema--entitlements--enabled_entitlement).
- `load_balancer` (Block) Load balancer entitlement. See [below for nested schema](#nestedschema--entitlements--assigned_entitlement).
- `managed_gateway_large` (Block) Managed Gateway (large) entitlement. See [below for nested schema](#nestedschema--entitlements--assigned_entitlement).
- `managed_gateway_small` (Block) Managed Gateway (small) entitlement. See [below for nested schema](#nestedschema--entitlements--assigned_entitlement).
- `mq_messages` (Block) MQ messages entitlement. See [below for nested schema](#nestedschema--entitlements--mq_entitlement).
- `mq_requests` (Block) MQ requests entitlement. See [below for nested schema](#nestedschema--entitlements--mq_entitlement).
- `network_connections` (Block) Network connections entitlement. See [below for nested schema](#nestedschema--entitlements--vcore_entitlement).
- `runtime_fabric` (Boolean) Whether Runtime Fabric is enabled. **Master-org-only** — ignored on business groups.
- `service_mesh` (Block) Service Mesh entitlement. **Master-org-only** — ignored on business groups. See [below for nested schema](#nestedschema--entitlements--enabled_entitlement).
- `vcores_design` (Block) Design vCore entitlement. See [below for nested schema](#nestedschema--entitlements--vcore_entitlement).
- `vcores_production` (Block) Production vCore entitlement. See [below for nested schema](#nestedschema--entitlements--vcore_entitlement).
- `vcores_sandbox` (Block) Sandbox vCore entitlement. See [below for nested schema](#nestedschema--entitlements--vcore_entitlement).
- `vpcs` (Block) VPC entitlement. See [below for nested schema](#nestedschema--entitlements--vcore_entitlement).
- `worker_logging_override` (Block) Worker logging override entitlement. **Master-org-only** — ignored on business groups. See [below for nested schema](#nestedschema--entitlements--enabled_entitlement).

> **Note:** `static_ips` and `vpns` entitlements are managed server-side by Anypoint and are not settable via Terraform. Configure them through the Anypoint UI or API.

<a id="nestedschema--entitlements--vcore_entitlement"></a>
### Nested Schema for `vcores_production` / `vcores_sandbox` / `vcores_design` / `vpcs` / `network_connections`

Optional:

- `assigned` (Number) The number of assigned units. Defaults to `0`.
- `reassigned` (Number) The number of reassigned units. Defaults to `0`.

<a id="nestedschema--entitlements--enabled_entitlement"></a>
### Nested Schema for `hybrid` / `omni_gateway` / `worker_logging_override` / `service_mesh`

Optional:

- `enabled` (Boolean) Whether this feature is enabled.

<a id="nestedschema--entitlements--assigned_entitlement"></a>
### Nested Schema for `gateways` / `load_balancer` / `managed_gateway_small` / `managed_gateway_large`

Optional:

- `assigned` (Number) The number of assigned units.

<a id="nestedschema--entitlements--mq_entitlement"></a>
### Nested Schema for `mq_messages` / `mq_requests`

Optional:

- `add_on` (Number) The add-on number of MQ units. Defaults to `0`.
- `base` (Number) The base number of MQ units. Defaults to `0`.

<a id="nestedschema--entitlements--design_center"></a>
### Nested Schema for `design_center`

Optional:

- `api` (Boolean) Whether API Designer is enabled.
- `mozart` (Boolean) Whether Flow Designer (Mozart) is enabled.

<a id="nestedschema--subscription"></a>
### Nested Schema for `subscription`

Read-Only:

- `category` (String) The subscription category.
- `expiration` (String) The subscription expiration date.
- `type` (String) The subscription type.

Optional:

- `justification` (String) The subscription justification.

<a id="nestedschema--environments"></a>
### Nested Schema for `environments`

~> **Note:** When a new organization is created, Anypoint Platform automatically provisions two environments: **Sandbox** and **Production**. These appear in the `environments` read-only attribute after the first apply and do not need to be declared in your configuration.

Read-Only:

- `client_id` (String) The environment client ID.
- `id` (String) The environment ID.
- `is_production` (Boolean) Whether the environment is a production environment.
- `name` (String) The environment name.
- `organization_id` (String) The organization ID.
- `type` (String) The environment type.

Optional:

- `arc_namespace` (String) The ARC namespace of the environment.

## Import

Existing Anypoint organizations can be imported using their organization ID:

```shell
terraform import anypoint_organization.example_org 00000000-0000-0000-0000-000000000000
```

Your HCL must declare `name`, `parent_organization_id`, and `owner_id` before you import — those are Required attributes on the resource. The first `terraform plan` after import refreshes all Read-Only and Optional attributes (including entitlements) from the Anypoint API.

`parent_organization_id` is derived from the server-returned ancestor chain (`parent_organization_ids`) on the first refresh. If the derivation doesn't match what you wrote in HCL, update the HCL to match — changing `parent_organization_id` triggers a destroy+recreate because it has the `RequiresReplace` plan modifier.
