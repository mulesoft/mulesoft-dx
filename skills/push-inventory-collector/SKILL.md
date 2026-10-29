---
name: push-inventory-collector
description: Generate a customer-hosted collector that inventories agents, MCP servers, or REST APIs from the customer's documents and publishes each as a ZIP to Anypoint Exchange through the Agent Scanner push API. Use when they ask for a self-managed scanner, push collector, inventory script, or Exchange publish from an existing catalog. First ask whether they already have a configuration id or want the script to create one using the same Name, Description, and Service type as the UI. Support Connected App client-credentials and Anypoint username/password login. Caps: 1000 assets per run, 12 MB zip, 5 MB per file, one zip = one asset, org-wide default 20000.
---

# Push inventory collector

This file is the whole skill. Customers receive only this `SKILL.md`. Do not
read other files, copy `schemas/`, or call `scripts/` — those do not ship.

Generate a script that lists assets from the customer's system, writes one ZIP
per asset, and publishes through Agent Scanner. One configuration accepts one
type. The script is not a MuleSoft product command.

## Caps

State these in the mapping and in `--help`. Do not invent different numbers.
Do not tell the customer the org-wide cap is 10000.

| Cap | Value |
|---|---|
| Assets staged per run | 1000 |
| ZIP file | 12 MB |
| One file inside a ZIP | 5 MB |
| One ZIP | one asset |
| Org-wide capacity | server default 20000 |

Also: multipart request 13 MB, 500 ZIP entries, 20 MB uncompressed, description
truncated to 250 characters at Exchange. Page so a run never stages more than
1000. Larger inventory → `complete: false`.

## What this produces

- A script in the programming language they named
- `inputs.env` with empty secrets
- Inspectable ZIPs plus a mapping table, then two files after they approve

The script logs in to Anypoint with one selected mode: Connected App
client-credentials, or username/password (`POST /accounts/login`). It creates
the self-managed scanner when they asked it to, using the same fields as the
UI (Name, Description, Service type). It never requires the UI to create the
scanner first.

## Required to run

- Anypoint organization id. Never invent it. Never call `GET /accounts/api/me`.
- One Anypoint login, selected in chat:
  - Connected App: client-credentials grant and `manage:exchange` on that org
  - Username/password: an Anypoint user that can manage Exchange in that org.
    Fails when the account requires MFA. Connected App is the unattended CI path.
- Either an existing self-managed configuration id, or Name + Service type so
  the script can create one. Description is optional, same as the UI.
- Feature `push-scanner-enabled` on for that org

The chat never asks for secret values. The generated script collects those at
runtime.

## One-question protocol

Ask the first unanswered question. Then stop.

The only customer questions, in this order:

1. Existing configuration id vs create
2. Name, only when creating
3. Description, only when creating (optional; still one turn)
4. Service type (`agent`, `mcp`, or `rest-api`)
5. Inventory documentation for that type
6. Provider authentication documentation
7. Several provider accounts, only when their docs name more than one
8. Anypoint login mode
9. Programming language
10. Mapping approval (`Does this look fine?`)

Do not combine these. Do not skip a question because a pasted OpenAPI implies
an answer. Treat an answer already in this chat as answered.

### 1. Existing configuration or create

```text
Do you already have a self-managed scanner configuration id, or should this script create a new scanner and push to it?

Reply with the configuration id, or with create.
```

A UUID or the words `configuration id` plus an id means existing. `create`,
`new`, or `make one` means create. Then stop.

Do not tell them to create the scanner in the UI. The script creates it through
the backend API with the same fields as **Self-managed Scanner**.

### 2. Name (create only)

```text
What name should the new scanner have? This is the Name field on the Self-managed Scanner page.
```

Required. Then stop.

### 3. Description (create only)

```text
Optional description for the new scanner. Reply skip if none. This is the Description field on the Self-managed Scanner page.
```

Then stop.

### 4. Service type

```text
What service type should this scanner accept? Reply with one of: agent, mcp, or rest-api.

agent is one agent card. mcp is one MCP server card. rest-api is one API description. This is the Service type field on the Self-managed Scanner page. One script commits one of these, to one configuration.
```

Then stop. Write that type into the script as `ASSET_TYPE`. Do not add
`--asset-type`.

