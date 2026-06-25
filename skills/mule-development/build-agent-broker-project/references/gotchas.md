# GA Gotchas, Compile-Error Rules, Asset Modes, Tooling Integration

This file consolidates everything the published docs don't make obvious — the rules that bite during build/edit. When in doubt about a field name or shape, mirror `canonical-example.md`.

GA is built on **A2A v1.0** and stays backward-compatible with A2A v0.3 clients via the `a2a_v03` registry branch. Beta patterns (`metadata.protocol` + flat `metadata.card`, `kind: "a2a:response"` echo with nested `task: a2a.task({...})`, `policies` as flat array) no longer apply.

## Project file layout

```
my-agent-network-project/
├── agent-network.yaml      # registry + context + brokers
├── exchange.json           # Anypoint Exchange asset metadata + variables
└── brokers/
    └── <broker-id>.agent   # Agent Script — one graph per file
```

For multi-broker projects: one `.agent` per broker, each referenced from its own entry under `brokers:`.

## Top-level YAML markers

- `agentNetwork: 2.0.0` — unquoted. (V1 used `schemaVersion: 1.0.0`.)
- `exchange.json` `"classifier": "agentic-network"`. (V1 used `agent-network`.)
- `info.version` accepts non-semver strings (`v1` works in canonical).

## Registry agents — interfaces and card shape

GA places the agent card under `metadata.interfaces.<branch>.card` where `<branch>` is one of:

- **`a2a`** — current A2A v1.0 card. Use this for agents on v1.0.
- **`a2a_v03`** — legacy A2A v0.3 card. Use this for agents that haven't migrated; the broker still talks to them transparently.
- **`other`** — non-A2A interfaces (custom HTTP, etc.).

```yaml
registry:
  agents:
    helpCenterAgent:
      info:
        label: Help Center Agent
      metadata:
        platform: Other
        interfaces:
          a2a_v03:                        # legacy v0.3 agent
            card:
              name: Help Center Agent
              description: ...
              url: http://localhost:8080/helpCenterAgent
              protocolVersion: 0.3.0
              version: 1.0.0
              capabilities: { pushNotifications: false }
              defaultInputModes: [application/json, text/plain]
              defaultOutputModes: [application/json, text/plain]
              skills: [...]
```

The Beta combination of `metadata.protocol: a2a` + flat `metadata.card.<branch>` is removed. Don't emit it.

### A2A card differences by branch

| Field | `a2a` (v1.0) | `a2a_v03` (legacy) |
|---|---|---|
| `url` | Required (per A2A v1.0 spec) | Required |
| `protocolVersion` | Required | `0.3.0` |
| `version`, `capabilities`, `defaultInputModes`, `defaultOutputModes`, `skills` | Required | Required |

**Broker card exception**: a broker IS the endpoint, so its own card under `brokers.<id>.interfaces.a2a.card` typically omits `url` and `protocolVersion` (the runtime fills them in at deploy). The required-field rules apply to **registry agent cards** (external agents the broker calls). When in doubt for a broker, mirror `canonical-example.md`.

## Agent Script `.agent` file

### Dialect line

```text
# @dialect: AGENTFABRIC=0.1
```

`AGENTFABRIC=0.1` pins to dialect 0.1 or later within the major. Major-only (`AGENTFABRIC=0`) references the latest within that major. Patch fixes (`AGENTFABRIC=0.1.2`) are invalid; major-or-major.minor only.

### `config:` block — minimal canonical form

```text
config:
  agent_name: "it-help-investigation"     # REQUIRED, kebab-case
  default_llm: @llm.openai_mini           # optional
```

`agent_name` is required and MUST be kebab-case. Do NOT add `name` or `id`. `label` and `description` are optional.

### LLM `kind:` casing

Exact case: `"Gemini"` or `"OpenAI"`. Azure OpenAI deployments use `kind: "OpenAI"` in the `.agent` LLM block; `AzureOpenai` only appears at `registry.llms.<id>.metadata.platform`.

