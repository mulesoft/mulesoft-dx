---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Secrets Manager

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `secrets-mgr` commands to automate your Secrets Manager processes. For more information
about how to use these commands, refer to the
[Secrets Manager documentation](../../anypoint-security/index-secrets-manager).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#secret-group-create">secrets-mgr:secret-group:create</a></p></div></div></td><td><div><div><p>Creates a new secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-group-delete">secrets-mgr:secret-group:delete</a></p></div></div></td><td><div><div><p>Deletes a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-group-describe">secrets-mgr:secret-group:describe</a></p></div></div></td><td><div><div><p>Shows details of a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-group-list">secrets-mgr:secret-group:list</a></p></div></div></td><td><div><div><p>Lists secret groups</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-group-modify">secrets-mgr:secret-group:modify</a></p></div></div></td><td><div><div><p>Modifies a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-shared-create">secrets-mgr:shared-secret:create</a></p></div></div></td><td><div><div><p>Creates a shared secret in a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-shared-describe">secrets-mgr:shared-secret:describe</a></p></div></div></td><td><div><div><p>Shows details of a shared secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-shared-list">secrets-mgr:shared-secret:list</a></p></div></div></td><td><div><div><p>Lists all shared secrets in a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-shared-modify">secrets-mgr:shared-secret:modify</a></p></div></div></td><td><div><div><p>Modifies a shared secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-shared-replace">secrets-mgr:shared-secret:replace</a></p></div></div></td><td><div><div><p>Replaces an existing shared secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-certificate-create">secrets-mgr:certificate:create</a></p></div></div></td><td><div><div><p>Creates a new certificate secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-certificate-describe">secrets-mgr:certificate:describe</a></p></div></div></td><td><div><div><p>Shows details of a certificate secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-certificate-list">secrets-mgr:certificate:list</a></p></div></div></td><td><div><div><p>Lists all certificate secrets in a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-certificate-modify">secrets-mgr:certificate:modify</a></p></div></div></td><td><div><div><p>Modifies a certificate secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-certificate-replace">secrets-mgr:certificate:replace</a></p></div></div></td><td><div><div><p>Replaces an existing certificate secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-keystore-create">secrets-mgr:keystore:create</a></p></div></div></td><td><div><div><p>Creates a new keystore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-keystore-describe">secrets-mgr:keystore:describe</a></p></div></div></td><td><div><div><p>Shows details of a keystore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-keystore-list">secrets-mgr:keystore:list</a></p></div></div></td><td><div><div><p>Lists all keystore secrets in a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-keystore-modify">secrets-mgr:keystore:modify</a></p></div></div></td><td><div><div><p>Modifies a keystore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-keystore-replace">secrets-mgr:keystore:replace</a></p></div></div></td><td><div><div><p>Replaces an existing keystore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-truststore-create">secrets-mgr:truststore:create</a></p></div></div></td><td><div><div><p>Creates a new truststore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-truststore-describe">secrets-mgr:truststore:describe</a></p></div></div></td><td><div><div><p>Shows details of a truststore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-truststore-list">secrets-mgr:truststore:list</a></p></div></div></td><td><div><div><p>Lists all truststore secrets in a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-truststore-modify">secrets-mgr:truststore:modify</a></p></div></div></td><td><div><div><p>Modifies a truststore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-truststore-replace">secrets-mgr:truststore:replace</a></p></div></div></td><td><div><div><p>Replaces an existing truststore secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-context-create">secrets-mgr:tls-context:mule:create</a></p></div></div></td><td><div><div><p>Creates a new Mule TLS context secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-context-describe">secrets-mgr:tls-context:mule:describe</a></p></div></div></td><td><div><div><p>Shows details of a Mule TLS context secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-context-list">secrets-mgr:tls-context:mule:list</a></p></div></div></td><td><div><div><p>Lists all Mule TLS context secrets in a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-context-modify">secrets-mgr:tls-context:mule:modify</a></p></div></div></td><td><div><div><p>Modifies a Mule TLS context secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-context-replace">secrets-mgr:tls-context:mule:replace</a></p></div></div></td><td><div><div><p>Replaces an existing Mule TLS context secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-flex-create">secrets-mgr:tls-context:flex-gateway:create</a></p></div></div></td><td><div><div><p>Creates a new Omni Gateway TLS context secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-flex-describe">secrets-mgr:tls-context:flex-gateway:describe</a></p></div></div></td><td><div><div><p>Shows details of a Omni Gateway TLS context secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-flex-list">secrets-mgr:tls-context:flex-gateway:list</a></p></div></div></td><td><div><div><p>Lists all Omni Gateway TLS context secrets in a secret group</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-flex-modify">secrets-mgr:tls-context:flex-gateway:modify</a></p></div></div></td><td><div><div><p>Modifies a Omni Gateway TLS context secret</p></div></div></td></tr><tr><td><div><div><p><a href="#secret-TLS-flex-replace">secrets-mgr:tls-context:flex-gatway:replace</a></p></div></div></td><td><div><div><p>Replaces an existing Omni Gateway TLS context secret</p></div></div></td></tr></tbody></table>

