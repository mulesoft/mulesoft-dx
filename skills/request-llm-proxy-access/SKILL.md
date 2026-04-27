---
name: request-llm-proxy-access
description: |
  Request consumer access to an existing LLM proxy by creating a client
  application in Exchange and a contract that binds the application to the
  LLM proxy. Returns the `clientId` and `clientSecret` the consumer will use
  as headers on every call. Use when the user wants LLM proxy credentials, a
  client ID and secret for an AI gateway, to subscribe an app to an LLM
  proxy, to onboard a new consumer, to create an Exchange client application
  for an LLM proxy, or to request access to an LLM gateway.
---

# Request Consumer Access to an LLM Proxy

## Overview

Walks the consumer onboarding flow for an existing LLM proxy. First, create a Client Application in Exchange (this mints a client ID + client secret). Second, create a Contract that binds the application to the LLM proxy — for proxies with no SLA tiers this auto-approves within seconds. The returned credentials are what the consumer sends on every call to the proxy (as `client_id` and `client_secret` headers).

**What you'll build:** A Client Application + a contract against the chosen LLM proxy, with the client ID + client secret surfaced back to the user.

## Prerequisites

Before starting, ensure you have:

1. **Authentication and permissions**
   - Valid Bearer token for Anypoint Platform
   - **Create Applications** and **Manage Contracts** permissions in the target environment

2. **Existing LLM proxy**
   - An LLM proxy deployed in the environment (created via `create-llm-proxy-model-based-routing` or `create-llm-proxy-semantic-routing`)
   - The proxy's `status` is `active`

3. **Consumer details**
   - A short application name the consumer will identify the credentials with (e.g., `fintech-chat-client`)
   - Optionally, a description

## Step 1: Get Current Organization

```yaml
api: urn:api:access-management
operationId: listMe
inputs: {}
outputs:
  - name: organizationId
    path: $.user.organization.id
    description: Root organization (Business Group GUID). For Exchange client applications this is also the `masterOrganizationId`.
  - name: organizationName
    path: $.user.organization.name
    description: Organization display name.
```

**What happens next:** You have the org ID used for both the application (`masterOrganizationId`) and the contract.

## Step 2: List Environments

```yaml
api: urn:api:access-management
operationId: listEnvironments
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Organization ID from Step 1
outputs:
  - name: environmentId
    path: $.data[*].id
    labels: $.data[*].name
    description: Target environment ID where the LLM proxy lives.
```

**What happens next:** Pick the environment containing the LLM proxy.

## Step 3: List LLM Proxies

Let the user pick which LLM proxy to request access to.

**What you'll need:**
- Organization ID, Environment ID from the earlier steps

**Action:** List LLM proxies.

```yaml
api: urn:api:llm-proxy
operationId: listEnvironmentLlmProxies
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Organization ID from Step 1

  environmentId:
    from:
      variable: environmentId
    description: Environment ID from Step 2

  endpointType:
    value: llm
    description: Filter to LLM proxies only.

  limit:
    value: 50
    description: Show up to 50 per page.

outputs:
  - name: environmentApiId
    path: $.instances[*].id
    labels: $.instances[*].assetId
    description: ID of the LLM proxy the user picks to request access for.
  - name: proxyStatus
    path: $.instances[*].status
    description: Should be `active` for the contract to succeed.
```

**What happens next:** User picks one LLM proxy. Use its `environmentApiId` below.

## Step 4: Create the Client Application in Exchange

Create a new Exchange Client Application via the Exchange Experience API (`POST /exchange/api/v2/organizations/{masterOrganizationId}/applications`). The response includes the application `id`, `clientId` (which becomes the `client_id` header value), and `clientSecret`. On the application POST/GET endpoints the field is `clientId`; the same value appears as `coreServicesId` when an application object is embedded in a contract response.

**What you'll need:**
- Organization ID (used as `masterOrganizationId`)
- A name for the application
- Optionally, a description

