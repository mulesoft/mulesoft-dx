# Agent Scanner push contract

Use this contract unchanged for every generated script. Provider discovery and
field mapping are dynamic; these scanner semantics are not.

## Contents

- Configuration and asset type
- Create configuration
- ZIP contract and Agent Fabric schemas
- Caps
- Authentication directions
- Push and commit
- Ownership boundary

## Configuration and asset type

- Publish one invocation to one scanner configuration id.
- The configuration accepts exactly one type: `agent`, `mcp`, or `rest-api`.
- That type is chosen in the skill chat and written into the script as a
  source constant. The script does not accept `--asset-type` or
  `SCANNER_ASSET_TYPE`.
- Classify with that type's inventory probe (handshake, protocol, export), not
  the display name and not "every row from a shared list".
- Customer UX (flags, missing-value prompts, stderr steps, FAILED block, JSON
  stdout) is identical across providers and languages. Only provider auth fields
  and inventory calls from the customer's documents change.
- Do not ask for separate configuration ids by asset subtype.
- Do not add a Java scanner, provider credential model, or provider request to
  Agent Scanner for a customer-hosted script.

## Create configuration

The UI **Self-managed Scanner** page collects Name (required), Description
(optional), and Service type (required: agent / MCP / REST API). The generated
script creates the same scanner through the backend. Do not tell the customer
they must create it in the UI first.

When `SCANNER_CONFIGURATION_ID` / `--config` is empty at runtime, create one
self-managed configuration for the baked `ASSET_TYPE` using `SCANNER_NAME`
(required) and `SCANNER_DESCRIPTION` (optional). When the id is set, use it
and do not create another.

Do not invent `ANYPOINT_ORG_ID`. Do not call `GET /accounts/api/me` or
`anypoint-cli` to look it up. Do not send a `schedule`. Do not send
`authParameters`. Push create rejects a stored credential and a scheduled
state.

List target systems:

```http
GET {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/connectivity/target-systems
Authorization: Bearer <token>
```

Pick the row whose `type` matches the baked asset type. Match case-insensitively
and ignore underscores:

| `ASSET_TYPE` | `type` values |
|---|---|
| `agent` | `pushagent`, `PUSH_AGENT` |
| `mcp` | `pushmcp`, `PUSH_MCP` |
| `rest-api` | `pushapi`, `PUSH_API` |

If that row is missing, FAILED: the organization does not have self-managed
scanners enabled, or the entitlement does not match (`agent` vs `apiScanners`).

Create:

```http
POST {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "name": "<SCANNER_NAME>",
  "description": "<SCANNER_DESCRIPTION>",
  "state": "STOPPED",
  "runPolicy": "{}",
  "notificationEnabled": false,
  "importMode": "ask-for-review",
  "connection": {
    "name": "<SCANNER_NAME>-connection",
    "orgId": "<ANYPOINT_ORG_ID>",
    "targetSystemId": "<id from target-systems>",
    "authScheme": "customer-upload"
  }
}
```

`runPolicy` is the JSON string `"{}"` (empty object). Omit `schedule`. Omit
`authParameters`. Omit `description` when `SCANNER_DESCRIPTION` is empty. Do
not send an empty-string description as a required field. Success is HTTP 200
with `id`. That `id` is the configuration id for this run. Print it on stderr
and include it in JSON stdout as `publish.configurationId`.

Service type on the UI is the baked `ASSET_TYPE`. Name and Description are
`SCANNER_NAME` and `SCANNER_DESCRIPTION`. `importMode` stays
`ask-for-review` (the UI default). Do not ask for review mode in chat.

A generated script that creates a pull scanner (any `authScheme` other than
`customer-upload`), that sends a schedule, or that stores provider credentials
on the scanner is a generation failure.

## ZIP contract and Agent Fabric schemas

Create one ZIP per asset with one top-level directory named by a stable provider
external id of at most 255 characters.

Required entries:

```text
<externalId>/specification/config.json
<externalId>/specification/<artifact-file>
```

`config.json`:

