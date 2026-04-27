---
name: create-llm-proxy-semantic-routing
description: |
  Create an LLM Gateway proxy that routes prompts to different LLM providers
  based on semantic meaning of the prompt content. Each upstream binds to one
  or more prompt topics (e.g., `Finance` → OpenAI, `Code` → Gemini). Uses an
  embedding provider (OpenAI or HuggingFace) and a vector database (Qdrant,
  Pinecone, or Azure AI Search) to classify incoming prompts and pick the
  best-matching route with an optional fallback. Use when the user wants
  semantic routing, topic-based LLM selection, content-aware LLM routing,
  prompt classification, or setting up a semantic service configuration with
  topics like Finance / Code / Support.
---

# Create an LLM Proxy with Semantic Routing

## Overview

Creates an LLM proxy whose routing decision is driven by prompt semantics instead of header values derived from the request body. The proxy embeds each incoming prompt against a configured embedding provider (e.g., OpenAI `text-embedding-3-small`), looks up the closest Global Prompt Topic in a vector database (e.g., Qdrant), and forwards the request to the upstream bound to that topic (via `promptTopicIDs`). Requests whose similarity score falls below the configured threshold go to the fallback route.

**What you'll build:** A deployed LLM proxy with (a) a Semantic Service Configuration (SSC) wiring an embedding provider + vector DB; (b) two or more Global Prompt Topics (e.g., `Finance`, `Code`); (c) one upstream per LLM provider, each bound to the relevant topic(s); (d) a fallback route/model for off-topic prompts.

## Prerequisites

Before starting, ensure you have:

1. **Authentication and entitlements**
   - Valid Bearer token for Anypoint Platform
   - API Manager permissions: **Manage APIs Configuration** and **Exchange Viewer**
   - The organization's `llmProxy` entitlement is enabled

2. **Flex Gateway target registered**
   - At least one Flex Gateway target connected (allowed ports typically 8081, 8082)

3. **Embedding provider credentials**
   - Either an OpenAI API key (for `text-embedding-3-small` / `text-embedding-3-large` / `text-embedding-ada-002`)
   - Or a HuggingFace token (for `sentence-transformers/all-MiniLM-L6-v2`)

4. **Vector database** (required for `serviceType=advanced`)
   - A Qdrant, Pinecone, or Azure AI Search instance with credentials + URL + collection / index / namespace name

5. **LLM provider credentials** for the routes you configure (OpenAI / Gemini / Azure OpenAI / Bedrock Anthropic / NVIDIA) — same per-provider field shapes as in `create-llm-proxy-model-based-routing`

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

**What happens next:** You have the organization ID.

## Step 2: List Environments

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
    description: Target environment ID
```

**What happens next:** Pick the environment that will host the LLM proxy.

## Step 3: List Existing Semantic Service Configurations

A Semantic Service Configuration (SSC) is reusable across proxies. First list existing SSCs; the user may pick one or create a new one in Step 5.

```yaml
api: urn:api:llm-proxy
operationId: listSemanticServiceConfigs
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
  - name: semanticServiceConfigId
    path: $[*].id
    labels: $[*].label
    description: Existing SSC UUIDs (response is a bare array; each entry has `id`, `label`, `provider`, `url`, `model`, `serviceType`).
