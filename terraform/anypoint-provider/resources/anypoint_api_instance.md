---
page_title: "anypoint_api_instance Resource - terraform-provider-anypoint"
subcategory: "API Management"
description: |-
  Manages an API instance in Anypoint API Manager. An API instance represents an API specification deployed to a Omni Gateway target with routing rules and upstream backends.
---

# anypoint_api_instance (Resource)

Manages an API instance in Anypoint API Manager. An API instance represents an API specification deployed to a Omni Gateway target with routing rules and upstream backends.

## Example Usage

### Minimal configuration using `upstream_uri` shorthand

```terraform
resource "anypoint_api_instance" "minimal" {
  environment_id = var.environment_id
  gateway_id     = var.gateway_id
  instance_label = "minimal-demo"
  upstream_uri   = "http://backend.internal:8080"

  spec = {
    asset_id = "my-api"
    group_id = var.organization_id
    version  = "1.0.0"
  }

  endpoint = {
    base_path = "minimal"
  }
}
```

### Weighted multi-upstream routing (canary / blue-green)

```terraform
resource "anypoint_api_instance" "weighted_routing" {
  environment_id = var.environment_id
  gateway_id     = var.gateway_id
  instance_label = "weighted-routing-demo"

  spec = {
    asset_id = "my-api"
    group_id = var.organization_id
    version  = "1.0.0"
  }

  endpoint = {
    base_path = "weightedRouting"
  }

  routing = [
    {
      label = "canary"
      upstreams = [
        {
          weight = 90
          uri    = "http://backend-stable.internal:8080"
          label  = "stable"
        },
        {
          weight = 10
          uri    = "http://backend-canary.internal:8080"
          label  = "canary"
        }
      ]
    }
  ]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID where the API instance will be created.
- `spec` (Block) The Exchange asset specification backing this API instance. See [below for nested schema](#nestedschema--spec).

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `technology` (String) The gateway technology. Valid values: `omniGateway`, `mule4`, `serviceMesh`. Defaults to `omniGateway`.
- `provider_id` (String) The identity provider ID for the API.
- `instance_label` (String) A human-readable label for this API instance.
- `approval_method` (String) Client approval method. Valid values: `manual`, `automatic`. Defaults to null (no approval required).
- `consumer_endpoint` (String) Consumer-facing endpoint URI (the public URL clients use to reach the API). Maps to top-level endpointUri in the API.
- `upstream_uri` (String) Shorthand for a single-upstream routing configuration. When set, the provider constructs routing as `[{upstreams: [{weight: 100, uri: <value>}]}]`. Mutually exclusive with the `routing` block.
- `gateway_id` (String) The Omni Gateway UUID. When provided, the deployment block is auto-populated by fetching gateway details (target_id, target_name, gateway_version) from the Gateway Manager API. Mutually exclusive with specifying a full deployment block.
- `endpoint` (Block) Endpoint / proxy configuration for the API instance. See [below for nested schema](#nestedschema--endpoint).
- `deployment` (Block) Deployment target configuration. Auto-populated when gateway_id is set. See [below for nested schema](#nestedschema--deployment).
- `routing` (Block List) Routing rules with weighted upstream backends. See [below for nested schema](#nestedschema--routing).

### Read-Only

- `id` (String) The numeric identifier of the API instance (stored as string for Terraform compatibility).
- `status` (String) The current status of the API instance.
- `asset_id` (String) The Exchange asset ID (computed from API response).
- `asset_version` (String) The Exchange asset version (computed from API response).
- `product_version` (String) The product version (computed from API response).

<a id="nestedschema--spec"></a>
### Nested Schema for `spec`

Required:

- `asset_id` (String) The Exchange asset ID.
- `group_id` (String) The Exchange group (organization) ID.
- `version` (String) The asset version.

<a id="nestedschema--endpoint"></a>
### Nested Schema for `endpoint`

Optional:

- `deployment_type` (String) Deployment type. Valid values: `HY` (hybrid), `CH` (CloudHub), `CH2`, `RF` (Runtime Fabric). Defaults to `HY`.
- `type` (String) Endpoint protocol type. Valid values: `http`, `rest`, `raml`. Defaults to `http`.
- `base_path` (String) API base path for OmniGateway (e.g. 'my-api'). The provider constructs the full proxy URI as `http://0.0.0.0:8081/<base_path>`. Required when technology='omniGateway'. Mutually exclusive with `uri`.
- `uri` (String) Direct implementation URI for Mule4 or other technologies (e.g. 'http://www.google.com'). Required when technology='mule4'. Mutually exclusive with `base_path`.
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
- `rules` (Block) Match conditions for this route (methods, path, headers). See [below for nested schema](#nestedschema--routing--rules).

Required:

- `upstreams` (Block List) Weighted upstream backends for this route. See [below for nested schema](#nestedschema--routing--upstreams).

<a id="nestedschema--routing--rules"></a>
### Nested Schema for `routing.rules`

Optional:

- `methods` (String) Pipe-separated HTTP methods (e.g. 'GET', 'POST|PUT').
- `path` (String) URL path pattern to match (e.g. '/api/*').
- `host` (String) Host header value to match.
- `headers` (Map) Header key-value pairs to match.

<a id="nestedschema--routing--upstreams"></a>
### Nested Schema for `routing.upstreams`

Required:

- `uri` (String) The upstream backend URI.

Optional:

- `weight` (Number) Traffic weight percentage (0-100). Weights across upstreams should sum to 100. Defaults to `100`.
- `label` (String) A label for this upstream.
- `tls_context_id` (String) TLS context for upstream connections. Format: 'secretGroupId/tlsContextId'.