```json
{
  "name": "<display name>",
  "type": "<agent|mcp|rest-api>",
  "description": "<optional, at most 500 characters>"
}
```

Artifact file by type. Agent Fabric (tag `1.2609.1`) is the source of truth.
Copy the files from this skill's `schemas/` directory. Keep `$ref` siblings in
the same folder (`a2a.json`, `a2a_v1.json`, `metadata_provenance.json`,
`references.json`).

| Type | ZIP artifact | Schema in this skill |
|---|---|---|
| `agent` | `a2a-card.json` | `schemas/agent_card.json` |
| `agent` | `a2a-v1-card.json` | `schemas/agent_card_v1.json` |
| `agent` | `other-card.json` | `schemas/other_card.json` |
| `mcp` | `mcp-metadata.json` | `schemas/mcp_metadata.json` |
| `rest-api` | `oas.json` | `schemas/openapi.schema.json` |

Reject a ZIP whose files are directly under `<externalId>/` without the
`specification/` directory. Require `config.json.type` to match the scanner
configuration asset type.

A2A v0.3 required keys: `name`, `description`, `protocolVersion`, `url`,
`version`, `capabilities`, `defaultInputModes` (at least one),
`defaultOutputModes` (at least one), `skills`. Skill objects, when present,
need `id`, `name`, `description`, and `tags`.

A2A v1: `supportedInterfaces` or `supported_interfaces` with a callable `url`;
never a top-level `url`.

MCP: `transport` required; if emitting `capabilities`, emit all four booleans
`tools`, `resources`, `prompts`, `logging`; omit `serverInfo`.

REST: require `openapi` or `swagger`; preserve the provider export unless an
approved transformation is documented. REST has no Agent Fabric JSON Schema.
`schemas/openapi.schema.json` is the scanner's intake shape check, not a second
Agent Fabric dialect.

Validate locally against those schema files before upload. The server validates
again and may refuse the ZIP.

## Caps

These are server limits. Put them in `--help`. Do not invent different numbers.

| Cap | Value |
|---|---|
| Assets staged per run | 1000 (`scanner.intake.max-assets`) |
| ZIP file | 12 MB |
| Multipart request | 13 MB |
| One ZIP entry | 5 MB |
| Entries per ZIP | 500 |
| Uncompressed ZIP | 20 MB |
| One ZIP | one asset |
| Description at Exchange | 250 characters (truncate `config.json` description if longer) |
| Org-wide agent capacity | server default 20000 (`organization.agents.capacity-limit`). Do not tell the customer this is 10000. |

## Authentication directions

Provider credentials are used only by the generated script to read the customer
system. They never enter the ZIP or MuleSoft request. Field names come from the
customer's authentication document. Do not assume a cloud CLI session.

MuleSoft authentication is one selected mode per run. Both modes are valid.
Do not probe the other mode after a 401. Do not send both a client secret and
a password in one token request.

### connected-app

Connected App client id and client secret, scoped for the customer's
organization, with `manage:exchange`. Mint the bearer token with:

```http
POST {ANYPOINT_BASE}/accounts/api/v2/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=...&client_secret=...
```

Do not send that token request as JSON. Never log the secret or bearer token.
This is the unattended CI path.

### username-password

Anypoint username and password (the same user-login used by Access Management
`createLogin`). Mint the bearer token with:

```http
POST {ANYPOINT_BASE}/accounts/login
Content-Type: application/json

{"username":"...","password":"..."}
```

Do not send that body as form-urlencoded. Do not use `grant_type=password` on
the Connected App token URL for this mode. Response `access_token` is the
bearer token. HTTP 401 with an MFA challenge means this account cannot use
username/password unattended — FAILED and tell them to use `connected-app`.
Never log the password or bearer token.

`ANYPOINT_ORG_ID` is still required. Login does not replace it. Do not call
`GET /accounts/api/me` to invent the org id.

Token and scanner share the user-supplied Anypoint host:

```text
scannerBase = trimTrailingSlash(ANYPOINT_BASE) + "/agent-scanner"
```

