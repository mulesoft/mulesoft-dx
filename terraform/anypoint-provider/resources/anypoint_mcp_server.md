---
page_title: "anypoint_mcp_server Resource - terraform-provider-anypoint"
subcategory: "Agents Tools"
description: |-
  Manages an MCP server in Anypoint API Manager. An MCP server represents an MCP server specification deployed to a Omni Gateway target with routing rules and upstream backends.
---

# anypoint_mcp_server (Resource)

Manages an MCP server in Anypoint API Manager. An MCP server represents an MCP server specification deployed to a Omni Gateway target with routing rules and upstream backends.

-> **Status after create:** After a successful `terraform apply` the `status` field is populated from a GET request made immediately after the POST. The Platform typically returns `status = "active"` right away.

-> **upstream_uri vs routing:** `upstream_uri` and `routing` are mutually exclusive. Use `upstream_uri` for a single upstream. Only **one upstream per route** is supported for MCP servers — multi-upstream weighted routing is not available.

-> **upstream_id:** The computed `upstream_id` attribute is the server-assigned ID for the first upstream. Reference it in outbound policy `upstream_ids` to bind policies to this MCP server's upstream.

## Example Usage

### Basic MCP Server with upstream_uri

```terraform
resource "anypoint_mcp_server" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  technology      = "omniGateway"
  instance_label  = "atlassian-mcp-server"

  spec = {
    asset_id = "my-mcp-spec"
    group_id = var.organization_id
    version  = "1.0.0"
  }

  endpoint = {
    deployment_type = "HY"
    base_path       = "mcp1"
  }

  gateway_id   = var.gateway_id
  upstream_uri = "http://example.com"
}
```

### MCP Server with explicit routing

```terraform
resource "anypoint_mcp_server" "advanced" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  technology      = "omniGateway"
  instance_label  = "enterprise-tools-mcp"

  spec = {
    asset_id = "postman-mcp-server"
    group_id = var.organization_id
    version  = "1.0.0"
  }

  endpoint = {
    deployment_type = "HY"
    base_path       = "mcp-tools"
  }

  gateway_id = var.gateway_id

  routing = [
    {
      upstreams = [
        {
          weight = 100
          uri    = "http://mcp-tools.internal:8080"
        }
      ]
    }
  ]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID where the MCP server will be created.
- `spec` (Block) The Exchange asset specification backing this MCP server. See [`spec`](#nestedschema--spec) below.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `technology` (String) The gateway technology. Valid values: `omniGateway`, `mule4`, `serviceMesh`. Defaults to `omniGateway`.
- `provider_id` (String) The identity provider ID for the MCP server.
- `instance_label` (String) A human-readable label for this MCP server.
- `approval_method` (String) Client approval method. Valid values: `manual`, `automatic`. Defaults to null (no approval required).
- `endpoint` (Block) Endpoint / proxy configuration for the MCP server. See [`endpoint`](#nestedschema--endpoint) below.
- `consumer_endpoint` (String) Consumer-facing endpoint URI (the public URL clients use to reach the MCP server). Maps to top-level endpointUri in the MCP server. For MCP, this is the proxy_uri that clients connect to.
- `upstream_uri` (String) Shorthand for a single-upstream routing configuration. When set, the provider constructs routing as `[{upstreams: [{weight: 100, uri: <value>}]}]`. Mutually exclusive with the `routing` block. For MCP servers, this is typically the upstream MCP server URI that the proxy_uri forwards to.
- `gateway_id` (String) The Omni Gateway UUID. When provided, the deployment block is auto-populated by fetching gateway details (target_id, target_name, gateway_version) from the Gateway Manager MCP server. Mutually exclusive with specifying a full deployment block.
- `deployment` (Block) Deployment target configuration. Auto-populated when gateway_id is set. See [`deployment`](#nestedschema--deployment) below.
- `routing` (Block List) Routing rules with weighted upstream backends. For MCP servers, upstreams typically point to the actual MCP server implementation URIs. See [`routing`](#nestedschema--routing) below.

### Read-Only

- `id` (String) The numeric identifier of the MCP server (stored as string for Terraform compatibility).
- `status` (String) The current status of the MCP server.
- `asset_id` (String) The Exchange asset ID (computed from MCP server response).
- `asset_version` (String) The Exchange asset version (computed from MCP server response).
- `product_version` (String) The product version (computed from MCP server response).
- `upstream_id` (String) The server-assigned upstream ID for the first upstream. Populated automatically after creation. Use this to reference the upstream in outbound policy upstream_ids.

<a id="nestedschema--spec"></a>
### Nested Schema for `spec`

Required:

- `asset_id` (String) The Exchange asset ID.
- `group_id` (String) The Exchange group (organization) ID.
- `version` (String) The asset version.

<a id="nestedschema--endpoint"></a>
### Nested Schema for `endpoint`

Optional:

- `deployment_type` (String) Deployment type. Valid values: `HY` (hybrid), `CH` (CloudHub), `RF` (Runtime Fabric). Defaults to `HY`.
- `type` (String) Endpoint protocol type. For MCP servers, this is `mcp`. Defaults to `mcp`.
- `base_path` (String) MCP server base path for Omni Gateway (e.g. `my-mcp-server`). The provider constructs the full proxy URI as `http://0.0.0.0:8081/<base_path>`. Required when technology=`omniGateway`. Mutually exclusive with `uri`.
- `uri` (String) Direct implementation URI for Mule4 or other technologies (e.g. `http://www.google.com`). Required when technology=`mule4`. Mutually exclusive with `base_path`.
- `response_timeout` (Number) Response timeout in milliseconds.

<a id="nestedschema--deployment"></a>
### Nested Schema for `deployment`

Optional:

- `environment_id` (String) The environment ID for deployment (usually matches the top-level environment_id).
- `type` (String) Deployment type. Valid values: `HY`, `CH`, `RF`. Defaults to `HY`.
- `expected_status` (String) Expected deployment status. Valid values: `deployed`, `undeployed`. Defaults to `deployed`.
- `overwrite` (Boolean) Whether to overwrite an existing deployment.
- `target_id` (String) The target gateway ID to deploy to.
- `target_name` (String) The target gateway name.
- `gateway_version` (String) The Omni Gateway runtime version.

<a id="nestedschema--routing"></a>
### Nested Schema for `routing`

Optional:

- `label` (String) A label for this route.
- `rules` (Block) Match conditions for this route (methods, path, headers). See [`routing.rules`](#nestedschema--routing--rules) below.

Required:

- `upstreams` (Block List) Weighted upstream backends for this route. For MCP servers, these are the actual MCP server implementation endpoints. See [`routing.upstreams`](#nestedschema--routing--upstreams) below.

<a id="nestedschema--routing--rules"></a>
### Nested Schema for `routing.rules`

Optional:

- `methods` (String) Pipe-separated HTTP methods (e.g. `GET`, `POST|PUT`).
- `path` (String) URL path pattern to match (e.g. `/api/*`).
- `host` (String) Host header value to match.
- `headers` (Map) Header key-value pairs to match.

<a id="nestedschema--routing--upstreams"></a>
### Nested Schema for `routing.upstreams`

Required:

- `uri` (String) The upstream backend URI. For MCP servers, this is the actual MCP server implementation URI that requests are forwarded to.

Optional:

- `weight` (Number) Traffic weight percentage (0-100). Weights across upstreams should sum to 100. Defaults to `100`.
- `label` (String) A label for this upstream.
- `tls_context_id` (String) TLS context for upstream connections. Format: `secretGroupId/tlsContextId`.
