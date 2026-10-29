---
name: push-inventory-collector
description: Generate a customer-hosted collector that inventories agents, MCP servers, or REST APIs from the customer's documents and publishes each as a ZIP to Anypoint Exchange through the Agent Scanner push API. Use when they ask for a self-managed scanner, push collector, inventory script, or Exchange publish from an existing catalog. First ask whether they already have a configuration id or want the script to create one using the same Name, Description, and Service type as the UI. Support Connected App client-credentials and Anypoint username/password login. Caps: 1000 assets per run, 12 MB zip, 5 MB per file, one zip = one asset, org-wide default 20000.
---

# Push inventory collector

Generate a script that lists assets from the customer's system, writes one ZIP
per asset, and publishes through Agent Scanner. One configuration accepts one
type. The script is not a MuleSoft product command.

Read `references/scanner-contract.md`, `references/generated-script-standard.md`,
`references/provider-auth-resolution.md`, `references/failure-and-retry.md`, and
`references/multi-account.md` before mapping or generating.
`references/examples.md` is examples only. Copy `schemas/` next to the script.

## Caps

These are server limits. State them in the mapping and in `--help`. Do not
invent different numbers. Do not tell the customer the org-wide cap is 10000.

| Cap | Value |
|---|---|
| Assets staged per run | 1000 |
| ZIP file | 12 MB |
| One file inside a ZIP | 5 MB |
| One ZIP | one asset |
| Org-wide capacity | server default 20000 |

Also enforce: multipart request 13 MB, 500 ZIP entries, 20 MB uncompressed,
description truncated to 250 characters at Exchange. Page the provider list so
a run never stages more than 1000. A larger inventory is a partial workspace
(`complete: false`).

## What this produces

- A script in the programming language they named
- `inputs.env` with empty secrets
- Inspectable ZIPs plus a mapping table, then two files after they approve

One zip = one asset. Required ZIP files and Agent Fabric schema names are in
`references/scanner-contract.md`. Validate against `schemas/` before upload.

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

The chat never asks for secret values (client secret, password, tokens, keys).
The generated script collects those at runtime.

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

Do not combine these. Do not ask a later question before the earlier one is
answered. Do not skip a question because a pasted OpenAPI implies an answer.
Treat an answer already in this chat as answered.

### 1. Existing configuration or create

If they have not said they already have a configuration id, and have not said
to create one, ask exactly:

```text
Do you already have a self-managed scanner configuration id, or should this script create a new scanner and push to it?

Reply with the configuration id, or with create.
```

A UUID or the words `configuration id` plus an id means existing. `create`,
`new`, or `make one` means create. Then stop.

Do not tell them to create the scanner in the UI. The script creates it through
the backend API with the same fields as **Self-managed Scanner**.

### 2. Name (create only)

If they chose create and have not named the scanner, ask exactly:

```text
What name should the new scanner have? This is the Name field on the Self-managed Scanner page.
```

Required. Then stop.

### 3. Description (create only)

If they chose create and you have not asked for a description, ask exactly:

```text
Optional description for the new scanner. Reply skip if none. This is the Description field on the Self-managed Scanner page.
```

Then stop.

### 4. Service type

If they have not chosen `agent`, `mcp`, or `rest-api`, ask exactly:

```text
What service type should this scanner accept? Reply with one of: agent, mcp, or rest-api.

agent is one agent card. mcp is one MCP server card. rest-api is one API description. This is the Service type field on the Self-managed Scanner page. One script commits one of these, to one configuration.
```

Then stop. One script, one type, one configuration. Write that type into the
script as `ASSET_TYPE`. Do not add `--asset-type`.

Creating: Service type selects the target system (`pushagent` / `pushmcp` /
`pushapi`). Existing id: the type must match that configuration.

### 5. Inventory

Ask only for the selected type. Include `assets/sample-inputs.md`.

```text
Please share the API inventory for {selected type}: list operation, detail or handshake, pagination, and a response example. OpenAPI, a collection, or a redacted curl transcript are all fine.

If you already have a file of runtime inputs, attach it — or see assets/sample-inputs.md.
```

Need vs nice-to-have is in `references/scanner-contract.md`.

### 6. Provider authentication

Ask for the request and response, not values. Details in
`references/provider-auth-resolution.md`.

```text
Please share how this script should authenticate to that system: the token or login request, the response shape, and a redacted example. Do not paste secrets.
```

### 7. Several provider accounts