```

**What happens next:** If the user picks an existing SSC, skip Step 5. Otherwise create one there after creating the topics in Step 4.

## Step 4: Create Global Prompt Topics

Create one Global Prompt Topic per semantic bucket you want to route on. Topics are created at environment scope (not explicitly linked to an SSC at creation time); on create, pass `semanticServiceConfigId: null`. If you're creating a new SSC in Step 5, pass the resulting topic IDs as `globalTopics` on the SSC POST — that's how the binding is made.

Repeat once per topic (typically 2–10; the Anypoint UI hard-caps at 100).

**Endpoint selection for basic vs advanced SSCs:** The Anypoint UI uses **two different endpoints** depending on the SSC's `serviceType`:

- **`advanced` SSC** → `POST /apimanager/xapi/v1/organizations/:orgId/environments/:envId/global-prompt-topics` (this step). Topics are environment-scoped and bound to the SSC via `SSC.globalTopics[]` on SSC create.
- **`basic` SSC** → `POST /apimanager/xapi/v1/organizations/:orgId/environments/:envId/prompt-topics` (different endpoint). The Anypoint UI uses this from within the LLM proxy wizard's outbound step to create topics scoped to a specific proxy via an `apiVersionId` body field. The payload shape is otherwise the same (`topicName`, `utterances`, `usedForDenyList`); `semanticServiceConfigId` is not sent, and `apiVersionId` (the proxy ID) is added instead.

This skill documents the **advanced** flow (recommended for scale). For basic SSCs, create the proxy first without topics, then iterate creating topics via the `prompt-topics` endpoint with the new proxy's `environmentApiId` as `apiVersionId`.

**Action:** Create a Global Prompt Topic.

```yaml
api: urn:api:llm-proxy
operationId: createGlobalPromptTopic
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
  environmentId:
    from:
      step: List Environments
      output: environmentId

  topicName:
    userProvided: true
    description: Short topic label (e.g., `Finance`, `Code`). Referenced by upstreams via `promptTopicIDs`.
    example: Finance
    required: true

  utterances:
    userProvided: true
    description: >-
      Newline-delimited string of example prompts. Each line is treated as a
      separate utterance; a common convention is to prefix each line with
      `* ` but any text works. For `serviceType=basic` SSCs keep this small
      (~10 per topic); for `advanced` the Anypoint UI permits up to 20000
      utterance lines per topic.
    example: |
      * Calculate compound interest
      * Explain stock market fundamentals
      * How to file taxes
      * Investment portfolio strategies
      * Mortgage calculation formula
    required: true

  usedForDenyList:
    value: false
    description: Whether this topic is used as a deny-list topic (blocks rather than routes). Set `false` for routing topics; set `true` only when creating topics for the semantic prompt guard policy.

  semanticServiceConfigId:
    value: null
    description: >-
      SSC to pre-bind this topic to. When creating a set of topics alongside a
      new SSC, pass `null` here and list the topic IDs under the SSC POST's
      `globalTopics` array — that binds them in a single step. When binding
      to an existing SSC, you can pass that SSC's UUID directly.

outputs:
  - name: promptTopicId
    path: $.id
    description: UUID of the created topic. Reference this UUID inside `routing[].upstreams[].llmConfigs.promptTopicIDs[]` in Step 9 to wire the topic to an upstream.
```

**What happens next:** Repeat until all topics exist. Keep the UUIDs — they're needed for SSC creation (Step 5, optional) and upstream configuration (Step 9). Note that the POST response returns `utterances` wrapped as an object containing a `data` array of utterance entries; the list endpoint returns the plain newline-delimited string form.

## Step 5: (Optional) Create a Semantic Service Configuration

Create an `advanced` SSC wiring an embedding provider + external vector DB. Use `basic` for lightweight scenarios (up to 6 topics, ~10 utterances each — the basic mode keeps topic embeddings in the Flex Gateway policy config rather than a vector DB).

**What you'll need:**
- Embedding provider credentials
- Vector DB credentials + URL (only for `serviceType=advanced`)
- Topic IDs from Step 4 (only for `advanced`, passed as `globalTopics`)

**Action:** Create the SSC.

```yaml
api: urn:api:llm-proxy
operationId: createSemanticServiceConfig
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
  environmentId:
    from:
      step: List Environments
      output: environmentId

  label:
    userProvided: true
    description: Unique label within the environment.
    example: openai-qdrant-prod
    required: true

  serviceType:
    userProvided: true
    description: >-
      `basic` — topic embeddings are maintained by the Anypoint backend and
      kept inside the Flex Gateway's Semantic Routing policy configuration;
      recommended for demos and small topic sets (the Anypoint UI documents
      a cap of ~6 topics and 10 utterances per topic).
      `advanced` — embeddings live in an external vector database
      (Qdrant / Pinecone / Azure AI Search); the Flex Gateway's Semantic
      Routing policy queries the DB at runtime for each request. Use for
      production and scale.
    example: advanced
    required: true

  provider:
    userProvided: true
    description: Embedding provider. On POST the Anypoint UI only lets users pick `openai` or `huggingface`.
    example: openai
    required: true

  config.authKey:
    userProvided: true
    description: |-
      Embedding provider API key. Validated live at creation time — the
      backend calls the embedding provider with this key and rejects the
      request with `ValidationError: The authentication key provided is
      invalid` if the key fails. Must be a real, active key. The 201
      response echoes the `authKey` back verbatim in `config.authKey`
      (it is not redacted on create); treat the response body as
      sensitive and do not log it.
    required: true

  config.url:
    userProvided: true
    description: Embedding endpoint URL. The Anypoint UI defaults to `https://api.openai.com/v1/embeddings` for OpenAI and `https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction` for HuggingFace.
    example: https://api.openai.com/v1/embeddings
    required: true

  config.model:
    userProvided: true
    description: |-
      Embedding model name. Valid values per the Anypoint UI:
      - `openai`: `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`
      - `huggingface`: `all-MiniLM-L6-v2`
      Required from the user's perspective — the Anypoint UI validates it. The server may accept the POST without it (some SSCs in GET responses omit `model`), but always supply it to match UI behavior.
    example: text-embedding-3-small
    required: true

  vectorDBConfig.provider:
    userProvided: true
    description: Vector database provider (required when `serviceType=advanced`).
    example: qdrant
    required: false

  vectorDBConfig.url:
    userProvided: true
    description: Vector database base URL (required when `serviceType=advanced`).
    required: false

  vectorDBConfig.apiKey:
    userProvided: true
    description: Vector database API key (required when `serviceType=advanced`).
    required: false

  vectorDBConfig.collection:
    userProvided: true
    description: Collection name (Qdrant-specific). For Azure AI Search use `indexName` instead; for Pinecone use `namespace`.
    required: false

  vectorDBConfig.namespace:
    userProvided: true
    description: Namespace (Pinecone-specific).
    required: false

  vectorDBConfig.indexName:
    userProvided: true
    description: Index name (Azure AI Search-specific).
    required: false

  globalTopics:
    userProvided: true
    description: >-
      Array of Global Prompt Topic UUIDs (from Step 4) to bind to this SSC
      at creation time. Used only for `serviceType=advanced`. The Anypoint
      UI then generates a setup script to seed these topics' utterance
      embeddings into the configured vector DB — the script is a separate
      download from the UI, not called via this API.
    required: false

