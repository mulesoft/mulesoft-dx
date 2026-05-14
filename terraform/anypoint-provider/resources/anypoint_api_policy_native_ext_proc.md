---
page_title: "anypoint_api_policy_native_ext_proc Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Native External Processing policy on an Anypoint API instance.
---

# anypoint_api_policy_native_ext_proc (Resource)

Manages a Native External Processing policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_native_ext_proc" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    uri                  = "grpc://ext-proc-service:9091"
    message_timeout      = 5000
    failure_mode_allow   = false
    request_header_mode  = "SEND"
    response_header_mode = "SKIP"
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

Required:

- `uri` (String) The URI of the external service.

Optional:

- `allow_mode_override` (Boolean) Whether to allow the external processor to override the processing mode.
- `failure_mode_allow` (Boolean) Whether to allow requests when the external processor fails.
- `max_message_timeout` (Number) Maximum message processing timeout in milliseconds.
- `message_timeout` (Number) Message processing timeout in milliseconds.
- `request_body_mode` (String) Processing mode for the request body.
- `request_header_mode` (String) Processing mode for request headers (e.g. `SEND`, `SKIP`).
- `request_trailer_mode` (String) Processing mode for request trailers.
- `response_body_mode` (String) Processing mode for the response body.
- `response_header_mode` (String) Processing mode for response headers (e.g. `SEND`, `SKIP`).
- `response_trailer_mode` (String) Processing mode for response trailers.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_native_ext_proc.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
