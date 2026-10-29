---
name: apply-native-policy-to-external-gateway
description: |
  Apply, edit, or list a native policy on an external gateway API instance
  (Kong / Apigee / Azure) through the MuleSoft Omni MCP tools, which route every
  external provider through the Anypoint API Manager Universal API. Use when the
  user wants to add IP allowlisting, rate limiting, message transformation, or
  any native policy to a non-MuleSoft gateway instance managed in Anypoint — or
  to inspect / reconfigure the policies already applied there.
---

## Overview

This workflow applies a native policy to an **external gateway** API instance
(Kong, Apigee, or Azure) using the Omni MCP policy tools. Unlike the MuleSoft
(Flex) gateway path, there are **no per-provider adapters**: every external
provider is routed through the Anypoint API Manager **Universal API**
(`/internal/universal/v1/...`), and APIM owns the provider-specific translation
server-side.

The tools are exposed by the Omni MCP server (Streamable HTTP transport at
`/mcp`) and shipped in W-23941112. The natural agent flow is:

**`prepare` → `form` → `apply`**, with **`list` / `edit`** operating on
policies that are already applied.

There is a helper CLI — `scripts/invoke_policy_mcp_tools.py` — that connects to
the MCP endpoint with a Bearer token and invokes each tool, so the whole flow is
exercisable without the chat UI.

## Prerequisites

- A valid **Anypoint Bearer token** for the target control plane (e.g. test1).
- API Manager permissions on the org: **View APIs Configuration** and
  **Manage Policies**.
- The external-provider routing gate **open for the org**. In a deployed env
  this is the LaunchDarkly flag `W_23173868_CANONICAL_POLICIES_ENABLED`
  (Kong) / the non-Kong equivalent. Locally it is forced on via
  `OMNI_CANONICAL_POLICIES_LOCAL_OVERRIDE=true` /
  `OMNI_NONKONG_POLICIES_VIA_APIM_LOCAL_OVERRIDE=true` (only take effect when no
  `LAUNCHDARKLY_SDK_KEY` is set).
- The target API instance already exists in API Manager (you need its
  **numeric / instance id** and its **provider** slug: `kong` / `apigee` /
  `azure`).
- **For local dev against the internal Universal API**: the backend must reach
  the in-mesh APIM service. Set `UNIVERSAL_POLICIES_URL=http://localhost:3100`
  (no `/apimanager` suffix) and run the port-forward tunnel (see the
  `dev-tunnel` skill). The path `/internal/universal/v1` is **not** exposed on
  the public edge.
- **Bearer → request-context**: the MCP server only turns your
  `Authorization: Bearer` header into a request-scoped identity when
  `MCP_AUTH_MIDDLEWARE_ENABLED=true`. With it off, MCP tool calls fail with
  *"Not logged in. Please call the 'login' tool first"* even though the token is
  valid — because the header never reaches `AnypointRequestContext`. Enable the
  flag (and restart the backend) for header-token clients, or call the `login`
  tool first.

## Step 1: Identify the target instance and provider

Determine the org id, the **numeric API instance id**, and the external
**provider** slug (`kong` / `apigee` / `azure`). These identify the gateway
instance the policy will be applied to.

The environment id is optional for the external path — omit it to let the
handler resolve it, or pass it to pin a specific environment.

## Step 2: Browse the applicable policy catalog — `prepare`

List the native policies that **can be applied** to this instance (the catalog,
minus the ones already applied). This is the "what can I add?" step.

**Tool:** `prepare_policy_creation`
**Args:** `organization_id`, `api_instance_id`, `provider`
(optional: `environment_id`, `policy_name_hint` to filter by name)

Returns one entry per applicable policy, each carrying the **Exchange
coordinates** you need downstream:

- `groupId` / `assetId` / `assetVersion` — hand these to `form` and `apply`.
- `capabilities.injectionPoints` (e.g. `["request","response"]`).
- `applicationLimit` (`MULTIPLE` = can be applied more than once).
- `category`, `description`, `isOOTB`, `alreadyApplied` (always `false` here —
  applied ones are filtered out).

CLI: `python scripts/invoke_policy_mcp_tools.py prepare --token "$TOKEN"
--org "$ORG" --instance "$INSTANCE" --provider apigee`

## Step 3: Read the editable schema — `form`

Fetch one policy template's **configuration schema** so you can build a valid
`configuration_data` payload with the correct, gateway-specific property names.

**Tool:** `get_policy_template_form`
**Args:** `organization_id`, `provider`, `group_id`, `asset_id`,
`asset_version` (from Step 2)
(optional: `api_instance_id`, `direction` — `inbound` / `outbound`)

