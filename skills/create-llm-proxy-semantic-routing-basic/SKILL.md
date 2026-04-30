---
name: create-llm-proxy-semantic-routing-basic
description: |
  Create an LLM Gateway proxy that routes prompts by semantic similarity
  using a **basic** Semantic Service Configuration. Topic embeddings live
  inline in the Flex Gateway policy config — **no vector database is
  needed.** Capped at ~6 topics with ~10 utterances per topic. Pick this
  flow for demos, small topic sets, or when the user does not want to
  stand up a vector database. For larger scale, use
  `create-llm-proxy-semantic-routing-advanced` (Qdrant / Pinecone / Azure
  AI Search). Use when the user wants semantic routing without a vector
  DB, basic prompt classification, or a quick semantic LLM proxy.
---

# Create an LLM Proxy with Semantic Routing — Basic (no vector DB)

## Overview

Creates an LLM proxy whose routing decision is driven by prompt semantics, using a **basic** Semantic Service Configuration. The basic flow embeds each topic's utterances at create time and stores the embeddings **inline in the Flex Gateway's Semantic Routing policy config** — there is no external vector database. The Flex Gateway holds the embeddings in memory and matches incoming prompts against them at request time.

**Basic-mode limits** (per the Anypoint UI's documented caps):
- ~6 topics per proxy
- ~10 utterances per topic
- No side-band setup; embeddings are computed and stored inline by the platform
- The platform auto-attaches the basic semantic-routing policy variant

If you need more, switch to `create-llm-proxy-semantic-routing-advanced` (uses an external vector DB; no per-proxy / per-topic caps).

**What you'll build:** a deployed LLM proxy with two or more semantic topics (e.g. `Finance`, `Code`), each topic bound to one upstream LLM provider, with the routing decision made by the gateway based on prompt embedding similarity.

## Prerequisites — what the agent will ask the user

Tell the user upfront what you'll need so they can prep. Some things are easier to enumerate later (after API calls), but the user-supplied values you'll need eventually are:

1. **Authentication and entitlements**
   - Anypoint username + password (used in the auth section to mint a Bearer token).
   - API Manager permissions: **Manage APIs Configuration**, **Exchange Viewer**, **Manage Policies**.
   - Organization's `llmProxy` entitlement enabled — verify by checking the `listMe` response body's `user.organization.entitlements.llmProxy: true` (Step 1).
2. **Proxy basics**
   - Proxy name (kebab-case — becomes the Exchange `assetId` and the API instance name)
   - Inbound API format the consumers will send: `openai` (universal default) or `gemini`
   - Port + base path the Flex Gateway will listen on (typical: `8081` + `/<your-proxy-name>`)
3. **Embedding service**
   - Provider — `openai` or `huggingface` (the basic-flow only accepts these two)
   - The corresponding credential — OpenAI API key, or HuggingFace token
   - The embedding model — for OpenAI: `text-embedding-3-small`, `text-embedding-3-large`, or `text-embedding-ada-002`. For HuggingFace: `all-MiniLM-L6-v2`
4. **LLM provider credentials** for each upstream the proxy routes to (OpenAI / Gemini / Azure OpenAI / Bedrock Anthropic / NVIDIA)
5. **Flex Gateway target** — which gateway target to deploy on. You'll enumerate available targets in Step 6 and let the user pick.
6. **Topics + utterances** — the routing categories and example prompts per category. Ask the user to provide either:
   - **Inline** in chat (preferred when there are only a couple of topics) — e.g. *"Finance: 'compound interest', 'mortgage payment'; Code: 'sort a list', 'debug error'"*
   - **As a file path** to a CSV or JSON they already have on disk (preferred when there are many topics/utterances). You'll read and parse it yourself in Step 5 — see that step for accepted shapes.

Read the prerequisites to the user up front, gather what they can give you immediately (proxy name, port, basepath, platform, provider keys, topics), and defer the listing-required choices (env, Flex Gateway target, existing SSCs) to the relevant steps.

**Important — verifying the proxy works end-to-end requires a separate skill.** This skill ends with a deployed proxy in `status: active`, but every call to it will return `401 {"error":"Authentication Attempt Failed"}` until the user has been minted a `client_id` + `client_secret`. To complete the loop, run the `request-llm-proxy-access` skill after this one. The final test step (after Step 10) points you at it.

## Read `llmproxy.yaml` first (preferred input format)

Customers can declare their entire proxy config in a single `llmproxy.yaml` file alongside `.env`. If the customer points you at one (or one already exists in the working directory), **read it before Step 1** and use it to populate as many step inputs as possible. Where the YAML defines a value, the corresponding step becomes a no-op. Where it doesn't, fall back to the interactive flow described in that step.

You're an LLM agent — be flexible about field names and structure. The customer's YAML may not match the recommended shape exactly. Read what's there, infer field meaning, ask for clarification only when truly ambiguous.

```yaml
# llmproxy.yaml — semantic-basic example
proxy:
  name: my-semantic-proxy        # required (kebab-case)
  display_name: My Semantic Proxy
  organization_id: <uuid>        # optional — if omitted, agent calls listMe (Step 1)
  environment_id: <uuid>         # optional — if omitted, agent calls listEnvironments (Step 2)

deployment:
  flex_gateway_target_id: <uuid>      # optional — if omitted, agent calls getGatewayTargets (Step 6)
  flex_gateway_target_name: <name>
  port: 8081                          # optional — default 8081
  base_path: /my-semantic-proxy       # optional — default /<proxy.name>

inbound:
  format: openai                # required — openai | gemini

routing:
  type: semantic-based          # required — must be semantic-based for this skill
  ssc:
    type: basic                 # required — must be basic for this skill
    id: <existing-ssc-uuid>     # OPTIONAL — if set, skip Step 3/4 (use this SSC). Note: the auto-rebind quirk in Step 5 may still pick a different SSC at topic-create time.
    embedding:                  # required only if creating a new SSC (Step 4)
      provider: openai          # openai | huggingface
      model: text-embedding-3-small
      env_var: OPENAI_KEY       # name of the .env entry holding the embedding API key
  topics:
    # Inline (preferred for ≤3 topics):
    - name: Finance
      route_label: Route A      # which route should serve prompts that match this topic
      utterances:
        - Calculate compound interest
        - Explain stock market fundamentals
        - How to file taxes
    - name: Code
      route_label: Route B
      utterances:
        - Write a Python function to sort a list
        - Debug this JavaScript error
    # OR — alternatives to `topics:` inline (use one of these instead):
    # topics_csv: ./topics.csv      # CSV with columns topic_name,utterance,route_label
    # topics_json: ./topics.json    # JSON: [ {topicName, utterances:[], routeLabel}, ... ]
  routes:
    - label: Route A
      provider: openai
      model: gpt-4o-mini
      key:
        mode: static
        env_var: OPENAI_KEY
    - label: Route B
      provider: gemini
      model: gemini-2.5-flash
      key:
        mode: dataweave
        header: x-gemini-key
  fallback:
    route_label: Route A
    model: gpt-4o-mini
    threshold: 0.5              # similarity score below which fallback fires; UI default is 0.5
```

`.env` keys referenced by `key.env_var` and `embedding.env_var` are looked up by exact name. The `.env` format may be `KEY=value` or `Key: value` — read literally. If a referenced env var is missing, stop and ask the user.

Step-input lookup table:

| Step | What it needs | YAML field | Behavior if missing |
|---|---|---|---|
| 1 (listMe) | organization id | `proxy.organization_id` | call `listMe` to discover |
| 2 (listEnvironments) | environment id | `proxy.environment_id` | call `listEnvironments`, ask user to pick |
| 3 (listSemanticServiceConfigs) | (informational — to surface existing basic SSCs) | `routing.ssc.id` already set → skip | otherwise list and surface to user |
| 4 (createSemanticServiceConfig) | embedding provider, model, env_var | `routing.ssc.id` set → skip; otherwise needs `routing.ssc.embedding.*` | required from YAML; if missing, ask user |
| 5 (createPromptTopic) | topics + utterances | `routing.topics` (inline) OR `routing.topics_csv` / `topics_json` (path) | otherwise ask user inline |
| 6 (getGatewayTargets) | gateway target | `deployment.flex_gateway_target_id` + `_name` | otherwise call API, ask user |
| 7 (port + base path) | port + base path | `deployment.port` + `deployment.base_path` | defaults `8081` + `/<proxy.name>` |
| 8 (asset publish) | proxy name + display name + inbound format | `proxy.name` + `proxy.display_name` + `inbound.format` | required from YAML; if missing, ask user |
| 9 (proxy create) | full routing block | `routing.routes[]` + `routing.fallback` | required from YAML; if missing, ask user route-by-route |

If the customer hasn't supplied a YAML, run the entire interactive flow — every step still works without it.

## API endpoints used in this skill

| Step | Operation | Method + URL |
|---|---|---|
| (auth) | login (one-time, before Step 1) | `POST {host}/accounts/login` |
| 1 | `listMe` | `GET {host}/accounts/api/me` |
| 2 | `listEnvironments` | `GET {host}/accounts/api/organizations/{organizationId}/environments` |
| 3 | `listSemanticServiceConfigs` | `GET {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/semantic-service-configs` |
| 4 | `createSemanticServiceConfig` | `POST {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/semantic-service-configs` |
| 5 | `createPromptTopic` | `POST {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/prompt-topics` |
| 6 | `getGatewayTargets` | `GET {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/gateway-targets` |
| 7 | `getGatewayTargetApisByPortAndPath` | `GET {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/gateway-targets/{targetId}/apis?port=&path=` |
| 8 | Exchange asset publish | `POST {host}/exchange/api/v2/organizations/{orgId}/assets/{groupId}/{assetId}/{version}` |
| 9 | `createEnvironmentLlmProxy` | `POST {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/apis` |
| 10 | deployment status poll | `GET {host}/proxies/xapi/v1/organizations/{orgId}/environments/{envId}/apis/{environmentApiId}/deployments/{deploymentId}/status` |
| (cleanup) | DELETE API instance | `DELETE {host}/apimanager/api/v1/organizations/{orgId}/environments/{envId}/apis/{environmentApiId}` |
| (cleanup) | DELETE Exchange asset | `DELETE {host}/exchange/api/v2/assets/{groupId}/{assetId}/{version}` (no `organizations/{orgId}` prefix on the delete path) |

`{host}` is `https://anypoint.mulesoft.com` for prod, `https://stgx.anypoint.mulesoft.com` for stgx, `https://eu1.anypoint.mulesoft.com` for EU. Use the same host for every call within one flow.

URL gotchas:
- The deployment-status endpoint is at `/proxies/xapi/v1/...`, not `/apimanager/xapi/v1/...` — different prefix from everything else.
- The Exchange asset DELETE URL drops the `organizations/{orgId}` prefix the publish URL has. DELETE on the publish URL returns `405 Method Not Allowed`.
- The single-instance API GET lives at `/apimanager/api/v1/...` (used by cleanup), not `/apimanager/xapi/v1/...` (which only allows PATCH).

## Authenticate first (mint a Bearer token)

Anypoint's experience APIs use bearer-token auth. Mint a token by calling the login endpoint with the user's credentials. This is a one-time setup before Step 1.

**What you'll need:**
- The Anypoint host (`{host}` from the table above).
- The user's Anypoint username + password.

**Action:** `POST {host}/accounts/login` with body `{"username": "...", "password": "..."}`. The response is JSON with `access_token` and `token_type: "bearer"`. Cache `access_token` for every subsequent call as the `Authorization: Bearer <token>` header.

```bash
TOKEN=$(curl -s -X POST "$HOST/accounts/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"...","password":"..."}' \
  | jq -r .access_token)
```

If `access_token` is empty, login failed — verify the credentials and the host.

## Step 1: Get Current Organization

**Skip this step if `proxy.organization_id` is already set in `llmproxy.yaml`** — go to Step 2 (or Step 3 if `proxy.environment_id` is also set).

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

**Skip this step if `proxy.environment_id` is already set in `llmproxy.yaml`.** When skipped, just trust the YAML's value and continue to Step 3.

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

**What happens next:** Pick the environment that will host the LLM proxy.

## Step 3: List Existing Semantic Service Configs (basic ones)

**Skip this step if `routing.ssc.id` is already set in `llmproxy.yaml`** — the user has explicitly named the SSC to bind against, so listing is unnecessary.

A Semantic Service Configuration (SSC) is reusable across proxies. List the existing SSCs so the user can see what's there before creating a new one.

**Important — auto-rebind quirk on basic SSCs.** The `/prompt-topics` POST endpoint used in Step 5 silently **ignores** the `semanticServiceConfigId` you send and always binds new topics to whichever basic SSC is the env's current default. The default is deterministic (verified live across multiple runs on stgx and on prod). Effect: if there are already two or more basic SSCs in the environment, you do NOT actually get to pick which one your topics bind to — the platform picks for you. The skill plans around this in Step 5 by reading the resolved SSC back from the topic-create response and using that for the proxy POST. If listing here shows zero basic SSCs in the env, create one in Step 4 (it'll become the default by virtue of being the only one).

