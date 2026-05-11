---
page_title: "anypoint_api_instance_sla_tier Resource - terraform-provider-anypoint"
subcategory: "API Management"
description: |-
  Manages an SLA tier for an API instance in Anypoint API Manager.
---

# anypoint_api_instance_sla_tier (Resource)

Manages an SLA tier for an API instance in Anypoint API Manager.

## Example Usage

```terraform
resource "anypoint_api_instance_sla_tier" "gold" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  api_instance_id = var.api_instance_id

  name        = "Gold"
  description = "Gold tier with high volume limits for premium customers"
  auto_approve = true
  status       = "ACTIVE"

  limits = [
    {
      time_period_in_milliseconds = 60000
      maximum_requests            = 1000
      visible                     = true
    },
    {
      time_period_in_milliseconds = 3600000
      maximum_requests            = 50000
      visible                     = true
    }
  ]
}
```

## Schema

### Required

- `environment_id` (String) Environment ID where the API instance lives.
- `api_instance_id` (String) Numeric ID of the API instance.
- `name` (String) Name of the SLA tier.
- `limits` (Block List) Rate limits for this SLA tier. See [below for nested schema](#nestedschema--limits).

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `description` (String) Description of the SLA tier.
- `auto_approve` (Boolean) Whether requests for this SLA tier are auto-approved. Defaults to `false`.
- `status` (String) Status of the SLA tier. Valid values: `ACTIVE`, `INACTIVE`.

### Read-Only

- `id` (String) Unique identifier of the SLA tier.

<a id="nestedschema--limits"></a>
### Nested Schema for `limits`

Required:

- `time_period_in_milliseconds` (Number) Time period for the rate limit in milliseconds.
- `maximum_requests` (Number) Maximum number of requests allowed in the time period.

Optional:

- `visible` (Boolean) Whether this limit is visible to API consumers. Defaults to `true`.

## Import

Import is supported using the following format:

```shell
terraform import anypoint_api_instance_sla_tier.example organization_id/environment_id/api_instance_id/tier_id
```
