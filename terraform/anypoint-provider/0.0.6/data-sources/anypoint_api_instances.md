---
page_title: "anypoint_api_instances Data Source - terraform-provider-anypoint"
subcategory: "API Management"
description: |-
  Lists all API instances registered in API Manager for the given environment.
---

# anypoint_api_instances (Data Source)

Lists all API instances registered in API Manager for the given environment.

## Example Usage

```terraform
data "anypoint_api_instances" "all" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
}

output "api_instance_ids" {
  value = [for inst in data.anypoint_api_instances.all.instances : inst.id]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID to list API instances from.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider credentials organization.

### Read-Only

- `id` (String) Composite identifier: `<organization_id>/<environment_id>`.
- `instances` (List of Object) List of API instances. See [`instances`](#nestedschema--instances) below.

<a id="nestedschema--instances"></a>
### Nested Schema for `instances`

Read-Only:

- `id` (String) The numeric ID of the API instance.
- `asset_id` (String) The Exchange asset ID.
- `asset_version` (String) The Exchange asset version.
- `product_version` (String) The product version.
- `group_id` (String) The Exchange group (organization) ID.
- `technology` (String) The gateway technology (e.g., `omniGateway`, `mule4`).
- `instance_label` (String) The label of the API instance.
- `status` (String) The current status of the API instance.
- `endpoint_uri` (String) The endpoint URI for the API instance.
- `autodiscovery_instance_name` (String) The autodiscovery instance name.