**What you'll need:**
- Organization ID, Environment ID

**Action:** List SSCs.

```yaml
api: urn:api:llm-proxy
operationId: listSemanticServiceConfigs
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId
outputs:
  - name: existingSscs
    path: $[*]
    description: Bare-array response. Each element has `id`, `label`, `provider`, `url`, `model`, `serviceType`. Filter client-side for `serviceType=basic`.
```

**What happens next:** If at least one basic SSC exists in the env, skip Step 4 — the auto-rebind in Step 5 will pick one of them anyway. If zero basic SSCs exist, run Step 4 to create one (it will then become the default).

## Step 4: (Conditional) Create a Basic Semantic Service Configuration

**Skip this step if any of:**
- `routing.ssc.id` is already set in `llmproxy.yaml` (user wants to reuse an SSC).
- Step 3 showed at least one existing basic SSC in the environment (the auto-rebind in Step 5 will pick one of them anyway, so creating another is wasteful).

Only run this step when none of the above is true — i.e. the env genuinely has zero basic SSCs, or the user explicitly asked for a fresh one.

**What you'll need:**
- Embedding provider (`openai` or `huggingface`) and its credentials

**Action:** Create a basic SSC.

```yaml
api: urn:api:llm-proxy
operationId: createSemanticServiceConfig
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId

  label:
    userProvided: true
    description: Unique label within the environment (e.g. `<proxy-name>-basic`).
    example: my-llm-proxy-basic
    required: true

  serviceType:
    value: basic
    description: |-
      Basic mode keeps topic embeddings inline in the Flex Gateway's Semantic
      Routing policy config — no vector DB. Capped at ~6 topics and
      ~10 utterances per topic.

  provider:
    userProvided: true
    description: Embedding provider — `openai` or `huggingface`.
    example: openai
    required: true

  config.authKey:
    userProvided: true
    description: |-
      Embedding provider API key. Validated live at SSC create time — the
      backend calls the provider with this key and rejects creation with
      `ValidationError: The authentication key provided is invalid` if it
      fails. The 201 response echoes the `authKey` back verbatim — treat
      the response body as sensitive.
    required: true

  config.url:
    userProvided: true
    description: |-
      Embedding endpoint URL. Defaults the Anypoint UI uses:
      - openai: `https://api.openai.com/v1/embeddings`
      - huggingface: `https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction`
    example: https://api.openai.com/v1/embeddings
    required: true

  config.model:
    userProvided: true
    description: |-
      Embedding model. Valid values:
      - openai: `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`
      - huggingface: `all-MiniLM-L6-v2`
    example: text-embedding-3-small
    required: true

