---
page_title: "anypoint_api_upstreams Data Source - terraform-provider-anypoint"
subcategory: "API Management"
description: |-
  Lists all upstreams registered for an API instance in API Manager.
---

# anypoint_api_upstreams (Data Source)

Lists all upstreams registered for an API instance in API Manager.

## Example Usage

```terraform
data "anypoint_api_upstreams" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = "12345"
}

output "upstream_uris" {
  value = [for u in data.anypoint_api_upstreams.example.upstreams : u.uri]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID where the API instance lives.
- `api_instance_id` (String) The numeric ID of the API instance.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider credentials organization.

### Read-Only

- `id` (String) Composite identifier: `<organization_id>/<environment_id>/<api_instance_id>`.
- `total` (Number) Total number of upstreams returned.
- `upstreams` (List of Object) List of upstreams for the API instance. See [`upstreams`](#nestedschema--upstreams) below.

<a id="nestedschema--upstreams"></a>
### Nested Schema for `upstreams`

Read-Only:

- `id` (String) The upstream UUID.
- `label` (String) The upstream label (matches the label in the routing configuration).
- `uri` (String) The upstream URI.