**Action:** Create the client application.

```yaml
api: urn:api:exchange-experience
operationId: createOrganizationsByMasterorganizationidApplications
inputs:
  masterOrganizationId:
    from:
      variable: organizationId
    description: Organization ID from Step 1.

  name:
    userProvided: true
    description: Human-readable application name. Shown in Exchange and in the LLM proxy Contracts tab.
    example: fintech-chat-client
    required: true

  description:
    userProvided: true
    description: Optional description of what the application will use the LLM proxy for.
    example: Internal chat client for the finance portal
    required: false

outputs:
  - name: applicationId
    path: $.id
    description: Numeric application ID (integer ≥ 1). Used as `applicationId` in the contract creation step below.
  - name: clientId
    path: $.clientId
    description: Public client ID the consumer puts in the `client_id` header on every call. The same value appears as `coreServicesId` when the application is embedded in a contract response; the application endpoints themselves return it as `clientId`.
  - name: clientSecret
    path: $.clientSecret
    description: Client secret the consumer puts in the `client_secret` header on every call. Returned on the POST response and (by observation) on subsequent application GETs as well. Rotation via the secret-reset endpoint invalidates the prior value. Store securely regardless.
```

**What happens next:** You have the credentials. **Do not print `clientSecret` to logs or chat history casually — present it to the end user exactly once with a clear warning.**

**Common issues:**
- **403 Forbidden**: Missing **Create Applications** permission in the organization. Escalate to an Anypoint admin.
- **Duplicate name**: Exchange allows the same application name across organizations but may warn within one org. Pick a distinct name.

## Step 5: Create the Contract Against the LLM Proxy

Bind the application to the LLM proxy via the API Manager REST API (`POST /apimanager/api/v1/organizations/{organizationId}/environments/{environmentId}/apis/{environmentApiId}/contracts`). The request body schema (`contractPOST.json`) requires `applicationId` and accepts optional `requestedTierId` and `requestAccessInfo.reason`. For LLM proxies created with `approvalMethod: null` (automatic, the default) and no SLA tiers, the contract auto-approves immediately.

**What you'll need:**
- Organization ID, Environment ID, `environmentApiId` from earlier steps
- `applicationId` from Step 4

**Action:** Create a contract.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisContracts
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Organization ID from Step 1

  environmentId:
    from:
      variable: environmentId
    description: Environment ID from Step 2

  environmentApiId:
    from:
      variable: environmentApiId
    description: LLM proxy ID from Step 3.

  applicationId:
    from:
      variable: applicationId
    description: Exchange application ID from Step 4 (integer ≥ 1). Required.

  requestedTierId:
    userProvided: true
    description: SLA tier ID (integer ≥ 1) if the LLM proxy has tiers configured. Omit for proxies with no tiers — contract auto-approves.
    required: false

  requestAccessInfo.reason:
    userProvided: true
    description: >-
      Required ONLY when the LLM proxy was created with the manual approval
      mode (`approvalMethod` set to `manual`, i.e. Request Access mode).
      A human-readable reason (1–500 characters) shown to the API owner
      during approval.
    required: false

outputs:
  - name: contractId
    path: $.id
    description: Numeric ID of the created contract.
  - name: contractStatus
    path: $.status
    description: Typically `APPROVED` for auto-approval proxies with no tiers. `PENDING` if the proxy was created with manual approval or if the requested tier requires manual approval.
  - name: approvedDate
    path: $.approvedDate
    description: Timestamp of contract approval when auto-approved.
