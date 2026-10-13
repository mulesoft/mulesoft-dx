---
name: apply-universal-policy
description: |
  Protect a portfolio slice by applying one Universal (canonical) policy across
  API instances on any gateway (Kong, Apigee, Azure, AWS, MuleSoft). Use when
  the user says all / many / my APIs / a portfolio slice — JWT validation, rate
  limiting, spike arrest, IP filtering, or apply one config across providers.
  DO NOT TRIGGER for "what protection do I have" / listing or editing already-
  applied native policies — use skill apply-native-policy-to-instance. DO NOT
  TRIGGER for a single already-chosen instance that needs a provider-native
  plugin — same skill. Do not use to remove, detach, enable, or disable a
  policy (those tools do not exist).
license: Apache-2.0
compatibility: Requires the MuleSoft Platform MCP Server (urn:mcp:mulesoft-platform) with list_universal_policies, apply_universal_policy, get_policy_operation_status, and find_assets (include_applied_policies). If those tools are missing, stop.
metadata:
  author: mulesoft-omni
  version: "1.3.0"
---

# Apply Universal Policy

Protect APIs across gateways with one Universal policy: discover what is
missing, collect configuration once, apply in one call, and wait until the
work has actually finished.

## When to Use This Skill

**Use this skill when the user asks to:**

- "Ensure all my finance-tagged APIs have JWT validation"
- Apply one canonical policy (JWT, rate limiting, spike arrest, IP allow/deny)
  across many instances or many providers

**Trigger keywords:** all my APIs · portfolio · missing this policy · universal
policy · canonical policy · JWT validation · rate limiting · spike arrest.

**Do NOT use this skill when:**

- They ask **what protection they already have**, or want to **change** an
  already-applied native policy ("improve IP filtering to include 1.1.1.1")
  → **skill apply-native-policy-to-instance** (Audit / Edit)
- The user already has **one** instance in context and wants a **native**
  plugin on it (Kong / Apigee / Azure / one MuleSoft instance) →
  **skill apply-native-policy-to-instance**
- They are driving **Anypoint REST** rather than MCP →
  **skill apply-policy-to-api-instance**
- They need to **create** an instance or deploy a gateway first → **skill secure-api**
- They want to **remove**, detach, or pause (enable/disable) a policy — say so
  and stop; those actions are not on the tool surface

## Prerequisites

You must be connected to the MuleSoft Platform MCP Server
(`urn:mcp:mulesoft-platform`). Probe with a read-only call:

1. Call `list_universal_policies`. If the tool is **not in the catalog**, STOP
   and say the Platform MCP catalog on this host does not include the Universal
   policy tools yet. Do not substitute Anypoint REST calls.
2. If the tool returns the catalog is unavailable (`status=not_configured` or
   an empty `policies` list with that message), say so and stop — do not invent
   a fallback apply path.
3. On a 403 / entitlement / gate-closed error, say they are not entitled and
   **stop**. Never silently switch provider or org.

## Reference files

- **`references/presentation-format.md`** — pinned tables. Read it when you
  are about to render a user-facing list, schema, mapping, or result.
- **`references/payloads.md`** — how to join `find_assets` rows and branch on
  apply `status`. Read it before the first apply.

## Workflow

### Pick the path first

This skill is **Protect only**. If the latest turn is "what's applied" or
"change this native policy", switch to **skill apply-native-policy-to-instance**
— do not run Steps 1–4.

### Rules that always apply

1. **Confirm before acting.** Report found/missing and wait for an explicit
   yes before `apply_universal_policy`. A missing confirmation writes
   policies the user did not approve.
2. **Instances, not APIs.** Users say "APIs"; policies attach to **deployed
   instances**. Gate apply on `policyCoverage` + `instancesMissingPolicy`,
   never on `hasPolicy` alone (`hasPolicy` is any-instance and would skip
   unprotected siblings).
3. **Join before you talk.** `instancesMissingPolicy` is `{instanceId,
   environment}` only. Build display rows and `instance_ids` using
   `references/payloads.md` — do not invent names or providers.
4. **Apply: one config, one shot.** Show the schema table (full surface, or
   required-only when it is too long — see `references/presentation-format.md`),
   then collect the **entire** configuration for the fields you showed in one
   reply. Reuse it across every targeted instance. Never walk field by field.
5. **Wait for completion.** Acceptance (`accepted` / HTTP 202) is not
   success. Poll until `COMPLETED` or `FAILED`. Distinguish retryable vs
   terminal from `error.retryable`.
6. **Plain names.** Mappings use human-readable native policy names from
   `providerMapping`, not IDs.

### Step 1: Discover the slice and what's missing (Protect)

Call `find_assets` with:

- `query` — search terms from the request (names, "finance", "payments").
  Include tag-like words when the user said "tagged", but do not claim a
  tag filter the backend did not apply — if hits look unrelated, say you
  searched by those terms.
