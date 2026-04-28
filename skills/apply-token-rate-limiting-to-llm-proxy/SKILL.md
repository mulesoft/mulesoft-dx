---
name: apply-token-rate-limiting-to-llm-proxy
description: |
  Apply the LLM-specific Token Based Rate Limit policy to an existing LLM
  proxy. Caps token consumption per client in a sliding window (e.g., 1000
  tokens per second). Use when the user wants to limit LLM token usage, cap
  tokens per second/minute, enforce token quotas, rate-limit LLM requests by
  token count, throttle OpenAI / Gemini usage through an LLM proxy, or
  protect an LLM gateway from runaway token consumption.
---

# Apply Token-Based Rate Limiting to an LLM Proxy

## Overview

Applies the MuleSoft `llm-token-rate-limit` policy (Exchange asset `llm-token-rate-limit` version `1.0.0`, category `LLM`, `groupId=68ef9520-24e9-4cf2-b2f5-620025690913`) to an existing LLM proxy. The policy tracks `usage.total_tokens` returned by the upstream LLM in each response and debits it from a sliding-window bucket keyed by a DataWeave expression — typically per client ID so each consumer gets its own quota.

**How it behaves at runtime:**
- **On request**: checks the bucket's `remaining` count. If `remaining == 0` → immediately returns `HTTP 429` with standard rate-limit headers; no request hits the upstream. If `remaining > 0` → request flows through, **but tokens are NOT yet consumed**.
- **On response**: extracts `usage.total_tokens` (input + output) from the upstream's JSON response and debits that many tokens from the bucket. Subsequent requests see the reduced `remaining`.
- **For streaming responses** (content-type `text/event-stream`): reads the final SSE chunk's `usage.total_tokens` field. Consumers sending streaming requests MUST set `stream_options.include_usage: true` in the body (except for calls to the Responses API, which handles usage differently) — otherwise the policy returns `HTTP 400` before the request reaches the upstream.
- **Only OpenAI-format requests are rate-limited** (the policy reads `x-input-format` set by the LLM Proxy Core policy). Non-OpenAI-format, non-POST, or non-JSON requests pass through without consuming tokens.
- **If `keySelector` fails to evaluate** (e.g., the expected header is missing): `HTTP 400 "Failed to evaluate keySelector"`.
- **Response headers emitted:**
  - Standard `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-tokens` on 429 responses.
  - Verbose `x-llm-proxy-ratelimit: "Token rate limit: {remaining} tokens remaining of {limit} limit. Reset in {reset}ms."` on successful responses.

**What you'll build:** A token rate limit policy (e.g., 1000 tokens per minute per client) enforced on the chosen LLM proxy. After a consumer exhausts their quota they receive a 429 until the sliding window rolls forward.

## Prerequisites

Before starting, ensure you have:

1. **Authentication and permissions**
   - Valid Bearer token for Anypoint Platform
   - API Manager permissions: **View APIs Configuration** and **Manage Policies** in the target environment

2. **Existing LLM proxy**
   - An LLM proxy (created via `create-llm-proxy-model-based-routing` or `create-llm-proxy-semantic-routing`) already deployed in the target environment

3. **Rate limit values**
   - A numeric token ceiling (e.g., `1000`)
   - A window duration in milliseconds (≥ 1000 — the policy schema floor is one second; for "1000 tokens per second" use `timePeriodInMilliseconds: 1000`)
   - A key selector DataWeave expression (default: per-client using `#[attributes.headers['client_id']]`)

## Step 1: Get Current Organization

```yaml
api: urn:api:access-management
operationId: listMe
inputs: {}
outputs:
  - name: organizationId
    path: $.user.organization.id
    description: Root organization Business Group GUID
```

**What happens next:** You have the organization ID required by every subsequent step.

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
    description: Target environment ID
```

**What happens next:** Pick the environment the LLM proxy lives in.

## Step 3: List LLM Proxies

Let the user pick which LLM proxy to protect. The filter `endpointType=llm` restricts the list to LLM proxies only.

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
    description: ID of the LLM proxy the user selects.
```

**What happens next:** The user picks one LLM proxy. Its `environmentApiId` is used in the policy application call below.

## Step 4: Confirm the Token Rate Limit Policy Exists in the Catalog

