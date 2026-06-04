---
page_title: "anypoint_api_policy_native_ext_authz Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Native External Authorization policy on an Anypoint API instance.
---

# anypoint_api_policy_native_ext_authz (Resource)

Manages a Native External Authorization policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_native_ext_authz" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    uri             = "grpc://auth-service:9090"
    server_type     = "grpc"
    request_timeout = 5000
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
- `asset_version` (String) The policy asset version. Defaults to `1.2.1`.
- `disabled` (Boolean) Whether the policy is disabled. Defaults to `false`.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `server_type` (String) The server type (e.g. `grpc`, `http`).
- `uri` (String) The URI of the external service.

Optional:

- `allowed_headers` (Dynamic) Array of headers to forward to the external service.
- `include_peer_certificate` (Boolean) Whether to include the peer certificate in the authorization request.
- `path_prefix` (String) Path prefix for the external authorization request.
- `request_timeout` (Number) Request timeout in milliseconds.
- `server_api_version` (String) The API version of the external authorization server.
- `service_request_headers_to_add` (Dynamic) Array of headers to add to the authorization request.
- `service_response_client_headers` (Dynamic) Array of headers from the authorization response to send to the client.
- `service_response_client_headers_on_success` (Dynamic) Array of headers to send on successful authorization.
- `service_response_upstream_headers` (Dynamic) Array of headers from the authorization response to send upstream.
- `service_response_upstream_headers_to_append` (Dynamic) Array of headers from the authorization response to append upstream.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_native_ext_authz.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
