---
name: create-llm-proxy-model-based-routing
description: |
  Create an LLM Gateway proxy that routes traffic across multiple LLM providers
  based on the `model` value in the consumer's request body (e.g.,
  `"model": "openai/gpt-4o-mini"` → OpenAI, `"model": "gemini-3-flash-preview"` →
  Gemini). Supports OpenAI, Gemini, Azure OpenAI, Bedrock Anthropic, and NVIDIA,
  with static or DataWeave-extracted API keys and an optional fallback
  provider+model. Use when the user wants to create an LLM proxy, set up an AI
  gateway, fan out to OpenAI and Gemini, expose a single endpoint in front of
  multiple LLM providers, or configure model-based routing for LLM APIs.
---

# Create an LLM Proxy with Model-Based Routing

## Overview

Creates an LLM proxy on a Flex Gateway that picks the upstream LLM provider based on the `model` field the consumer sends in the request body. The consumer calls the proxy's public URL with a standard OpenAI-format body; the Model-Based Routing policy parses `model` (e.g., `"openai/gpt-4o-mini"` — explicit provider prefix — or `"gpt-4o-mini"` if the model name unambiguously maps to a single configured vendor), sets an internal `x-routing-header: <provider>` header, and the gateway's route rules dispatch to the matching upstream.

**Important — the proxy overrides the consumer's requested model.** Each upstream is configured with a fixed target model (e.g., `gpt-5-mini` for an OpenAI upstream). The routing policy rewrites the request body's `model` to that configured target before forwarding, regardless of what the consumer sent. The response's `x-llm-proxy-llm-model` header surfaces the resolved target. So if a consumer sends `"model": "openai/gpt-4o"` and the proxy's OpenAI upstream is configured with `model: "gpt-5-mini"`, the upstream actually serves `gpt-5-mini` and the response header reflects that.

When the consumer's provider prefix doesn't match any configured upstream, the request is routed to the configured fallback route + fallback model (`x-llm-proxy-routing-fallback: true` in the response). Without a fallback, the policy returns `HTTP 400`.

**What you'll build:** A deployed LLM proxy with one route per provider (e.g., `Route A` → OpenAI, `Route B` → Gemini), a Flex Gateway deployment, and the platform-managed core policies applied automatically (LLM Proxy Core, Client ID Enforcement, CORS, per-provider transcoding, Model-Based Routing).

## Prerequisites

Before starting, ensure you have:

1. **Authentication and entitlements**
   - Valid Bearer token for Anypoint Platform
   - API Manager permissions: **Manage APIs Configuration** and **Exchange Viewer** in the target environment
   - The organization's `llmProxy` entitlement is enabled (check the JWT's `organization.entitlements.llmProxy: true`)

2. **Flex Gateway target registered**
   - At least one Flex Gateway target is connected and ready in the target environment
   - You know the gateway target's `id` (a UUID) and which ports it allows — typical values are `8081` and `8082`. An over-used port is rejected at create time with a clear error (`Proxy must be deployed in a port that is available in the Managed Flex target. Available ports: ...`).

3. **LLM provider credentials**
   - Valid API keys for each provider you want to route to: OpenAI, Gemini, Azure OpenAI (key + deployment ID), Bedrock Anthropic (AWS access key + secret + region + optional session token), NVIDIA
   - Decide for each: static (key stored encrypted on the upstream) vs DataWeave (key read from a request header at runtime)

## Step 1: Get Current Organization

Retrieve the caller's profile to discover the organization automatically.

**What you'll need:**
- A valid Bearer token (authentication header)

**Action:** Call the `/me` endpoint to get the current user's organization.

```yaml
api: urn:api:access-management
operationId: listMe
inputs: {}
outputs:
  - name: organizationId
    path: $.user.organization.id
    description: Root organization Business Group GUID
  - name: organizationName
    path: $.user.organization.name
    description: Organization display name
```

**What happens next:** You have the root organization ID. If your account has sub-organizations (child Business Groups), call `getOrganizations` with this ID to list them and pick the right scope before continuing.

## Step 2: List Environments

List all environments in the organization so you can select the one where the LLM proxy should be deployed.

**What you'll need:**
- Organization ID from Step 1

**Action:** List environments and pick the target.