outputs:
  - name: semanticServiceConfigId
    path: $.id
    description: UUID of the created Semantic Service Configuration.
```

**What happens next:** The SSC is created. For `advanced`, the Anypoint UI downloads a setup script (`semantic-service-setup-<configId>.sh`) that the user runs side-band to seed the vector DB with topic embeddings — this skill does not expose that script download as an API call.

## Step 6: List Flex Gateway Targets

```yaml
api: urn:api:api-portal-xapi
operationId: getGatewayTargets
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
  environmentId:
    from:
      step: List Environments
      output: environmentId
outputs:
  - name: targetId
    path: $.rows[*].id
    labels: $.rows[*].name
    description: The `id` field of each gateway target row (a UUID). Use it as both `deployment.targetId` and — combined with the row's `name` — `deployment.targetName` below.
  - name: targetName
    path: $.rows[*].name
    labels: $.rows[*].name
    description: Human-readable gateway target name.
```

## Step 7: Pre-check Port + Base Path Availability

```yaml
api: urn:api:llm-proxy
operationId: getGatewayTargetApisByPortAndPath
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
  environmentId:
    from:
      step: List Environments
      output: environmentId
  targetId:
    from:
      step: List Flex Gateway Targets
      output: targetId
  port:
    userProvided: true
    example: 8081
    required: true
  path:
    userProvided: true
    example: /my-semantic-proxy
    pattern: '^/.+'
    required: true
outputs:
  - name: conflictInstances
    path: $.instances
    description: Empty array means the port+path is available.
```

**What happens next:** If non-empty, stop and let the user pick a different base path.

## Step 8: Publish the Exchange Asset

An LLM proxy is backed by an Exchange asset. Publish a minimal `type=llm` asset; the publish is asynchronous and returns a `publicationStatusLink` to poll until `status=completed`.

```yaml
api: urn:api:exchange-experience
operationId: createOrganizationsByOrganizationidAssetsByGroupidByAssetidByVersion
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
  groupId:
    from:
      step: Get Current Organization
      output: organizationId
  assetId:
    userProvided: true
    example: my-semantic-proxy
    pattern: '^[a-z0-9][a-z0-9.\-_]*$'
    required: true
  version:
    value: "1.0.0"
  name:
    userProvided: true
    description: Display name.
    required: true
  type:
    value: llm
  status:
    value: published
  properties.apiVersion:
    value: v1
  properties.platform:
    userProvided: true
    description: Inbound request format the proxy accepts from consumers. Set to `openai` or `gemini`. Must match `llmConfigs.format` on each upstream in Step 9.
    example: openai
    required: true
  x-sync-publication:
    value: false