outputs:
  - name: createdBasicSscId
    path: $.id
    description: >-
      UUID of the basic SSC just created. Heads-up — in Step 5 you'll still read
      the resolved SSC ID off the topic-create response, and that's what gets
      used downstream (auto-rebind quirk).
```

**What happens next:** Continue to Step 5 — even with this newly-created SSC in hand, the binding logic in Step 5 is what determines which SSC ends up tied to your topics.

## Step 5: Create Prompt Topics (one per topic)

Each route the proxy supports needs one prompt topic with a few example utterances. Basic mode caps you at **~6 topics with ~10 utterances each** per the Anypoint UI's documented limits (the underlying API may accept more, but the Flex Gateway's in-policy embedding store is sized for the documented cap). For larger sets switch to the advanced flow.

**Source the topics + utterances** from the first one of these that's available:

1. **`llmproxy.yaml` `routing.topics` (inline)** — if the YAML already has the topics + utterances, use them directly. No need to ask the user. Each entry is `{name, route_label, utterances:[]}`.
2. **`llmproxy.yaml` `routing.topics_csv` or `topics_json` (file path)** — read and parse the file.
3. **Inline from the user (in chat)** — if neither is available, ask: *"Tell me each topic and 5–10 example user prompts that should route to it."*
4. **File path the user names in chat** — if there are too many topics for inline, ask the user for a CSV or JSON file path. Standard shapes:

- **CSV** (preferred): three columns `topic_name,utterance,route_label` (or two columns `topic_name,utterance` if all topics share routing — you'll resolve `route_label` separately):

  ```csv
  topic_name,utterance
  Finance,Calculate compound interest
  Finance,Explain stock market fundamentals
  Code,Write a Python function to sort a list
  Code,Debug this JavaScript error
  ```

- **JSON file path:** typical shape is an array of `{topicName, utterances}` objects, where utterances is an array of strings:

  ```json
  [
    { "topicName": "Finance", "utterances": ["Calculate compound interest", "Explain stocks"] },
    { "topicName": "Code", "utterances": ["Sort a list", "Debug error"] }
  ]
  ```

You're an LLM agent — read the file the user names, parse it, and assemble the in-memory topic→utterances mapping. No need for a strict schema; figure out the file's shape and proceed. If the user gives you something ambiguous, summarize what you parsed and ask them to confirm before creating topics.

**Validation before continuing:**
- Each topic should have ≥ 5 utterances (semantic routing degrades quickly below that).
- No more than ~6 topics total.
- No more than ~10 utterances per topic.
- Utterances within a topic should be diverse in phrasing (not slight rewordings).
- Utterances should not overlap heavily across topics — if a phrase could plausibly belong to two topics, ask the user which one owns it.

**Now create one topic per row group.** The basic-mode endpoint is `POST .../prompt-topics` (different from the `global-prompt-topics` endpoint used by the advanced flow).

**Critical — the auto-rebind quirk.** The `/prompt-topics` POST schema accepts `semanticServiceConfigId` in the body and echoes it back in the response. **The server overrides whatever value you send** and binds the topic to whichever basic SSC is the env's default. Verified deterministic across multiple runs on stgx and on prod. So:

- Send `semanticServiceConfigId: null` (or any value — it's a no-op).
- After the POST, **read `semanticServiceConfigId` off the response** — that resolved value is the SSC the platform actually bound the topic to. Use it for `metadata.semanticServiceConfigId` on the proxy POST in Step 9. If you instead pass the SSC you tried to send, the proxy create will fail with `400 BadRequestError: "The following promptTopicIDs do not exist"`.
- All topics in this Step 5 sequence should resolve to the **same** SSC. If you see them resolving to different SSCs across calls, stop and surface that to the user — the env state is unusual.

**What you'll need:**
- Organization ID, Environment ID
- The topics and utterances assembled above

**Action:** Create one prompt topic. Repeat for each topic.

```yaml
api: urn:api:llm-proxy
operationId: createPromptTopic
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId

  topicName:
    userProvided: true
    description: Short topic label (e.g. `Finance`, `Code`). Referenced by upstreams via `promptTopicIDs`.
    example: Finance
    required: true

  utterances:
    userProvided: true
    description: >-
      Newline-delimited string of example prompts. Each line is one
      utterance; conventional prefix is `* `, but any text works. Cap at
      ~10 lines per topic in basic mode.
    example: |
      * Calculate compound interest
      * Explain stock market fundamentals
      * How to file taxes
      * Investment portfolio strategies
      * Mortgage calculation formula
    required: true

  usedForDenyList:
    value: false
    description: Set `false` for routing topics. Use `true` only when creating topics for the semantic prompt guard policy.

  semanticServiceConfigId:
    value: null
    description: |-
      Server overrides this — pass `null`. The response will carry the
      resolved SSC id; capture that.