```yaml
api: urn:api:access-management
operationId: listEnvironments
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
    description: Organization ID from Step 1
outputs:
  - name: environmentId
    path: $.data[*].id
    labels: $.data[*].name
    description: Selected environment ID
```

**What happens next:** The user picks the environment (e.g., Sandbox or Production). The environment ID is required by every subsequent step.

## Step 3: List LLM Route Configurations

Retrieve the catalog of supported LLM providers. The response is `{ routeConfigurations: [...] }` with one entry per provider, containing `provider` (identifier), `url` (default URL), `model` (default target model), and `fields` (array of per-credential field descriptors with `name`, `requestKey`, `dataWeaveRequestKey`, `type`, `required`, `sensitive`).

**What you'll need:**
- No inputs — the catalog is static (no org/env scoping)

**Action:** Fetch the LLM provider catalog.

```yaml
api: urn:api:llm-proxy
operationId: listLlmRouteConfigurations
inputs: {}
outputs:
  - name: providers
    path: $.routeConfigurations[*].provider
    labels: $.routeConfigurations[*].provider
    description: Supported provider identifiers (`openai`, `gemini`, `azureopenai`, `bedrockanthropic`, `nvidia`).
  - name: providerCatalog
    path: $.routeConfigurations
    description: Full provider catalog (default URL, default model, per-field `requestKey` / `dataWeaveRequestKey` / `sensitive`, target model enum).
```

**What happens next:** For each provider the user picks, note the required credential fields using the catalog's `fields[]` descriptors. Each field marks whether it's `sensitive` (goes into `llmConfigs.keys` for static mode) or non-sensitive (goes into `llmConfigs.fields`). Per the catalog:

- **openai**: sensitive `key` (static) / `apiKeySelector` (DataWeave). No non-sensitive fields.
- **gemini**: sensitive `key` / `apiKeySelector`. No non-sensitive fields. Gemini proxies accept only one route.
- **azureopenai**: sensitive `apiKey` / `apiKeySelector`. Non-sensitive `deploymentId` (needed for Chat Completions; optional for the Responses API), optional `azureApiVersion`.
- **bedrockanthropic**: sensitive `awsAccessKeyId` / `awsAccessKeyIdSelector`, sensitive `awsSecretAccessKey` / `awsSecretAccessKeySelector`, optional sensitive `awsSessionToken` (static only — not supported in DataWeave mode), non-sensitive `awsRegion` (one of 27 regions listed in the catalog).
- **nvidia**: sensitive `key` / `apiKeySelector`. No non-sensitive fields.

The target model is picked separately for each upstream (the `model` field — see Step 7).

## Step 4: List Flex Gateway Targets

Retrieve connected Flex Gateway targets so the user can pick which one will host the LLM proxy.

**What you'll need:**
- Organization ID from Step 1
- Environment ID from Step 2

**Action:** List gateway targets in the environment.

```yaml
api: urn:api:api-portal-xapi
operationId: getGatewayTargets
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
    description: Organization ID from Step 1
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
outputs:
  - name: targetId
    path: $.rows[*].id
    labels: $.rows[*].name
    description: |-
      The `id` field of the gateway target row (a UUID) — this is the value to pass as `deployment.targetId` and `deployment.targetName` to the LLM proxy create call. The live response wraps rows in a `rows[]` array with top-level pagination fields `totalElements`, `pageSize`, `pageNumber`, `totalPages`. The row shape includes `id`, `targetId` (a different cloud resource ID), `name`, `kind` (e.g., `managed`), `status`, `ready`, `running`, `targetType` (e.g., `private-space`), `version`, and `deploymentTarget`.
  - name: targetName
    path: $.rows[*].name
    labels: $.rows[*].name
    description: Human-readable gateway target name — pass as `deployment.targetName` alongside `targetId`.
```

**What happens next:** User picks a connected, `ready: true` target whose `status` is `UP` / `OK` (not `DISCONNECTED` / `FAILED`). If none are available the user must register one first via Runtime Manager — stop the workflow and surface that as a clear error.

## Step 5: Pre-check Port + Base Path Availability

Before creating the Exchange asset and the API instance, confirm that the chosen `{targetId, port, basePath}` tuple is not already claimed by another API.

