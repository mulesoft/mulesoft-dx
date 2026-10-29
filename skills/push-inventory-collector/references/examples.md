# Examples only

These rows illustrate how a generated script looks for one customer paste.
They are not defaults, not a menu, and not a catalog to copy. If the customer
did not paste that specification, do not use the row.

## Inventory formats (shape, not required)

OpenAPI, Swagger, a Postman or Insomnia collection, RAML, API Blueprint, a
GraphQL schema, an SDK reference, or a redacted request and response can all
be a usable inventory. Ask for whichever they have. Do not require OpenAPI.

## Programming languages (named as examples)

Python, Java, Node.js, Bash, Go, and PowerShell are examples of languages a
customer might name. The list is not closed. Do not default to Python.

## Example: AWS AgentCore agents and MCP in one list

Use this row only when they pasted AgentCore `list_agent_runtimes` (or the
equivalent) plus the fetch or handshake that type needs.

A shared list is not shared publish. Classify with the probe in that inventory,
never by name.

- Agent: skip runtimes whose documented protocol is MCP, then fetch the agent
  card. If the card is A2A v0.3, write `a2a-card.json`. If it is v1 with
  `supportedInterfaces` and no top-level `url`, write `a2a-v1-card.json`.
- MCP: skip non-MCP runtimes, then JSON-RPC `initialize` and `tools/list` at
  the invoke URL from that inventory. Null `initialize` result = skip (count
  only unless `--verbose`). HTTP 401/403 on initialize is FAILED. HTTP
  400/404/405/415/422 or a missing `result` object is skip.

Do not invent a handshake URL. Do not POST a path the spec does not document.

If that same paste uses AWS access keys, implement the fields in the paste
(access key, secret, optional session token, region). Strip wrapping quotes
before an `ASIA` check if the paste uses temporary keys. A named profile is
allowed only when the paste names a profile. Do not add `--profile` for some
other provider because this example used it.

If they asked for Bash and the paste uses region/profile expansions, assign
those values sequentially. Nested `${CLI_REGION:-${AWS_REGION:-x}}}}` is a
generation failure.

## Example: REST export per stage

Use this row only when they pasted a REST list plus an OpenAPI export. One
stage (or equivalent deployment) is one asset. External id is the provider's
stable id, not the display name. Write `oas.json` and validate against
`schemas/openapi.schema.json`.

## Example: Vertex agent card overlay

Use this row only when they pasted Vertex `reasoningEngines`. Zip directory is
whatever stable id that inventory documents. If the paste includes an A2A card
in `spec.classMethods`, use it when it validates against `schemas/agent_card.json`
or `schemas/agent_card_v1.json`. Do not invent a concatenation rule that the
paste does not state.

## Example: Cloud Run MCP handshake

Use this row only when they pasted Cloud Run services plus JSON-RPC
`initialize` / `tools/list` to the service URI. Null `initialize` = skip.
Write `mcp-metadata.json` with `transport` and, if capabilities are present,
all four booleans. Validate against `schemas/mcp_metadata.json`. This is not
the Vertex MCP enum.

## Example: creating the configuration at runtime

Customer has an org id and either a Connected App or an Anypoint
username/password, but no configuration id yet. The skill already asked Name,
optional Description, and Service type (same as the UI). `inputs.env` leaves
`SCANNER_CONFIGURATION_ID` empty and sets `SCANNER_NAME` /
`SCANNER_DESCRIPTION`. After the selected Anypoint login the script lists
target systems, picks `pushagent` / `pushmcp` / `pushapi` for the baked type,
POSTs `customer-upload` with no schedule, and uses the returned `id` for
`/push`. If they later paste an existing configuration id, the script uses
that id and does not create another.

Username/password here is `POST /accounts/login` JSON. It is not an excuse to
skip Connected App for CI. If they already have client id and secret, keep
`connected-app`.

## Example: several provider accounts, one scanner

Use this row only when they said the assets live in more than one provider
account, project, subscription, tenant, or org, and they want all of them in
the scanner they created.

One configuration id. Loop each account with the auth shape **in their
document**. Prefix ZIP directory names when provider ids collide. Caps are
for the whole run. One account 401 after remint → skip that account, continue
the others, `/commit` `complete: false`. Do not create N scanners. Do not
tell them to enable a pull-scanner cross-account flag.

## Example: `/push` 503 then success

Retry the same ZIP up to 3 times (1s/2s/4s or `Retry-After`). Do not rebuild
the ZIP. Do not switch Anypoint mode. A mid-run Anypoint 401 remints once in
the same mode and retries the same `/push`. `/commit` 409 → `GET /workspace`
once. After `/commit` 202, a later Temporal failure is not retried with the
old `workspaceRunId`.
