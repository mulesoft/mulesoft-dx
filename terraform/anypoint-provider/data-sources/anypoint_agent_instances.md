---
page_title: "anypoint_agent_instances Data Source - terraform-provider-anypoint"
subcategory: "Agents Tools"
description: |-
  Lists all agent instances registered in API Manager for the given environment.
---

# anypoint_agent_instances (Data Source)

Lists all agent instances registered in API Manager for the given environment.

## Example Usage

```terraform
data "anypoint_agent_instances" "all" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
}

output "instance_ids" {
  value = [for inst in data.anypoint_agent_instances.all.instances : inst.id]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID to list agent instances from.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider credentials organization.

### Read-Only

- `id` (String) Composite identifier: `<organization_id>/<environment_id>`.
- `instances` (List of Object) List of agent instances. See [`instances`](#nestedschema--instances) below.

<a id="nestedschema--instances"></a>
### Nested Schema for `instances`

Read-Only:

- `id` (String) The numeric ID of the agent instance.
- `asset_id` (String) The Exchange asset ID.
- `asset_version` (String) The Exchange asset version.
- `product_version` (String) The product version.
- `group_id` (String) The Exchange group (organization) ID.
- `technology` (String) The gateway technology (e.g., `omniGateway`, `mule4`).
- `instance_label` (String) The label of the agent instance.
- `status` (String) The current status of the agent instance.
- `endpoint_uri` (String) The endpoint URI for the agent instance.
- `autodiscovery_instance_name` (String) The autodiscovery instance name.