outputs:
  - name: promptTopicId
    path: $.id
    description: UUID of the created topic. Reference inside `routing[].upstreams[].llmConfigs.promptTopicIDs[]` in Step 9.
  - name: resolvedSemanticServiceConfigId
    path: $.semanticServiceConfigId
    description: The SSC the platform actually bound the topic to (auto-rebind, see warning above). Use this exact value for `metadata.semanticServiceConfigId` on the proxy POST in Step 9.
```

**What happens next:** Repeat for each topic. Collect the topic UUIDs and confirm all of them resolved to the same `semanticServiceConfigId`. Hold both for use in Step 9.

**Common issues:**
- **`/prompt-topics` returns `405 Method Not Allowed` on `GET`** — the endpoint is POST-only. There's no list endpoint for basic-mode topics; rely on the IDs you captured.
- **All topics resolved to a different SSC than the one you created in Step 4** — that's expected; the auto-rebind picks the env's default basic SSC, which may be a pre-existing one. Use the resolved value, not the one from Step 4.

## Step 6: List Flex Gateway Targets

**Skip this step if `deployment.flex_gateway_target_id` and `deployment.flex_gateway_target_name` are both set in `llmproxy.yaml`.**

```yaml
api: urn:api:api-portal-xapi
operationId: getGatewayTargets
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId
outputs:
  - name: targetId
    path: $.rows[*].id
    labels: $.rows[*].name
    description: The `id` field of each gateway target row (a UUID). Pass as both `deployment.targetId` and — combined with the row's `name` — `deployment.targetName` below.
  - name: targetName
    path: $.rows[*].name
    labels: $.rows[*].name
    description: Human-readable gateway target name.
```

**What happens next:** Pick a target where `ready: true`, `running: true`, and `status: RUNNING` (verified live on stgx — the live values are `RUNNING` / `NOT_RUNNING`). Targets in `NOT_RUNNING` or unconnected are not usable. If no target is available, register one via Runtime Manager first.

## Step 7: Pre-check Port + Base Path Availability

```yaml
api: urn:api:llm-proxy
operationId: getGatewayTargetApisByPortAndPath
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId
  targetId:
    from:
      variable: targetId
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
    description: Empty array means the port+path is available. A populated array means another API already occupies it; pick a different path.