Fetch the policy catalog to confirm the token rate limit policy is available and extract its `configuration` schema. This step is informational — the Exchange coordinates are fixed, but fetching the schema lets the skill validate the user's configuration before POSTing.

**Note on filtering:** For LLM proxies, the Anypoint UI sends `isLlmProxy=true` (and explicitly omits `injectionPoint`). That flag does NOT restrict the response to LLM templates only — in practice it expands the catalog to include every snapshot/pre-release version of all templates (~1200+ entries vs ~130 without it). Filter the response client-side by `assetId == 'llm-token-rate-limit'` (or `category == 'LLM'`) to locate the token rate limit template.

**What you'll need:**
- Organization ID, Environment ID

**Action:** List policy templates including configuration schemas.

```yaml
api: urn:api:api-portal-xapi
operationId: getExchangePolicyTemplates
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Organization ID from Step 1

  environmentId:
    from:
      variable: environmentId
    description: Environment ID from Step 2

  isLlmProxy:
    value: true
    description: Signals the LLM-proxy catalog variant. Must be set for LLM proxies; do NOT set `injectionPoint` alongside this flag (the Anypoint UI sends one or the other).

  splitModel:
    value: true
    description: Match the Anypoint UI's default — returns the catalog in its usual split-by-model shape.

  latest:
    value: true
    description: Only the latest version of each template.

  includeConfiguration:
    value: true
    description: Include configuration schemas so we can validate the payload.

  automatedOnly:
    value: false
    description: Include non-automated templates (the default).

outputs:
  - name: tokenRateLimitTemplate
    path: $[?(@.assetId=='llm-token-rate-limit')]
    description: |-
      The LLM Token Based Rate Limit template entry. Expect
      `assetId=llm-token-rate-limit`, `groupId=68ef9520-24e9-4cf2-b2f5-620025690913`,
      `category=LLM`, and a `configuration` schema with required fields
      `maximumTokens` (integer ≥ 1), `timePeriodInMilliseconds` (integer ≥ 1000),
      and `keySelector` (string, DataWeave expression).
```

**What happens next:** Verify the template is present. If not, the org may be missing the LLM Proxy entitlement — stop and report.

## Step 5: Apply the Token Rate Limit Policy

Create the policy on the selected LLM proxy. The `configurationData` object matches the `llm-token-rate-limit` JSON Schema: three required fields.

**What you'll need:**
- Organization ID, Environment ID, `environmentApiId` from previous steps
- Numeric `maximumTokens`, `timePeriodInMilliseconds`, and `keySelector` (DataWeave expression)

**Action:** Apply the `llm-token-rate-limit` policy.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisPolicies
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

  groupId:
    value: "68ef9520-24e9-4cf2-b2f5-620025690913"
    description: Exchange group ID of MuleSoft's public policy catalog. Fixed.

  assetId:
    value: "llm-token-rate-limit"
    description: Exchange asset ID of the token rate limit policy. Fixed.

  assetVersion:
    value: "1.0.0"
    description: Latest stable version of the token rate limit policy.

  configurationData:
    userProvided: true
    description: Policy configuration. Required fields - `maximumTokens` (integer ≥ 1), `timePeriodInMilliseconds` (integer ≥ 1000), `keySelector` (DataWeave expression string).
    example:
      maximumTokens: 1000
      timePeriodInMilliseconds: 1000
      keySelector: "#[attributes.headers['client_id']]"
    required: true

outputs:
  - name: policyId
    path: $.id
    description: Numeric ID (integer, not UUID) of the applied policy instance. Retain for updates / removal. The response also includes the auto-resolved `implementationAsset` (e.g., `llm-token-rate-limit-policy-flex` version `1.0.1`), `policyTemplateId`, and echoes `configurationData`.