outputs:
  - name: publicationStatusLink
    path: $.publicationStatusLink
    description: Poll until the response's `status` is `completed` and an `asset` object is present.
```

**Common issues:**
- **409 `ASSET_PRE_CONDITIONS_FAILED`** — an asset with the same `{groupId, assetId, version}` already exists and is published. Body: `{ status: 409, code: "ASSET_PRE_CONDITIONS_FAILED", message: "Cannot create a new asset with the provided groupId, assetId, version, state", details: { errors: [...], asset: {...} } }`. Pick a different `assetId` and retry.

## Step 9: Create the LLM Proxy (Single POST)

Create the semantic LLM proxy in a single POST that carries the full routing configuration, including each upstream's provider credentials, target model, inbound `format`, and the list of `promptTopicIDs` that should route to it. The server assigns upstream IDs and starts deployment asynchronously.

**Critical body-shape notes (verified against the Anypoint UI's LLM proxy wizard):**

- Asset coordinates go under `spec.{groupId, assetId, version}`.
- `technology` must be `flexGateway`.
- `endpoint.type=llm`, `endpoint.deploymentType=HY`, `deployment.type=HY`.
- On the POST body, each upstream inside `routing[].upstreams[]` carries `llmConfigs` **directly on the upstream** (not wrapped in a `metadata` field). The upstream-level GET returns it as `metadata.llmConfigs`, but POST expects it at the top level of the upstream.
- For semantic routing:
  - `metadata.globalRouting.llmConfigs.routingType` is `semantic-based`.
  - `metadata.semanticServiceConfigId` (at the `metadata` level, NOT under `globalRouting`) is required and set to the SSC UUID from Step 3/5.
  - Each upstream's `llmConfigs` must include `format` (set to match the inbound `properties.platform` from Step 8 — typically `openai`) and `promptTopicIDs` (the Step 4 topic UUIDs that should route to this upstream).
- `approvalMethod` is `null` for automatic contract approval (default) or `"manual"` for request-access-required proxies.
- The Anypoint UI includes additional explicit-null fields inside `endpoint` for cross-API-type compatibility: `endpoint.muleVersion4OrAbove: null`, `endpoint.isCloudHub: null`, `endpoint.referencesUserDomain: null`, and `endpoint.tlsContexts.inbound: null`. They aren't LLM-specific and are not listed as inputs below. If you hit a schema validation error mentioning one of those keys, add them as literal `null`s on the POST body.

**Action:**

```yaml
api: urn:api:llm-proxy
operationId: createEnvironmentLlmProxy
inputs:
  organizationId:
    from:
      step: Get Current Organization
      output: organizationId
  environmentId:
    from:
      step: List Environments
      output: environmentId

  spec.groupId:
    from:
      step: Get Current Organization
      output: organizationId
  spec.assetId:
    from:
      step: Publish the Exchange Asset
      input: assetId
  spec.version:
    value: "1.0.0"

  technology:
    value: flexGateway

  approvalMethod:
    value: null
    description: "`null` for automatic contract approval (default); `\"manual\"` for request-access."

  providerId:
    value: null
    description: Client Provider (IDP) UUID. `null` uses the organization's default Anypoint IDP.

  endpointUri:
    userProvided: true
    description: Optional public consumer URL (custom domain). Set to `null` to use the computed Flex Gateway URL.
    required: false

  endpoint.type:
    value: llm
  endpoint.proxyUri:
    userProvided: true
    example: http://0.0.0.0:8081/my-semantic-proxy
    required: true
  endpoint.deploymentType:
    value: HY

  deployment.environmentId:
    from:
      step: List Environments
      output: environmentId
  deployment.targetId:
    from:
      step: List Flex Gateway Targets
      output: targetId
  deployment.targetName:
    from:
      step: List Flex Gateway Targets
      output: targetName
  deployment.type:
    value: HY
  deployment.expectedStatus:
    value: deployed
  deployment.overwrite:
    value: false
  deployment.gatewayVersion:
    value: "1.0.0"

  instanceLabel:
    userProvided: true
    description: Optional label identifying this API instance.
    required: false

  routing:
    userProvided: true
    description: >-
      One route per upstream. Each upstream is declared inline with its full
      `llmConfigs` — provider, model, `format` (matching the inbound
      `properties.platform`), credential keys/fields, and `promptTopicIDs`
      (the Global Prompt Topic UUIDs from Step 4 that should route to this
      upstream). The server assigns `id`s on POST and returns them.
      `rules.headers.x-routing-header` is the internal dispatch signal the
      Semantic Routing policy writes after picking the best-matched topic;
      consumers never send this header.
    example:
      # Route A - OpenAI, static key, bound to the Finance prompt topic
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
              format: openai
              keys:
                key: sk-redacted
              promptTopicIDs:
                - <finance-topic-uuid>
      # Route B - Gemini, DataWeave-extracted key, bound to the Code prompt topic
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
              format: openai
              keys: {}
              fields:
                apiKeySelector: "#[attributes.headers['x-gemini-key']]"
              promptTopicIDs:
                - <code-topic-uuid>
    required: true

  metadata.globalRouting.llmConfigs.routingType:
    value: semantic-based

  metadata.globalRouting.llmConfigs.fallbackRoute:
    userProvided: true
    description: Label of the route to use when the best-matched topic's similarity score falls below `fallbackThreshold` (recommended for semantic proxies).
    example: Route A
    required: false

  metadata.globalRouting.llmConfigs.fallbackModel:
    userProvided: true
    description: Target model for the fallback route.
    example: gpt-4o-mini
    required: false

  metadata.globalRouting.llmConfigs.fallbackThreshold:
    userProvided: true
    description: Minimum similarity score (0.0–1.0) required to match a primary route. Scores below this trigger the fallback. The Anypoint UI defaults this to 0.5.
    example: 0.6
    required: false

  metadata.globalRouting.llmConfigs.denyTopicIDs:
    userProvided: true
    description: >-
      Optional array of Global Prompt Topic UUIDs that, when matched, block
      the request rather than routing it. Used with the semantic prompt guard
      policy. Omit the key entirely when no deny-list is configured.
    required: false

  metadata.semanticServiceConfigId:
    from:
      step: List Existing Semantic Service Configurations
      output: semanticServiceConfigId
    description: SSC UUID from Step 3 (existing) or Step 5 (newly created). Required for semantic routing. Lives at the top `metadata` level — not inside `globalRouting`.