```

**What happens next:** The contract is active and the consumer can call the LLM proxy. Present the `clientId` and `clientSecret` (from Step 4) plus the proxy's public URL (from the LLM proxy list) to the user.

**Common issues:**
- **409 Conflict**: This application already has an active contract with the proxy. Use the existing contract instead.
- **400 Bad Request — tier required**: The proxy has SLA tiers. Fetch tiers via `listOrganizationsEnvironmentsApisTiers` and pass one as `requestedTierId`.

## Completion Checklist

- [ ] Step 3 returned a valid `environmentApiId` for the target LLM proxy
- [ ] Step 4 returned `clientId` + `clientSecret` (and the secret was surfaced to the user)
- [ ] Step 5 returned a contract with `status: APPROVED`
- [ ] The consumer has the proxy's public URL (from Step 3's `endpointUri` or the LLM Summary page)

## What You've Built

✅ **A consumer-ready credential pair** — `client_id` + `client_secret` headers authenticate every call via the Client ID Enforcement policy on the LLM proxy.

✅ **An approved contract** — the application is formally entitled to call the proxy and any rate-limit / guard policies evaluate against this consumer's client ID.

✅ **Visibility in API Manager** — the new contract shows up under the LLM proxy's Contracts tab; the application shows up in Exchange.

## Next Steps

1. **Test the credentials** — call the LLM proxy's public URL with the two auth headers and an OpenAI-format request body. The gateway picks which upstream to call from the body's `model` field (see below), NOT from any user-supplied routing header. The subpath is the standard OpenAI API subpath: `/chat/completions` for Chat Completions, `/responses` for the Responses API, etc. For DataWeave-injected provider keys, additionally pass the header the upstream expects (e.g., `x-openai-key`).

```bash
curl -X POST 'https://<gateway-domain>/<proxy-base-path>/chat/completions' \
  -H 'Content-Type: application/json' \
  -H 'client_id: <clientId>' \
  -H 'client_secret: <clientSecret>' \
  -H 'x-openai-key: <upstream provider key>' \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'