---

## Compile-error rules — action invocation

These bite the most.

### A2A actions

**Definition:** only `target` and `kind`. NO `inputs:`. A2A tools accept only a `message` parameter (plain string).

```text
actions:
  help_center_agent:
    target: "a2a://helpCenterAgentConnection"
    kind: "a2a:send_message"
```

**Inside `subagent`/`orchestrator` `reasoning.actions`:** bare reference. Adding `with message = ...` is a compile error. The LLM picks the message at runtime.

```text
reasoning:
  actions:
    search_help: @actions.help_center_agent      # ✓ bare reference
    # search_help: @actions.help_center_agent
    #   with message = "..."                      # ✗ COMPILE ERROR
```

**Inside `executor` `do:` `run`:** REQUIRES `with message = <value>` where `<value>` is string literal, `@reference`, or concatenation.

```text
do: ->
  run @actions.help_center_agent
    with message = "Search for: " + @generator.classify.output.topic
```

### MCP actions

**Definition:** `target`, `kind: "mcp:tool"`, `tool_name`, optional `inputs:`. Only declare `inputs:` if you actually know the parameter names and types.

```text
actions:
  escalate_ticket:
    target: "mcp://escalationMcpConnection"
    kind: "mcp:tool"
    tool_name: "escalate"
    inputs:
      ticket_id: string
      severity: string
```

**`with` parameters must be declared in `inputs:`** — passing an undeclared `with` parameter is a compile error. If `inputs:` is omitted, the runtime auto-discovers tool arguments and the invocation MUST have zero `with` parameters (other than `http_headers`).

**Slot-fill (`...`)** is only valid inside `reasoning.actions` MCP `with` clauses. Never in executor `run`.

```text
reasoning:
  actions:
    update_ticket: @actions.update_jira_ticket
      with ticket_id = @generator.classify.output.ticket_id     # ✓ declared input
      with http_headers = {"Authorization": @request.headers["Authorization"]}     # ✓ implicit
    send_slack: @actions.send_slack_message
      with message = ...                                        # ✓ slot-fill (MCP only)
```

### `http_headers` — the ONE implicit parameter

Every action automatically accepts an optional `http_headers` parameter (an object). Never declare in `inputs:`. Use to propagate auth or correlation IDs.

## Other compile-error rules

- **Trigger `on_message:`** must be a fixed `transition to`. Conditional routing inside `on_message:` is a compile error — use a `router` node.
- **Router `on_exit:` with `transition to`** is a compile error. Routers transition exclusively via `routes` and `otherwise`.
- **`a2a.message` / `a2a.artifact` / `a2a.textPart` / `a2a.dataPart` / `a2a.filePart` / `uuid()`** are FUNCTIONS, not references — do NOT prefix with `@`.

## Echo node — A2A v1.0 update events

GA echo replaces the Beta `kind: "a2a:response"` (with nested `task: a2a.task({...})`) with **A2A v1.0 update events**. Two `kind` values:

| Kind | Required parameters | Optional parameters |
|---|---|---|
| `a2a:status_update_event` | `state` (string), `message` (built via `a2a.message(...)`) | `metadata` (dict) |
| `a2a:artifact_update_event` | `artifact` (built via `a2a.artifact(...)`) | `append` (bool), `lastChunk` (bool) |

**Status update example (GA):**

```text
echo escalationResponse:
  kind: "a2a:status_update_event"
  state: "TASK_STATE_COMPLETED"
  message: a2a.message({
    messageId: uuid(),
    parts: [
      a2a.textPart("Ticket " + @generator.classifySeverity.output.ticket_id + " escalated.")
    ]
  })
```

**Artifact update example:**

```text
echo addArtifact:
  kind: "a2a:artifact_update_event"
  artifact: a2a.artifact({
    artifactId: uuid(),
    name: "myArtifact",
    parts: [
      a2a.textPart("Employee ID: " + @orchestrator.hrSystemOnboard.output.employeeId)
    ]
  })
  append: false
  lastChunk: false
```