### 5. Inventory

Ask only for the selected type.

```text
Please share the API inventory for {selected type}: list operation, detail or handshake, pagination, and a response example. OpenAPI, a collection, or a redacted curl transcript are all fine.

If you already have a file of runtime inputs, attach it.
```

### 6. Provider authentication

```text
Please share how this script should authenticate to that system: the token or login request, the response shape, and a redacted example. Do not paste secrets.
```

Field names come from that document. Do not copy pull-scanner `@Field` names.
Do not assume `gcloud`, `az`, or `aws` is already logged in. Do not add
`--profile` unless their document names a profile.

### 7. Several provider accounts

Ask only when their inventory or auth document names more than one account,
project, subscription, tenant, or org, or they want all accounts scanned into
the scanner they created. Default is one account.

```text
These assets look split across more than one provider account. Should this script inventory all of them and push to the one scanner you created?

Reply with one-account, or with all-accounts and how this script authenticates to each (one credential that can assume into the others, or a list of credential sets). Do not paste secrets.
```

Then stop. Do not create one scanner per account. Do not tell them to turn on
a pull-scanner cross-account feature flag (`aws-cross-account-scanning-enabled`,
`copilot-cross-account-scanning-enabled`,
`azure-ai-foundry-cross-account-scanning-enabled`). Loop each account, `/push`
to the **one** configuration, one `/commit`. Caps apply to the whole run. If
two accounts can emit the same provider id, prefix the ZIP directory with a
stable account discriminator (≤ 255 characters). One account fails → continue
the others, then `complete: false`. Do not invent hub-and-spoke unless **that
document** describes it.

### 8. Anypoint login

```text
How should this script log in to Anypoint? Reply with connected-app or username-password.

connected-app uses a Connected App client id and client secret (client_credentials). username-password uses an Anypoint username and password (POST /accounts/login). Do not paste secret values. Connected App is the unattended CI path. Username and password is the user-login path; it fails when the account requires MFA.
```

Then stop. One mode per generated script. Do not probe both. Do not fall back
after a 401.

### 9. Programming language

```text
Which programming language, runtime or version, file format, and existing project conventions (if any) should this use? Examples: Python, Java, Node.js, or any language your repo already builds.
```

Do not default. Do not generate until they name one.

### 10. Mapping, then generate

Show in chat, in this order:

1. Inventory-to-zip mapping table (every required field → response path or
   labeled constant)
2. Field-level provenance
3. Representative JSON
4. ZIP upload path (`{ANYPOINT_BASE}/agent-scanner`, not a second host)
5. Caps: 1000 assets per run, 12 MB zip, 5 MB per file, one zip = one asset,
   org-wide default 20000 (not 10000)
6. Anypoint login mode and whether the script will create the scanner
   (Name, Description, Service type) or use the existing id
7. Retry and expiry: 429/502/503/504 retried up to 3 times; Anypoint 401 after
   a good token remints once in the same mode; `/commit` 409 reads `/workspace`
   once; never `complete: true` after a partial
8. Multi-account: one configuration; N provider logins from their document;
   unique ZIP ids across accounts; one account fail → `complete: false`
9. Script architecture and flags
10. `Does this look fine?`