```

**What happens next:** The policy is active within seconds. Calls to the proxy that exceed the quota receive HTTP 429. Consumers can inspect the remaining budget via the `x-ratelimit-remaining-tokens` and `x-ratelimit-reset-tokens` response headers (added by the LLM Proxy Core Policy).

**Verifying the policy is enforcing.** After ~30 seconds for gateway propagation, make one test call to the proxy with valid credentials and a small request body, then look at the response headers:

- `x-llm-proxy-ratelimit: "Token rate limit: <remaining> tokens remaining of <limit> limit. Reset in <ms>ms."` — present means the policy is live and counting.
- Header **absent** on a successful 200 response means the gateway hasn't picked up the policy config yet — wait another 30 seconds and retry. If still absent after 90 seconds, suspect the policy didn't apply correctly (re-list policies on the proxy via `listOrganizationsEnvironmentsApisPolicies` and confirm `llm-token-rate-limit` shows up).
- If the verbose header is present but the consumer expects to see standard `x-ratelimit-*` headers, those only appear on 429 responses (when the bucket is empty). 200 responses get the verbose `x-llm-proxy-ratelimit` instead.

**Note on per-upstream (outbound) policies:** The policy POST endpoint also accepts an optional `upstreamId` field on the body when applying per-upstream (outbound) policies. `llm-token-rate-limit` is an inbound policy and does not use `upstreamId`; omit that field.

**Common issues:**
- **400 Bad Request — schema violation**: Ensure all three required fields are present and `timePeriodInMilliseconds` is ≥ 1000. Smaller windows are rejected by the policy schema.
- **409 Conflict**: The policy is already applied to this proxy. Use `patchOrganizationsEnvironmentsApisPolicy` to update the existing instance instead.

## Completion Checklist

- [ ] Step 3 returned a valid `environmentApiId` for an LLM proxy
- [ ] Step 4 confirmed the `llm-token-rate-limit` template is in the catalog
- [ ] Step 5 returned a `policyId` for the newly applied policy
- [ ] Verify the policy shows up under the proxy's AI Policies tab

## What You've Built

✅ **Token-budget enforcement per consumer** — each client ID (or other configured key) has its own sliding-window token quota.

✅ **Graceful 429 responses** — over-quota requests get a standard HTTP 429 with remaining-token headers for the consumer to back off.

✅ **Zero application changes** — the policy is enforced at the Flex Gateway; the upstream LLM provider never sees the request.

## Next Steps

1. **Monitor usage** — watch the `x-ratelimit-*` response headers in LLM Insights / Anypoint Monitoring.
2. **Add SLA tiers** — combine this policy with SLA-based rate limiting if different consumer tiers deserve different token budgets.
3. **Apply semantic prompt guarding** — use one of the `semantic-prompt-guard-policy-*` templates to block topics you never want called (e.g., sensitive domains).

## Tips and Best Practices

### Key selector
- **`#[attributes.headers['client_id']]`** — per-client quota (the default and most common choice)
- **`#[attributes.principal]`** — per-user quota
- **`#[attributes.headers['X-Forwarded-For']]`** — per-IP quota (useful in anonymous scenarios)

### Window sizing
- `timePeriodInMilliseconds` must be ≥ 1000.
- Common windows: `1000` (per-second bursts), `60000` (per-minute sustained), `3600000` (per-hour budget).

### Tokens counted
- The policy counts *both* input and output tokens (so a 200-token prompt with a 500-token completion consumes 700 tokens).

## Troubleshooting

### Policy applied but no rate limiting observed
**Symptoms:** Calls go through beyond the configured budget.
**Possible causes:** Gateway hasn't synced yet, or an older policy version was applied.
**Solutions:** Wait ~30 seconds for gateway propagation, confirm the policy's `assetVersion` is the one you intended, and verify the `keySelector` actually resolves for your requests (if the expression returns null, all requests share the same "null" key).

### 429 even on the first request
**Symptoms:** Every call returns 429.
**Possible causes:** `keySelector` evaluates to null or empty, so all requests share one bucket.
**Solutions:** Confirm the consumer is sending the expected header (e.g., `client_id`). The Client ID Enforcement policy auto-applied to every LLM proxy requires it anyway.

### Schema validation error
**Symptoms:** 400 response with `configurationData` complaint.
**Possible causes:** Missing a required field or using a sub-second window.
**Solutions:** Verify all three required fields are present and `timePeriodInMilliseconds` ≥ 1000.

## Related Jobs

- **create-llm-proxy-model-based-routing** — Create the LLM proxy in the first place.
- **create-llm-proxy-semantic-routing** — Same, with semantic routing.
- **request-llm-proxy-access** — Create a client application + contract so consumers can call the proxy.
- **apply-policy-to-api-instance** — Apply any other Exchange policy (non-LLM) to an API instance.
