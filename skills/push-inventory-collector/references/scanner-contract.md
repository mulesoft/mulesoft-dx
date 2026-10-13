# Agent Scanner push contract

Use this contract unchanged for every generated provider adapter. Provider
discovery and field mapping are dynamic; these scanner semantics are not.

## Contents

- Configuration and asset type
- ZIP contract
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
  and inventory calls change.
- Do not ask for separate configuration ids by asset subtype.
- Do not add a Java scanner, provider credential model, or provider request to
  Agent Scanner for a customer-hosted adapter.

## ZIP contract

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

Artifact file by type:

| Type | Artifact | Validation |
|---|---|---|
| `agent` | `a2a-card.json`, `a2a-v1-card.json`, or `other-card.json` | Exchange agent-fabric `agent_card` / `agent_card_v1` / `other_card` (1.2609.1), then a callable HTTP URL via `url` or `supportedInterfaces` |
| `mcp` | `mcp-metadata.json` | Exchange `mcp_metadata` (transport required, no `serverInfo`). Generated scripts emit pull four-boolean capabilities |
| `rest-api` | `oas.json` | Require `openapi` or `swagger`; preserve the provider export unless an approved transformation is documented |

Reject a ZIP whose files are directly under `<externalId>/` without the
`specification/` directory. Require `config.json.type` to match the scanner
configuration asset type.

## Authentication directions

Provider credentials are used only by the generated script to read the customer
system. They never enter the ZIP or MuleSoft request. For AWS SigV4, select
`default-chain`, `profile`, or `access-keys` explicitly. Temporary `ASIA` keys
in access-keys mode require `AWS_SESSION_TOKEN` in the selected file or
parameters source. Do not prompt for that token. Strip wrapping quotes before
ASIA detection; see `generated-script-standard.md`.

MuleSoft authentication uses a Connected App client id and client secret scoped
for the customer's organization. Mint the bearer token with:

```http
POST {ANYPOINT_BASE}/accounts/api/v2/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=...&client_secret=...
```

Do not send that token request as JSON. Never log the secret or bearer token.

Token and scanner share the user-supplied Anypoint host:

```text
scannerBase = trimTrailingSlash(ANYPOINT_BASE) + "/agent-scanner"
```

Do not ask for a scanner URL. The host is whatever the customer provided.
Do not emit `--scanner-base`, `SCANNER_BASE`, `localhost`, or `127.0.0.1`.
`--anypoint-base` is not "token only": push and commit use the same host
plus `/agent-scanner`. A 404 on that path is a wrong org id, configuration id,
or environment — not permission to point the script at a laptop.

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
(empty-inventory `--allow-empty`):

```http
GET {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations/{scannerConfigurationId}/workspace
Authorization: Bearer <token>
```

Success is HTTP 200 (`PushWorkspaceStateResponse`) with `workspaceRunId`,
`generation` (always 0, deprecated), `stagedAssetCount`, `assetCap`,
`remainingCapacity`, `hitAssetCap`, `commitAcceptedNotStarted` (always false,
deprecated), and `scanRunId`. After uploads, use the `workspaceRunId` from the
202 instead of this call.

Optional unstage of one staged asset:

```http
DELETE {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations/{scannerConfigurationId}/push/{externalId}
Authorization: Bearer <token>
```

Success is HTTP 200 (`PushWorkspaceUnstageResponse`).

A partial workspace still calls this. A page cap, a dropped asset, or a failed
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
committed `workspaceRunId`. After uploads, use the `workspaceRunId` from the
202. For empty-inventory `--allow-empty`, `GET .../workspace` first.

A generated script that calls `POST /seal`, `POST /complete`, or
`POST /push-assets` is a generation failure. The upload path is `/push` only;
`/assets` is not an alias. The JSON field `complete` is inventory completeness,
not the path.

JSON field `complete` is inventory completeness, not the HTTP method name.
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
artifact validation, ZIP construction, upload, and commit request.

Agent Scanner owns ZIP validation, workspace/run persistence, reconciliation,
review, Exchange versioning, and Project API publication. Do not duplicate or
bypass those server-side stages.