**What you'll need:**
- Organization ID, Environment ID, and `targetId` from Steps 1, 2, 4
- The port + base path the user wants (typical port is `8081`; base path must begin with `/`)

**Action:** Query the gateway target for existing APIs on this port+path.

```yaml
api: urn:api:llm-proxy
operationId: getGatewayTargetApisByPortAndPath
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
    description: Organization ID from Step 1
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
  targetId:
    from:
      step: List Flex Gateway Targets
      output: targetId
    description: Gateway target ID from Step 4
  port:
    userProvided: true
    description: >-
      Port the Flex Gateway will listen on for this proxy. Typical values are
      8081 and 8082. Allowed ports are defined per gateway target; if you pick
      an unavailable port, the create call later fails with an
      "Available ports" error listing the valid options.
    example: 8081
    required: true
  path:
    userProvided: true
    description: Base path (must start with `/`). Used by consumers and must be unique for the chosen gateway target + port.
    example: /my-openai-gemini-proxy
    pattern: '^/.+'
    required: true
outputs:
  - name: conflictInstances
    path: $.instances
    description: Empty array means the port + path is available. A populated array means one or more APIs already occupy this port + path; stop and let the user pick a different path.
  - name: targetAllowsPortSharing
    path: $.targetAllowsPortSharing
    description: Whether the gateway target supports multiple APIs on the same port with different base paths. When true, only the `path` must be unique; when false, the `port` must be unique as well.
```

**What happens next:** If `instances` is empty, proceed. Otherwise the user picks a different port or base path.

**Common issues:**
- **Conflict found**: Another API already listens on this port + path. Pick a different base path.

## Step 6: Publish the Exchange Asset

An LLM proxy is backed by an Exchange asset with the same name as the proxy. Publish a minimal `type=llm` asset so the API instance can reference it by `groupId` + `assetId` + `version`. The publish is asynchronous (`x-sync-publication=false`) and returns a `publicationStatusLink` you poll until `status=completed`.

**What you'll need:**
- Organization ID (used as both `organizationId` and Exchange `groupId`)
- The proxy name chosen by the user — this becomes the `assetId` (kebab-case, unique within the organization)
- The inbound request format the proxy will accept from consumers (`openai` or `gemini`) — stored as the asset's `properties.platform`

**Action:** Upload an Exchange asset for the LLM proxy.

```yaml
api: urn:api:exchange-experience
operationId: createOrganizationsByOrganizationidAssetsByGroupidByAssetidByVersion
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
    description: Organization ID from Step 1

  groupId:
    from:
      step: Get Current Organization
      output: organizationId
    description: Exchange group ID (same as organization ID)

  assetId:
    userProvided: true
    description: Kebab-case proxy name. Becomes the Exchange asset ID and the API instance name.
    example: my-openai-gemini-proxy
    pattern: '^[a-z0-9][a-z0-9.\-_]*$'
    required: true

  version:
    value: "1.0.0"
    description: Asset semantic version. Start at 1.0.0 for a new LLM proxy.

  name:
    userProvided: true
    description: Display name (human-readable). Typically the same words as the assetId but can include mixed case / spaces.
    required: true

  type:
    value: llm
    description: LLM-proxy Exchange asset type.

  status:
    value: published
    description: Mark the asset as published immediately.

  properties.apiVersion:
    value: v1
    description: API-version property attached to the asset. The Anypoint UI sets this to `v1`.

  properties.platform:
    userProvided: true
    description: Inbound request format (the OpenAI-format API the consumer calls). Set to `openai` or `gemini` — lowercase.
    example: openai
    required: true

  x-sync-publication:
    value: false
    description: Publish asynchronously; poll the returned status URL before creating the API instance. The LLM proxy flow always uses async publication.
outputs:
  - name: publicationStatusLink
    path: $.publicationStatusLink
    description: URL to poll for publication status. Wait until the asset publication status reports `completed` and an `asset` object (with `assetId`, `groupId`, `version`) is present before proceeding.
```

**What happens next:** The asset is being published. Poll the `publicationStatusLink` (GET, with the same Bearer token) every few seconds until the response's `status` is `completed` and an `asset` object is present — then proceed to Step 7 using `asset.assetId` and `asset.groupId`.

