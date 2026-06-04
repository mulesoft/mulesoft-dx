---
page_title: "anypoint_secret_group_tls_contexts Data Source - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Lists all TLS contexts within a secret group.
---

# anypoint_secret_group_tls_contexts (Data Source)

Lists all TLS contexts within a secret group.

## Example Usage

```terraform
data "anypoint_secret_group_tls_contexts" "tls" {
  organization_id = var.organization_id
  environment_id  = var.environment_id
  secret_group_id = var.secret_group_id
}

output "tls_context_ids" {
  value = [for t in data.anypoint_secret_group_tls_contexts.tls.tls_contexts : t.id]
}
```

## Schema

### Required

- `environment_id` (String) The environment ID.
- `secret_group_id` (String) The secret group ID.

### Optional

- `organization_id` (String) The organization ID. Defaults to the provider organization.

### Read-Only

- `tls_contexts` (List of Object) List of TLS contexts. See [`tls_contexts`](#nestedschema--tls_contexts) below.

<a id="nestedschema--tls_contexts"></a>
### Nested Schema for `tls_contexts`

Read-Only:

- `id` (String) The TLS context ID.
- `name` (String) The name of the TLS context.
- `target` (String) The target (e.g., `OmniGateway`).
- `min_tls_version` (String) Minimum TLS version.
- `max_tls_version` (String) Maximum TLS version.
- `expiration_date` (String) The expiration date of the TLS context.
- `enable_client_cert_validation` (Boolean) Whether client certificate validation is enabled.
- `skip_server_cert_validation` (Boolean) Whether server certificate validation is skipped.
- `alpn_protocols` (String) Comma-separated list of ALPN protocols.
- `cipher_suites` (String) Comma-separated list of cipher suites.