- `asset_type` — `api` when they mean APIs (expands to the API Exchange types)
- `user_query` — the verbatim user message
- `include_applied_policies` — `true`
- `policy_name_filter` — the protection they named ("JWT validation",
  "rate-limiting"; matching is case- and separator-insensitive)
- `max_results` — raise it when they asked for "all" / a large slice
  (default is 20)

If `userOrgAssets` is empty, say you found no matching API instances and
stop. Do not search the public catalog for apply targets.

Present the **API-instance list** (`references/presentation-format.md`)
using the join in `references/payloads.md`. Summarize **per instance**:
"N instances found, M missing this policy, K unknown."

Coverage rules:

| `policyCoverage` | Meaning | Apply to |
| --- | --- | --- |
| `all` | Every readable instance has it | skip (already protected) |
| `partial` / `none` | Some or none have it | exactly the joined `instancesMissingPolicy` |
| `unknown` | Incomplete read (error or cap) | re-check with `view_api_instance_policies`. Never count as missing. |

If `appliedPolicyEnrichment.assetCapApplied` is true, fan out
`view_api_instance_policies` for the remaining instances rather than
treating the truncated set as complete.

**[GATE] Wait for the user to confirm they want you to fix the gap.**

### Step 2: Choose the Universal policy and show its schema (Protect)

Call `list_universal_policies` with `policy_name_hint` from the user's
protection. If more than one template matches, list their `label`s and ask
which to use — do not pick silently.

Each entry has `configurationSchema`, `supportedProviders`, and
`providerMapping` (what it becomes on Kong / Apigee / …).

Drop any target instance whose provider is not in `supportedProviders`. If
that leaves none, say so and stop. Keep the surviving list — that is the
apply set for Steps 3–4, **not** the raw Step 1 missing list.

Present the **policy configuration schema** table
(`references/presentation-format.md`). If the flattened schema is too long
to scan, show required fields only, say how many optionals are hidden, and
offer to expand. Then ask the user to fill the **visible** fields in one
reply. Do not invent optional values; omitted hidden fields keep schema
defaults.

### Step 3: Preview the native mapping, then apply (Protect)

Build the **policy → API + instance mapping** by joining each **remaining**
instance's provider to `providerMapping`. Show it. **[GATE] Wait for okay.**

Call `apply_universal_policy` once with:

- `policy_name` — the canonical kebab-case template `name`
- `instance_ids` — remaining missing instances from Step 2 (after the
  provider drop), not the raw Step 1 list
- `configuration` — the collected config, reused as-is

Do **not** loop `apply_policy_to_instance` for a Universal/canonical template.
That tool is one native plugin on one instance — **skill apply-native-policy-to-instance**.

### Step 4: Wait until it is actually done (Protect)

Branch on the apply `status` (`references/payloads.md`):

- `accepted` — poll `get_policy_operation_status` with `operationId` until
  `COMPLETED` or `FAILED` (not `RUNNING`). A few seconds between polls;
  give up after ~20 attempts and report **Still running**.
- `ok` — synchronous success. Report immediately. Do not poll.
- `partial` — some targets failed. Report **Partially succeeded** from
  `results`. Do not poll.

Then the same **policy → API + instance mapping** as the preview (now as
the result). On `FAILED`, say whether `error.retryable` is true.

## Best Practices

- **Route first.** ✅ "what's applied" / "change IP filtering" goes to
  skill apply-native-policy-to-instance. ❌ running Step 1's
  `policy_name_filter` + apply GATE on an audit turn.
- **One apply call for Universal.** ✅ `apply_universal_policy` with the
  Step-2 remaining ids. ❌ looping native apply; ❌ sending the pre-drop
  Step 1 list.
- **Don't invent display fields.** ✅ join `instanceId` as in
  `references/payloads.md`. ❌ filling provider/name from memory.

## Troubleshooting

**Universal policy tools are missing from the catalog:** say so and stop.
Do not substitute Anypoint REST calls.

**`policyCoverage` is `unknown`, or the table shows `?`:** re-read those
instances with `view_api_instance_policies`. Do not apply as if they were
missing.

**403 / not entitled / gate closed:** the org cannot manage that provider's
policies. Say so plainly and stop.

**Apply returned `ok` or `partial` and you started polling:** those statuses
are already terminal. Report from `results`; only `accepted` has an
`operationId` to poll.

**User asks to undo / remove / disable the policy:** not supported. There is
no detach tool and no enable/disable parameter on the agent surface. Explain
and stop.

## Related Skills

- **skill apply-native-policy-to-instance**: list what's applied, edit an
  already-applied native policy, or apply one native plugin/template to one
  instance (Kong / Apigee / Azure / MuleSoft) via MCP.
- **skill apply-policy-to-api-instance**: same single-instance job over
  Anypoint REST (`urn:api:*`), not MCP.
- **skill secure-api**: create/deploy an instance and then apply a policy —
  use that when the API is not yet an instance.
- **skill secure-mcp-server**: protect an MCP server, not an API instance.