**Common issues:**
- **409 `ASSET_PRE_CONDITIONS_FAILED`** — an asset with the same `{groupId, assetId, version}` already exists and is published. The response body is `{ status: 409, code: "ASSET_PRE_CONDITIONS_FAILED", message: "Cannot create a new asset with the provided groupId, assetId, version, state", details: { errors: ["An asset already exists with this version and published lifecycle state."], asset: { organizationId, groupId, assetId, version } } }`. Pick a different `assetId` and retry.

## Step 7: Create the LLM Proxy (Single POST)

Create the LLM proxy API instance in a single POST that carries the full routing configuration, including each upstream's provider credentials, inline. The server assigns upstream IDs and returns them in the response. Deployment also kicks off inside this call (`deployment.expectedStatus=deployed`); the actual deployment completes asynchronously and is observed by polling (see Step 8).

**Critical body-shape notes (verified against the Anypoint UI's LLM proxy wizard):**

- Asset coordinates live under a `spec` wrapper: `{ spec.groupId, spec.assetId, spec.version }`. The top-level `groupId` / `assetId` / `assetVersion` fields you see in GET responses are READ-ONLY reflections — they are NOT valid keys on the POST body.
- `technology` must be `flexGateway`. Omitting it defaults to `mule3` which is NOT a valid runtime for LLM proxies.
- `endpoint.type` must be `llm`. `endpoint.proxyUri` is `http://0.0.0.0:{port}/{basePath}`.
- `endpoint.deploymentType` and `deployment.type` must both be `HY` (Hybrid — Flex Gateway).
- On the POST body, each upstream inside `routing[].upstreams[]` carries `llmConfigs` **directly on the upstream** (not wrapped in a `metadata` field). The server stores it under `metadata.llmConfigs` internally and returns it that way on the upstream-level GET (`/upstreams/{upstreamId}`), but POST expects it at the top level of the upstream.
- `routing[].upstreams[].id` MUST NOT be set — the server generates upstream UUIDs and returns them in the response.
- `approvalMethod` is `null` for automatic contract approval (LLM proxies' default) or `"manual"` for request-access-required proxies. Omitting it defaults to automatic.
- `providerId` is `null` to use the organization's default identity provider; set to a specific Client Provider UUID to pin Client ID Enforcement to that IDP.
- The Anypoint UI includes additional explicit-null fields inside `endpoint` for cross-API-type compatibility: `endpoint.muleVersion4OrAbove: null`, `endpoint.isCloudHub: null`, `endpoint.referencesUserDomain: null`, and `endpoint.tlsContexts.inbound: null`. They aren't LLM-specific and are not listed as inputs below. If you hit a schema validation error mentioning one of those keys, add them as literal `null`s on the POST body.

**What you'll need:**
- Organization ID, Environment ID from earlier steps
- `assetId` + `groupId` confirmed from Step 6's publication status
- `targetId` and `targetName` from Step 4
- Port + base path from Step 5
- Per-provider configuration (provider identifier, target model, URL, credential fields)

**Action:** Create the LLM proxy API instance with inline upstream provider configs.

```yaml
api: urn:api:llm-proxy
operationId: createEnvironmentLlmProxy
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
    description: Organization ID from Step 1

  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2

  spec.groupId:
    from:
      step: Get Current Organization
      output: organizationId
    description: Exchange group ID (same as organization ID).

  spec.assetId:
    from:
      step: Publish the Exchange Asset
      input: assetId
    description: Proxy name from Step 6.

  spec.version:
    value: "1.0.0"
    description: Matches the asset version published in Step 6.

  technology:
    value: flexGateway
    description: LLM proxies run on Flex Gateway. Must be set explicitly; the default (`mule3`) is not a valid runtime for LLM proxies.

  approvalMethod:
    value: null
    description: "`null` for automatic contract approval (default for LLM proxies); `\"manual\"` when consumers must request access. Changes Skill 4's contract-creation behavior."

  providerId:
    value: null
    description: Client Provider (IDP) UUID. `null` uses the organization's default Anypoint IDP; set to a specific Client Provider UUID to pin Client ID Enforcement to that IDP.

  endpointUri:
    userProvided: true
    description: Optional public consumer URL the proxy is exposed on (e.g., a custom domain). Set to `null` to use the Flex Gateway's computed URL.
    required: false

  endpoint.type:
    value: llm
    description: Marks this instance as an LLM proxy. Required.

  endpoint.proxyUri:
    userProvided: true
    description: "`http://0.0.0.0:{port}/{basePath}` built from the port + base path validated in Step 5."
    example: http://0.0.0.0:8081/my-openai-gemini-proxy
    required: true

  endpoint.deploymentType:
    value: HY
    description: Hybrid deployment (managed Flex Gateway).

  deployment.environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID (same as the URL path param).

  deployment.targetId:
    from:
      step: List Flex Gateway Targets
      output: targetId
    description: Flex Gateway target ID from Step 4.

  deployment.targetName:
    from:
      step: List Flex Gateway Targets
      output: targetName
    description: Flex Gateway target display name from Step 4.

  deployment.type:
    value: HY
    description: Must match `endpoint.deploymentType`.

  deployment.expectedStatus:
    value: deployed
    description: Deploy immediately after creation.

  deployment.overwrite:
    value: false
    description: Do not overwrite an existing deployment on this target.

  deployment.gatewayVersion:
    value: "1.0.0"
    description: Flex Gateway configuration version marker used by the backend.

  instanceLabel:
    userProvided: true
    description: Optional user-defined label that identifies this API instance in the environment. Omit (or set to null) when not needed.
    required: false

  routing:
    userProvided: true
    description: >-
      Array of routes, one entry per provider. Each route carries `label`,
      `rules.headers` (the `x-routing-header` value that the Model-Based
      Routing policy writes internally — consumers never send this header),
      and `upstreams[]`. Each upstream is declared inline with its full
      `llmConfigs` (provider, model, keys, fields) — the server assigns an
      `id` on POST and returns it in the response. Do NOT set `id` on the
      POST body.
    example:
      # Route A - OpenAI with a static API key (no non-sensitive fields)
      - label: Route A
        rules:
          headers:
            x-routing-header: openai
        upstreams:
          - uri: https://api.openai.com/v1/
            label: openai
            weight: 100
            llmConfigs:
              provider: openai
              model: gpt-4o-mini
              keys:
                key: sk-redacted
      # Route B - Gemini with a DataWeave-extracted API key (keys stays empty in DataWeave mode)
      - label: Route B
        rules:
          headers:
            x-routing-header: gemini
        upstreams:
          - uri: https://generativelanguage.googleapis.com/v1beta/
            label: gemini
            weight: 100
            llmConfigs:
              provider: gemini
              model: gemini-2.5-flash
              keys: {}
              fields:
                apiKeySelector: "#[attributes.headers['x-gemini-key']]"
    required: true

  metadata.globalRouting.llmConfigs.routingType:
    value: model-based
    description: Dispatch by the provider resolved from the request body's `model` field. The policy writes `x-routing-header` server-side before route matching.

  metadata.globalRouting.llmConfigs.fallbackRoute:
    userProvided: true
    description: Label of the route to use when no primary `model` prefix matches a configured provider (e.g., `Route A`). Recommended — configure one for every multi-route proxy.
    example: Route A
    required: false

  metadata.globalRouting.llmConfigs.fallbackModel:
    userProvided: true
    description: Target model used when the fallback route is triggered.
    example: gpt-4o-mini
    required: false

outputs:
  - name: environmentApiId
    path: $.id
    description: Numeric API instance ID. Use for later policy application, contract creation, and upstream management.
  - name: upstreamIds
    path: $.routing[*].upstreams[*].id
    description: UUIDs of the upstreams the server generated (one per route). The single-instance API GET returns only `{id, weight}` per entry in `routing[].upstreams[]`; fetch the standalone upstream (GET `/upstreams/{upstreamId}`) to see `uri`, `label`, and `metadata.llmConfigs`.
  - name: deploymentId
    path: $.deployment.id
    description: Deployment ID. Use to poll deployment status in Step 8.
  - name: publicProxyUri
    path: $.endpointUri
    description: Public Flex Gateway URL consumers call. Populated once the Flex Gateway registers the proxy; may be empty on the immediate POST response.
```

**What happens next:** The proxy API instance is created with server-assigned upstream UUIDs. Deployment to the Flex Gateway starts asynchronously. Next, poll the deployment status (Step 8) to wait for the proxy to become live.

**Common issues:**
- **`Ids are not allowed in POST ...`**: You included `id` under `routing[].upstreams[]`. Remove it — the server generates upstream IDs.
- **`Proxy must be deployed in a port that is available in the Managed Flex target. Available ports: ...`**: The chosen port is not available on this target. Pick one of the listed available ports.
- **`There is no asset matching given parameters.`**: The Exchange asset (from Step 6) hasn't finished publishing. Poll the publication status until `completed`.
- **403 Forbidden on `llmProxy` entitlement**: Organization's subscription doesn't include LLM Proxy. Ask the Anypoint admin to enable the entitlement.
- **504 Gateway Timeout at the edge**: Deployment can take longer than the edge proxy timeout. Wait 30 seconds, list LLM proxies (`listEnvironmentLlmProxies`), and confirm the proxy is present — creation may have succeeded despite the 504.

## Step 8: Poll the Deployment Status

The POST in Step 7 returns immediately once the database record is created, but the Flex Gateway deployment finishes asynchronously. Poll the deployment status endpoint until the deployment is healthy before onboarding consumers.

**What you'll need:**
- Organization ID, Environment ID from earlier steps
- `environmentApiId` and `deploymentId` from Step 7's response

**Action:** Poll deployment status (typical client polling interval is 10 seconds until a terminal status is reached). Live captures show the deployment typically reaches the applied state within 60–90 seconds of the POST — the first poll a few seconds after create usually returns `undeployed`, and a follow-up poll ~60 seconds later returns `applied`.

**Response shape:** `{ status, lastActiveDate, apiVersionStatus? }` where `status` is the deployment-side state (`undeployed` while in progress, `applied` when the Flex Gateway has picked up the config, and `failed` on a deployment error), `apiVersionStatus` is present once the API instance itself is live (`active`), and `lastActiveDate` is `null` until traffic flows.

```yaml
api: urn:api:proxies-xapi
operationId: getOrganizationsByOrganizationidEnvironmentsByEnvironmentidApisByEnvironmentapiidDeploymentsByProxydeploymentidStatus
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
  environmentId:
    from:
      step: List Environments
      output: environmentId
  environmentApiId:
    from:
      step: Create the LLM Proxy (Single POST)
      output: environmentApiId
  proxyDeploymentId:
    from:
      step: Create the LLM Proxy (Single POST)
      output: deploymentId
    description: Deployment numeric ID from Step 7's `$.deployment.id`.
outputs:
  - name: deploymentStatus
    path: $.status
    description: Deployment-side state. `undeployed` while the Flex Gateway is still picking up the configuration; `applied` when the configuration has been applied successfully; `failed` on a deployment error. Keep polling until a terminal state is reached.
  - name: apiVersionStatus
    path: $.apiVersionStatus
    description: API-instance-side status. Appears once the deployment reaches `applied` and is set to `active` when the proxy is ready to serve traffic.
  - name: lastActiveDate
    path: $.lastActiveDate
    description: Timestamp of the last observed traffic. `null` until the proxy serves its first request.
```

**What happens next:** When `status` reaches `applied` (and `apiVersionStatus` becomes `active`), the proxy is live. The platform-managed `type: system` policies (LLM Proxy Core, Client ID Enforcement, CORS, DataWeave Headers Transformation, Model-Based Routing, per-provider transcoding, per-provider LLM provider policies) are applied in the background once the gateway picks up the new configuration.

**Common issues:**
- **401 / 403 / 404 on poll**: The deployment was deleted, the session expired, or you lost permission. Stop polling and surface the error.
- **`status: failed`**: Look at the `deployment` section of the API instance (via `listEnvironmentLlmProxies`) for the error detail. Common causes: port already taken after check (race), misconfigured provider URL, missing `llmProxy` entitlement.

## Completion Checklist

- [ ] Step 1 returned `organizationId`
- [ ] Step 2 returned `environmentId`
- [ ] Step 4 returned a `targetId` and `targetName` for a connected Flex Gateway
- [ ] Step 5's `instances` was empty
- [ ] Step 6 published the Exchange asset and the publication-status link reports `completed` with an `asset` object
- [ ] Step 7's `environmentApiId`, `deploymentId`, and `routing[*].upstreams[*].id` are all populated in the response
- [ ] Step 8's deployment status reached `applied` (with `apiVersionStatus: active`)
- [ ] Proxy appears in API Manager → LLM Proxies with `status: active` and the expected `endpointUri`

## What You've Built

✅ **A Flex-Gateway-hosted LLM proxy** — exposes a single OpenAI-format endpoint that fans requests out to multiple LLM providers based on the resolved provider from the request body's `model` field.

✅ **Per-provider credential injection** — either via static keys stored encrypted on the upstream, or via DataWeave expressions that pass through headers from the caller.

✅ **Automatic LLM plumbing policies** — LLM Proxy Core, CORS, header transforms, Client ID Enforcement, per-provider transcoding, and Model-Based Routing are all applied by the platform without explicit configuration.

## Next Steps

1. **Apply rate limiting** — run the `apply-token-rate-limiting-to-llm-proxy` skill to cap token consumption per client.
2. **Onboard consumers** — run the `request-llm-proxy-access` skill to create a client application and contract, returning the consumer's client ID + client secret.
3. **Layer on semantic routing** — if you want content-aware routing (e.g., `Finance` → OpenAI, `Code` → Gemini), see the `create-llm-proxy-semantic-routing` skill.

## Tips and Best Practices

### Credential injection
- **Static keys** are simplest but mean all consumers share the same provider quota. Stored encrypted on the upstream via `llmConfigs.keys.<keyName>` (e.g., `keys.key` for OpenAI/Gemini/NVIDIA, `keys.apiKey` for Azure OpenAI, `keys.awsAccessKeyId` + `keys.awsSecretAccessKey` for Bedrock).
- **DataWeave expressions** (e.g., `#[attributes.headers['x-openai-key']]`) let each consumer bring their own provider key, keeping billing and quota separation clean. These go into `llmConfigs.fields.<selectorName>` (e.g., `fields.apiKeySelector`, `fields.awsAccessKeyIdSelector`, `fields.awsSecretAccessKeySelector`). Note that Bedrock's `awsSessionToken` is static-only — it has no DataWeave selector.

### Naming
- `assetId` must be kebab-case, lowercase, and unique in the organization. Pick something descriptive (e.g., `public-chat-llm-proxy`).
- Route labels (`Route A`, `Route B`, …) are user-defined and referenced by `metadata.globalRouting.llmConfigs.fallbackRoute`.

### Gemini proxies
- The Anypoint UI creates single-route proxies when `properties.platform=gemini`. Keep this in mind: a Gemini-format proxy has exactly one route.

### Fallback
- Configure a fallback route + model for model-based proxies with more than one route. Without it, requests whose `model` prefix doesn't match a configured provider will fail.

## Troubleshooting

### Create returns 504 but the proxy appears in the list
**Symptoms:** `POST /apis` times out at the edge.
**Possible causes:** Backend deployment takes longer than the browser/proxy timeout.
**Solutions:** Wait 30 seconds, list LLM proxies, and confirm the proxy exists before retrying. If it's there, the creation succeeded — proceed to Step 8 polling.

### Gateway shows no available targets
**Symptoms:** Step 4 returns an empty `rows[]` array.
**Possible causes:** No Flex Gateway is registered/connected in this environment.
**Solutions:** Register a Flex Gateway via Runtime Manager first. If using a shared space, confirm the user has Flex Gateway admin permissions.

### `llmProxy` entitlement error on Step 7
**Symptoms:** `AuthorizationError` on create.
**Possible causes:** Subscription doesn't include LLM Proxy.
**Solutions:** Escalate to the Anypoint admin to enable the entitlement.

## Related Jobs

- **create-llm-proxy-semantic-routing** — Same base flow but routes by semantic similarity against prompt topics instead of header matching.
- **apply-token-rate-limiting-to-llm-proxy** — Adds a token-based rate limit policy to an existing LLM proxy.
- **request-llm-proxy-access** — Creates a consumer client application and contract against an existing LLM proxy.
