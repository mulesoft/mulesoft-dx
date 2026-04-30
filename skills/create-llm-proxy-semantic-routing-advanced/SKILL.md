---
name: create-llm-proxy-semantic-routing-advanced
description: |
  Create an LLM Gateway proxy that routes prompts by semantic similarity
  using an **advanced** Semantic Service Configuration backed by a
  vector database (Qdrant / Pinecone / Azure AI Search). Topic embeddings
  live in the vector DB and are looked up at request time. Scales beyond
  basic mode's ~6-topic / ~10-utterance limits — supports up to ~100 topics
  with up to ~20,000 utterances each. Use when the user wants production-
  grade semantic routing, large topic sets, or content-aware classification
  backed by a vector DB. For small/demo cases without a vector DB, see
  `create-llm-proxy-semantic-routing-basic`.
---

# Create an LLM Proxy with Semantic Routing — Advanced (with vector DB)

## Overview

Creates an LLM proxy whose routing decision is driven by prompt semantics, using an **advanced** Semantic Service Configuration. The advanced flow stores topic embeddings in an external vector database (Qdrant, Pinecone, or Azure AI Search). The Flex Gateway's Semantic Routing policy queries the vector DB at request time, finds the best-matching topic, and dispatches to the upstream bound to that topic.

The big operational moment that distinguishes the advanced flow from basic:

- **Vector DB hydration is a side-band step.** After creating the SSC and its global prompt topics, the platform exposes a `GET /semantic-setup-script` endpoint that returns a `bash` script. The user runs that script locally against their vector DB to seed the topic embeddings. Until they do, the vector DB is empty and every prompt routes to the fallback.

The routing policy itself (`semantic-routing-policy-<embedding-provider>-<vector-db>` — e.g. `semantic-routing-policy-openai-qdrant`) is **auto-attached by the platform** at proxy-create time, same as basic. No manual policy attach step is needed (verified live on stgx, 2026-04-30).

**What you'll build:** a deployed LLM proxy with a Qdrant / Pinecone / Azure AI Search backing, two or more global prompt topics with their utterance embeddings seeded in the vector DB, and the routing decision made by the gateway based on vector similarity at request time.

## Prerequisites — what the agent will ask the user

Tell the user upfront what you'll need so they can prep:

1. **Authentication and entitlements**
   - Anypoint username + password (used in the auth section to mint a Bearer token).
   - API Manager permissions: **Manage APIs Configuration**, **Exchange Viewer**, **Manage Policies**.
   - Organization's `llmProxy` entitlement enabled — verify by checking the `listMe` response body's `user.organization.entitlements.llmProxy: true` (Step 1).
2. **Proxy basics**
   - Proxy name (kebab-case — becomes the Exchange `assetId` and the API instance name)
   - Inbound API format the consumers will send: `openai` (universal default) or `gemini`
   - Port + base path the Flex Gateway will listen on (typical: `8081` + `/<your-proxy-name>`)
3. **Embedding provider credentials**
   - OpenAI API key (for `text-embedding-3-small` / `text-embedding-3-large` / `text-embedding-ada-002`), or
   - HuggingFace token (for `sentence-transformers/all-MiniLM-L6-v2`)
4. **Vector database credentials and connection info**
   - Provider — one of `qdrant`, `pinecone`, `azure-ai-search`
   - Base URL of the vector DB instance
   - API key
   - Collection / namespace / indexName (depending on provider)