Ask `Does this look fine?` once, only in this turn, before any file exists.
`Yes` writes `{name}_collector.{ext}` and `{name}_collector.md`. Do not write
files in the mapping turn. Re-read those files. Confirm mapping, Anypoint
mode, create-or-existing, caps in `--help`, and that the file parses in the
language they named (`python3 -m py_compile`, `node --check`, `bash -n`, or
that project's compile). Then show Ways to run.

## Anypoint token

Token host and scanner host are the same `ANYPOINT_BASE`. No `--scanner-base`,
`SCANNER_BASE`, `localhost`, or `127.0.0.1`.

**connected-app** — form-urlencoded, never JSON:

```http
POST {ANYPOINT_BASE}/accounts/api/v2/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=...&client_secret=...
```

**username-password** — JSON, never form, never `grant_type=password`:

```http
POST {ANYPOINT_BASE}/accounts/login
Content-Type: application/json

{"username":"...","password":"..."}
```

Response `access_token` is the bearer. Infer mode when `ANYPOINT_AUTH_MODE` is
empty: client id+secret present and username empty → `connected-app`;
username+password present and client id empty → `username-password`. Mixed or
neither is FAILED before any HTTP.

## Create configuration

When `SCANNER_CONFIGURATION_ID` / `--config` is empty:

```http
GET {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/connectivity/target-systems
```

Pick `type` case-insensitively, ignore underscores: `agent` → `pushagent` /
`PUSH_AGENT`; `mcp` → `pushmcp` / `PUSH_MCP`; `rest-api` → `pushapi` /
`PUSH_API`. Then:

```http
POST {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations
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

`runPolicy` is the JSON string `"{}"`. Omit `schedule`. Omit `authParameters`.
Omit `description` when empty. Success is HTTP 200 with `id`. When the id is
already set, do not create another.

## ZIP (one zip = one asset)

Top-level directory = stable provider external id, at most 255 characters.

```text
<externalId>/specification/config.json
<externalId>/specification/<artifact>
```

`config.json`: `name`, `type` (`agent`|`mcp`|`rest-api`), optional
`description` (truncate to 250 at Exchange). `type` must match `ASSET_TYPE`.

| Type | ZIP artifact | Required keys |
|---|---|---|
| `agent` | `a2a-card.json` | `name`, `description`, `protocolVersion`, `url`, `version`, `capabilities`, `defaultInputModes` (≥1), `defaultOutputModes` (≥1), `skills`. Skill objects need `id`, `name`, `description`, `tags` |
| `agent` | `a2a-v1-card.json` | `supportedInterfaces` or `supported_interfaces` with a callable `url`; no top-level `url` |
| `agent` | `other-card.json` | whatever that card requires; not A2A |
| `mcp` | `mcp-metadata.json` | `transport`; if `capabilities`, all four booleans `tools`, `resources`, `prompts`, `logging`; omit `serverInfo` |
| `rest-api` | `oas.json` | `openapi` or `swagger`; keep the provider export |

Refuse a ZIP over 12 MB or a file over 5 MB. Validate required keys in the
script before upload. Do not fetch or copy schema files — they are not part of
this skill. The server validates again.

## Push and commit

```http
POST {ANYPOINT_BASE}/agent-scanner/api/v1/organizations/{organizationId}/scanner-configurations/{scannerConfigurationId}/push
Content-Type: multipart/form-data
file=<zip bytes>
```

Success is HTTP 202 with `assetId`, `action` (`created` or `replaced`),
`workspaceRunId`. Same ZIP directory name replaces the staged object. Part name
is `file`. Boundary must not start with `=`. Do not JSON the ZIP.

```http
POST .../commit
{"workspaceRunId":"<id>","complete":true}
```

Both fields required. Success HTTP 202. Do not call `/seal`, `/complete`, or
`/push-assets`.

| Discovery/upload | `/commit` |
|---|---|
| First list failed, nothing staged | Do not commit |
| Anything staged, then a later page/account/detail/`/push` failed | `complete: false`, no prompt, exit 2 |
| Page cap 1000 | `complete: false` if anything staged |
| Full list and every `/push` succeeded | Ask `Commit this scan? [y/N]` (default no). `--commit` / `PUSH_COMMIT=yes` is that yes → `complete: true` |

`PUSH_COMMIT=yes` does not turn a partial into `complete: true`.
`complete: false` publishes what was pushed and must not retire absent assets.

## Retry and expired credentials

| Event | Script | Do not |
|---|---|---|
| 429 / 502 / 503 / 504 on `/push` or `/commit` | Retry the **same** request up to 3 times (`Retry-After` or 1s/2s/4s) | Change ZIP bytes or Anypoint mode |
| Connection refused | Retry once, then FAILED | Point at `localhost` |
| Anypoint 401 after a good token | Remint **once** with the **same** `ANYPOINT_AUTH_MODE`, retry that call | Probe the other mode |
| Anypoint 401 on the first token | FAILED | Retry |
| Provider 401 after identity succeeded | Remint once if their auth doc has refresh; else fail that account | Fall back to a CLI session |
| `/push` 400 / 415 / 422 | FAILED | Retry the same bytes |
| `/push` 404 | FAILED | Retry |
| `/push` 422 asset cap 1000 | Stop uploads; `complete: false` if staged | Retry that ZIP |
| `/commit` 409 | `GET .../workspace` once; commit the current id. Already started → success | Create another scanner |
| Temporal/Exchange fails after `/commit` 202 | Re-run the collector on the **same** config after RUNNING ends | Reseal the old `workspaceRunId` |

## `inputs.env`

```dotenv
ANYPOINT_BASE=https://anypoint.mulesoft.com
ANYPOINT_ORG_ID=
ANYPOINT_AUTH_MODE=
ANYPOINT_CLIENT_ID=
ANYPOINT_CLIENT_SECRET=
ANYPOINT_USERNAME=
ANYPOINT_PASSWORD=
SCANNER_CONFIGURATION_ID=
SCANNER_NAME=
SCANNER_DESCRIPTION=
PUSH_COMMIT=no
PUSH_ALLOW_EMPTY=
```

Create: leave `SCANNER_CONFIGURATION_ID` empty, fill `SCANNER_NAME` /
`SCANNER_DESCRIPTION`. Existing id: set the id, leave name/description blank.
Fill only the selected Anypoint mode's rows.

Flags: `--dry-run`, `--input-file`, `--anypoint-base`, `--org`, `--config`,
`--scanner-name`, `--scanner-description`, `--auth-mode`, `--client-id`,
`--username`, `--commit`, `--verbose`, `--help`. No `--asset-type`. No
`--client-secret`. No `--password`. No `--scanner-base`. No `--allow-empty`.

`--help` three columns (Prompt label, Parameter flag, Input file key) and must
name **Connected App Client Secret** / `ANYPOINT_CLIENT_SECRET` and **Anypoint
Password** / `ANYPOINT_PASSWORD`. A help page that lists `--username` but not
**Anypoint Password** is a generation failure. Caps in `--help`: 1000 assets
per run, 12 MB zip, 5 MB per file, one zip = one asset, org-wide default 20000.

Multipart: `files={"file": (f"{id}.zip", zip_bytes, "application/zip")}` and do
not set `Content-Type`. `curl -F "file=@{id}.zip;type=application/zip"`.

## FAILED block

```
FAILED step=<name> http=<code>
where: <call>
request: <method and path, no secrets>
response fields: <names only>
why: <one sentence>
body: <response snippet with secrets removed>
next: <what to fix>
```

| http | next |
|---|---|
| 0 | Retry once. Confirm `ANYPOINT_BASE`. |
| 401 / 403 first token | Do not retry. Reset Connected App secret, or confirm username/password and no MFA. |
| 401 after a good token | Remint once, same mode. Still 401 → FAILED. |
| 404 | Wrong org, config, or host. Do not retry. |
| 400 / 415 / 422 | Do not retry the same bytes. Check `specification/`. |
| 409 | `GET .../workspace` once. |
| 429 / 502 / 503 / 504 | Retry up to 3 times, then FAILED; `complete: false` if staged. |

## Ways to run

Connected App:

```
export ANYPOINT_CLIENT_SECRET="..."
<run> <script> --anypoint-base https://anypoint.mulesoft.com --org YOUR_ORG_ID --auth-mode connected-app --config YOUR_CONFIGURATION_ID --client-id YOUR_CLIENT_ID --commit
```

Username/password (omit `--config`, pass `--scanner-name` to create):

```
export ANYPOINT_PASSWORD="..."
<run> <script> --anypoint-base https://anypoint.mulesoft.com --org YOUR_ORG_ID --auth-mode username-password --scanner-name "Production Account - Marketing" --username YOUR_USERNAME --commit
```

`--dry-run` stops after zips and does not need Anypoint rows.

## Guardrails

- Do not invent inventory operations or authentication.
- Do not generate from a MuleSoft-managed relationship.
- Do not PUT/POST/DELETE on the customer's system except the documented
  handshake (`initialize`, `tools/list`, a documented card GET).
- Classify with that type's probe, not the display name.
- Never log secrets, bearer tokens, or passwords.
- Do not describe AWS, a pull-scanner form, `@Field`, or a catalog of HTTP
  calls as requirements.
- Provider credentials never go to MuleSoft. MuleSoft credentials never go to
  the provider.