outputs:
  - name: environmentApiId
    path: $.id
    description: Numeric API instance ID.
  - name: upstreamIds
    path: $.routing[*].upstreams[*].id
    description: Server-generated upstream UUIDs. The API-instance GET returns `{id, weight}` only; fetch a single upstream (GET `/upstreams/{upstreamId}`) to see the stored `metadata.llmConfigs`.
  - name: deploymentId
    path: $.deployment.id
    description: Deployment ID for Step 10's status polling.
  - name: publicProxyUri
    path: $.endpointUri
    description: Public Flex Gateway URL consumers call. Populated once the Flex Gateway registers the proxy.
```

**What happens next:** The proxy is created and deployment starts asynchronously. Once the Flex Gateway picks up the configuration, the platform-managed `type: system` policies (LLM Proxy Core, Client ID Enforcement, CORS, per-provider transcoding, per-provider LLM provider policies, and the Semantic Routing policy for the chosen embedding-provider + vector-DB combination) are applied.

**Common issues:**
- **`Ids are not allowed in POST ...`**: You included `id` on `routing[].upstreams[]`. Remove it.
- **Missing `semanticServiceConfigId`**: Semantic routing requires the SSC UUID at the `metadata` top level — not inside `globalRouting.llmConfigs`.
- **Missing `format` on upstream**: For semantic routing, each upstream's `llmConfigs.format` must be set (usually `openai`). Without it the transcoding policy can't be selected.

## Step 10: Poll the Deployment Status

Poll deployment status (typical client polling interval is 10 seconds). Live captures show the deployment typically reaches the applied state within 60–90 seconds of the POST.

**Response shape:** `{ status, lastActiveDate, apiVersionStatus? }` where `status` is `undeployed` while in progress, `applied` when the configuration has been applied, and `failed` on a deployment error. `apiVersionStatus` is set to `active` once the proxy is ready to serve traffic. `lastActiveDate` is `null` until traffic flows.

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
    description: Deployment ID from Step 9's `$.deployment.id`.
outputs:
  - name: deploymentStatus
    path: $.status
    description: Deployment-side state. `undeployed` while the Flex Gateway is still picking up the configuration; `applied` on success; `failed` on error. Keep polling until a terminal state is reached.
  - name: apiVersionStatus
    path: $.apiVersionStatus
    description: API-instance-side status. Appears once the deployment is `applied` and is set to `active` when the proxy is ready to serve traffic.
```