## secrets-mgr:secret-group:create

> secrets-mgr:secret-group:create [flags]

Creates a new secret group with the name specified by `--name`

Prompt the `--downloadable` flag if the secrets in this group are referenced in an API Manager
proxy.

This command accepts the [default flags](./#default-options).

## secrets-mgr:secret-group:delete

> secrets-mgr:secret-group:delete [flags]

Deletes the secret group specified by `--id`

> [!WARNING] This command does not prompt for confirmation before deleting.

This command accepts the [default flags](./#default-options).

## secrets-mgr:secret-group:describe

> secrets-mgr:secret-group:describe [flags]

Returns the details of a secret group specified by `--id`

This command accepts the [default flags](./#default-options).

## secrets-mgr:secret-group:list

> secrets-mgr:secret-group:list [flags]

Lists all your secret groups, including the name and ID

This command accepts the [default flags](./#default-options).

## secrets-mgr:secret-group:modify

> secrets-mgr:secret-group:modify [flags]

Modifies a secret group specified by `--id`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret group</p></div></div></td><td><div><div><p><code>--name TestSecretGroup</code></p></div></div></td></tr><tr><td><div><div><p><code>--downloadable</code></p></div></div></td><td><div><div><p>Secrets in this group are referenced in an API Manager proxy</p></div></div></td><td><div><div><p><code>--downloadable</code></p></div></div></td></tr><tr><td><div><div><p><code>--no-downloadable</code></p></div></div></td><td><div><div><p>Secrets in this group are not referenced in an API Manager proxy</p></div></div></td><td><div><div><p><code>--no-downloadable</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:shared-secret:create

> secrets-mgr:shared-secret:create [flags]

Creates a new shared secret in the secret group specified by `--group-id`, using the name specified
by `--name` and the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Choose the shared secret type (required)<br>Options: <code>Blob</code>, <code>UsernamePassword</code>, <code>SymmetricKey</code>, <code>S3Credential</code></p></div></div></td><td><div><div><p><code>--type UsernamePassword</code></p></div></div></td></tr><tr><td><div><div><p><code>--content</code></p></div></div></td><td><div><div><p>Blob text content (for <code>blob</code> type secrets)</p></div></div></td><td><div><div><p><code>--type Blob --content example</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 01/01/2025</code></p></div></div></td></tr><tr><td><div><div><p><code>--key</code></p></div></div></td><td><div><div><p>Key value (for <code>SymmetricKey</code> type secrets)</p></div></div></td><td><div><div><p><code>--type SymmetricKey --key 49324329</code></p></div></div></td></tr><tr><td><div><div><p><code>--access-key-id</code></p></div></div></td><td><div><div><p>S3 access key id (for <code>S3Credential</code> type secrets)</p></div></div></td><td><div><div><p><code>--type S3Credential -access-key-id 03249348324</code></p></div></div></td></tr><tr><td><div><div><p><code>--secret-access-key</code></p></div></div></td><td><div><div><p>S3 secret access key (for <code>S3Credential</code> type secrets)</p></div></div></td><td><div><div><p><code>-type S3Credential -secret-access-key 00000000000</code></p></div></div></td></tr><tr><td><div><div><p><code>--secret-password</code></p></div></div></td><td><div><div><p>Password (for <code>UsernamePassword</code> type secrets)</p></div></div></td><td><div><div><p><code>-type UsernamePassword -secret-password testpassword12</code></p></div></div></td></tr><tr><td><div><div><p><code>--secret-username</code></p></div></div></td><td><div><div><p>Username (for <code>UsernamePassword</code> type secrets)</p></div></div></td><td><div><div><p><code>-type UsernamePassword -secret-username mulesoft-username</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:shared-secret:describe

> secrets-mgr:shared-secret:describe [flags]

Returns the details of a shared secret specified by `--id` from the secret group specified by
`--group-id`

This command accepts the [default flags](./#default-options).

> [!NOTE] The output does not include any sensitive or secret data.

## secrets-mgr:shared-secret:list

> secrets-mgr:shared-secret:list [flags]

Lists all shared secrets in a secret group specified by `--group-id`

This command accepts the [default flags](./#default-options).

## secrets-mgr:shared-secret:modify

> secrets-mgr:shared-secret:modify [flags]

Modifies the name or expiration date for a shared secret specified by `--id`, from the secret group
specified by `--group-id`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for the shared secret</p></div></div></td><td><div><div><p><code>--name TestSharedSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>New expiration date for the shared secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:secret-group:replace

> secrets-mgr:shared-secret:replace [flags]

Replaces an existing shared secret specified by `--id`, from the secret group specified by
`--group-id`, using the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--id</code></p></div></div></td><td><div><div><p>Secret ID (required)</p></div></div></td><td><div><div><p><code>--id 6e8417f6-2ca7-417a-82b6-047189a18b53</code></p></div></div></td></tr><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret Group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Shared secret type (required)<br>The value must match the existing secret type.</p></div></div></td><td><div><div><p><code>--type Blob</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for your shared secret</p></div></div></td><td><div><div><p><code>--name TestSharedSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--content</code></p></div></div></td><td><div><div><p>Blob text content (for <code>blob</code> type secrets)</p></div></div></td><td><div><div><p><code>--type Blob --content example</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--key</code></p></div></div></td><td><div><div><p>Key value (for <code>SymmetricKey</code> type secrets)</p></div></div></td><td><div><div><p><code>--type SymmetricKey --key 49324329</code></p></div></div></td></tr><tr><td><div><div><p><code>--access-key-id</code></p></div></div></td><td><div><div><p>S3 access key id (for <code>S3Credential</code> type secrets)</p></div></div></td><td><div><div><p><code>--type S3Credential -access-key-id 03249348324</code></p></div></div></td></tr><tr><td><div><div><p><code>--secret-access-key</code></p></div></div></td><td><div><div><p>S3 secret access key (for <code>S3Credential</code> type secrets)</p></div></div></td><td><div><div><p><code>-type S3Credential -secret-access-key 00000000000</code></p></div></div></td></tr><tr><td><div><div><p><code>--secret-password</code></p></div></div></td><td><div><div><p>Password (for <code>UsernamePassword</code> type secrets)</p></div></div></td><td><div><div><p><code>-type UsernamePassword -secret-password testpassword12</code></p></div></div></td></tr><tr><td><div><div><p><code>--secret-username</code></p></div></div></td><td><div><div><p>Username (for <code>UsernamePassword</code> type secrets)</p></div></div></td><td><div><div><p><code>-type UsernamePassword -secret-username mulesoft-username</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:certificate:create

> secrets-mgr:certificate:create [flags]

Creates a new certificate secret in the secret group specified by `--group-id`, using the name
specified by `--name` and the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret (required)</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Choose the certificate secret type (required)<br>Options: <code>PEM</code></p></div></div></td><td><div><div><p><code>--type PEM</code></p></div></div></td></tr><tr><td><div><div><p><code>--cert-file</code></p></div></div></td><td><div><div><p>Certificate file path</p></div></div></td><td><div><div><p><code>--cert-file ./example-cert.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:certificate:describe

> secrets-mgr:certificate:describe [flags]

Returns the details of a certificate secret specified by `--id` from the secret group specified by
`--group-id`

This command accepts the [default flags](./#default-options).

> [!NOTE] The output does not include any sensitive or secret data.

## secrets-mgr:certificate:list

> secrets-mgr:certificate:list [flags]

Lists all certificate secrets in a secret group specified by `--group-id`

This command accepts the [default flags](./#default-options).

## secrets-mgr:certificate:modify

> secrets-mgr:certificate:modify [flags]

Modifies the name or expiration date for a certificate secret specified by `--id` from the group
specified by `--group-id`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for the certificate secret</p></div></div></td><td><div><div><p><code>--name TestCertificateSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>New expiration date for the keystore secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:certificate:replace

> secrets-mgr:certificate:replace [flags]

Replaces an existing certificate secret specified by `--id`, from the secret group specified by
`--group-id`, using the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--id</code></p></div></div></td><td><div><div><p>Secret ID (required)</p></div></div></td><td><div><div><p><code>--id 6e8417f6-2ca7-417a-82b6-047189a18b53</code></p></div></div></td></tr><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret Group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Certificate secret type (required)<br>The value must match the existing secret type</p></div></div></td><td><div><div><p><code>--type PEM</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for your shared secret</p></div></div></td><td><div><div><p><code>--name TestSharedSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--cert-file</code></p></div></div></td><td><div><div><p>Certificate file type</p></div></div></td><td><div><div><p><code>--cert-file ./example-cert.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:keystore:create

> secrets-mgr:keystore:create [flags]

Creates a new keystore secret in the secret group specified by `--group-id`, using the name
specified by `--name` and the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret (required)</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Keystore secret type (required)<br>Options: <code>PEM</code>, <code>JKS</code>, <code>PKCS12</code>, <code>JCEKS</code></p></div></div></td><td><div><div><p><code>--type PEM</code></p></div></div></td></tr><tr><td><div><div><p><code>--algorithm</code></p></div></div></td><td><div><div><p>Key manager factory algorithm for <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--algorithm PKIX</code></p></div></div></td></tr><tr><td><div><div><p><code>--alias</code></p></div></div></td><td><div><div><p>Alias for the key used in <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--alias KeyAliasExample</code></p></div></div></td></tr><tr><td><div><div><p><code>--capath-file</code></p></div></div></td><td><div><div><p>CA path certificate file for <code>PEM</code> keystore secrets</p></div></div></td><td><div><div><p><code>--capath-file ./example-capath.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--key-file</code></p></div></div></td><td><div><div><p>Key file for PEM keystore secrets</p></div></div></td><td><div><div><p><code>--key-file ./example-key.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--key-passphrase</code></p></div></div></td><td><div><div><p>Passphrase required for <code>JKS</code>, <code>PKCS12</code> and <code>JCEKS</code> keystore secrets<br>Optional for <code>PEM</code> keystore secrets</p></div></div></td><td><div><div><p><code>--key-passphrase examplePassphrase</code></p></div></div></td></tr><tr><td><div><div><p><code>--keystore-file</code></p></div></div></td><td><div><div><p>Keystore filepath for <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> type secrets</p></div></div></td><td><div><div><p><code>--keystore-file ./keystorefile.jks</code></p></div></div></td></tr><tr><td><div><div><p><code>--store-passphrase</code></p></div></div></td><td><div><div><p>Passphrase for the <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> type secrets</p></div></div></td><td><div><div><p><code>--store-passphrase ExampleStorePassphrase</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:keystore:describe

> secrets-mgr:keystore:describe [flags]

Returns the details of a keystore secret specified by `--id` from the secret group specified by
`--group-id`

This command accepts the [default flags](./#default-options).

> [!NOTE] The output doesn’t include any sensitive or secret data.

## secrets-mgr:keystore:list

> secrets-mgr:keystore:list [flags]

Lists all keystore secrets in a secret group specified by `--group-id`

This command accepts the [default flags](./#default-options).

## secrets-mgr:keystore:modify

> secrets-mgr:keystore:modify [flags]

Modifies the name or expiration date for a keystore secret specified by `--id` from the group
specified by `--group-id`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for the keystore secret</p></div></div></td><td><div><div><p><code>--name TestKeystoreSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>New expiration date for the keystore secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:keystore:replace

> secrets-mgr:keystore:replace [flags]

Replaces an existing keystore secret specified by `--id`, from the secret group specified by
`--group-id`, using the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--id</code></p></div></div></td><td><div><div><p>Secret ID (required)</p></div></div></td><td><div><div><p><code>--id 6e8417f6-2ca7-417a-82b6-047189a18b53</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Choose the keystore secret type (required)<br>Options: <code>PEM</code>, <code>JKS</code>, <code>PKCS12</code>, <code>JCEKS</code></p></div></div></td><td><div><div><p><code>--type PEM</code></p></div></div></td></tr><tr><td><div><div><p><code>--algorithm</code></p></div></div></td><td><div><div><p>Key manager factory algorithm for <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--algorithm PKIX</code></p></div></div></td></tr><tr><td><div><div><p><code>--alias</code></p></div></div></td><td><div><div><p>Alias for the key used in <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--alias KeyAliasExample</code></p></div></div></td></tr><tr><td><div><div><p><code>--capath-file</code></p></div></div></td><td><div><div><p>CA path certificate file for <code>PEM</code> keystore secrets</p></div></div></td><td><div><div><p><code>--capath-file ./example-capath.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--key-file</code></p></div></div></td><td><div><div><p>Key file for PEM keystore secrets</p></div></div></td><td><div><div><p><code>--key-file ./example-key.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--key-passphrase</code></p></div></div></td><td><div><div><p>Passphrase required for <code>JKS</code>, <code>PKCS12</code> and <code>JCEKS</code> keystore secrets<br>Optional for <code>PEM</code> keystore secrets</p></div></div></td><td><div><div><p><code>--key-passphrase examplePassphrase</code></p></div></div></td></tr><tr><td><div><div><p><code>--keystore-file</code></p></div></div></td><td><div><div><p>Keystore filepath for <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> type secrets</p></div></div></td><td><div><div><p><code>--keystore-file ./keystorefile.jks</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--store-passphrase</code></p></div></div></td><td><div><div><p>Passphrase for the <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> type secrets</p></div></div></td><td><div><div><p><code>--store-passphrase ExampleStorePassphrase</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:truststore:create

> secrets-mgr:truststore:create [flags]

Creates a new truststore secret in the secret group specified by `--group-id`, using the name
specified by `--name` and the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret (required)</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Choose the truststore secret type (required)<br>Options: <code>PEM</code>, <code>JKS</code>, <code>PKCS12</code>, <code>JCEKS</code></p></div></div></td><td><div><div><p><code>--type PEM</code></p></div></div></td></tr><tr><td><div><div><p><code>--truststore-file</code></p></div></div></td><td><div><div><p>Truststore filepath (required)</p></div></div></td><td><div><div><p><code>--truststore-file ./truststorefile.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--algorithm</code></p></div></div></td><td><div><div><p>Key manager factory algorithm for <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--algorithm SUNX509</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--store-passphrase</code></p></div></div></td><td><div><div><p>Passphrase required for <code>JKS</code>, <code>PKCS12</code> and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--store-passphrase examplePassphrase</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:truststore:describe

> secrets-mgr:truststore:describe [flags]

Returns the details of a truststore secret specified by `--id` from the secret group specified by
`--group-id`

This command accepts the [default flags](./#default-options).

> [!NOTE] The output does not include any sensitive or secret data.

## secrets-mgr:truststore:list

> secrets-mgr:truststore:list [flags]

Lists all truststore secrets in a secret group specified by `--group-id`

This command accepts the [default flags](./#default-options).

## secrets-mgr:truststore:modify

> secrets-mgr:truststore:modify [flags]

Modifies the name or expiration date for a truststore secret specified by `--id` from the group
specified by `--group-id`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for the truststore secret</p></div></div></td><td><div><div><p><code>--name TestTruststoreSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>New expiration date for the truststore secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:truststore:replace

> secrets-mgr:truststore:replace [flags]

Replaces an existing truststore secret specified by `--id`, from the secret group specified by
`--group-id`, using the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--id</code></p></div></div></td><td><div><div><p>Secret ID (required)</p></div></div></td><td><div><div><p><code>--id 6e8417f6-2ca7-417a-82b6-047189a18b53</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Choose the truststore secret type (required)<br>Options: <code>PEM</code>, <code>JKS</code>, <code>PKCS12</code>, <code>JCEKS</code></p></div></div></td><td><div><div><p><code>--type PEM</code></p></div></div></td></tr><tr><td><div><div><p><code>--truststore-file</code></p></div></div></td><td><div><div><p>Truststore filepath (required)</p></div></div></td><td><div><div><p><code>--truststore-file ./truststorefile.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--algorithm</code></p></div></div></td><td><div><div><p>Key manager factory algorithm for <code>JKS</code>, <code>PKCS12</code>, and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--algorithm SUNX509</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--store-passphrase</code></p></div></div></td><td><div><div><p>Passphrase required for <code>JKS</code>, <code>PKCS12</code> and <code>JCEKS</code> keystore secrets</p></div></div></td><td><div><div><p><code>--store-passphrase examplePassphrase</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:tls-context:mule:create

> secrets-mgr:tls-context:mule:create [flags]

Creates a new Mule TLS context secret in the secret group specified by `--group-id`, and using the
name specified by `--name`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret (required)</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--tls-version</code></p></div></div></td><td><div><div><p>TLS Version<br>Default: TLSv1.2</p></div></div></td><td><div><div><p><code>--tls-version TLSv1.1</code></p></div></div></td></tr><tr><td><div><div><p><code>--cipher</code></p></div></div></td><td><div><div><p>Cipher for the specified TLS version</p></div></div></td><td><div><div><p><code>--cipher TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--insecure</code></p></div></div></td><td><div><div><p>Disable certificate validation</p></div></div></td><td><div><div><p><code>--insecure</code></p></div></div></td></tr><tr><td><div><div><p><code>--keystore-id</code></p></div></div></td><td><div><div><p>A valid <code>JKS</code>, <code>JCEKS</code>, or <code>PKCS12</code> keystore ID in the secret group, which is used as keystore for the TLS context</p></div></div></td><td><div><div><p><code>--keystore-id 2d773060-aed0-46a7-b131-efbdb6ceff70</code></p></div></div></td></tr><tr><td><div><div><p><code>--truststore-id</code></p></div></div></td><td><div><div><p>A valid <code>JKS</code>, <code>JCEKS</code>, or <code>PKCS12</code> truststore ID in the secret group, which is used as truststore for the TLS context</p></div></div></td><td><div><div><p><code>--truststore-id 588c33e4-7f6f-44be-94e8-8b65a56d1670</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:tls-context:mule:describe

> secrets-mgr:tls-context:mule:describe [flags]

Returns the details of a Mule TLS context secret specified by `--id` from the secret group specified
by `--group-id`

This command accepts the [default flags](./#default-options).

> [!NOTE] The output does not include any sensitive or secret data.

## secrets-mgr:tls-context:mule:list

> secrets-mgr:tls-context:mule:list [flags]

Lists all Mule TLS context secrets in a secret group specified by `--group-id`

This command accepts the [default flags](./#default-options).

## secrets-mgr:tls-context:mule:modify

> secrets-mgr:TLS-context:mule:modify [flags]

Modifies the name or expiration date for a Mule TLS context secret specified by `--id` from the
group specified by `--group-id`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for the truststore secret</p></div></div></td><td><div><div><p><code>--name TestTruststoreSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>New expiration date for the truststore secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:tls-context:mule:replace

> secrets-mgr:tls:context:mule:replace [flags]

Replaces an existing Mule TLS context secret specified by `--id`, from the secret group specified by
`--group-id`, using the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret (required)</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--tls-version</code></p></div></div></td><td><div><div><p>TLS Version<br>Default: TLSv1.2</p></div></div></td><td><div><div><p><code>--tls-version TLSv1.1</code></p></div></div></td></tr><tr><td><div><div><p><code>--cipher</code></p></div></div></td><td><div><div><p>Cipher for the specified TLS version</p></div></div></td><td><div><div><p><code>--cipher TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--insecure</code></p></div></div></td><td><div><div><p>Disable certificate validation</p></div></div></td><td><div><div><p><code>--insecure</code></p></div></div></td></tr><tr><td><div><div><p><code>--keystore-id</code></p></div></div></td><td><div><div><p>A valid <code>JKS</code>, <code>JCEKS</code>, or <code>PKCS12</code> keystore ID in the secret group, which is used as keystore for the TLS context</p></div></div></td><td><div><div><p><code>--keystore-id 2d773060-aed0-46a7-b131-efbdb6ceff70</code></p></div></div></td></tr><tr><td><div><div><p><code>--truststore-id</code></p></div></div></td><td><div><div><p>A valid <code>JKS</code>, <code>JCEKS</code>, or <code>PKCS12</code> truststore ID in the secret group, which is used as truststore for the TLS context</p></div></div></td><td><div><div><p><code>--truststore-id 588c33e4-7f6f-44be-94e8-8b65a56d1670</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:tls-context:flex-gateway:create

> secrets-mgr:tls-context:flex-gateway:create [flags]

Creates a new Omni Gateway TLS context secret in the secret group specified by `--group-id`, and
using the name specified by `--name`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret (required)</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--max-tls-version</code></p></div></div></td><td><div><div><p>Maximum TLS Version<br>Default: TLSv1.3</p></div></div></td><td><div><div><p><code>--max-tls-version TLSv1.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--min-tls-version</code></p></div></div></td><td><div><div><p>Minimum TLS Version<br>Default: TLSv1.3</p></div></div></td><td><div><div><p><code>--min-tls-version TLSv1.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--cipher</code></p></div></div></td><td><div><div><p>Cipher for the specified TLS version range</p></div></div></td><td><div><div><p><code>--cipher TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256</code></p></div></div></td></tr><tr><td><div><div><p><code>--alpn-protocol</code></p></div></div></td><td><div><div><p>ALPN Protocol<br>Options: <code>h2</code>, <code>http/1.1</code></p></div></div></td><td><div><div><p><code>--alpn-protocol h2</code></p></div></div></td></tr><tr><td><div><div><p><code>--enable-client-cert-validation</code></p></div></div></td><td><div><div><p>Enable client certificate validation</p></div></div></td><td><div><div><p><code>--enable-client-cert-validation</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--keystore-id</code></p></div></div></td><td><div><div><p>A valid <code>PEM</code> keystore ID in the secret group, which is used as keystore for the TLS context</p></div></div></td><td><div><div><p><code>--keystore-id 2d773060-aed0-46a7-b131-efbdb6ceff70</code></p></div></div></td></tr><tr><td><div><div><p><code>--truststore-id</code></p></div></div></td><td><div><div><p>A valid <code>PEM</code> truststore ID in the secret group, which is used as truststore for the TLS context</p></div></div></td><td><div><div><p><code>--truststore-id 588c33e4-7f6f-44be-94e8-8b65a56d1670</code></p></div></div></td></tr><tr><td><div><div><p><code>--skip-server-cert-validation</code></p></div></div></td><td><div><div><p>Skip service certificate validation</p></div></div></td><td><div><div><p><code>--skip-server-cert-validation</code></p></div></div></td></tr></tbody></table>

For more information about ciphers, see
[Flex Gateway Supported Ciphers](../../gateway/latest/flex-conn-tls-config#supported-ciphers).

## secrets-mgr:tls-context:flex-gateway:describe

> secrets-mgr:tls-context:flex-gateway:describe [flags]

Returns the details of an Omni Gateway TLS context secret specified by `--id` from the secret group
specified by `--group-id`

This command accepts the [default flags](./#default-options).

> [!NOTE] The output does not include any sensitive or secret data.

## secrets-mgr:tls-context:flex-gateway:list

> secrets-mgr:tls-context:flex-gateway:list [flags]

Lists all Omni Gateway TLS context secrets in a secret group specified by `--group-id`

This command accepts the [default flags](./#default-options).

## secrets-mgr:tls-context:flex-gateway:modify

> secrets-mgr:TLS-context:flex-gateway:modify [flags]

Modifies the name or expiration date for an Omni Gateway TLS context secret specified by `--id` from
the group specified by `--group-id`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New name for the truststore secret</p></div></div></td><td><div><div><p><code>--name TestTruststoreSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>New expiration date for the truststore secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr></tbody></table>

## secrets-mgr:tls-context:flex-gateway:replace

> secrets-mgr:tls:context:flex-gateway:replace [flags]

Replaces an existing Omni Gateway TLS context secret specified by `--id`, from the secret group
specified by `--group-id`, using the type specified by `--type`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id</code></p></div></div></td><td><div><div><p>Secret group ID (required)</p></div></div></td><td><div><div><p><code>--group-id 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name for your secret (required)</p></div></div></td><td><div><div><p><code>--name TestSecret</code></p></div></div></td></tr><tr><td><div><div><p><code>--max-tls-version</code></p></div></div></td><td><div><div><p>Maximum TLS Version<br>Default: TLSv1.3</p></div></div></td><td><div><div><p><code>--max-tls-version TLSv1.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--min-tls-version</code></p></div></div></td><td><div><div><p>Minimum TLS Version<br>Default: TLSv1.3</p></div></div></td><td><div><div><p><code>--min-tls-version TLSv1.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--cipher</code></p></div></div></td><td><div><div><p>Cipher for the specified TLS version range</p></div></div></td><td><div><div><p><code>--cipher TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256</code></p></div></div></td></tr><tr><td><div><div><p><code>--alpn-protocol</code></p></div></div></td><td><div><div><p>ALPN Protocol<br>Options: <code>h2</code>, <code>http/1.1</code></p></div></div></td><td><div><div><p><code>--alpn-protocol h2</code></p></div></div></td></tr><tr><td><div><div><p><code>--enable-client-cert-validation</code></p></div></div></td><td><div><div><p>Enable client certificate validation</p></div></div></td><td><div><div><p><code>--enable-client-cert-validation</code></p></div></div></td></tr><tr><td><div><div><p><code>--expiration-date</code></p></div></div></td><td><div><div><p>Expiration date for the secret</p></div></div></td><td><div><div><p><code>--expiration-date 2025-01-25</code></p></div></div></td></tr><tr><td><div><div><p><code>--keystore-id</code></p></div></div></td><td><div><div><p>A valid <code>PEM</code> keystore ID in the secret group, which is used as keystore for the TLS context</p></div></div></td><td><div><div><p><code>--keystore-id 2d773060-aed0-46a7-b131-efbdb6ceff70</code></p></div></div></td></tr><tr><td><div><div><p><code>--truststore-id</code></p></div></div></td><td><div><div><p>A valid <code>PEM</code> truststore ID in the secret group, which is used as truststore for the TLS context</p></div></div></td><td><div><div><p><code>--truststore-id 588c33e4-7f6f-44be-94e8-8b65a56d1670</code></p></div></div></td></tr><tr><td><div><div><p><code>--skip-server-cert-validation</code></p></div></div></td><td><div><div><p>Skip service certificate validation</p></div></div></td><td><div><div><p><code>--skip-server-cert-validation</code></p></div></div></td></tr></tbody></table>