```

**What happens next:** If `instances` is non-empty, ask the user for a different base path.

## Step 8: Publish the Exchange Asset

An LLM proxy is backed by an Exchange asset. Publish a minimal `type=llm` asset; the publish is asynchronous and returns a `publicationStatusLink` to poll until `status=completed`.

**Critical: the asset's `platform` value must be set via a multipart FILE field, not a plain form field.** The Exchange Experience API is `multipart/form-data`, and it enforces a strict file-naming convention for any field that attaches a file: `files.<classifier>.<packaging>`. Anything else (a `properties=...;type=application/json` form field, or a flat `platform=openai` field) is silently accepted and ignored. The publish still returns `202 Accepted`, the publication-status poll still says `completed`, and the asset still appears `published` — but its `attributes` end up as `[{key: "platform", value: "other"}]` and the auto-generated `llm-metadata.json` artifact contains `{"platform":"other"}`. At request time the Flex Gateway's `llm-proxy-core` policy classifies the input format as `other`, the semantic-routing policy refuses to route, and every request returns `404 Not Found` with no `x-llm-proxy-*` headers. Always attach the metadata as `files.llm-metadata.json` (verified live, 2026-04-30).

```yaml
api: urn:api:exchange-experience
operationId: createOrganizationsByOrganizationidAssetsByGroupidByAssetidByVersion
inputs:
  organizationId:
    from:
      variable: organizationId
  groupId:
    from:
      variable: organizationId
  assetId:
    userProvided: true
    example: my-semantic-proxy
    pattern: '^[a-z0-9][a-z0-9.\-_]*$'
    required: true
  version:
    value: "1.0.0"
  name:
    userProvided: true
    description: Display name (human-readable).
    required: true
  type:
    value: llm
  status:
    value: published
  files.llm-metadata.json:
    userProvided: true
    description: |-
      Multipart FILE field. Attach a JSON file whose contents are
      `{"platform": "<openai|gemini>"}`. The classifier (`llm-metadata`)
      and packaging (`json`) MUST appear in the field name exactly as
      `files.llm-metadata.json`.

      The `platform` value MUST match `llmConfigs.format` on each upstream
      in Step 9.
    example: '{"platform":"openai"}'
    required: true
  x-sync-publication:
    value: false
outputs:
  - name: publicationStatusLink
    path: $.publicationStatusLink
    description: Poll until the response's `status` is `completed` and an `asset` object is present.
```

**Concrete `curl` example** (copy-pasteable). Capture the `publicationStatusLink` from the response — you'll poll it next.

```bash
echo '{"platform":"openai"}' > /tmp/llm-metadata.json
curl -X POST -H "Authorization: Bearer $TOKEN" -H "X-Sync-Publication: false" \
  -F "name=My Semantic Proxy" -F "assetId=my-semantic-proxy" -F "version=1.0.0" \
  -F "groupId=$ORG" -F "organizationId=$ORG" \
  -F "type=llm" -F "status=published" \
  -F "files.llm-metadata.json=@/tmp/llm-metadata.json;type=application/json" \
  "https://anypoint.mulesoft.com/exchange/api/v2/organizations/$ORG/assets/$ORG/my-semantic-proxy/1.0.0"
# Response body has: { "publicationStatusLink": "https://...", ... }
```

**Poll the publication status until `completed`.** Publish is asynchronous; do not proceed to Step 9 until this returns `status: completed` and includes an `asset` object. Typical completion time: ~5–15 seconds. Poll every 2–3 seconds.

```bash
# $PUB_STATUS_LINK is the publicationStatusLink from the publish response above
while true; do
  STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" "$PUB_STATUS_LINK" | jq -r .status)
  echo "publish status: $STATUS"
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ]    && { echo "publish failed"; exit 1; }
  sleep 3
done
```

**Verify the publish landed correctly** (do this BEFORE creating the proxy):

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://anypoint.mulesoft.com/exchange/api/v2/assets/$ORG/my-semantic-proxy/1.0.0" \
  | jq '.attributes'
# Expect:  [{"key":"platform","value":"openai"}]
# If you see "value":"other", re-publish with a bumped version.
```

**Common issues:**

1. **409 `ASSET_PRE_CONDITIONS_FAILED`** — an asset with the same `{groupId, assetId, version}` already exists. Pick a different `assetId` or bump the version. Even after `DELETE`, the same triple stays locked.
2. **Asset publishes but the proxy 404s every request** — multipart field name was wrong; asset's `attributes[].platform` is `other`. Verify with `GET /exchange/api/v2/assets/...`. Recovery: see "Recovering a proxy whose asset has `platform: other`" under Troubleshooting at the bottom of this skill.

## Step 9: Create the LLM Proxy (Single POST)

Create the basic semantic LLM proxy in a single POST that carries the full routing configuration, including each upstream's provider credentials, target model, inbound `format`, and the `promptTopicIDs` from Step 5 that should route to it.

**Critical body-shape notes:**

- Asset coordinates go under `spec.{groupId, assetId, version}`.
- `technology` must be `flexGateway`.
- `endpoint.type=llm`, `endpoint.deploymentType=HY`, `deployment.type=HY`.
- For semantic routing:
  - `metadata.globalRouting.llmConfigs.routingType` is `semantic-based`.
  - `metadata.semanticServiceConfigId` is set to the **resolved** SSC from Step 5's response (NOT whatever you tried to send). Putting any other SSC here causes `400 BadRequestError: "The following promptTopicIDs do not exist"`.
  - Each upstream's `llmConfigs` includes `format` (matching the asset's `platform` from Step 8), `promptTopicIDs` (the Step 5 topic UUIDs), and the provider credentials.
- `routing[].upstreams[].id` MUST NOT be set — server-generated.
- The Anypoint UI sends additional explicit-null `endpoint` fields (`muleVersion4OrAbove`, `isCloudHub`, `referencesUserDomain`, `tlsContexts.inbound`). They aren't LLM-specific; if a schema-validation error mentions them, add them as literal `null`s.