**Echo `state` enum.** GA emits `TASK_STATE_*` constants (uppercase, prefixed). One of:
`TASK_STATE_SUBMITTED`, `TASK_STATE_WORKING`, `TASK_STATE_INPUT_REQUIRED`, `TASK_STATE_COMPLETED`, `TASK_STATE_FAILED`, `TASK_STATE_CANCELED`, `TASK_STATE_REJECTED`. Custom values are rejected.

**No `a2a.task(...)` wrapper.** GA echo doesn't wrap its payload in `a2a.task({...})`. Build status updates with `state: "..."` + `message: a2a.message(...)` directly. The runtime aggregates events into the canonical Task on the server side.

## Expression syntax — three forms

| Form | Where | Example |
|---|---|---|
| `{!@<reference>}` | Inside plain string literals (`prompt:`, `reasoning.instructions:`) | `"Severity is {!@generator.classify.output.severity}"` |
| Direct `@reference` | Inside `+` concatenation, in `with` values, inside `a2a.*()` echo helpers | `"Ticket " + @generator.classify.output.ticket_id` |
| Slot-fill `...` | `reasoning.actions` MCP `with` clauses ONLY | `with message = ...` |

**Inside echo `a2a.message() / a2a.artifact() / a2a.textPart()`, references are direct.** `{!@...}` does NOT apply inside echo helpers.

## Subagent vs orchestrator — the decision

```
Does this node use any actions OR require human-in-the-loop?
  ├─ NO  → generator (single LLM call, no actions, no HITL)
  └─ YES
       └─ Does this node coordinate MULTIPLE actions toward a compound goal?
            ├─ YES → orchestrator
            └─ NO  → subagent (default)
```

Single-action node calling one A2A agent → **`subagent`**. NOT `orchestrator`. Node type is determined by *coordination scope*, not protocol.

`subagent` and `orchestrator` MUST have ≥1 action OR HITL. Otherwise use `generator`.

**HITL is built into `subagent`** via the runtime's `input-required` A2A response. Don't model clarification as an external `subagent → router on needs_clarification → executor → echo` flow.

## Operational parameters — set them, don't leave defaults

Two optional fields on every `subagent`/`orchestrator`:

- **`reasoning.max_number_of_loops`** — caps the agent loop. Default 25. Lower for tight loops: classification subagents fine at 3, multi-action orchestrators usually 5–10. Default 25 risks runaway token spend on bad inputs.
- **`reasoning.task_timeout_secs`** — wall-clock cap. No documented default; set when calling slow downstream agents.

```text
orchestrator crossPlatformTriage:
  reasoning:
    instructions: -> | {!@request.payload.message.parts[0].text}
    actions: { ... }
    max_number_of_loops: 5
    task_timeout_secs: 60
```

## `outputs:` placement — different per node type

- **`generator`**: at node top level (sibling of `prompt:`).
- **`subagent` / `orchestrator`**: nested inside `reasoning:` (sibling of `reasoning.instructions` and `reasoning.actions`).

Wrong placement is a compile error.

## Connection rules (GA)

- `url` is **optional** for all connection kinds (a2a, mcp, llm). Resolved at deploy time when omitted.
- `authentication` is **required for `kind: llm`** connections, optional for `a2a` and `mcp`.
- `policies` on a connection (when present) is an object with `inbound` and `outbound` arrays:

  ```yaml
  context:
    connections:
      myConnection:
        kind: a2a
        ref: { name: myAgent }
        url: ${myAgent.url}
        policies:
          inbound: []
          outbound:
            - ref: { name: rate-limit-policy }
  ```
  The Beta shape (flat array of policy ids) is removed.

## Authentication kind casing (GA)

