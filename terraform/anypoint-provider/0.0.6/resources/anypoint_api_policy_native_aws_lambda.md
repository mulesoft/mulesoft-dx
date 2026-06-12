---
page_title: "anypoint_api_policy_native_aws_lambda Resource - terraform-provider-anypoint"
subcategory: "API Policies"
description: |-
  Manages a Native AWS Lambda policy on an Anypoint API instance.
---

# anypoint_api_policy_native_aws_lambda (Resource)

Manages a Native AWS Lambda policy on an Anypoint API instance.

## Example Usage

```terraform
resource "anypoint_api_policy_native_aws_lambda" "example" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = anypoint_api_instance.example.id

  configuration = {
    arn                 = "arn:aws:lambda:us-east-1:123456789012:function:my-function"
    payload_passthrough = false
    invocation_mode     = "synchronous"
    authentication_mode = "static_credentials"
    credentials = {
      access_key_id     = "AKIAIOSFODNN7EXAMPLE"
      secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    }
  }

  upstream_ids = [anypoint_api_upstream.example.id]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `api_instance_id` (String) The API instance ID.
- `configuration` (Block) The policy configuration. See [Configuration](#nestedschema--configuration) below.
- `upstream_ids` (List of String) List of upstream IDs this policy applies to.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `label` (String) A human-readable label for this policy instance.
- `asset_version` (String) The policy asset version. Defaults to `1.0.1`.

### Read-Only

- `id` (String) The policy ID.
- `policy_template_id` (String) The policy template ID assigned by the server.

<a id="nestedschema--configuration"></a>
### Nested Schema for `configuration`

Required:

- `arn` (String) The ARN of the AWS Lambda function.
- `payload_passthrough` (Boolean) Whether to pass the request payload directly to Lambda.
- `invocation_mode` (String) Lambda invocation mode (`synchronous` or `asynchronous`).
- `authentication_mode` (String) AWS authentication mode (e.g. `static_credentials`, `iam_role`).

Optional:

- `credentials` (Dynamic) AWS credentials object with `access_key_id`, `secret_access_key`, and optional `session_token`.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_api_policy_native_aws_lambda.example {organization_id}/{environment_id}/{api_instance_id}/{policy_id}
```