**What you'll need:**
- Organization ID, Environment ID
- `assetId` + `groupId` confirmed from Step 8's publication status
- `targetId` and `targetName` from Step 6
- Port + base path from Step 7
- Topic UUIDs from Step 5 + the resolved `semanticServiceConfigId`
- Per-provider configuration (provider, target model, URL, credentials)

**Action:**

```yaml
api: urn:api:llm-proxy
operationId: createEnvironmentLlmProxy
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId

  spec.groupId:
    from:
      variable: organizationId
  spec.assetId:
    from:
      variable: assetId
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
      variable: environmentId
  deployment.targetId:
    from:
      variable: targetId
  deployment.targetName:
    from:
      variable: targetName
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
      `llmConfigs` — provider, model, `format` (matching the asset's
      `platform` from Step 8), credential keys/fields, and `promptTopicIDs`
      (the topic UUIDs from Step 5 that should route to this upstream).
      The server assigns `id`s on POST and returns them.
      `rules.headers.x-routing-header` is the internal dispatch signal the
      Semantic Routing policy writes after picking the best-matched topic;
      consumers never send this header.
    example:
      # Route A — OpenAI, static key, bound to the Finance prompt topic
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
      # Route B — Gemini, DataWeave-extracted key, bound to the Code topic
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
    description: Label of the route to use when the best-matched topic's similarity score falls below `fallbackThreshold` (recommended).
    example: Route A
    required: false

  metadata.globalRouting.llmConfigs.fallbackModel:
    userProvided: true
    description: Target model for the fallback route.
    example: gpt-4o-mini
    required: false

  metadata.globalRouting.llmConfigs.fallbackThreshold:
    userProvided: true
    description: Minimum similarity score (0.0–1.0) to match a primary route. Below triggers fallback. UI default is 0.5.
    example: 0.6
    required: false

  metadata.semanticServiceConfigId:
    from:
      variable: resolvedSemanticServiceConfigId
    description: The SSC ID resolved off Step 5's `/prompt-topics` response — NOT the SSC you may have created in Step 4. Server-side validator looks topics up against the SSC bound here; mismatch yields `400 "The following promptTopicIDs do not exist"`.

outputs:
  - name: environmentApiId
    path: $.id
    description: Numeric API instance ID.
  - name: upstreamIds
    path: $.routing[*].upstreams[*].id
    description: Server-generated upstream UUIDs.
  - name: deploymentId
    path: $.deployment.id
    description: Deployment ID for Step 10's status polling.
  - name: publicProxyUri
    path: $.endpointUri
    description: Public Flex Gateway URL consumers call. Populated once the gateway registers the proxy.
```

**What happens next:** The proxy is created and deployment starts asynchronously. The platform **auto-attaches the basic semantic-routing policy** (`semantic-routing-policy-openai` for an OpenAI embedding SSC, or `semantic-routing-policy-huggingface` for HuggingFace). Unlike the advanced flow, you do NOT need a manual policy attach step.

**Verify the proxy was created** (a quick checkpoint the customer can run):

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$HOST/apimanager/api/v1/organizations/$ORG/environments/$ENV/apis/$ENVIRONMENT_API_ID" \
  | jq '{id, assetId, endpointType, technology, status, deployment: .deployment.expectedStatus}'
# Returns the API instance metadata. `status` may show `unregistered` until the
# deployment finishes — that's normal. Step 10 is what confirms it's actually live.
```

**Common issues:**
- **`Ids are not allowed in POST ...`** — you included `id` on `routing[].upstreams[]`. Remove it.
- **`The following promptTopicIDs do not exist`** — `metadata.semanticServiceConfigId` doesn't match what `/prompt-topics` resolved to. Fix: use the resolved value from Step 5's response, not the one from Step 4.
- **Missing `format` on upstream** — basic semantic routing still requires each upstream's `llmConfigs.format` to be set. Without it the transcoding policy can't be selected.

## Step 10: Poll the Deployment Status

Poll deployment status. **Plan for 1–20 minutes total**, environment-dependent. Production envs typically reach `applied` in 60–120 seconds; **stgx and busy shared envs are routinely much slower — observed runs of 15–20 minutes**. Reasonable cadence: 10 seconds for the first 2 minutes, then 30 seconds thereafter, until either `status: applied` or `status: failed`.

**Response shape:** `{ status, lastActiveDate, apiVersionStatus? }` where:
- `status` is the deployment-side state. While the gateway is propagating you'll see `applying` (most common; sometimes `undeployed`). On success: `applied`. On failure: `failed`.
- `apiVersionStatus` is the API-instance-side state. It is `null` on the earliest polls (typically the first ~10 seconds after the create POST returns), then becomes `unregistered`, and finally flips to `active` together with `status: applied`. **Gate on `apiVersionStatus == "active"`, NOT on its presence** — the value is what matters.
- `lastActiveDate` is `null` until the proxy serves its first request.

```yaml
api: urn:api:proxies-xapi
operationId: getOrganizationsByOrganizationidEnvironmentsByEnvironmentidApisByEnvironmentapiidDeploymentsByProxydeploymentidStatus
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId
  environmentApiId:
    from:
      variable: environmentApiId
  proxyDeploymentId:
    from:
      variable: deploymentId
    description: Deployment ID from Step 9's `$.deployment.id`.
outputs:
  - name: deploymentStatus
    path: $.status
    description: "Deployment-side state. While propagating: `applying` (most common) or `undeployed`. Terminal: `applied` (success) or `failed`. Keep polling until terminal."
  - name: apiVersionStatus
    path: $.apiVersionStatus
    description: "Present from the first poll as `unregistered`; flips to `active` together with `status: applied`. Gate on `apiVersionStatus == \"active\"`, not on the field's presence."