5. **LLM provider credentials** for each upstream the proxy routes to (OpenAI / Gemini / Azure OpenAI / Bedrock Anthropic / NVIDIA)
6. **Flex Gateway target** — which gateway target to deploy on (you'll enumerate available targets in Step 7 and let the user pick)
7. **Topics + utterances** — the routing categories and example prompts per category. Ask the user to provide either:
   - **Inline** in chat (preferred when there are only a couple of topics)
   - **As a file path** to a CSV or JSON they already have on disk. You'll read and parse it yourself in Step 4.
8. **Local shell access** — the user will need to run a `bash` script locally in Step 6 to hydrate the vector DB. Confirm they have access to a shell + curl (the script uses only standard tools).

Read the prerequisites to the user up front, gather what they can give you immediately (proxy name, port, basepath, platform, provider keys, vector DB creds, topics), and defer the listing-required choices (env, Flex Gateway target, existing SSCs) to the relevant steps.

**Important — verifying the proxy works end-to-end requires a separate skill.** This skill ends with a deployed proxy in `status: active`, but every call to it will return `401 {"error":"Authentication Attempt Failed"}` until the user has been minted a `client_id` + `client_secret`. To complete the loop, run the `request-llm-proxy-access` skill after this one. The final test step (after Step 11) points you at it.

## Read `llmproxy.yaml` first (preferred input format)

Customers can declare their entire proxy config in a single `llmproxy.yaml` file alongside `.env`. If the customer points you at one (or one already exists in the working directory), **read it before Step 1** and use it to populate as many step inputs as possible. Where the YAML defines a value, the corresponding step becomes a no-op. Where it doesn't, fall back to the interactive flow described in that step.

You're an LLM agent — be flexible about field names and structure. The customer's YAML may not match the recommended shape exactly. Read what's there, infer field meaning, ask for clarification only when truly ambiguous.

```yaml
# llmproxy.yaml — semantic-advanced example
proxy:
  name: my-semantic-proxy        # required (kebab-case)
  display_name: My Semantic Proxy
  organization_id: <uuid>        # optional — if omitted, agent calls listMe (Step 1)
  environment_id: <uuid>         # optional — if omitted, agent calls listEnvironments (Step 2)

deployment:
  flex_gateway_target_id: <uuid>      # optional — if omitted, agent calls getGatewayTargets (Step 7)
  flex_gateway_target_name: <name>
  port: 8081                          # optional — default 8081
  base_path: /my-semantic-proxy       # optional — default /<proxy.name>

inbound:
  format: openai                # required — openai | gemini

routing:
  type: semantic-based          # required — must be semantic-based for this skill
  ssc:
    type: advanced              # required — must be advanced for this skill
    id: <existing-ssc-uuid>     # OPTIONAL — if set, skip Steps 4 + 5 (use this SSC + its existing topics)
    embedding:                  # required only when creating a new SSC (Step 5)
      provider: openai          # openai | huggingface
      model: text-embedding-3-small
      env_var: OPENAI_KEY       # name of the .env entry holding the embedding API key
    vector_db:                  # required only when creating a new SSC (Step 5)
      provider: qdrant          # qdrant | pinecone | azure-ai-search
      url_env_var: QDRANT_URL   # name of the .env entry holding the vector DB base URL
      api_key_env_var: QDRANT_KEY
      collection: my-collection # for qdrant
      # namespace: my-ns        # for pinecone — pick one of {collection, namespace, indexName}
      # index_name: my-index    # for azure-ai-search
  topics:
    # Inline topic+utterance list, OR `topics_csv: <path>` / `topics_json: <path>` as alternatives.
    - name: Finance
      route_label: Route A
      utterances:
        - Calculate compound interest
        - Explain stock market fundamentals
        # ... 10–50 diverse utterances per topic in production
    - name: Code
      route_label: Route B
      utterances:
        - Write a Python function to sort a list
        - Debug this JavaScript error
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
    threshold: 0.6              # similarity score below which fallback fires; UI default is 0.5
```

`.env` keys referenced by `key.env_var`, `embedding.env_var`, `vector_db.url_env_var`, and `vector_db.api_key_env_var` are looked up by exact name. If a referenced env var is missing, stop and ask the user.

Step-input lookup table:

| Step | What it needs | YAML field | Behavior if missing |
|---|---|---|---|
| 1 (listMe) | organization id | `proxy.organization_id` | call `listMe` to discover |
| 2 (listEnvironments) | environment id | `proxy.environment_id` | call `listEnvironments`, ask user to pick |
| 3 (listSemanticServiceConfigs) | (informational — to surface existing SSCs) | `routing.ssc.id` set → skip | otherwise list and surface to user |
| 4 (createGlobalPromptTopic) | topics + utterances | `routing.topics` (inline) OR `routing.topics_csv` / `topics_json` | required from YAML; otherwise ask user. **Skip if `routing.ssc.id` is set** — the existing SSC already has topics. |
| 5 (createSemanticServiceConfig) | embedding + vector DB config + topic ids from Step 4 | `routing.ssc.embedding.*` + `routing.ssc.vector_db.*` | required from YAML; otherwise ask user. **Skip if `routing.ssc.id` is set.** |
| 6 (getSemanticSetupScript) | SSC id | (always) | always run; the script is essential to hydrate the vector DB |
| 7 (getGatewayTargets) | gateway target | `deployment.flex_gateway_target_id` + `_name` | otherwise call API, ask user |
| 8 (port + base path) | port + base path | `deployment.port` + `deployment.base_path` | defaults `8081` + `/<proxy.name>` |
| 9 (asset publish) | proxy name + display name + inbound format | `proxy.name` + `proxy.display_name` + `inbound.format` | required from YAML; if missing, ask user |
| 10 (proxy create) | full routing block | `routing.routes[]` + `routing.fallback` | required from YAML; if missing, ask user route-by-route |

If the customer hasn't supplied a YAML, run the entire interactive flow — every step still works without it.

## API endpoints used in this skill

| Step | Operation | Method + URL |
|---|---|---|
| (auth) | login (one-time, before Step 1) | `POST {host}/accounts/login` |
| 1 | `listMe` | `GET {host}/accounts/api/me` |
| 2 | `listEnvironments` | `GET {host}/accounts/api/organizations/{organizationId}/environments` |
| 3 | `listSemanticServiceConfigs` | `GET {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/semantic-service-configs` |
| 4 | `createGlobalPromptTopic` | `POST {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/global-prompt-topics` |
| 5 | `createSemanticServiceConfig` | `POST {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/semantic-service-configs` |
| 6 | `getSemanticSetupScript` | `GET {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/semantic-setup-script/semantic-service-configs/{sscId}` |
| 7 | `getGatewayTargets` | `GET {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/gateway-targets` |
| 8 | `getGatewayTargetApisByPortAndPath` | `GET {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/gateway-targets/{targetId}/apis?port=&path=` |
| 9 | Exchange asset publish | `POST {host}/exchange/api/v2/organizations/{orgId}/assets/{groupId}/{assetId}/{version}` |
| 10 | `createEnvironmentLlmProxy` | `POST {host}/apimanager/xapi/v1/organizations/{orgId}/environments/{envId}/apis` |
| 11 | deployment status poll | `GET {host}/proxies/xapi/v1/organizations/{orgId}/environments/{envId}/apis/{environmentApiId}/deployments/{deploymentId}/status` |
| (cleanup) | DELETE API instance | `DELETE {host}/apimanager/api/v1/organizations/{orgId}/environments/{envId}/apis/{environmentApiId}` |
| (cleanup) | DELETE Exchange asset | `DELETE {host}/exchange/api/v2/assets/{groupId}/{assetId}/{version}` (no `organizations/{orgId}` prefix) |

`{host}` is `https://anypoint.mulesoft.com` for prod, `https://stgx.anypoint.mulesoft.com` for stgx, `https://eu1.anypoint.mulesoft.com` for EU. Same host for every call within one flow.

URL gotchas:
- The deployment-status endpoint is at `/proxies/xapi/v1/...`, not `/apimanager/xapi/v1/...` — different prefix from everything else.
- The Exchange asset DELETE URL drops the `organizations/{orgId}` prefix that the publish URL has. DELETE on the publish URL returns `405 Method Not Allowed`.
- The single-instance API GET lives at `/apimanager/api/v1/...`, not `/apimanager/xapi/v1/...` (which only allows PATCH).

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

**Skip this step if `proxy.organization_id` is already set in `llmproxy.yaml`.**

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

**Skip this step if `proxy.environment_id` is already set in `llmproxy.yaml`.**

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

## Step 3: List Existing Semantic Service Configs (advanced ones)

**Skip this step if `routing.ssc.id` is already set in `llmproxy.yaml`** — the user has explicitly named the SSC to reuse, so listing is unnecessary. Also skip Steps 4 + 5 (creation) below.

A Semantic Service Configuration (SSC) is reusable across proxies. List existing SSCs so the user can decide whether to reuse one or create a new one.

**Filter the response client-side to `serviceType: advanced` only.** The endpoint returns BOTH basic and advanced SSCs in the same array; this skill is for advanced only, so drop the basic rows before showing them to the user.

**Then explicitly ASK the user**: *"I see the following advanced Semantic Service Configurations in this environment: [list with each entry showing label, embedding provider, vector DB provider]. Would you like to use one of them, or create a new one?"* Do NOT silently default to "use one of the existing" or "create a new one" — make the user choose. Reusing an existing SSC + its already-bound topics is significantly cheaper than creating a new one (it skips Steps 4 + 5 entirely and the existing vector DB rows are already searchable, so Step 6's hydration script can be skipped too if the existing SSC was previously seeded).

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
  - name: semanticServiceConfigId
    path: $[*].id
    labels: $[*].label
    description: Bare-array response. Each element has `id`, `label`, `provider`, `url`, `model`, `serviceType`. Filter client-side for `serviceType=advanced`. If the user picks an existing advanced SSC here, capture its `id` and skip Step 5.
```

**What happens next:** If the user reuses an existing SSC (and its topics), skip Step 5. The SSC's existing `globalTopics` are still searchable in the vector DB if it was hydrated previously. Otherwise continue to Step 4 to create new topics.

## Step 4: Create Global Prompt Topics (one per topic)

**Skip this step if `routing.ssc.id` is already set in `llmproxy.yaml`** — that SSC already has topics bound to it; you can reuse them. Capture the existing topic IDs by calling `listGlobalPromptTopicsBySsc` (`GET {host}/apimanager/xapi/v1/.../semantic-service-configs/{sscId}/global-prompt-topics`) so you have the UUIDs to wire into Step 10.

Each topic the proxy supports needs a Global Prompt Topic with a set of example utterances. The advanced flow scales well past basic mode's limits — the Anypoint UI permits up to ~100 topics per environment with up to ~20,000 utterance lines per topic.

**Before creating topics, you must know what ROUTES they map to.** A "route" is a `{label, provider, model, key}` quadruple — one per upstream LLM the proxy can dispatch to. A topic's `route_label` ties it to one route; **multiple topics can share the same route** (many-to-one is fully supported and common). Don't assume routes are predefined or limited to two — the user can have 1, 3, 5+ routes depending on how many providers they want to fan out to.

**Source the routes** from the first one of these that's available:

1. **`llmproxy.yaml` `routing.routes[]`** — if the YAML already has them, use those directly.
2. **Elicit routes interactively** before topics, in this order:
   - *"Which LLM providers should this proxy route to?"* — accept any subset of `openai`, `gemini`, `azureopenai`, `bedrockanthropic`, `nvidia`. Don't assume two; the user can pick one, three, or more.
   - For each provider, *"Which target model?"* (e.g. `gpt-4o-mini` for OpenAI, `gemini-2.5-flash` for Gemini). The provider catalog (`listLlmRouteConfigurations` if you're unsure of valid model names per provider) is the authoritative source.
   - For each route, *"Should the upstream API key be **static** (encrypted on the proxy) or **DataWeave-extracted** (read from a request header at runtime)?"* For static, ask which `.env` entry holds the key. For DataWeave, ask which header name to read.
   - Pick a label for each route (`Route A`, `Route B`, ...).

Once routes are defined, **source the topics + utterances** from the first one of these that's available:

1. **`llmproxy.yaml` `routing.topics` (inline)** — if the YAML already has the topics + utterances, use them directly. No need to ask the user. Each entry is `{name, route_label, utterances:[]}`.
2. **`llmproxy.yaml` `routing.topics_csv` or `topics_json` (file path)** — read and parse the file.
3. **Inline from the user (in chat)** — if neither is available, ask: *"Tell me each topic and 5–10 example user prompts that should route to it."*
4. **File path the user names in chat** — if there are too many topics for inline, ask the user for a CSV or JSON file path. **Prefer the file route below for advanced** (since topic counts are typically larger):

- **Inline (preferred for ≤3 topics):** ask the user directly in chat. E.g. *"Tell me each topic and 5–10 example user prompts that should route to it."*
- **CSV file path:** typical shape is two columns `topic_name,utterance` with one row per utterance:

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
- Aim for 10–50 diverse utterances per topic in production; more usually helps.
- Utterances within a topic should be diverse in phrasing (paraphrases, length, formality).
- Utterances should not overlap heavily across topics — if a phrase plausibly belongs to two topics, ask the user which one owns it.
- Every topic's `route_label` must match one of the route labels you defined above. Multiple topics CAN map to the same route — that's a normal pattern (e.g. `Finance` + `Investing` topics → same OpenAI route).

**Now create one Global Prompt Topic per row group via `POST .../global-prompt-topics`.** Pass `semanticServiceConfigId: null` here — you'll bind these topics to the SSC in Step 5 by passing their UUIDs as `globalTopics` on the SSC create.

**What you'll need:**
- Organization ID, Environment ID
- The topics and utterances assembled above

**Action:** Create one Global Prompt Topic. Repeat for each topic.

```yaml
api: urn:api:llm-proxy
operationId: createGlobalPromptTopic
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
      utterance; conventional prefix is `* `, but any text works. The
      Anypoint UI permits up to ~20,000 lines per topic for advanced.
    example: |
      * Calculate compound interest
      * Explain stock market fundamentals
      * How to file taxes
      * Investment portfolio strategies
      * Mortgage calculation formula
      * What's the difference between stocks and bonds
      * Compare 401k vs IRA
      * How to read a balance sheet
      * Tax-advantaged accounts explained
      * What's an ETF
    required: true

  usedForDenyList:
    value: false
    description: Set `false` for routing topics. Use `true` only when creating topics for the semantic prompt guard policy.

  semanticServiceConfigId:
    value: null
    description: |-
      Pass `null` here. Bind the topic to the SSC in Step 5 by including
      its UUID in the SSC's `globalTopics` array.

outputs:
  - name: promptTopicId
    path: $.id
    description: UUID of the created topic. Reference inside `routing[].upstreams[].llmConfigs.promptTopicIDs[]` in Step 10, AND in the SSC's `globalTopics[]` array in Step 5.
```

**What happens next:** Repeat for each topic. Collect the topic UUIDs. Note that the POST response wraps `utterances` as `{data: [{utterance}, ...]}` — different shape from the list endpoint, which returns the plain newline-string form.

## Step 5: Create the Advanced Semantic Service Configuration

**Skip this step if `routing.ssc.id` is already set in `llmproxy.yaml`** (or the user picked an existing SSC in Step 3). When skipped, jump straight to Step 6 with the existing SSC's id — no new SSC needs to be created.

Create an `advanced` SSC wiring the embedding provider + external vector DB.

**What you'll need:**
- Embedding provider credentials (from Prerequisites)
- Vector DB credentials + URL + collection/namespace/indexName (from Prerequisites)
- Topic IDs from Step 4 (passed as `globalTopics`)

**Action:** Create the advanced SSC.

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
    description: Unique label within the environment.
    example: my-llm-proxy-advanced
    required: true

  serviceType:
    value: advanced
    description: |-
      Advanced mode stores embeddings in the configured external vector DB.
      Recommended for production and for any workload above basic's
      ~6-topic / ~10-utterance limits.

  provider:
    userProvided: true
    description: Embedding provider — `openai` or `huggingface`.
    example: openai
    required: true

  config.authKey:
    userProvided: true
    description: |-
      Embedding provider API key. Validated live at SSC create time —
      the backend calls the embedding provider with this key and rejects
      creation with `ValidationError: The authentication key provided is
      invalid` if it fails. The 201 response echoes the `authKey` back
      verbatim — treat the response body as sensitive.
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

  vectorDBConfig.provider:
    userProvided: true
    description: Vector database provider — `qdrant`, `pinecone`, or `azure-ai-search`.
    example: qdrant
    required: true

  vectorDBConfig.url:
    userProvided: true
    description: Vector database base URL.
    required: true

  vectorDBConfig.apiKey:
    userProvided: true
    description: Vector database API key (treat as sensitive).
    required: true

  vectorDBConfig.collection:
    userProvided: true
    description: Collection name (Qdrant). Use `namespace` for Pinecone or `indexName` for Azure AI Search instead.
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
      Array of Global Prompt Topic UUIDs from Step 4 to bind to this SSC at
      creation time. The Anypoint UI's flow is: create topics first with
      `semanticServiceConfigId: null` (Step 4), then list the resulting
      UUIDs here on SSC create — that's how the binding is made.
    required: true

outputs:
  - name: semanticServiceConfigId
    path: $.id
    description: UUID of the created Semantic Service Configuration. Use as `metadata.semanticServiceConfigId` on the proxy POST in Step 10. Also pass to Step 6 to fetch the hydration script.
```

**What happens next:** The SSC is created and the topics from Step 4 are bound to it. The vector DB is **not yet hydrated** — Step 6 generates the script that does that. Until you run that script, the vector DB will be empty and every request will hit the fallback route.

## Step 6: Hydrate the Vector DB via the Setup Script

This is the side-band step that matters most for advanced. The platform exposes a `GET /semantic-setup-script` endpoint that returns a ~15 KB `bash` script. The script (a) calls the embedding provider for every utterance across every topic in the SSC, (b) batches and upserts the resulting vectors into the configured vector DB. Until the script is run end-to-end, the vector DB contains zero embeddings, and at request time every prompt scores below `fallbackThreshold` and routes to the fallback.

**The agent fetches the script from the API; the user runs it locally.** Your tools probably can't dial into the user's vector DB directly (different network / different credentials), so document what the script needs and present the steps clearly.

**What you'll need:**
- Organization ID, Environment ID
- `semanticServiceConfigId` from Step 5 (or Step 3 if reusing)

**Action:** Fetch the setup script.

```yaml
api: urn:api:llm-proxy
operationId: getSemanticSetupScript
inputs:
  organizationId:
    from:
      variable: organizationId
  environmentId:
    from:
      variable: environmentId
  semanticServiceConfigId:
    from:
      variable: semanticServiceConfigId
    description: SSC id from Step 5 (or Step 3 if reusing).
outputs:
  - name: setupScript
    description: |-
      The 200 response body is the bash script source. Save it to a file
      (e.g. `vectordb-embedding-semantic-setup.sh`) — the response carries
      `Content-Type: application/x-sh` and `Content-Disposition: attachment;
      filename="vectordb-embedding-semantic-setup.sh"`. The script declares
      `EMBEDDING_PROVIDER`, `OPENAI_EMBEDDING_MODEL`, `VECTOR_DB_PROVIDER`,
      and `ENTRIES` (your topic+utterance data) populated server-side.
```

**Then guide the user through running it:**

1. **Save the response body** to disk as `vectordb-embedding-semantic-setup.sh` (use `chmod +x` to make it executable). Show the user how:

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://anypoint.mulesoft.com/apimanager/xapi/v1/organizations/$ORG/environments/$ENV/semantic-setup-script/semantic-service-configs/$SSC_ID" \
     -o vectordb-embedding-semantic-setup.sh
   chmod +x vectordb-embedding-semantic-setup.sh
   ```

2. **Provide the runtime secrets** the script collects from the user. Depending on the embedding provider + vector DB picked, the script will prompt for (or accept via env vars):
   - The embedding provider's API key (same as `config.authKey` from Step 5)
   - The vector DB API key (same as `vectorDBConfig.apiKey` from Step 5)
   - The vector DB base URL (same as `vectorDBConfig.url` from Step 5; sometimes also a `QDRANT_BASE_URL` / `AZURE_SEARCH_URL` env var)

3. **Run the script.** It will batch-call the embedding provider for every utterance and upsert the resulting vectors into the vector DB collection. Run time is typically a few seconds per topic for OpenAI's `text-embedding-3-small` and a few topics' worth.

4. **Verify the vector DB has rows.** For Qdrant: hit the cluster's REST API with `GET /collections/<collection>/points/count`; expect a count equal to the total number of utterances across all topics. Skipping this check is the single most common cause of "everything matches the fallback" symptoms downstream.

**What happens next:** Once the script reports success and the vector DB has rows, you can proceed to create the proxy. The vector DB is now searchable; the routing policy will be auto-attached by the platform at proxy-create time.

**Common issues:**
- **Script exits with `OpenAI 401 Unauthorized`** — the embedding provider key the user supplied at runtime doesn't match the one stored on the SSC, or the key has been rotated. Re-supply the working key.
- **Script exits with `Qdrant 403`** — the vector DB API key doesn't have write access on the configured collection. Check the cluster's permissions.
- **Script reports success but vector DB shows 0 rows** — the script may have written to a different collection/namespace than the SSC was configured for. Cross-check `vectorDBConfig.collection` (or `.namespace` / `.indexName`) on the SSC against where the script actually wrote.

## Step 7: List Flex Gateway Targets

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

**What happens next:** Filter the response down to the eligible targets (`ready: true`, `running: true`, `status: RUNNING` — verified live on stgx). **Surface the eligible targets to the user and ASK them to pick one.** Do NOT auto-select even if there's only one eligible candidate. Present each target's `name`, `id`, and `targetType` so the user can decide. If no target is eligible, surface that as a clear error — the user must register a Flex Gateway via Runtime Manager first.

## Step 8: Pre-check Port + Base Path Availability

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

## Step 9: Publish the Exchange Asset

An LLM proxy is backed by an Exchange asset. Publish a minimal `type=llm` asset; the publish is asynchronous and returns a `publicationStatusLink` to poll until `status=completed`.

**Critical: the asset's `platform` value must be set via a multipart FILE field, not a plain form field.** The Exchange Experience API enforces a strict file-naming convention: `files.<classifier>.<packaging>`. Anything else (a `properties=...;type=application/json` form field, or a flat `platform=openai` field) is silently accepted and ignored. The publish still returns `202 Accepted` and the asset still appears `published` — but its `attributes` end up as `[{key: "platform", value: "other"}]` and the auto-generated `llm-metadata.json` artifact contains `{"platform":"other"}`. At request time the gateway classifies the input format as `other`, the semantic-routing policy refuses to route, and every request returns `404 Not Found` with no `x-llm-proxy-*` headers. Always attach the metadata as `files.llm-metadata.json` (verified live, 2026-04-30).

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
      in Step 10.
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

**Poll the publication status until `completed`.** Publish is asynchronous; do not proceed to Step 10 until this returns `status: completed` and includes an `asset` object. Typical completion time: ~5–15 seconds. Poll every 2–3 seconds.

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

## Step 10: Create the LLM Proxy (Single POST)

Create the advanced semantic LLM proxy in a single POST that carries the full routing configuration, including each upstream's provider credentials, target model, inbound `format`, and the `promptTopicIDs` from Step 4 that should route to it.

**Critical body-shape notes:**

- Asset coordinates go under `spec.{groupId, assetId, version}`.
- `technology` must be `flexGateway`.
- `endpoint.type=llm`, `endpoint.deploymentType=HY`, `deployment.type=HY`.
- For semantic routing:
  - `metadata.globalRouting.llmConfigs.routingType` is `semantic-based`.
  - `metadata.semanticServiceConfigId` is set to the SSC UUID from Step 5 (or Step 3 if reusing).
  - Each upstream's `llmConfigs` includes `format` (matching the asset's `platform` from Step 9), `promptTopicIDs` (the Step 4 topic UUIDs), and the provider credentials.
- `routing[].upstreams[].id` MUST NOT be set — server-generated.
- The Anypoint UI sends additional explicit-null `endpoint` fields (`muleVersion4OrAbove`, `isCloudHub`, `referencesUserDomain`, `tlsContexts.inbound`). They aren't LLM-specific; if a schema-validation error mentions them, add them as literal `null`s.

**What you'll need:**
- Organization ID, Environment ID
- `assetId` + `groupId` confirmed from Step 9's publication status
- `targetId` and `targetName` from Step 7
- Port + base path from Step 8
- Topic UUIDs from Step 4 + the SSC ID from Step 5
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
      `platform` from Step 9), credential keys/fields, and `promptTopicIDs`
      (the Global Prompt Topic UUIDs from Step 4 that should route to this
      upstream). The server assigns `id`s on POST and returns them.
      `rules.headers.x-routing-header` is the internal dispatch signal the
      Semantic Routing policy writes after picking the best-matched topic;
      consumers never send this header.
    example:
      # Route A — OpenAI, static key, bound to the Finance topic
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
    description: 'Minimum similarity score (0.0–1.0) required to match a primary route. The comparison is **strictly greater than** — a score of exactly the threshold value triggers the fallback. UI default is 0.5.'
    example: 0.6
    required: false

  metadata.semanticServiceConfigId:
    from:
      variable: semanticServiceConfigId
    description: SSC UUID from Step 5 (or Step 3 if reusing). Required for semantic routing. Lives at the top `metadata` level — not inside `globalRouting`.

outputs:
  - name: environmentApiId
    path: $.id
    description: Numeric API instance ID.
  - name: upstreamIds
    path: $.routing[*].upstreams[*].id
    description: Server-generated upstream UUIDs.
  - name: deploymentId
    path: $.deployment.id
    description: Deployment ID for Step 11's status polling.
  - name: publicProxyUri
    path: $.endpointUri
    description: Public Flex Gateway URL consumers call. Populated once the gateway registers the proxy.
```

**What happens next:** The proxy is created and deployment starts asynchronously. The platform **auto-attaches** the matching `semantic-routing-policy-<embedding-provider>-<vector-db>` variant (e.g. `semantic-routing-policy-openai-qdrant`) at this point — same as basic. You can verify by listing the proxy's policies after a few seconds:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$HOST/apimanager/api/v1/organizations/$ORG/environments/$ENV/apis/$ENVIRONMENT_API_ID/policies" \
  | jq '.policies[].template.assetId'
# Should include `semantic-routing-policy-<provider>-<vectordb>` along with
# `llm-proxy-core`, `client-id-enforcement`, `cors`, and the per-provider transcoders.
```

**Common issues:**
- **`Ids are not allowed in POST ...`** — you included `id` on `routing[].upstreams[]`. Remove it.
- **Missing `semanticServiceConfigId`** — semantic routing requires the SSC UUID at the `metadata` top level — not inside `globalRouting.llmConfigs`.
- **Missing `format` on upstream** — for semantic routing, each upstream's `llmConfigs.format` must be set (usually `openai`). Without it the transcoding policy can't be selected.

## Step 11: Poll the Deployment Status

Poll deployment status. **Plan for 1–20 minutes total**, environment-dependent. Production envs typically reach `applied` in 60–120 seconds; **stgx and busy shared envs are routinely much slower — observed runs of 15–20 minutes**. Reasonable cadence: 10 seconds for the first 2 minutes, then 30 seconds thereafter, until either `status: applied` or `status: failed`.

**Response shape:** `{ status, lastActiveDate, apiVersionStatus? }` where:
- `status`: while propagating you'll see `applying` (most common; sometimes `undeployed`). Terminal: `applied` (success) or `failed`.
- `apiVersionStatus`: the API-instance-side state. It is `null` on the earliest polls (typically the first ~10 seconds after the create POST returns), then becomes `unregistered`, and finally flips to `active` together with `status: applied`. **Gate on `apiVersionStatus == "active"`, NOT on its presence** — the value is what matters.
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
    description: Deployment ID from Step 10's `$.deployment.id`.
outputs:
  - name: deploymentStatus
    path: $.status
    description: "Deployment-side state. While propagating: `applying` (most common) or `undeployed`. Terminal: `applied` (success) or `failed`. Keep polling until terminal."
  - name: apiVersionStatus
    path: $.apiVersionStatus
    description: "Present from the first poll as `unregistered`; flips to `active` together with `status: applied`. Gate on `apiVersionStatus == \"active\"`, not on the field's presence."
```

**What happens next:** When `status` reaches `applied` (and `apiVersionStatus: active`), the proxy is live but uncallable until you onboard a consumer — see the next section.

**Common issues:**
- **`status: failed` with no error detail (target-side flake)**: even with `ready: true && running: true && status: RUNNING`, a Flex Gateway target can be in a degraded state. Recovery is to switch targets via a full-instance PATCH:

  ```bash
  curl -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"deployment\":{\"environmentId\":\"$ENV\",\"targetId\":\"$NEW_TARGET_ID\",\"targetName\":\"$NEW_TARGET_NAME\",\"type\":\"HY\",\"expectedStatus\":\"deployed\",\"overwrite\":true}}" \
    "$HOST/apimanager/xapi/v1/organizations/$ORG/environments/$ENV/apis/$ENVIRONMENT_API_ID"
  ```

  Usually flips to `applied` within seconds. `endpointUri` won't refresh — pull from the new gateway target's `configuration.ingress.publicUrl`.
- **Long polls hit transient curl errors**: stgx polls can run 15+ min. Use `--max-time 20 --retry 3 --retry-delay 2` per call.

## Test the Proxy with a real request (final verification)

The proxy is deployed and active, but every call to it currently returns `401 Authentication Attempt Failed` because no consumer has been onboarded yet. To send a test request:

1. **Run the `request-llm-proxy-access` skill** to mint a `client_id` + `client_secret`. That skill creates an Exchange Client Application and a contract against this proxy. After it completes, you'll have credentials to test with.

2. **Confirm Step 6's hydration script ran end-to-end** and the vector DB actually has rows for the SSC's topics. If the script didn't run (or wrote to the wrong collection), every request will hit the fallback regardless of prompt content.

3. **Resolve the public URL.** The `endpointUri` from Step 10 is often a **comma-separated list** (e.g. `<cloudhub-url>,<custom-domain-url>`). Split on `,` and use the first cloudhub-style URL. If empty or stale (e.g. after a target migration), fetch the canonical hostname directly: `GET {host}/apimanager/xapi/v1/.../gateway-targets/{targetId}` and read `configuration.ingress.publicUrl`.

4. **Send a test request that exercises one of your topics.** Pick a phrase you'd expect to match the topic semantically — e.g. for a `Finance` topic, *"How do I calculate compound interest?"*; for `Code`, *"Write a function to sort a list."* The semantic-routing policy embeds the prompt, queries the vector DB, and dispatches to the bound route.

```bash
# Test a Finance-flavored prompt — should match Finance and route to its bound provider
curl -i -X POST "$ENDPOINT_URI$BASE_PATH/chat/completions" \
  -H 'Content-Type: application/json' \
  -H "client_id: $CLIENT_ID" \
  -H "client_secret: $CLIENT_SECRET" \
  -d '{
    "model": "any-placeholder",
    "messages": [{"role":"user","content":"How do I calculate compound interest?"}]
  }'
# Look for:
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

# Test the fallback (off-topic prompt)
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
- **`401 Client ID is not present` / `Authentication Attempt Failed`** — credentials wrong or not yet propagated. Wait ~30s after `request-llm-proxy-access` and retry.
- **`404 Not Found` with no `x-llm-proxy-*` headers AND `[llm-proxy-core-policy] Input format: other`** — asset's `platform` attribute is `other` (Step 9 publish format mistake). See "Recovering a proxy whose asset has `platform: other`" under Troubleshooting.
- **`404 Not Found` with no `x-llm-proxy-*` headers but `Input format: openai`** — the auto-attached `semantic-routing-policy-<provider>-<vectordb>` is missing. List the proxy's policies (`GET /apis/{id}/policies`) and verify the variant is present. If not, the platform's auto-attach didn't fire — re-trigger by re-saving the API instance (PATCH the deployment block) or apply the policy manually via `POST /apis/{id}/policies` with the matching variant + the same embedding-provider + vector-DB credentials the SSC has.
- **All requests setting `x-llm-proxy-routing-fallback: true`** — even prompts that should match a topic. Most likely Step 6's hydration script wasn't run end-to-end, OR ran against a different collection/namespace than the SSC was configured for. Verify the vector DB has rows.

This is the only step in the skill that proves end-to-end success. `apiVersionStatus: active` from Step 11 alone does not.

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

   NO `organizations/{orgId}` prefix on the delete URL. DELETE on the publish URL returns `405`.

4. **Caveat — version coordinates remain locked.** Even after a successful asset DELETE, you cannot create a new asset with the same `{groupId, assetId, version}` triple. Bump the version on republish.

5. **(Optional) Delete the SSC + global prompt topics + vector DB rows.** The SSC and topics are reusable across proxies — only delete if no other proxy uses them. Endpoints if needed:
   - `DELETE /apimanager/xapi/v1/.../global-prompt-topics/{topicId}` (one per topic)
   - `DELETE /apimanager/xapi/v1/.../semantic-service-configs/{sscId}`
   - **The vector DB rows are NOT auto-deleted** — they live in the user's Qdrant / Pinecone / Azure AI Search instance. To clean those up, run a separate `DELETE` against the vector DB itself (e.g. `DELETE /collections/{collection}/points/delete` for Qdrant) using the same credentials the setup script used.

**Common issues:**
- **`400 Cannot delete active contract`** on contract DELETE: revoke first via PATCH, or just delete the application.
- **`405 Method Not Allowed`** on asset DELETE: you used the publish URL by mistake.

## Completion Checklist

- [ ] Existing advanced SSC reused (Step 3) OR new advanced SSC created (Step 5) with `globalTopics` populated
- [ ] Global Prompt Topics created (Step 4) with diverse utterances (≥ 5 each)
- [ ] **Vector DB hydrated** by running the setup script from Step 6 — verified by checking the vector DB has rows
- [ ] Port + base path checked available (Step 8)
- [ ] Exchange asset published with `attributes[].platform = openai|gemini` (Step 9 — verify via `GET /assets`; `platform: other` means the publish format was wrong)
- [ ] LLM proxy POST returned `environmentApiId`, `deploymentId`, and upstream UUIDs (Step 10)
- [ ] Each upstream's `llmConfigs` carries `format`, `provider`, `model`, credential keys/fields, AND `promptTopicIDs`
- [ ] **Semantic-routing policy auto-attached** by the platform — verify `GET /apis/{id}/policies` lists `semantic-routing-policy-<provider>-<vectordb>`
- [ ] Deployment status reached `applied` with `apiVersionStatus: active` (Step 11)
- [ ] Proxy shows `status: active` with a populated `endpointUri`
- [ ] Test request returns `x-llm-proxy-routing-type: Semantic` and matches the expected topic

## What You've Built

- **A semantically routed LLM proxy backed by an external vector DB** — supports up to ~100 topics with ~20,000 utterances each.
- **Reusable Global Prompt Topics + SSC** — both can be referenced by other proxies in the same env.
- **Manually-attached semantic-routing policy** — the only variant the platform doesn't auto-wire today.
- **Fallback-ready** — off-topic prompts route to a dedicated fallback route/model when below `fallbackThreshold`.

## Next Steps

1. **Apply token rate limiting** — run `apply-token-rate-limiting-to-llm-proxy`.
2. **Onboard consumers** — run `request-llm-proxy-access`.
3. **Layer on semantic prompt guarding** — apply a `semantic-prompt-guard-policy-<embeddingProvider>-<vectorDB>` policy on deny-listed topics (configured via `metadata.globalRouting.llmConfigs.denyTopicIDs`).

## Tips and Best Practices

### Topic + utterance design
- 10–50 diverse utterances per topic is a strong baseline. Push toward more if you have the data — vector matching benefits from coverage.
- Cover variations in phrasing, length, and formality.
- Avoid heavy overlap between topics — if a phrase plausibly belongs to two topics, ask the user which one owns it.

### Threshold tuning
- `0.5–0.6` is reasonable to start. Monitor `x-llm-proxy-routing-fallback` in production to gauge fallback rate; tune up if fallback fires for legit on-topic prompts, tune down if off-topic prompts are being matched.

### Vector DB
- **Qdrant** is the easiest to start with — generous free tier on Cloud, simple REST.
- **Pinecone** scales further but requires careful index/namespace planning.
- **Azure AI Search** is the right fit if the user is already in the Microsoft ecosystem.
- Use separate collections / indexes / namespaces per environment to avoid contamination.

### Hydration script reruns
- If the user adds or edits a topic later, re-fetch the script (Step 6) and re-run it — it overwrites the vector DB rows for that SSC's topics each time.

## Troubleshooting

### Every request hits the fallback route (`x-llm-proxy-routing-fallback: true`)
**Possible causes (in order of likelihood):**
1. Vector DB wasn't seeded — Step 6's script wasn't run, or it ran against a different collection/namespace.
2. Threshold too high.
4. Topics' utterances don't match real prompt distribution.

**Solutions:** Verify the vector DB has rows (Step 6), confirm the policy is attached (`GET /apis/{id}/policies`), then iterate on threshold + utterances.

### 404 on every request with no `x-llm-proxy-*` headers
**Possible causes:**
1. Asset's `platform` attribute is `other` (Step 9 publish format was wrong) — see "Recovering a proxy whose asset has `platform: other`" below.
2. The platform's auto-attach of `semantic-routing-policy-<provider>-<vectordb>` didn't fire — verify with `GET /apis/{id}/policies` and re-trigger by PATCHing the deployment block if missing.

### Topic misclassification
**Symptoms:** Prompts that should match topic A are routed to topic B.
**Solutions:** Add more diverse utterances to both topics, or raise the similarity threshold. Re-run Step 6 after editing topics.

### 504 Gateway Timeout on create
**Solutions:** Wait 30 seconds, list LLM proxies (`listEnvironmentLlmProxies`), confirm the proxy exists. If it does, proceed to Step 11 polling.

### Recovering a proxy whose asset has `platform: other`
**Symptoms:** Proxy is `status: active`, the gateway accepts the request (auth works — wrong creds → 401), but every request returns `404 Not Found` with no `x-llm-proxy-*` headers and (where logs are accessible) the gateway emits `[llm-proxy-core-policy] Input format: other`.

**Cause:** the underlying Exchange asset's `attributes[].platform` is `other` and its `llm-metadata.json` file contains `{"platform":"other"}` because the publish in Step 9 used the wrong multipart field name. See Step 9's "Common issues" #2.

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

- **create-llm-proxy-semantic-routing-basic** — Same end goal but with no vector DB; quicker to set up; capped at small topic sets.
- **create-llm-proxy-model-based-routing** — Routes by the request body's `model` field instead of semantics.
- **apply-token-rate-limiting-to-llm-proxy** — Adds a token-based rate limit policy.
- **request-llm-proxy-access** — Creates a consumer client application and contract.
