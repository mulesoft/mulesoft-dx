---
page_title: "anypoint_managed_omni_gateways Data Source - terraform-provider-anypoint"
subcategory: "API Management"
description: |-
  Lists all managed Omni Gateway instances in the given environment.
---

# anypoint_managed_omni_gateways (Data Source)

Lists all managed Omni Gateway instances in the given environment.

## Example Usage

```terraform
data "anypoint_managed_omni_gateways" "all" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
}

output "gateway_names" {
  value = [for gw in data.anypoint_managed_omni_gateways.all.gateways : gw.name]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID to list gateways from.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider credentials organization.

### Read-Only

- `id` (String) Composite identifier: `<organization_id>/<environment_id>`.
- `gateways` (List of Object) List of managed Omni Gateway instances. See [`gateways`](#nestedschema--gateways) below.

<a id="nestedschema--gateways"></a>
### Nested Schema for `gateways`

Read-Only:

- `id` (String) The unique identifier of the gateway.
- `name` (String) The name of the gateway.
- `target_id` (String) The target (private space) ID the gateway is deployed to.
- `status` (String) The current status of the gateway (e.g., `APPLIED`, `RUNNING`).
- `date_created` (String) Timestamp when the gateway was created.
- `last_updated` (String) Timestamp of the last update to the gateway.
