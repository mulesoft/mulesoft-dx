---
page_title: "anypoint_tls_context Data Source - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Fetches information about a CloudHub 2.0 TLS context.
---

# anypoint_tls_context (Data Source)

Fetches information about a CloudHub 2.0 TLS context.

## Example Usage

```terraform
data "anypoint_tls_context" "example" {
  id               = var.tls_context_id
  private_space_id = var.private_space_id
  organization_id  = var.organization_id
}

output "tls_context_name" {
  value = data.anypoint_tls_context.example.name
}
```

## Schema

### Required

- `id` (String) The unique identifier for the TLS context.
- `private_space_id` (String) The private space ID where the TLS context is located.

### Optional

- `organization_id` (String) The organization ID where the private space is located. If not specified, uses the organization from provider credentials.

### Read-Only

- `name` (String) The name of the TLS context.
- `type` (String) The type of the TLS context.
- `ciphers` (Object) Cipher configuration for the TLS context. See [`ciphers`](#nestedschema--ciphers) below.
- `trust_store` (Object) Trust store information. See [`trust_store`](#nestedschema--trust_store) below.
- `key_store` (Object) Key store information. See [`key_store`](#nestedschema--key_store) below.

<a id="nestedschema--ciphers"></a>
### Nested Schema for `ciphers`

Read-Only:

- `aes128_gcm_sha256` (Boolean) AES128-GCM-SHA256 cipher status.
- `aes128_sha256` (Boolean) AES128-SHA256 cipher status.
- `aes256_gcm_sha384` (Boolean) AES256-GCM-SHA384 cipher status.
- `aes256_sha256` (Boolean) AES256-SHA256 cipher status.
- `dhe_rsa_aes128_sha256` (Boolean) DHE-RSA-AES128-SHA256 cipher status.
- `dhe_rsa_aes256_gcm_sha384` (Boolean) DHE-RSA-AES256-GCM-SHA384 cipher status.
- `dhe_rsa_aes256_sha256` (Boolean) DHE-RSA-AES256-SHA256 cipher status.
- `ecdhe_ecdsa_aes128_gcm_sha256` (Boolean) ECDHE-ECDSA-AES128-GCM-SHA256 cipher status.
- `ecdhe_ecdsa_aes256_gcm_sha384` (Boolean) ECDHE-ECDSA-AES256-GCM-SHA384 cipher status.
- `ecdhe_rsa_aes128_gcm_sha256` (Boolean) ECDHE-RSA-AES128-GCM-SHA256 cipher status.
- `ecdhe_rsa_aes256_gcm_sha384` (Boolean) ECDHE-RSA-AES256-GCM-SHA384 cipher status.
- `ecdhe_ecdsa_chacha20_poly1305` (Boolean) ECDHE-ECDSA-CHACHA20-POLY1305 cipher status.
- `ecdhe_rsa_chacha20_poly1305` (Boolean) ECDHE-RSA-CHACHA20-POLY1305 cipher status.
- `dhe_rsa_chacha20_poly1305` (Boolean) DHE-RSA-CHACHA20-POLY1305 cipher status.
- `tls_aes256_gcm_sha384` (Boolean) TLS-AES256-GCM-SHA384 cipher status.
- `tls_chacha20_poly1305_sha256` (Boolean) TLS-CHACHA20-POLY1305-SHA256 cipher status.
- `tls_aes128_gcm_sha256` (Boolean) TLS-AES128-GCM-SHA256 cipher status.

<a id="nestedschema--trust_store"></a>
### Nested Schema for `trust_store`

Read-Only:

- `filename` (String) Trust store filename.
- `expiration_date` (String) Trust store expiration date.
- `type` (String) Trust store type.

<a id="nestedschema--key_store"></a>
### Nested Schema for `key_store`

Read-Only:

- `filename` (String) Key store filename.
- `type` (String) Key store type.
- `cn` (String) Common name from the certificate.
- `san` (List of String) Subject alternative names.
- `expiration_date` (String) Key store expiration date.
