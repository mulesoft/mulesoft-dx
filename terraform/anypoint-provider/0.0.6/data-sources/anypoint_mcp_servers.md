---
page_title: "anypoint_mcp_servers Data Source - terraform-provider-anypoint"
subcategory: "Agents Tools"
description: |-
  Lists all MCP servers registered in API Manager for the given environment.
---

# anypoint_mcp_servers (Data Source)

Lists all MCP servers registered in API Manager for the given environment.

## Example Usage

```terraform
data "anypoint_mcp_servers" "all" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
}

output "mcp_server_proxy_uris" {
  value = [for s in data.anypoint_mcp_servers.all.servers : s.proxy_uri]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID to list MCP servers from.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider credentials organization.

### Read-Only

- `id` (String) Composite identifier: `<organization_id>/<environment_id>`.
- `servers` (List of Object) List of MCP servers. See [`servers`](#nestedschema--servers) below.

<a id="nestedschema--servers"></a>
### Nested Schema for `servers`

Read-Only:

- `id` (String) The numeric ID of the MCP server.
- `asset_id` (String) The Exchange asset ID.
- `asset_version` (String) The Exchange asset version.
- `product_version` (String) The product version.
- `group_id` (String) The Exchange group (organization) ID.
- `technology` (String) The gateway technology (typically `omniGateway` for MCP).
- `instance_label` (String) The label of the MCP server.
- `status` (String) The current status of the MCP server.
- `endpoint_uri` (String) The endpoint URI for the MCP server.
- `proxy_uri` (String) The MCP proxy URI (e.g., `http://0.0.0.0:8081/mcp1`).
- `autodiscovery_instance_name` (String) The autodiscovery instance name.