| Auth kind | Casing |
|---|---|
| API key | `apiKey` |
| API key client credentials | `apikey-client-credentials` |
| OAuth2 client credentials | `oauth2-client-credentials` |
| OAuth2 OBO | `oauth2-obo` |
| Basic auth | `basic` |
| In-task authorization code | `in-task-authorization-code` |

Default to `apiKey`, `oauth2-client-credentials`, `oauth2-obo`. `in-task-authorization-code` is for OAuth2 step-up — don't emit unless explicitly requested.

GA additions:
- **`distributed`** field on `oauth2-obo` and `in-task-authorization-code` blocks (boolean) — set when the auth flow spans services or replicas.
- `in-task-authorization-code` accepts `subjectTokenType` and `requestedTokenType` (token-exchange semantics).

## Variables block — the rules

```text
variables:
  response_message: string
  response_state: string
```

- Only declare for **cross-path shared state** (e.g., `response_message` written by multiple paths and read by a shared echo).
- Do NOT mirror node outputs (`@<nodeType>.<nodeId>.output`) or globally-accessible request data — reference directly.
- Never declare a variable that isn't both set and read by ≥1 node.
- Syntax: `<name>: <type>` with optional indented `description:`. NO `mutable`, NO defaults like `= ""`.

## Supported LLMs — model IDs change fast

Always look up current production model IDs at provider docs:
- Gemini: <https://ai.google.dev/gemini-api/docs/models>
- OpenAI: <https://developers.openai.com/api/docs/models>

GA-supported families: GPT-5 family (OpenAI / Azure OpenAI) and Gemini 2.5 / 3 family. When emitting model IDs, confirm with the user — IDs change quickly across releases.

---

## RULE-ASSET-MODE — inline vs Exchange

Every asset is in **one of two modes**. Each asset's mode is independent — a single project can mix.

### Mode 1 — Inline (asset defined locally)

Used when the asset doesn't exist in Anypoint Exchange.

**Two places:**
- **a)** `registry.{agents,mcps,llms}.<id>` — asset definition.
- **b)** `context.connections.<connId>` with `ref.name: <id>` matching the registry id.

No `exchange.json.dependencies` entry. No `ref.namespace`.

### Mode 2 — Exchange (asset is a published dependency)

Used when the asset exists in Anypoint Exchange — Private (your org) or Public.

**Two places:**
- **a)** `exchange.json.dependencies` — `{ groupId, assetId, version, classifier, packaging: "zip" }`.
- **b)** `context.connections.<connId>` with `ref.name: <assetId>` AND `ref.namespace: <groupId>`. **No registry entry.**

## Asset selection — identify, search, register, bind

### Stage 1: Identify the need

| Need | Asset type |
|---|---|
| Delegate to another autonomous agent that owns its logic | A2A agent |
| Call a specific API/function | MCP server tool |
| Classify, summarize, generate, judge | LLM |

Prefer MCP for single API calls (cheaper, faster). Prefer A2A for multi-step delegation (autonomous reasoning).

### Stage 2: Search Exchange

If `search_asset` is available, call it per asset need. Search **Private Exchange first**; only fall back to Public if Private has no match. Confirm before pulling Public.

| Asset type | `assetFilters` |
|---|---|
| LLM | `["llm"]` |
| MCP server | `["mcp"]` |
| A2A agent | `["agent"]` |

If `search_asset` isn't available, ask: *"Do you have this in Exchange already, or should I register a placeholder?"*

```
search_asset → found in Private?       → Case A (Exchange, Private)
            → found only in Public?    → Case B (confirm, then Exchange, Public)
            → not found anywhere?      → Case C (inline placeholder)
```

**Case C placeholder:** create a registry entry with `default: ""` for URLs/secrets in `exchange.json`. Flag clearly. Example:

