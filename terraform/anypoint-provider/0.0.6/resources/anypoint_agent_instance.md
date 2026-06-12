---
page_title: "anypoint_agent_instance Resource - terraform-provider-anypoint"
subcategory: "Agents Tools"
description: |-
  Manages an Agent instance in Anypoint API Manager. An Agent instance represents an Agent specification deployed to a Omni Gateway target with routing rules and upstream backends.
---

# anypoint_agent_instance (Resource)

Manages an Agent instance in Anypoint API Manager. An Agent instance represents an Agent specification deployed to a Omni Gateway target with routing rules and upstream backends.

-> **Status after create:** After a successful `terraform apply` the `status` field is populated from a GET request made immediately after the POST. The Platform typically returns `status = "active"` right away. If your Gateway is not yet ready the provider retries the POST up to 5 times with a 20-second backoff before failing.

-> **upstream_uri vs routing:** `upstream_uri` and `routing` are mutually exclusive. Use `upstream_uri` for a single upstream — the provider expands it to `[{upstreams: [{weight: 100, uri: <value>}]}]` automatically. Only one upstream per route is supported; multi-upstream weighted routing is not available for Agent instances.

## Example Usage

### Basic Agent Instance with upstream_uri

```terraform
resource "anypoint_agent_instance" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  technology      = "omniGateway"
  instance_label  = "customer-support-agent"

  spec = {
    asset_id = "my-agent-spec"
    group_id = var.organization_id
    version  = "1.0.0"
  }

  endpoint = {
    deployment_type = "HY"
    base_path       = "agent/support"
  }

  gateway_id   = var.gateway_id
  upstream_uri = "http://agent-service.internal:8080"
}
```

### Agent Instance with explicit routing

```terraform
resource "anypoint_agent_instance" "advanced" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  technology      = "omniGateway"
  instance_label  = "sales-agent"

  spec = {
    asset_id = "my-agent-spec"
    group_id = var.organization_id
    version  = "1.0.0"
  }

  endpoint = {
    deployment_type = "HY"
    base_path       = "agent/sales"
  }

  gateway_id = var.gateway_id

  routing = [
    {
      upstreams = [
        {
          weight = 100
          uri    = "http://sales-agent.internal:8080"
        }
      ]
    }
  ]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID where the Agent instance will be created.
- `spec` (Block) The Exchange asset specification backing this Agent instance. See [`spec`](#nestedschema--spec) below.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `technology` (String) The gateway technology. Valid values: `omniGateway`, `mule4`, `serviceMesh`. Defaults to `omniGateway`.
- `provider_id` (String) The identity provider ID for the Agent.
- `instance_label` (String) A human-readable label for this Agent instance.
- `approval_method` (String) Client approval method. Valid values: `manual`, `automatic`. Defaults to null (no approval required).
- `endpoint` (Block) Endpoint / proxy configuration for the Agent instance. See [`endpoint`](#nestedschema--endpoint) below.
- `consumer_endpoint` (String) Consumer-facing endpoint URI (the public URL clients use to reach the Agent). Maps to top-level endpointUri in the Agent.
- `upstream_uri` (String) Shorthand for a single-upstream routing configuration. When set, the provider constructs routing as `[{upstreams: [{weight: 100, uri: <value>}]}]`. Mutually exclusive with the `routing` block.
- `gateway_id` (String) The Omni Gateway UUID. When provided, the deployment block is auto-populated by fetching gateway details (target_id, target_name, gateway_version) from the Gateway Manager Agent. Mutually exclusive with specifying a full deployment block.
- `deployment` (Block) Deployment target configuration. Auto-populated when gateway_id is set. See [`deployment`](#nestedschema--deployment) below.
- `routing` (Block List) Routing rules with weighted upstream backends. See [`routing`](#nestedschema--routing) below.

### Read-Only

- `id` (String) The numeric identifier of the Agent instance (stored as string for Terraform compatibility).
- `status` (String) The current status of the Agent instance.
- `asset_id` (String) The Exchange asset ID (computed from Agent response).
- `asset_version` (String) The Exchange asset version (computed from Agent response).
- `product_version` (String) The product version (computed from Agent response).

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
- `type` (String) Endpoint protocol type. For agent instances, this is `a2a` (Agent-to-Agent). Defaults to `a2a`.
- `base_path` (String) Agent base path for Omni Gateway (e.g. `my-agent`). The provider constructs the full proxy URI as `http://0.0.0.0:8081/<base_path>`. Required when technology=`omniGateway`. Mutually exclusive with `uri`.
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

- `upstreams` (Block List) Weighted upstream backends for this route. See [`routing.upstreams`](#nestedschema--routing--upstreams) below.

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

- `uri` (String) The upstream backend URI.

Optional:

- `weight` (Number) Traffic weight percentage (0-100). Weights across upstreams should sum to 100. Defaults to `100`.
- `label` (String) A label for this upstream.
- `tls_context_id` (String) TLS context for upstream connections. Format: `secretGroupId/tlsContextId`.
