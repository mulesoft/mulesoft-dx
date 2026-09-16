# Tool payloads — apply-universal-policy

Read this when building tables or choosing `instance_ids`. Field names
below are the structured tool output, not the chat rendering.

## `find_assets` join (Protect)

`include_applied_policies=true` annotates each **userOrgAssets** row. Public
catalog hits have no applied-policy state — ignore them for this skill.

Per user-org asset you get:

- API display name from the row (`name` / title).
- `appliedPolicies.instances[]` — `{instanceId, environment, policyNames}`
  for the **sampled** instances.
- When `policy_name_filter` was set: `policyCoverage`, `hasPolicy`, and
  `instancesMissingPolicy[]` — `{instanceId, environment}` only.

`instancesMissingPolicy` does **not** carry instance name or provider.
Build each table row by:

1. Taking the API name from the parent asset.
2. Joining `instanceId` to `appliedPolicies.instances` for `environment`.
3. Taking provider from the asset/version if present. If it is missing,
   call `view_api_instance_policies` for that `instanceId` before applying.
   Do not invent a provider.
4. Using `environment` as the instance-name fallback when the payload has
   no separate instance name.

Apply targets = the joined `instancesMissingPolicy` rows whose
`policyCoverage` is `partial` or `none`. Skip `all`. Re-check `unknown`.

`appliedPolicyEnrichment.assetCapApplied` (or `assetsDropped` > 0) means
the list is truncated. Fan out `view_api_instance_policies` for remaining
user-org assets rather than treating the truncated set as complete.

## Provider filter on Protect

If they scoped Protect to a provider ("JWT on my Apigee APIs"), put the
provider word in `query` (keep `user_query` verbatim), then **filter
client-side**: keep instances whose provider matches (`apigee`, `kong`,
`azure`, `aws`, `mulesoft` / `anypoint`). Audit and edit of already-applied
native policies are **skill apply-native-policy-to-instance**, not this file.

## `apply_universal_policy` responses

Branch on `status` — do not assume async:

| `status` | Meaning | Next |
| --- | --- | --- |
| `accepted` | HTTP 202. Work is in flight. `operationId` is set. | Poll `get_policy_operation_status` |
| `ok` | Synchronous success. `appliedCount` / `results` are final. | Report **Succeeded** + mapping. Do not poll. |
| `partial` | HTTP 207. Some targets failed. | Report **Partially succeeded**; name failures from `results`. Do not poll. |

Poll only the `accepted` branch. Same `operationId` covers the whole fan-out
(not one id per instance). Poll every few seconds; stop at `COMPLETED` or
`FAILED`, or after ~20 attempts — then report **Still running**, never
success. On `FAILED`, read `error.retryable`.

`not_found` from the status tool means the id is unknown or aged out — say
so; do not retry with a guessed id.