```yaml
registry:
  agents:
    customAgent:
      info:
        label: Custom Agent (PLACEHOLDER — fill in skills)
      metadata:
        platform: Other
        interfaces:
          a2a:
            card:
              name: customAgent
              description: TODO
              url: ${customAgent.url}
              protocolVersion: "1.0"
              version: 1.0.0
              capabilities: { pushNotifications: false }
              defaultInputModes: [application/json, text/plain]
              defaultOutputModes: [application/json, text/plain]
              skills: []
```

When you finish the build, list every placeholder explicitly. **Never fabricate** asset IDs, URLs, or MCP tool names.

### Stage 3: Register

Per asset, atomically:
1. Inline OR Exchange definition (per RULE-ASSET-MODE).
2. Add any new `${...}` variables to `exchange.json.metadata.variables`. Mark URLs `secret: false`. API keys / passwords / OAuth secrets `secret: true`.
3. Confirm with user before next asset.

**Naming conventions** (from canonical):
- Asset id: camelCase (`helpCenterAgent`, `escalationMcp`, `openAiMini`).
- Connection id: `<assetId>Connection`.
- Variables: `<assetId>.url`, `<assetId>.apiKey`, etc.

### Stage 4: Bind to nodes

**Cap at 4 actions per LLM-powered node** (guideline). Beyond 4, hallucination rates climb. Move actions to a downstream `executor`, split via `router`, or drop unused actions. Don't refuse a 5th if user accepts the risk.

**CR-18 nuance — least privilege.** Hard business constraints are enforced by **router conditions**, not prompts.

- **Irreversible / high-stakes mutations** (escalate, delete, restart, send-to-customer) MUST be in `executor` nodes gated by `router`. NEVER on `subagent`/`orchestrator` — the LLM could invoke them bypassing the router.
- **Idempotent updates** integral to the compound goal (status updates, ticket updates, log entries) MAY be on a `subagent`/`orchestrator`. Canonical IT Help does this: `crossPlatformTriage` (orchestrator) has `update_ticket` because updating Jira is part of the compound triage goal. **It does NOT have `escalate`** — that's irreversible and lives on executors gated by routers.

The line: irreversible/high-stakes (executor-only, router-gated) vs idempotent/domain-natural (orchestrator OK).

**LLM tier per node:**

| Tier | When |
|---|---|
| Pro | Multi-step orchestration, ambiguous classification, ≥3 actions |
| Flash / mini | Single-step classification, summary, formatting, templated text |

Use `default_llm` for common case. Override per-node only on exceptions.

**Action aliases** inside `reasoning.actions` — short readable names (`search_help`, `slack_update`, `escalate`). The alias is what the LLM sees — clear aliases reduce hallucinated tool calls.

### Common mistakes

- A2A for a single API call (use MCP).
- MCP for autonomous multi-step delegation (use A2A).
- Cramming everything into one orchestrator (split or move to executors).
- Declaring fabricated `inputs:` on MCP actions.
- Declaring `inputs:` on A2A actions (forbidden).
- Forgetting `${...}` variables in `exchange.json.metadata.variables`.
- Hardcoding URLs (always parameterize).
- Using `orchestrator` for a single-action node.
- Putting irreversible mutations on `subagent`/`orchestrator`.
- Mixing inline and Exchange registration for the same asset.
- Putting hard constraints in prompts (use router conditions on identifying attributes — service name + recommended action — not derived judgment flags like `requires_approval`).
- Modeling HITL as external `subagent → router → executor` (subagents have built-in HITL).
- Using `{!@...}` template syntax inside `a2a.*()` echo helpers.
- Auto-inserting missing assets during validation (ask the user to fix or remove).

---

## Tooling integration — CLI-first, MCP-fallback

The skill prefers the **Anypoint CLI Agent Fabric plugin** for validate/publish/deploy because it's portable (every host, including CI/CD), official MuleSoft, and stays in sync with platform changes. The MuleSoft MCP server (auto-installed in ACB/Vibes) is the fallback — same operations, host-mediated auth.

### Capability matrix