Do not ask for a scanner URL. The host is whatever the customer provided.
Do not emit `--scanner-base`, `SCANNER_BASE`, `localhost`, or `127.0.0.1`.
`--anypoint-base` is not "token only": create, push, and commit use the same
host plus `/agent-scanner`. A 404 on that path is a wrong org id, configuration
id, or environment — not permission to point the script at a laptop.

## Push and commit

For every ZIP:

```http
POST {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations/{scannerConfigurationId}/push
Authorization: Bearer <token>
Content-Type: multipart/form-data
file=<zip bytes>
```

Success is HTTP 202 (`PushWorkspaceUploadResponse`) with `assetId` (the ZIP's
single top-level project dir name), `action` (`created` or `replaced`), and
`workspaceRunId`. Require every successful upload in one invocation to return
the same workspace id. The same ZIP directory name replaces the staged object.
Exchange is not called. An id left out of a later `POST /push` stays staged.
Remove it before commit with `DELETE .../push/{externalId}`.

When the script needs a `workspaceRunId` without having uploaded yet
(empty-inventory `PUSH_ALLOW_EMPTY=yes`):

```http
GET {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations/{scannerConfigurationId}/workspace
Authorization: Bearer <token>
```

Success is HTTP 200 (`PushWorkspaceStateResponse`) with `workspaceRunId`,
`stagedAssetCount`, `assetCap`, `remainingCapacity`, `hitAssetCap`, and
`scanRunId`. After uploads, use the `workspaceRunId` from the 202 instead of
this call. The empty-inventory hatch is the env `PUSH_ALLOW_EMPTY=yes`. Do not
emit a separate `--allow-empty` flag.

Optional unstage of one staged asset:

```http
DELETE {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations/{scannerConfigurationId}/push/{externalId}
Authorization: Bearer <token>
```

Success is HTTP 200 (`PushWorkspaceUnstageResponse`).

A partial workspace still calls commit. A page cap, a dropped asset, or a failed
upload after another upload succeeded sends `complete: false` and does not ask.
A full success asks "Commit this scan? [y/N]". The default is no. `--commit` or
`PUSH_COMMIT=yes` is that yes when there is no prompt, and that yes sends
`complete: true`.

```http
POST {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations/{scannerConfigurationId}/commit
Authorization: Bearer <token>
Content-Type: application/json

{"workspaceRunId":"<id>","complete":true}
```

Both `workspaceRunId` and `complete` are required; there are no defaults.
Success is HTTP 202 (`PushCommitResponse`) with `scanRunId` equal to the
committed `workspaceRunId`.

A generated script that calls `POST /seal`, `POST /complete`, or
`POST /push-assets` is a generation failure. The upload path is `/push` only.
The JSON field `complete` is inventory completeness, not the path.

`PUSH_COMMIT=yes` / `--commit` is the yes for a full inventory. It does not
turn a partial inventory into `complete: true`.

| Discovery/upload state | Complete behavior |
|---|---|
| First list page failed before any upload/workspace | Do not complete |
| Later list page failed after uploads established a workspace | Automatically complete `false` |
| Page/inventory cap reached | Automatically complete `false` when at least one upload established a workspace |
| Detail/export failure omitted an asset | Automatically complete `false` when a workspace exists |
| Any upload failed after another upload succeeded | Automatically complete `false` |
| Empty successful list | Do not complete unless the customer explicitly enabled an approved empty-inventory policy |
| Full list and every upload succeeded | Complete `true` |

`complete: false` publishes the pushed assets and must not retire assets that
were absent. A partial run still exits 2. A full success does not call
`/commit` unless they answer yes or set `--commit` / `PUSH_COMMIT=yes`.

## Ownership boundary

The generated script owns provider authentication, discovery, mapping, local
artifact validation against `schemas/`, ZIP construction, optional
configuration create, upload, and commit request.

Agent Scanner owns ZIP validation, workspace/run persistence, reconciliation,
review, Exchange versioning, and Project API publication. Do not duplicate or
bypass those server-side stages.
