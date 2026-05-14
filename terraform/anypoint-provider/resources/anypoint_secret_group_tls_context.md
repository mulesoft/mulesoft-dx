---
page_title: "anypoint_secret_group_tls_context Resource - terraform-provider-anypoint"
subcategory: "Secrets Management"
description: |-
  Manages a Omni Gateway TLS context within a secret group in Anypoint Secrets Manager.
---

# anypoint_secret_group_tls_context (Resource)

Manages a Omni Gateway TLS context within a secret group in Anypoint Secrets Manager. The target is automatically set to `OmniGateway`. References keystore and truststore resources by their IDs — the provider automatically builds the internal path references (`keystores/{id}`, `truststores/{id}`).

~> **Delete behaviour:** The Anypoint Secrets Manager API does not expose individual DELETE endpoints for sub-resources. `terraform destroy` removes this resource from Terraform state only — the TLS context is deleted on the Platform when the parent `anypoint_secret_group` is destroyed.

## Example Usage

### Basic TLS Context

```terraform
resource "anypoint_secret_group_tls_context" "example" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "omni-tls-context"

  keystore_id   = anypoint_secret_group_keystore.tls.id
  truststore_id = anypoint_secret_group_truststore.ca.id

  min_tls_version = "TLSv1.3"
  max_tls_version = "TLSv1.3"
  alpn_protocols  = ["h2", "http/1.1"]

  enable_client_cert_validation = false
  skip_server_cert_validation   = false
}
```

### mTLS-enabled TLS Context

```terraform
resource "anypoint_secret_group_tls_context" "mtls" {
  environment_id  = var.environment_id
  secret_group_id = anypoint_secret_group.main.id
  name            = "mtls-context"

  keystore_id   = anypoint_secret_group_keystore.tls.id
  truststore_id = anypoint_secret_group_truststore.ca.id

  min_tls_version = "TLSv1.3"
  max_tls_version = "TLSv1.3"
  alpn_protocols  = ["h2", "http/1.1"]

  enable_client_cert_validation = true
  skip_server_cert_validation   = false
}
```

## Schema

### Required

- `environment_id` (String) Environment ID.
- `secret_group_id` (String) Secret group ID that this TLS context belongs to.
- `name` (String) Name of the TLS context.

### Optional

- `organization_id` (String) The organization ID. If not provided, the organization ID will be inferred from the connected app credentials.
- `keystore_id` (String) ID of the keystore in the same secret group. Use `anypoint_secret_group_keystore.example.id` to reference it.
- `truststore_id` (String) ID of the truststore in the same secret group. Use `anypoint_secret_group_truststore.example.id` to reference it.
- `min_tls_version` (String) Minimum TLS version. Valid values: `TLSv1.1`, `TLSv1.2`, `TLSv1.3`. Defaults to `TLSv1.3`.
- `max_tls_version` (String) Maximum TLS version. Valid values: `TLSv1.1`, `TLSv1.2`, `TLSv1.3`. Defaults to `TLSv1.3`.
- `alpn_protocols` (List of String) ALPN protocol negotiation list. Valid element values: `h2`, `http/1.1`. Order determines preference: `["h2", "http/1.1"]` prefers H2, `["http/1.1", "h2"]` prefers HTTP/1.1.
- `cipher_suites` (List of String) Allowed cipher suites. Empty list means use defaults.
- `enable_client_cert_validation` (Boolean) Enable mutual TLS client certificate validation (inbound). Defaults to `false`.
- `skip_server_cert_validation` (Boolean) Skip server certificate validation (outbound). Defaults to `false`.

### Read-Only

- `id` (String) Unique identifier of the TLS context.
- `target` (String) Target runtime for the TLS context. Always `OmniGateway` for this resource.
- `expiration_date` (String) Expiration date of the TLS context.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_secret_group_tls_context.example organization_id/environment_id/secret_group_id/tls_context_id
```