| Capability | Step | CLI command (preferred) | MCP tool (fallback) | If neither |
|---|---|---|---|---|
| Scaffold project | 0 | `agent-network project create --name <n> --output-dir <d> --create-dir` | `create_agent_network_project` | Write canonical scaffold directly; warn about missing `groupId` |
| Configure YAML | 0–5 | *(skill IS the experience — edits files in place)* | *(skip — `configure_agent_network_yaml` returns a duplicate prompt template)* | — |
| Search Exchange | 1, 2 | `anypoint-cli-v4 exchange asset list` | `search_asset` | Ask user for `groupId`/`assetId`/`version` |
| Validate / build | 6 | `agent-network project build` | `validate_project` | Structural checklist + doc link |
| Publish to Exchange | 7 | `agent-network project publish` | `publish_agent_network_assets` | Doc link |
| Deploy to runtime | 8 | `agent-network project deploy` | `deploy_agent_network` | Doc link |
| Set up gateways | one-time | `agent-network setup gateways` | *(no MCP equivalent)* | Doc link |

### Detection

In order at each integration point:

1. **CLI:** `command -v` the relevant binary —
   - `anypoint-cli-agent-fabric-plugin` for build/publish/deploy/setup-gateways
   - `anypoint-cli-v4` for Exchange search and any general Anypoint operation
2. **MCP:** Tool appears with prefix `mcp__mulesoft__` (e.g., `mcp__mulesoft__search_asset`).
3. **Neither:** Fall back to doc link or user prompt.

Don't probe filesystems for credentials — let CLI/host abstract auth.

### CLI failure → MCP fallback (automatic, no prompting)

**As soon as a CLI command fails, fall back to the equivalent MCP tool. Do not ask the user. Do not retry the CLI. Do not stop the phase.**

A CLI attempt is failed if ANY of:
- `command -v` returns empty.
- Non-zero exit for an environment reason — `ENOENT`, "command not found", plugin not installed, auth env vars unset, network error, `EACCES`, `npm install` prompt.
- Hangs past timeout — ~60s for search, ~5min for build/publish/deploy.
- Succeeds but returns empty/malformed output where the schema requires content.

A CLI attempt is **not** failed when the failure is the user's input (invalid project name, missing field) or when the CLI legitimately reports schema errors — surface those, don't fall back.

**Procedure:**
1. Catch the CLI failure. Note the reason silently. Do NOT narrate the failure to the user unless they ask.
2. Map to the MCP equivalent (table below) and call it with the same inputs.
3. If MCP is also unavailable or also fails, fall back to the no-tool path (§ "Graceful degradation").
4. Tell the user only the **outcome** — not the tool-by-tool path.

**If a CLI invocation needs more info to construct** (unknown flag, unfamiliar subcommand, ambiguous syntax error): run `<command> --help` first; if that doesn't resolve it, do a public-web search for the CLI's documentation. Only ask the user after both fail. Don't narrate the lookup — just run the corrected command.

| Step | CLI | MCP equivalent |
|---|---|---|
| Step 1 Scaffold | `anypoint-cli-agent-fabric-plugin agent-network project create` | `mcp__mulesoft__create_agent_network_project` |
| Phase 2 Exchange search | `anypoint-cli-v4 exchange asset list` | `mcp__mulesoft__search_asset` |
| Step 7 Validate / build | `anypoint-cli-agent-fabric-plugin agent-network project build` | `mcp__mulesoft__validate_project` |
| Step 8 Publish | `anypoint-cli-agent-fabric-plugin agent-network project publish` | `mcp__mulesoft__publish_agent_network_assets` |
| Step 9 Deploy | `anypoint-cli-agent-fabric-plugin agent-network project deploy` | `mcp__mulesoft__deploy_agent_network` |
| Step 9 Gateways setup | `anypoint-cli-agent-fabric-plugin agent-network setup gateways` | (no MCP equivalent — point user at docs) |