```

**What happens next:** When `status` reaches `applied` (and `apiVersionStatus: active`), the proxy is live but uncallable until you onboard a consumer — see the next section.

## Test the Proxy with a real request (final verification)

The proxy is deployed and active, but every call to it currently returns `401 Authentication Attempt Failed` because no consumer has been onboarded yet. To send a test request:

1. **Run the `request-llm-proxy-access` skill** to mint a `client_id` + `client_secret`. That skill creates an Exchange Client Application and a contract against this proxy. After it completes, you'll have credentials to test with.

2. **Send a test request that exercises one of your topics.** Pick a phrase you'd expect to match the topic semantically — e.g. for a `Finance` topic, *"How do I calculate compound interest?"*; for `Code`, *"Write a function to sort a list."* The semantic-routing policy embeds the prompt, queries the in-policy embedding store, and dispatches to the bound route.

```bash
# Test a Finance-flavored prompt — should match the Finance topic and route to its bound provider
curl -i -X POST "$ENDPOINT_URI$BASE_PATH/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "client_id: $CLIENT_ID" \
  -H "client_secret: $CLIENT_SECRET" \
  -d '{
    "model": "any-placeholder",
    "messages": [{"role":"user","content":"How do I calculate compound interest?"}]
  }'
# Look for response headers:
#   x-llm-proxy-routing-type: Semantic
#   x-llm-proxy-semantic-routing-success: Request successfully matched 'Finance' topic ... Score: 0.7x
#   x-llm-proxy-routing-fallback: false
#   x-llm-proxy-llm-provider: <provider bound to Finance>
#   x-llm-proxy-llm-model: <that provider's model>

# Test a Code-flavored prompt
curl -i -X POST "$ENDPOINT_URI$BASE_PATH/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "client_id: $CLIENT_ID" \
  -H "client_secret: $CLIENT_SECRET" \
  -d '{
    "model": "any-placeholder",
    "messages": [{"role":"user","content":"Write a Python function to sort a list."}]
  }'

# Test the fallback (an off-topic prompt)
curl -i -X POST "$ENDPOINT_URI$BASE_PATH/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "client_id: $CLIENT_ID" \
  -H "client_secret: $CLIENT_SECRET" \
  -d '{
    "model": "any-placeholder",
    "messages": [{"role":"user","content":"What is the airspeed velocity of an unladen swallow?"}]
  }'
