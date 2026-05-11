---
page_title: "anypoint_tls_context Resource - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Manages a CloudHub 2.0 TLS Context with support for both PEM and JKS keystores.
---

# anypoint_tls_context (Resource)

Manages a CloudHub 2.0 TLS Context with support for both PEM and JKS keystores.

## Example Usage

### PEM Keystore

```terraform
resource "anypoint_tls_context" "pem_example" {
  private_space_id     = "your-private-space-id"
  name                 = "example-pem-tls-context"
  keystore_type        = "PEM"

  certificate          = file("cert.pem")
  key                  = file("key.pem")
  key_filename         = "key.pem"
  certificate_filename = "cert.pem"

  ciphers = {
    aes128_gcm_sha256             = true
    aes128_sha256                 = false
    aes256_gcm_sha384             = false
    aes256_sha256                 = false
    dhe_rsa_aes128_sha256         = false
    dhe_rsa_aes256_gcm_sha384     = false
    dhe_rsa_aes256_sha256         = false
    ecdhe_ecdsa_aes128_gcm_sha256 = true
    ecdhe_ecdsa_aes256_gcm_sha384 = true
    ecdhe_rsa_aes128_gcm_sha256   = true
    ecdhe_rsa_aes256_gcm_sha384   = true
    ecdhe_ecdsa_chacha20_poly1305 = false
    ecdhe_rsa_chacha20_poly1305   = false
    dhe_rsa_chacha20_poly1305     = false
    tls_aes256_gcm_sha384         = true
    tls_chacha20_poly1305_sha256  = true
    tls_aes128_gcm_sha256         = true
  }
}
```

### JKS Keystore

```terraform
resource "anypoint_tls_context" "jks_example" {
  private_space_id  = "your-private-space-id"
  name              = "example-jks-tls-context"
  keystore_type     = "JKS"

  keystore_base64   = var.jks_keystore_base64
  store_passphrase  = var.jks_store_passphrase
  key_passphrase    = var.jks_key_passphrase
  alias             = "my-alias"
  keystore_filename = "keystore.jks"

  ciphers = {
    aes128_gcm_sha256             = false
    aes128_sha256                 = false
    aes256_gcm_sha384             = true
    aes256_sha256                 = false
    dhe_rsa_aes128_sha256         = false
    dhe_rsa_aes256_gcm_sha384     = false
    dhe_rsa_aes256_sha256         = false
    ecdhe_ecdsa_aes128_gcm_sha256 = false
    ecdhe_ecdsa_aes256_gcm_sha384 = true
    ecdhe_rsa_aes128_gcm_sha256   = false
    ecdhe_rsa_aes256_gcm_sha384   = true
    ecdhe_ecdsa_chacha20_poly1305 = false
    ecdhe_rsa_chacha20_poly1305   = false
    dhe_rsa_chacha20_poly1305     = false
    tls_aes256_gcm_sha384         = true
    tls_chacha20_poly1305_sha256  = false
    tls_aes128_gcm_sha256         = false
  }
}
```

## Schema

### Required

- `private_space_id` (String) The ID of the private space this TLS context belongs to.
- `name` (String) The name of the TLS context.
- `keystore_type` (String) The type of keystore: 'PEM' or 'JKS'.
- `ciphers` (Block) Cipher configuration for the TLS context. See [below for nested schema](#nestedschema--ciphers).

### Optional

- `organization_id` (String) The organization ID where the private space is located. If not provided, the organization ID will be inferred from the connected app credentials.
- `certificate` (String, Sensitive) PEM certificate content (required for PEM keystore).
- `key` (String, Sensitive) PEM private key content (required for PEM keystore).
- `key_filename` (String) Filename for the private key (PEM keystore).
- `certificate_filename` (String) Filename for the certificate (PEM keystore).
- `keystore_base64` (String, Sensitive) Base64 encoded JKS keystore content (required for JKS keystore).
- `store_passphrase` (String, Sensitive) Store passphrase for JKS keystore (required for JKS keystore).
- `alias` (String) Alias for JKS keystore (required for JKS keystore).
- `keystore_filename` (String) Filename for the JKS keystore (required for JKS keystore).
- `key_passphrase` (String, Sensitive) Passphrase for the private key.

### Read-Only

- `id` (String) The unique identifier for the TLS context.
- `type` (String) The type of TLS context.
- `trust_store` (Block) Trust store information. See [below for nested schema](#nestedschema--trust_store).
- `key_store` (Block) Key store information. See [below for nested schema](#nestedschema--key_store).

<a id="nestedschema--ciphers"></a>
### Nested Schema for `ciphers`

Optional:

- `aes128_gcm_sha256` (Boolean) Enable AES128-GCM-SHA256 cipher. Defaults to `false`.
- `aes128_sha256` (Boolean) Enable AES128-SHA256 cipher. Defaults to `false`.
- `aes256_gcm_sha384` (Boolean) Enable AES256-GCM-SHA384 cipher. Defaults to `false`.
- `aes256_sha256` (Boolean) Enable AES256-SHA256 cipher. Defaults to `false`.
- `dhe_rsa_aes128_sha256` (Boolean) Enable DHE-RSA-AES128-SHA256 cipher. Defaults to `false`.
- `dhe_rsa_aes256_gcm_sha384` (Boolean) Enable DHE-RSA-AES256-GCM-SHA384 cipher. Defaults to `false`.
- `dhe_rsa_aes256_sha256` (Boolean) Enable DHE-RSA-AES256-SHA256 cipher. Defaults to `false`.
- `ecdhe_ecdsa_aes128_gcm_sha256` (Boolean) Enable ECDHE-ECDSA-AES128-GCM-SHA256 cipher. Defaults to `false`.
- `ecdhe_ecdsa_aes256_gcm_sha384` (Boolean) Enable ECDHE-ECDSA-AES256-GCM-SHA384 cipher. Defaults to `false`.
- `ecdhe_rsa_aes128_gcm_sha256` (Boolean) Enable ECDHE-RSA-AES128-GCM-SHA256 cipher. Defaults to `false`.
- `ecdhe_rsa_aes256_gcm_sha384` (Boolean) Enable ECDHE-RSA-AES256-GCM-SHA384 cipher. Defaults to `false`.
- `ecdhe_ecdsa_chacha20_poly1305` (Boolean) Enable ECDHE-ECDSA-CHACHA20-POLY1305 cipher. Defaults to `false`.
- `ecdhe_rsa_chacha20_poly1305` (Boolean) Enable ECDHE-RSA-CHACHA20-POLY1305 cipher. Defaults to `false`.
- `dhe_rsa_chacha20_poly1305` (Boolean) Enable DHE-RSA-CHACHA20-POLY1305 cipher. Defaults to `false`.
- `tls_aes256_gcm_sha384` (Boolean) Enable TLS-AES256-GCM-SHA384 cipher. Defaults to `false`.
- `tls_chacha20_poly1305_sha256` (Boolean) Enable TLS-CHACHA20-POLY1305-SHA256 cipher. Defaults to `false`.
- `tls_aes128_gcm_sha256` (Boolean) Enable TLS-AES128-GCM-SHA256 cipher. Defaults to `false`.

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

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_tls_context.example <private_space_id>:<tls_context_id>
```