Returns `template.configuration` — a JSON Schema (`properties`, `enum`,
`description`, `required`) describing the exact shape the provider expects
(e.g. Apigee's `AccessControl.IPRules.MatchRule[...]`). Build your config from
this — do **not** guess property names.

CLI: `python scripts/invoke_policy_mcp_tools.py form --token "$TOKEN"
--org "$ORG" --instance "$INSTANCE" --provider apigee
--group-id mulesoft --asset-id apigee-access-control --asset-version 1.0.0`

## Step 4: Apply the policy — `apply`

Apply the selected policy with the configuration built from Step 3.

**Tool:** `apply_policy_to_instance`
**Args:** `organization_id`, `api_instance_id`, `provider`,
`asset` (`{group_id, asset_id, asset_version}`), `configuration_data`
(optional: `environment_id`, `injection_point` — omit to let APIM default it
from the template)

Routes through the Universal API (`via: apim_universal`). Returns
`status: success` and the new policy. A successful apply is audited as a
`policy_write` event (`operation: create`).

CLI: `python scripts/invoke_policy_mcp_tools.py apply --token "$TOKEN"
--org "$ORG" --instance "$INSTANCE" --provider apigee
--group-id mulesoft --asset-id apigee-access-control --asset-version 1.0.0
--config '{"AccessControl":{...}}'`

### Worked example — `apigee-access-control` (IP allowlisting)

Configuration built from the Step 3 schema (allow only `9.9.9.9/32`, deny
everything else):

```json
{
  "AccessControl": {
    "@name": "access-control-demo",
    "IPRules": {
      "@noRuleMatchAction": "DENY",
      "MatchRule": [
        {
          "@action": "ALLOW",
          "SourceAddress": [
            { "@mask": 32, "__text": "9.9.9.9" }
          ]
        }
      ]
    }
  }
}
```

`apply_policy_to_instance` returns (HTTP 200) the new external-policy id:

```json
{
  "tool": "apply_policy_to_instance",
  "via": "apim_universal",
  "platform": "apigee",
  "status": "success",
  "httpStatus": 200,
  "organizationId": "<org>",
  "apiInstanceId": "<instance>",
  "request": {
    "groupId": "mulesoft",
    "assetId": "apigee-access-control",
    "assetVersion": "1.0.0"
  },
  "result": {
    "id": "v1~external-policy.<org>.<instance>.new-policy.apigee-access-control~<uuid>"
  }
}
```

## Step 5: Verify and reconfigure — `list` / `edit`

**List** the native policies currently applied to the instance to confirm the
apply landed and to get each policy's `policyId`.

**Tool:** `list_applied_policies_on_instance`
**Args:** `organization_id`, `api_instance_id`, `provider`

Returns each applied policy with `policyId`, `policyName`, `order`,
`injectionPoint`, its live `configurationData`, and the Exchange coordinates.

Continuing the `apigee-access-control` example, the applied policy now shows up
in the list with the config exactly as sent:

```json
{
  "assetId": "apigee-access-control",
  "assetVersion": "1.0.0",
  "category": "Access and Security",
  "injectionPoint": "request",
  "order": 7,
  "policyId": "<policyId>",
  "policyName": "access-control-demo",
  "disabled": false,
  "readOnly": true,
  "configurationData": {
    "AccessControl": {
      "@name": "access-control-demo",
      "IPRules": {
        "@noRuleMatchAction": "DENY",
        "MatchRule": [
          { "@action": "ALLOW", "SourceAddress": [ { "@mask": 32, "__text": "9.9.9.9" } ] }
        ]
      }
    }
  }
}
```

**Edit** an already-applied policy's configuration.

**Tool:** `edit_applied_policy`
**Args:** `organization_id`, `api_instance_id`, `provider`, `policy_id`
(from `list`), `asset` (`{group_id, asset_id, asset_version}`),
`configuration_data`

PATCHes the per-policy Universal API path. The immutable `injectionPoint` is
never sent on edit. Audited as a `policy_write` event (`operation: update`).

CLI: `python scripts/invoke_policy_mcp_tools.py edit --token "$TOKEN"
--org "$ORG" --instance "$INSTANCE" --provider apigee
--policy-id <policyId> --group-id mulesoft --asset-id apigee-access-control
--asset-version 1.0.0 --config '{"AccessControl":{...}}'`

### Worked example — reconfigure `apigee-access-control` (change the allowed IP)

Reusing the `policyId` from the `list` above, change the allowlisted address
from `9.9.9.9` to `8.8.8.8` while keeping `@name` unchanged:

```json
{
  "AccessControl": {
    "@name": "access-control-demo",
    "IPRules": {
      "@noRuleMatchAction": "DENY",
      "MatchRule": [
        { "@action": "ALLOW", "SourceAddress": [ { "@mask": 32, "__text": "8.8.8.8" } ] }
      ]
    }
  }
}
```

`edit_applied_policy` returns `status: success` / `via: apim_universal`, and a
follow-up `list` shows the policy with `__text: "8.8.8.8"`.

### Important: writes are asynchronous — `success` is not the final outcome

The Universal API accepts apply/edit with **HTTP 202 (Accepted)** and processes
the provider mutation in a **background workflow**. The tool returns
`status: "success"` on that 202 — it means *accepted*, not *applied*. Always
confirm the real result with a follow-up `list` read-back **or** the
`list_instance_policy_operations` tool (the Activity feed):

**Tool:** `list_instance_policy_operations`
**Args:** `organization_id`, `api_instance_id`, `provider` (optional: `limit`)

Returns the recent async operations (newest first), each carrying `type`
(`APPLY` / `UPDATE` / `TOGGLE` / `REMOVE` / `CANONICAL_APPLY`) and `status`
(`RUNNING` / `COMPLETED` / `FAILED`), plus `total` / `running` / `failed`
counts. A `COMPLETED` entry confirms the write landed; a `FAILED` entry is
**enriched with its `error`** (`{code, retryable, message}`) fetched from the
**org-scoped** per-operation detail (`GET .../organizations/{orgId}/operations/{id}`) —
so the failure reason is right there without a second call.

Two non-obvious facts about that per-operation detail read:

- The detail path is **org-scoped, not instance-scoped**:
  `GET /internal/universal/v1/organizations/{orgId}/operations/{id}`. The
  instance-scoped shape
  (`.../organizations/{orgId}/instances/{instanceId}/operations/{id}`) **404s** —
  only the list is instance-scoped; the detail is under the org.
- The `error.code` on a FAILED operation is one of: `BAD_REQUEST`, `CONFLICT`,
  `BAD_GATEWAY`, `SCANNER_ERROR`, `INSTANCE_NOT_FOUND`, `NO_TRANSLATION`,
  `UNEXPECTED_ERROR`. `retryable` tells you whether a re-apply is worth trying.

To keep one tool call bounded, `list_instance_policy_operations` caps `limit`
at **50** and enriches at most **10** FAILED operations with their detail; when
more failures are present it sets `failedDetailsTruncated` (the count skipped)
in the payload so you know to page or narrow the window.

CLI: `python scripts/invoke_policy_mcp_tools.py list-operations --token "$TOKEN"
--org "$ORG" --instance "$INSTANCE" --provider apigee`

**Apigee policies cannot be renamed.** Changing `AccessControl.@name` on an
existing Apigee policy makes the async `UPDATE` workflow **fail** (even though
the tool reported `success` on the 202) with:

```
BAD_REQUEST: "Apigee policies cannot be renamed (found '<new>', expected '<old>');
delete and re-create instead"
```

So `edit` is for **configuration values** (IP rules, actions, headers…), not for
the display name. To change the name, `apply` a new policy and remove the old
one. Keep `@name` identical to the applied value on every edit.

## Completion Checklist

- Target instance + provider identified (Step 1).
- Applicable policy chosen from `prepare` — with its Exchange coordinates.
- Configuration built from the `form` schema (correct property names).
- `apply` returned `status: success` / `via: apim_universal`.
- `list` shows the new policy with a `policyId` and the expected
  `configurationData`.
- (If reconfiguring) `edit` returned success and `list` reflects the change.

## Next Steps

1. Re-run `list_applied_policies_on_instance` to confirm final state.
2. Test enforcement with real API requests against the gateway.
3. Adjust configuration with `edit_applied_policy`.
4. Apply additional policies by repeating `prepare → form → apply`.

## Troubleshooting

- **"Not logged in. Please call the 'login' tool first"** — the Bearer header is
  not reaching the request context. Set `MCP_AUTH_MIDDLEWARE_ENABLED=true` and
  restart the backend, or call the `login` tool first. The token itself can be
  perfectly valid; this is a wiring flag, not an auth failure.
- **Structured error with `enabled: false`** — the external-provider gate is
  closed for the org. Open the LaunchDarkly flag (deployed) or set the local
  override env vars (local dev). There is **no** adapter fallback by design —
  one deterministic path.
- **`missing: api_instance_id` / `missing: group_id, asset_id and asset_version`**
  — the external branch requires the numeric instance id (for `prepare`/`list`)
  and the full Exchange coordinates (for `form`/`apply`/`edit`). Get the
  coordinates from `prepare`.
- **`Permission denied` / httpStatus 403** — the token lacks **Manage Policies**
  / **View APIs Configuration** on the org.
- **`httpStatus 422` on apply/edit** — the `configuration_data` doesn't match the
  provider schema. Re-read the `form` output and use its exact property names
  (e.g. Apigee `@`-prefixed attributes, nested `IPRules`/`MatchRule`).
- **Local: `RuntimeError` about a 3xx redirect / public APIM edge** —
  `UNIVERSAL_POLICIES_URL` is pointing at the public edge. Point it at the
  in-mesh tunnel host root (`http://localhost:3100`, no `/apimanager`) and run
  the port-forward (`dev-tunnel` skill).

## Related

- `dev-tunnel` — bring up the local stack + APIM internal Universal API tunnel.
- MuleSoft (Flex) gateway policy apply — uses per-provider adapters instead of
  the Universal API path.
- `scripts/invoke_policy_mcp_tools.py` — the reference MCP client for all six
  tools (`prepare` / `form` / `list` / `list-operations` / `apply` / `edit`).