# Expect: 200, x-llm-proxy-routing-fallback: true, x-llm-proxy-llm-provider: <fallback provider>
```

If the test returns:
- **`401 Client ID is not present`** — `client_id` header is missing or empty.
- **`401 Authentication Attempt Failed`** — wrong credentials, or the contract hasn't propagated to the gateway yet (wait ~30 seconds and retry).
- **`404 Not Found` with no `x-llm-proxy-*` headers** — the asset's `platform` attribute is `other` (Step 8 publish format mistake). Re-run Step 8's `attributes` verification and follow the Recovery procedure under Troubleshooting.
- **All requests setting `x-llm-proxy-routing-fallback: true`** — even prompts that should match a topic. The semantic policy isn't matching anything. Check (a) the auto-rebind picked the right SSC (Step 5's `resolvedSemanticServiceConfigId`), (b) topics actually got created (each Step 5 POST returned 201), (c) the prompt is sufficiently distinct from the fallback baseline.

This is the only step in the skill that proves end-to-end success. `apiVersionStatus: active` from Step 10 alone does not.

## Cleanup — when removing the proxy

Skip on a normal create. Run only when explicitly removing the proxy + asset. Order matters:

1. **If consumers were onboarded**, delete the **applications** first (active contracts can't be deleted directly; they auto-revoke when the app goes away):

   ```bash
   curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     "$HOST/exchange/api/v2/organizations/$ORG/applications/$APPLICATION_ID"
   # 204 No Content
   ```

2. **Delete the API instance** (also removes its deployment from the Flex Gateway):

   ```bash
   curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     "$HOST/apimanager/api/v1/organizations/$ORG/environments/$ENV/apis/$ENVIRONMENT_API_ID"
   # 204
   ```

   Use `apimanager/api/v1` (not `xapi/v1`); the xapi path only allows `PATCH`.

3. **Delete the Exchange asset:**

   ```bash
   curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     "$HOST/exchange/api/v2/assets/$GROUP_ID/$ASSET_ID/$VERSION"
   # 204
   ```

   Note the URL: NO `organizations/{orgId}` prefix. DELETE on the publish URL returns `405`.

4. **Caveat — version coordinates remain locked.** Even after a successful asset DELETE, you cannot create a new asset with the same `{groupId, assetId, version}` triple — Exchange returns `409 ASSET_PRE_CONDITIONS_FAILED`. Bump the version on republish.

5. **(Optional) Delete the basic SSC and its prompt topics.** Basic SSCs are env-shared resources; deleting one may break other proxies that rely on the env-default basic SSC. Usually leave alone unless you're sure nothing else uses it. Endpoints if needed:
   - `DELETE /apimanager/xapi/v1/.../prompt-topics/{topicId}` (one per topic)
   - `DELETE /apimanager/xapi/v1/.../semantic-service-configs/{sscId}`

**Common issues:**
- **`400 Cannot delete active contract`** on contract DELETE: revoke first via PATCH, or just delete the application.
- **`405 Method Not Allowed`** on asset DELETE: you used the publish URL by mistake.

## Completion Checklist

- [ ] At least one basic SSC exists in the env (Step 3 or Step 4)
- [ ] Topics created via `/prompt-topics` in Step 5, all resolved to the **same** `semanticServiceConfigId`
- [ ] `resolvedSemanticServiceConfigId` captured for use as `metadata.semanticServiceConfigId` in Step 9
- [ ] Port + base path checked available (Step 7)
- [ ] Exchange asset published with `attributes[].platform = openai|gemini` (Step 8 — verify via `GET /assets`; `platform: other` means the publish format was wrong)
- [ ] LLM proxy POST returned `environmentApiId`, `deploymentId`, and upstream UUIDs (Step 9)
- [ ] Each upstream's `llmConfigs` carries `format`, `provider`, `model`, credential keys/fields, AND `promptTopicIDs`
- [ ] Deployment status reached `applied` with `apiVersionStatus: active` (Step 10)
- [ ] `semantic-routing-policy-openai` (or `-huggingface`) is attached automatically (verify via `GET /apis/{id}/policies` if uncertain — should show up without a manual attach step)
- [ ] Proxy shows `status: active` with a populated `endpointUri`

## What You've Built

- **A semantically routed LLM proxy with no vector DB** — embeddings live inline in the Flex Gateway policy config; no Qdrant / Pinecone / Azure AI Search needed.
- **Automatic policy stack** — the platform auto-attaches the basic semantic-routing policy variant for the SSC's embedding provider.
- **Fallback-ready** — off-topic prompts route to a dedicated fallback route/model when below `fallbackThreshold`.

## Next Steps

1. **Apply token rate limiting** — run `apply-token-rate-limiting-to-llm-proxy`.
2. **Onboard consumers** — run `request-llm-proxy-access`.
3. **Outgrew basic mode** (>6 topics or >10 utterances per topic)? — re-create as advanced via `create-llm-proxy-semantic-routing-advanced`.

## Tips and Best Practices

### Topic design
- Keep utterances diverse — paraphrase, vary length and formality.
- Avoid heavy overlap between topics; if a phrase plausibly belongs to two topics, ask the user which one owns it.
- Think of utterances as the "training set" for the matcher — the more varied, the better the runtime classification.

### Threshold tuning
- `0.5–0.6` is a reasonable starting threshold; raise it if the proxy is matching off-topic prompts to one of your topics, lower it if real on-topic prompts are hitting the fallback. Monitor the `x-llm-proxy-routing-fallback` response header.

### Auto-rebind reality check
- The basic-SSC auto-rebind is a known platform behavior, not a bug you can work around. If the user wants to target a specific basic SSC for their topics, they can't — the platform always picks the env's default. Recommend the advanced flow if a specific SSC binding matters.

## Troubleshooting

### All requests are matching the fallback route
**Symptoms:** Every call sets `x-llm-proxy-routing-fallback: true`.
**Possible causes:** Threshold too high; topics' utterances don't actually represent the prompt distribution; only one topic configured (no contrast).
**Solutions:** Lower `fallbackThreshold`, add more diverse utterances to each topic, ensure at least two topics with distinct semantic content.

### Topic misclassification
**Symptoms:** Prompts that should match topic A are routed to topic B.
**Solutions:** Add more diverse utterances to both topics, or raise the similarity threshold.

### 504 Gateway Timeout on create
**Solutions:** Wait 30 seconds, list LLM proxies (`listEnvironmentLlmProxies`), confirm the proxy exists. If it does, proceed to Step 10 polling.

### Recovering a proxy whose asset has `platform: other`
**Symptoms:** Proxy is `status: active`, the gateway accepts the request (auth works — wrong creds → 401), but every request returns `404 Not Found` with no `x-llm-proxy-*` headers and (where logs are accessible) the gateway emits `[llm-proxy-core-policy] Input format: other`.

**Cause:** the underlying Exchange asset's `attributes[].platform` is `other` and its `llm-metadata.json` file contains `{"platform":"other"}` because the publish in Step 8 used the wrong multipart field name. See Step 8's "Common issues" #2.

**Recovery procedure** (verified live, 2026-04-30). The asset itself cannot be fixed in place — Exchange returns `409 ASSET_PRE_CONDITIONS_FAILED` for the same `groupId/assetId/version` even after a soft delete. The fix is to bump the asset version and re-point the proxy:

1. **Republish a new asset version** with the correct multipart format (`files.llm-metadata.json` field name). Bump `version` to `1.0.1`. Verify with `GET /assets/.../{1.0.1}` that `attributes` shows `[{key:"platform", value:"openai"}]`.

2. **Update the API instance to reference the new version**:

   ```bash
   curl -X PATCH \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"assetVersion":"1.0.1"}' \
     "https://anypoint.mulesoft.com/apimanager/xapi/v1/organizations/$ORG/environments/$ENV/apis/$ENVIRONMENT_API_ID"
   ```

   Returns `200`. **This step alone does NOT make the gateway pick up the new asset** — it only updates API Manager's metadata.

3. **Force a deployment refresh** by re-asserting the deployment block:

   ```bash
   curl -X PATCH \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d "{\"deployment\":{\"environmentId\":\"$ENV\",\"targetId\":\"$TARGET_ID\",\"targetName\":\"$TARGET_NAME\",\"type\":\"HY\",\"expectedStatus\":\"deployed\",\"overwrite\":true}}" \
     "https://anypoint.mulesoft.com/apimanager/xapi/v1/organizations/$ORG/environments/$ENV/apis/$ENVIRONMENT_API_ID"
   ```

   Returns `200`. The gateway re-fetches `llm-metadata.json` within ~30 seconds; on the next request the `Input format` log line flips from `other` to `openai` and routing fires normally.

The endpoints `POST /apis/{id}/deployments`, `PATCH /apis/{id}/deployments/{deploymentId}`, and `POST .../deployments/{id}/redeploy` all return `404` — they're not the right entrypoint. The full-instance PATCH with `deployment` IS the redeploy lever.

## Related Jobs

- **create-llm-proxy-semantic-routing-advanced** — Same end goal, but with a vector DB for larger topic sets.
- **create-llm-proxy-model-based-routing** — Routes by the request body's `model` field instead of semantics. Use when consumers can prefix the model with the provider name.
- **apply-token-rate-limiting-to-llm-proxy** — Adds a token-based rate limit policy.
- **request-llm-proxy-access** — Creates a consumer client application and contract.