Ask only when their inventory or auth document names more than one account,
project, subscription, tenant, or org, or they say they want all accounts
scanned into the scanner they created. Exact question is in
`references/multi-account.md`. Then stop.

Default is one account. Do not create one scanner per account. Do not tell
them to turn on a pull-scanner cross-account feature flag. The script lists
each account and `/push`es to the **one** configuration.

### 8. Anypoint login

If they have not chosen an Anypoint login, ask exactly:

```text
How should this script log in to Anypoint? Reply with connected-app or username-password.

connected-app uses a Connected App client id and client secret (client_credentials). username-password uses an Anypoint username and password (POST /accounts/login). Do not paste secret values. Connected App is the unattended CI path. Username and password is the user-login path; it fails when the account requires MFA.
```

Then stop. One mode per generated script. Do not probe both. Do not fall back
after a 401. Both modes stay valid: an older Connected App `inputs.env` still
works; a username/password `inputs.env` works without a Connected App.

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
`Yes` writes two files. Do not write files in the mapping turn.

After `Yes`, write `{name}_collector.{ext}` and `{name}_collector.md`. Copy
`schemas/` next to the script. Re-read those files. Confirm the mapping,
Anypoint mode, create-or-existing path, and caps in `--help`. Run the language
checker in `references/generated-script-standard.md`. Then show Ways to run.

Do not ask `Does this look fine?` again. If they change mapping, inventory, or
authentication, show a new table and ask once more before regenerating.

## Guardrails

- Do not invent inventory operations, query parameters, or authentication.
- Do not generate from a MuleSoft-managed relationship. Ask for a customer-side
  token contract.
- Do not PUT/POST/DELETE on the customer's system except the documented
  handshake (`initialize`, `tools/list`, a documented card GET).
- Classify with that type's probe, not the display name.
- Page the list. 1000 assets per run is a cap, not a goal. One zip = one asset.
  Refuse a ZIP over 12 MB or a file over 5 MB.
- `complete: true` only after a full successful inventory. Partial →
  `complete: false` with no prompt.
- Create body is Name, optional Description, Service type → target system,
  `authScheme: customer-upload`, `state: STOPPED`, no `schedule`, no
  `authParameters`. Details in `references/scanner-contract.md`.
- Token host and scanner host are the same `ANYPOINT_BASE`. No
  `--scanner-base`, `SCANNER_BASE`, `localhost`, or `127.0.0.1`.
- Never log or print secrets, bearer tokens, or passwords.
- Do not add `--profile` unless their auth document names a profile.
- Do not describe AWS, a pull-scanner form, `@Field`, or a catalog of HTTP
  calls as requirements. Use only what they pasted, plus the scanner contract.
- Retry only the cases in `references/failure-and-retry.md`. Do not retry a
  400/415/422 ZIP. Do not seal an old `workspaceRunId` after a Temporal failure.
- Several provider accounts share one scanner. Details in
  `references/multi-account.md`.

## `inputs.env`

```dotenv
ANYPOINT_BASE=https://anypoint.mulesoft.com
ANYPOINT_ORG_ID=
ANYPOINT_AUTH_MODE=
# connected-app
ANYPOINT_CLIENT_ID=
ANYPOINT_CLIENT_SECRET=
# username-password
ANYPOINT_USERNAME=
ANYPOINT_PASSWORD=
SCANNER_CONFIGURATION_ID=
SCANNER_NAME=
SCANNER_DESCRIPTION=
PUSH_COMMIT=no
PUSH_ALLOW_EMPTY=
# Provider fields: only from their authentication document.
```

If they chose create, leave `SCANNER_CONFIGURATION_ID` empty and fill
`SCANNER_NAME` / `SCANNER_DESCRIPTION`. If they pasted an id, set
`SCANNER_CONFIGURATION_ID` and leave name/description blank.

`ANYPOINT_AUTH_MODE` is `connected-app` or `username-password`. Fill only that
mode's rows. Leave the other mode empty. `ANYPOINT_CLIENT_SECRET` and
`ANYPOINT_PASSWORD` stay empty in chat.

US production host is an example. EU/CA/JP/AU/control-plane hosts are the
value they supply. `--help` names both secret labels: **Connected App Client
Secret** and **Anypoint Password**.

## Runtime

Follow `references/generated-script-standard.md`. `--dry-run` stops after zips.
Live: selected Anypoint login → create configuration if the id is empty →
`POST /push` (retry transients) → optional `POST /commit`. Copy
`scripts/retry_policy.py` behavior. Several accounts: loop provider logins,
one configuration, one commit.