**What happens next:** When `status` reaches `applied` (and `apiVersionStatus` becomes `active`), re-fetch the LLM proxy and confirm `endpointUri` is populated. For `advanced` SSCs, also verify you've run the UI-generated setup script side-band to populate the vector DB with topic embeddings — without that, the semantic routing policy has nothing to match against and every request will hit the fallback route.

## Completion Checklist

- [ ] Semantic Service Configuration exists (Step 3 existing, or Step 5 new)
- [ ] One Global Prompt Topic per semantic bucket exists (Step 4)
- [ ] Port + base path checked available (Step 7)
- [ ] Exchange asset published and `completed` (Step 8)
- [ ] LLM proxy POST returned `environmentApiId`, `deploymentId`, and upstream UUIDs inside `routing[*].upstreams[*].id` (Step 9)
- [ ] Each upstream's `llmConfigs` carries `format`, `provider`, `model`, credential keys/fields, AND `promptTopicIDs`
- [ ] Deployment status reached `applied` with `apiVersionStatus: active` (Step 10)
- [ ] For advanced SSCs: setup script run against the vector DB so topic embeddings are searchable (side-band)
- [ ] Proxy shows `status: active` with a populated `endpointUri`

## What You've Built

✅ **A semantically routed LLM proxy** — routes prompts to the best-matching LLM provider by embedding similarity against the configured Global Prompt Topics.

✅ **Reusable prompt topics** — Global Prompt Topics can be referenced by multiple proxies and updated centrally via `updateGlobalPromptTopic`.

✅ **Fallback-ready** — off-topic prompts (those with similarity scores below `fallbackThreshold`) are routed to a dedicated fallback route/model.

## Next Steps

1. **Layer on semantic prompt guarding** — apply a `semantic-prompt-guard-policy-<embeddingProvider>-<vectorDB>` policy on deny-listed topics (configured via `metadata.globalRouting.llmConfigs.denyTopicIDs`).
2. **Apply token rate limiting** — run `apply-token-rate-limiting-to-llm-proxy`.
3. **Onboard consumers** — run `request-llm-proxy-access`.

## Tips and Best Practices

### Utterances
- 10–20 diverse utterances per topic is a good starting point for `advanced`. For `basic` keep to the documented cap (~10 per topic).
- Cover variations in phrasing, length, and formality.

### Threshold tuning
- `0.6` is a reasonable default. The Anypoint UI initializes the threshold state at `0.5`. Monitor the `x-llm-proxy-routing-fallback` response header in production to gauge fallback rate.

### Vector DB
- Qdrant is the simplest to get started with.
- Use separate collections / indexes / namespaces per environment.

### Binding topics to SSC
- When creating a new SSC alongside fresh topics, create the topics first (Step 4, each with `semanticServiceConfigId: null`), then pass their IDs as `globalTopics` on the SSC POST (Step 5). This matches the Anypoint UI's two-phase flow.

## Troubleshooting

### Topic misclassification
**Symptoms:** Prompts that should match topic A are routed to topic B.
**Solutions:** Add more diverse utterances to both topics, or raise the similarity threshold.

### All requests going to the fallback route
**Symptoms:** Every call sets `x-llm-proxy-routing-fallback: true`.
**Possible causes:** The vector DB wasn't seeded — topic embeddings aren't searchable.
**Solutions:** For `advanced` SSCs, run the setup script downloaded from the Anypoint UI against your vector DB, then retry.

### 504 Gateway Timeout on create
**Solutions:** Wait 30 seconds, list LLM proxies, confirm the proxy exists before retrying. Proceed to Step 10 polling if it does.

## Related Jobs

- **create-llm-proxy-model-based-routing** — Same base flow but routes by header match (derived from the request body `model` field) instead of semantics.
- **apply-token-rate-limiting-to-llm-proxy** — Adds a token-based rate limit policy.
- **request-llm-proxy-access** — Creates a consumer client application and contract.