### CLI auth (env vars only — never inline)

Both CLIs share Anypoint Platform auth via the same env vars:

- `ANYPOINT_CLIENT_ID` / `ANYPOINT_CLIENT_SECRET` (connected app credentials)
- `ANYPOINT_ORG` (org ID)
- `ANYPOINT_ENV` (environment name; defaults to Sandbox)
- `ANYPOINT_HOST` (defaults to `anypoint.mulesoft.com`; override for EU/Gov)

The general CLI also supports username/password auth via `anypoint-cli-v4 conf username <u>` / `conf password <p>` / `conf organization <o>`, but env-var/connected-app credentials are preferred for CI and shared sessions.

If env vars are unset and a CLI is being asked to do an auth-bearing action, point user at <https://docs.mulesoft.com/anypoint-cli/latest/auth>. Do not paste credentials, even temporarily.

Install:
- Agent Fabric plugin: `npm i mulesoft-anypoint-cli-agent-fabric-plugin`
- General CLI v4: `npm install -g anypoint-cli-v4`

### Exchange search — Phase 1 preview, Phase 2 registration

**CLI (preferred):** `anypoint-cli-v4 exchange asset list --search "<query>" [--type <type>] [--organization <orgId>]`

- General CLI v4 type filters: `connector` | `rest-api` | `soap-api` | `template` | `example` | `custom` | `raml-fragment`. Agent-Fabric–specific types (LLM/MCP/Agent) aren't first-class here yet, so search broadly and filter the result list by name/description.
- Useful follow-ups: `anypoint-cli-v4 exchange asset describe <groupId>/<assetId>/<version>` to confirm details before registering.
- **Always pass `--organization <orgId>`** to scope to Private Exchange first. If no Private match, drop the flag (or pass the public org) — confirm with user before pulling Public.

**MCP fallback:** `search_asset` with `assetFilters: ["llm"]`, `["mcp"]`, `["agent"]`.

- At least one of `searchQuery` or `maxResults`.
- Optional: `statuses`, `organizationId`, `sharedWithMe`, `sortCriteria`, `ascending`, `exchangeScope` (Private / Public).
- Always include `assetFilters` — searching without narrows nothing.

If search returns no results, **don't invent the asset**. Tell the user: *"I didn't find a matching asset in Exchange. Want to provide a custom configuration, or skip?"*

### Step 7 — Validate / build

**CLI:** `anypoint-cli-agent-fabric-plugin agent-network project build --path <projectPath>`. Validates configuration via Maven wrapper, generates deployable artifact. Add `--debug` for verbose output. Exits non-zero on validation failure.

**MCP:** `validate_project` with `projectPath`. Returns schema/reference/expression findings.

Two kinds of fixes:
1. **Auto-fix safely** — formatting/indentation, missing required keys (e.g., `info.version`).
2. **Ask the user** — schema-required references missing. **Never auto-insert missing assets.**

Loop until clean.

### Step 8 — Publish

**CLI:** `anypoint-cli-agent-fabric-plugin agent-network project publish [--path <projectPath>] [--environment <env>] [--json]`.
- `assetVersion` is read from `exchange.json` (not a flag).
- `--json` returns asset URLs in parseable form for CI.

**MCP:** `publish_agent_network_assets` with `assetVersion` (semver), optional `projectPath`, `groupId`.

Prereqs (both paths): authenticated; valid `exchange.json` (no empty `default: ""` for `secret: true` variables); `assetVersion` set.

After publish, surface published asset URLs.

### Step 9 — Deploy

**One-time setup per private space:** `anypoint-cli-agent-fabric-plugin agent-network setup gateways --target-space <space>`. Defaults: ingress `agent-network-ingress-gw`, egress `agent-network-egress-gw`, space `agent-network-space`. Skip if gateways already exist.

