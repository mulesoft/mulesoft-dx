---
page_title: "anypoint_api_policy_http_caching Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a HTTP Caching policy on an Anypoint API instance.
---

# anypoint_api_policy_http_caching (Resource)

Manages a HTTP Caching policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_http_caching" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    http_caching_key       = "#[attributes.requestPath]"
    max_cache_entries      = 1000
    ttl                    = 600
    distributed            = false
    persist_cache          = false
    use_http_cache_headers = true
    invalidation_header    = "X-Cache-Invalidate"
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
- `asset_version` (String) The policy asset version. Defaults to `1.1.1`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Optional:

- `distributed` (Boolean) Whether the cache is distributed across the cluster.
- `http_caching_key` (String) Expression to compute the cache key.
- `invalidation_header` (String) Header name that triggers cache invalidation.
- `max_cache_entries` (Number) Maximum number of entries in the cache.
- `persist_cache` (Boolean) Whether to persist the cache to disk.
- `request_expression` (String) Expression to evaluate on the request for caching decisions.
- `response_expression` (String) Expression to evaluate on the response for caching decisions.
- `ttl` (Number) Time-to-live in seconds for cached entries.
- `use_http_cache_headers` (Boolean) Whether to honor standard HTTP caching headers.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_http_caching.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
