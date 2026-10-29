# Provider authentication resolution

Use this reference when selecting provider operations and runtime credential
inputs for a generated script. The customer's API specification and
authentication documentation are the only sources. This skill is provider
agnostic, language agnostic, auth agnostic, input-format agnostic, and asset
type agnostic.

## Decision order

1. Resolve exactly one scanner asset type first: `agent`, `mcp`, or
   `rest-api`. If it is missing, ask only that question and stop.
2. Ask for that type's API inventory next. The inventory is the specification
   they paste or attach. Do not ask which provider. Infer the provider from a
   usable spec. Do not ask for authentication in the same turn.
3. If the attachment is unreadable, the wrong kind of file, or missing the
   list, fetch, handshake, or export that type needs, ask only for that missing
   piece. Do not invent calls. Do not treat the first attach as final.
4. After the inventory is usable, ask for authentication. Use the request and
   response they paste. If a piece is missing (token or signing request,
   response, which field is a secret, how the account is proven), ask only that
   piece.
5. Do not combine inventory and auth into one question. Do not skip either
   because they named a vendor or a language. Language comes after auth.
   Mapping confirmation comes after language. Files come after yes.
6. When they have not given a usable inventory and auth contract, keep asking
   for the missing callable API or executable authentication piece. Do not
   route by a similar vendor name.

## Derive fields from the customer's document

Prompt labels, flags, input-file keys, and secret vs non-secret come from the
authentication document they pasted. Use the names in that document.

Do not:

- ask which cloud vendor they use
- copy pull-scanner `@Field(label=...)` names
- add Hub Role ARN, Spoke Role Name, External ID, Account IDs, or Target Regions
- assume `gcloud`, `az`, or `aws` is already logged in
- add `--profile` unless their document names a named profile
- embed a catalog of shipped scanner operations

When the document offers more than one credential source, ask which one before
the mapping. The script uses only that source. It does not fall back to another.

A laptop CLI session is allowed only when the pasted document says the calls
use that session. It is not a default and not a requirement of this skill.

## Managed-only flows

Some Anypoint pull forms rely on infrastructure a customer-hosted script does
not inherit (MuleSoft-managed authorization-code token resolution, Salesforce
trusted tenant / C2C). Those forms are not executable evidence.

For a managed-only description:

1. Explain which pull behavior is not portable.
2. Request the customer's executable auth documentation, including the exact
   token/signing request, response fields, scopes or audience, refresh behavior,
   and how the credential is applied to the inventory requests.
3. Do not ask for credential values.
4. Do not generate live-capable code until the replacement auth contract is
   complete.

## New-provider contract

Request only what the selected asset type needs. The contract must prove:

- list/search and required detail, card, metadata, handshake, or export calls
- method, URL or SDK operation, parameters, request body, and response schema
- pagination fields, termination, limits, stable identity, and error behavior
- auth method and every runtime field using the names in their document
- token or signing request and response format, credential application, expiry,
  refresh or rotation, identity test, and least privilege
- source response paths for every required Agent Scanner artifact field

The generated script then performs one deterministic run:

1. Resolve and validate provider and MuleSoft inputs.
2. Authenticate to the provider and run the safe identity/read test.
3. List and fetch only the configured asset type.
4. Map and validate the approved artifact JSON against `schemas/`.
5. In dry-run, write inspectable ZIPs and stop.
6. In live mode, obtain a MuleSoft token with the selected Anypoint mode
   (`connected-app` or `username-password`), create the scanner configuration
   when `SCANNER_CONFIGURATION_ID` is empty (Name, optional Description,
   Service type → target system), upload every ZIP to that one configuration
   (retry transients; remint a mid-run 401 once), and commit with the correct
   completeness value. Several provider accounts share that one configuration.
7. Print a redacted structured result and clear next actions.

Provider credentials never go to MuleSoft. MuleSoft credentials (Connected App
secret or Anypoint password) never go to the provider. A list failure does not
commit; a partial discovery or upload commits `complete: false`; only a full
successful inventory commits `complete: true`. Do not enable pull-scanner
cross-account flags for this script.

## Completeness checks by scheme

These rows are checks, not a provider catalog. Emit only the row selected and
proven by the customer's document.

| Selected scheme | Completeness checks |
|---|---|
| Signed request | Documented SDK or signer, identity/key, secret, region or scope when the document requires it, temporary session token when the document requires it, request signing, identity test |
| OAuth or OIDC | Exact grant, token URL, client/workload identity, secret or certificate only when selected, required scopes/audience, form encoding, expiry/refresh |
| API key, PAT, or bearer token | Exact header/query location and name, base URL, tenant/workspace selectors, expiry, safe identity/read test |
| Basic authentication | Documented username/password semantics, transport requirements, safe identity/read test |
| mTLS | Client certificate, private-key and CA/trust references, formats, hostname verification |
| Workload identity | Runtime identity source, tenant/project/account selectors, audience/scopes, token acquisition |
| Service-account/JWT | Account identity, private key or key reference, issuer/audience, scopes, token URL, algorithm, lifetime |

Never switch schemes automatically after an authentication failure. Secret
values never appear in process arguments or output.

If several documented methods must be supported in one generated script, add an
explicit non-secret authentication-mode selector named in their document.
Validate all inputs for the selected mode before the first request. Do not probe
modes, infer a mode from leftover environment variables, or silently fall back.

MuleSoft rows include Anypoint host, organization id, Anypoint auth mode, then
either Connected App client id and secret or Anypoint username and password,
scanner configuration id (optional when creating), scanner name (required when
creating), and scanner description (optional when creating). Asset type is a
source constant from skill generation, not a runtime row. Do not mix the two
Anypoint credential pairs. Do not invent the org id from `/accounts/api/me`.