**CLI deploy:** `anypoint-cli-agent-fabric-plugin agent-network project deploy [flags]`. Useful flags:
- `--environment <name>` (or `ANYPOINT_ENV`)
- `--target-space <name>` (defaults to `agent-network-space`)
- `--ingress-gw <name>` / `--egress-gw <name>` (defaults shown above)
- `--property k:v` (repeatable — env-specific secrets/config; e.g., `--property openai.apiKey:STAGING_API_KEY`)
- `--dont-wait-for-agent-network` (CI: return immediately)
- `--disable-tracing` (CI/test: skip telemetry)
- `--json` (parseable output)

**MCP:** `deploy_agent_network` with `projectPath`, `environmentName`, `privateSpaceName`, `ingressGatewayName`, `egressGatewayName`.

Prereqs (both paths): gateways exist in target space; successful publish (or assets in Exchange); secrets injected via `--property` or pre-filled `exchange.json`.

After deploy, surface URL/ID.

### Graceful degradation (neither CLI nor MCP)

The skill works in Cursor, standalone Claude Code, Codex — anywhere without MuleSoft tooling. When neither CLI nor MCP is available:

- **Phase 1/2 — search:** Ask the user directly. For Exchange-mode assets, get `groupId`/`assetId`/`version` and (for MCPs) transport kind + tool names. For unknown assets, register an inline placeholder per Case C. Tell the user: *"To search Exchange directly, install `anypoint-cli-v4` (`npm i -g anypoint-cli-v4`)."*
- **Step 7 — validation:** Run the structural checklist. Tell the user: *"To run MuleSoft's full schema validator, install the CLI plugin (`npm i mulesoft-anypoint-cli-agent-fabric-plugin`) or use the MuleSoft MCP server in your IDE. CI/CD reference: <https://docs.mulesoft.com/anypoint-code-builder/af-build-agent-networks-in-a-ci-cd-environment>."*
- **Step 8 — publish:** Point at <https://docs.mulesoft.com/anypoint-code-builder/af-publish-agent-network-assets>.
- **Step 9 — deploy:** Point at <https://docs.mulesoft.com/anypoint-code-builder/af-deploy-agent-network-targets>.

### Step 1 — Scaffold

**CLI:** `anypoint-cli-agent-fabric-plugin agent-network project create --name <project-name> --output-dir <parent-dir> --create-dir`. Key flags:
- `-n, --name=<value>` (required) — project name; becomes default `assetId` (lowercased, hyphenated).
- `-o, --output-dir=<value>` — parent directory for the new project (default: current dir).
- `--create-dir` — create a new directory at `output-dir` named after the project (recommended; without it, files land directly in `output-dir`).
- `--asset-id`, `--asset-version` (default `0.0.0`), `--api-version` (default `v1`) — override the defaults written into `exchange.json`.
- `--organization=<orgId>` / `--environment=<name>` — pulled from `ANYPOINT_ORG` / `ANYPOINT_ENV` env vars by default.

The CLI writes a starter `agent-network.yaml` (with `agentNetwork: 2.0.0`), `exchange.json` (with the correct `groupId`/`organizationId`/`classifier: agentic-network`), and an empty `brokers/` directory. The skill then edits these in place.

**MCP fallback:** `create_agent_network_project` — same inputs as the CLI.

**No-tool fallback:** write the canonical scaffold (per `canonical-example.md`) directly. Tell the user to fill in `groupId`/`organizationId` in `exchange.json` before publish.

### What this skill must NOT do

- **Don't call `configure_agent_network_yaml`** — it returns a duplicate prompt template that overlaps with the skill's guided experience.
- **Don't silently shell out** for auth-bearing actions without confirming env vars are set; never paste credentials inline.
- **Don't auto-deploy.** Step 7 ends at "validated"; 8 is publish; 9 is deploy. Both opt-in.
- **Don't auto-insert missing assets** when validation reports a dangling reference. Ask user.
- **Don't fabricate** MCP `tool_name`, asset IDs, or model IDs even when neither CLI nor MCP is present.