```

**How model-based routing selects the provider:**
- **Explicit**: `"model": "<provider>/<model>"` — e.g., `"openai/gpt-4o-mini"`, `"gemini/gemini-3-flash-preview"`. The `<provider>` prefix must match one of the proxy's `supportedVendors`.
- **Inferred**: `"model": "<model>"` without a provider prefix — works only if the model name maps unambiguously to a single supported vendor (or there's only one vendor configured).
- **Fallback**: if the provider in `model` isn't supported, the request falls back to the proxy's configured fallback provider + model (`metadata.globalRouting.llmConfigs.fallbackRoute` + `fallbackModel`).

The routing policy rewrites the request body's `model` field to the resolved target model and sets an internal `x-routing-header` header before dispatching.

**For semantic routing proxies**, the consumer sends any `model` placeholder — the Semantic Routing policy picks the provider based on the last user message's meaning (via the configured prompt topics), not the model field.

**Diagnostic response headers** (all verified live against a model-based LLM proxy on a Flex Gateway):

- `server: Anypoint Flex Gateway` — present on every response; useful verification marker.
- `x-llm-proxy-routing-type: ModelBased | Semantic` — CamelCase, matching the policy's identifier.
- `x-llm-proxy-routing-fallback: true | false` — `true` when the request resolved to the configured fallback route (e.g., the user sent an unknown provider prefix and a fallback was set).
- `x-llm-proxy-llm-provider: <provider>` — resolved provider (e.g., `openai`, `gemini`).
- `x-llm-proxy-llm-model: <model>` — the **upstream's configured target model**. Note this is what the proxy rewrote the body's `model` to — not the model the consumer sent. Example: consumer sends `"model": "openai/gpt-4o"` → proxy rewrites to the upstream's configured target (e.g., `gpt-5-mini`) and forwards.
- `x-llm-proxy-model-based-routing-success` / `x-llm-proxy-semantic-routing-success` — verbose explanation of how routing resolved (e.g., `Request successfully matched. Provider: openai, Model: gpt-5-mini.` on direct match, or `Request fell back to gpt-5.2 (Provider: openai, Model: gpt-5.2).` on fallback).
- `x-llm-proxy-request-success` — on 200 responses.
- **Upstream pass-through headers**: `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-tokens`, `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests`, plus provider-specific ones like `openai-processing-ms`, `openai-organization`, `openai-project`, `x-request-id`. These come directly from the upstream provider and are **not** inserted by the proxy.
- **Token rate limit policy headers** (only when the `llm-token-rate-limit` policy is applied — see the `apply-token-rate-limiting-to-llm-proxy` skill): verbose `x-llm-proxy-ratelimit: "Token rate limit: {remaining} tokens remaining of {limit} limit. Reset in {reset}ms."` on 2xx responses; standard `x-ratelimit-limit-tokens` / `x-ratelimit-remaining-tokens` / `x-ratelimit-reset-tokens` set by the policy on 429 responses.

**Expected auth + routing behavior (verified live):**
- No `client_id` header → `401` with `{"error":"Client ID is not present"}`. Also sets `www-authenticate: Client-ID-Enforcement`.
- Wrong `client_id` / `client_secret` → `401` with `{"error":"Authentication Attempt Failed"}`. Same `www-authenticate` header.
- Unknown provider prefix in `model` (e.g., `"foobar/…"`) when a fallback is configured → `200` with `x-llm-proxy-routing-fallback: true` and the request served by the fallback route/model. (If no fallback is configured, the policy is documented as returning 400; not observed yet.)
- Valid credentials + invalid upstream provider key → `200`/`400` with the upstream provider's own error (e.g., Gemini's `API key not valid`).
- Valid credentials + valid upstream key → `200` with the upstream LLM's response body.

2. **Rotate the secret** — when the secret needs to change, reset it via the Exchange application management endpoint.

3. **Monitor consumption** — the LLM proxy's Cost Management dashboard attributes tokens to each `client_id`.

## Tips and Best Practices

### Secret handling
- Never log the secret. Surface it once to the user and immediately instruct them to store it in a secret vault.
- If the secret is lost, it can only be reset (which invalidates the old value) — it cannot be retrieved.

### Naming
- Use a consistent naming scheme (e.g., `<team>-<purpose>-<env>`) so the contract list in API Manager stays organized.

### Tiered access
- If the proxy has SLA tiers (Bronze / Silver / Gold), `requestedTierId` is required. Different tiers can have different rate limits via the SLA-based rate limiting policy (different from the `llm-token-rate-limit` token-based one).

## Troubleshooting

### Contract stays PENDING
**Symptoms:** `status: PENDING` after Step 5, doesn't transition to `APPROVED`.
**Possible causes:** The proxy has manual approval enabled, or it has SLA tiers and the requested tier requires manual review.
**Solutions:** An API owner needs to approve the contract from the Contracts tab. Or, if the proxy has no tiers, the auto-approval can take up to ~30 seconds — wait and re-fetch.

### 401 on the proxy call even with credentials
**Symptoms:** Consumer call returns 401 with the credentials set.
**Possible causes:** The Client ID Enforcement policy expects specific header names. The default expressions are `#[attributes.headers['client_id']]` and `#[attributes.headers['client_secret']]` — confirm the consumer is sending `client_id` and `client_secret` (snake_case, not `clientId`).
**Solutions:** Align the consumer's header names with the Client ID Enforcement policy configuration on the proxy.

### Application already has a contract with this proxy
**Symptoms:** 409 on Step 5.
**Possible causes:** Either the app was contracted previously, or there's a stale revoked contract.
**Solutions:** Use the existing contract (fetch via `listOrganizationsEnvironmentsApisContracts` and inspect `status`). If it's `REVOKED`, restore it via the restore operation instead of creating a new one.

## Related Jobs

- **create-llm-proxy-model-based-routing** / **create-llm-proxy-semantic-routing** — Create the proxy in the first place.
- **apply-token-rate-limiting-to-llm-proxy** — Apply a token budget that'll be enforced against the `client_id` from this contract.
