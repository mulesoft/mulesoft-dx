# Provider bundle and authentication resolution

Use this reference when selecting provider operations and runtime credential
inputs for a generated script.

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
   piece. If a pull-scanner connection form exists for the inferred provider,
   match its field labels for the fields the script actually asks.
5. Do not combine inventory and auth into one question. Do not skip either
   because they named a vendor or a language. Language comes after auth.
   Mapping confirmation comes after language. Files come after yes.
6. When they have not given a usable inventory and auth contract, keep asking
   for the missing callable API or executable authentication piece. Do not
   route by a similar vendor name.

The bundle is an evidence index, not a generic provider implementation. AWS
Bedrock agents, AWS AgentCore agents, AWS AgentCore MCP, and AWS API Gateway
REST APIs are four different bundles because their operations and output types
differ, even though their authentication profile is shared.

## Pull-form parity

For an existing pull scanner, every logical provider input in the generated
script must use the same field label, required/optional meaning, validation,
and provider scope as the pull connection form. The generated guide must cite
the profile and credential class.

Runtime delivery may be adapted to the customer's approved environment:

- a non-secret field may come from script parameters, environment, approved
  configuration, an in-memory caller, or an interactive prompt
- a secret may come from an approved secret store, environment, an in-memory
  caller, or a hidden interactive prompt
- the logical field and auth protocol do not change merely because the value is
  injected by CI rather than typed by a person

Do not add a generic authentication menu. When the selected portable profile
has one method, the generated script implements that method directly. When the
pull provider genuinely exposes several profiles, show only those profiles and
require the customer to select one executable method during generation.

## Managed-only pull flows

Some pull forms rely on infrastructure that a customer-hosted script does not
inherit. Examples in the catalog include MuleSoft-managed authorization-code
token resolution and Salesforce trusted tenant relationships.

For a `managed-only` profile:

1. Explain which pull behavior is not portable.
2. Request the customer's executable auth documentation, including the exact
   token/signing request, response fields, scopes or audience, refresh behavior,
   and how the credential is applied to the inventory requests.
3. Do not ask for credential values.
4. Do not generate live-capable code until the replacement auth contract is
   complete and approved.

## New-provider contract

Request only what the selected asset type needs. The contract must prove:

- list/search and required detail, card, metadata, handshake, or export calls
- method, URL or SDK operation, parameters, request body, and response schema
- pagination fields, termination, limits, stable identity, and error behavior
- auth method and every runtime field using provider-native names
- token or signing request and response format, credential application, expiry,
  refresh or rotation, identity test, and least privilege
- source response paths for every required Agent Scanner artifact field

The generated script then performs one deterministic run:

1. Resolve and validate provider and MuleSoft inputs.
2. Authenticate to the provider and run the safe identity/read test.
3. List and fetch only the configured asset type.
4. Map and validate the approved artifact JSON and show field provenance.
5. In dry-run, write inspectable ZIPs and stop.
6. In live mode, obtain a MuleSoft Connected App token, upload every ZIP to the
   one scanner configuration, and commit with the correct completeness value.
7. Print a redacted structured result and clear next actions.

Provider credentials never go to MuleSoft. MuleSoft Connected App credentials
never go to the provider. A list failure does not commit; a partial discovery or
upload commits `complete: false`; only a full successful inventory commits
`complete: true`.
