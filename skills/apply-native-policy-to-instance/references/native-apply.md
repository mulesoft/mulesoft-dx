# Native policy apply / audit / edit — routing

## Which tool path

| Instance | `provider` | Catalog / apply | Edit | Wait for completion |
| --- | --- | --- | --- | --- |
| Kong / Apigee / Azure | `kong` / `apigee` / `azure` | Universal API via `prepare_policy_creation` → `get_policy_template_form` → `apply_policy_to_instance` (`asset` coordinates required) | `edit_applied_policy` with `policy_id` + `asset` from `view_api_instance_policies`. Never send `injectionPoint` on edit (immutable). | If `httpStatus` is 202 or `operationStatus=accepted`, poll `list_instance_policy_operations` (`organization_id`, `api_instance_id`, `provider`) until that instance's latest `APPLY` / `UPDATE` is `COMPLETED` or `FAILED`. ~20 polls, a few seconds apart. The tool may still return `status: "success"` on that 202 — that means *accepted*, not *applied*. |
| MuleSoft / Anypoint | omit, or `mulesoft` | API Manager via the same three tools (`environment_id` required) | Same `edit_applied_policy`; `environment_id` required; `asset` optional (forward it to bump version) | 2xx without `operationStatus` is terminal. Do not poll `list_instance_policy_operations` (external-only). |

AWS is not on this apply/edit surface — say so and stop.

Use `view_api_instance_policies` to list what is already applied (there is
no `list_applied_policies_on_instance` tool). Pass `organization_id`,
`api_instance_id`, and `provider` (plus `environment_id` on MuleSoft).

## `find_assets` join (Audit)

`include_applied_policies=true` annotates each **userOrgAssets** row.
Public catalog hits have no applied-policy state — ignore them.

Per user-org asset you get API display name and
`appliedPolicies.instances[]` — `{instanceId, environment, policyNames}`.

`find_assets` has no provider parameter. Put the provider word in `query`
(and keep `user_query` verbatim), then **filter client-side**: keep
instances whose provider matches (`apigee`, `kong`, `azure`, `mulesoft` /
`anypoint`). If provider is still unknown, resolve it with
`view_api_instance_policies` before including or excluding the row. Do not
invent a provider.

If `appliedPolicyEnrichment.assetCapApplied` (or `assetsDropped` > 0), fan
out `view_api_instance_policies` rather than treating the truncated set as
complete.

Do **not** pass `policy_name_filter` on Audit — that path is for Universal
Protect (skill apply-universal-policy).

## `apply_policy_to_instance` vs `apply_universal_policy`

- Native plugin / template id on **one** instance → `apply_policy_to_instance`.
- Canonical kebab name from `list_universal_policies` on **many** instances
  → skill apply-universal-policy / `apply_universal_policy`.

Never send a Kong plugin name to `apply_universal_policy`. Never loop
`apply_policy_to_instance` to fake a Universal fan-out.

## Required arguments (do not guess)

External apply: `organization_id`, `api_instance_id`, `provider`,
`asset.group_id`, `asset.asset_id`, `asset.asset_version`,
`configuration_data`.

External edit: the apply set plus `policy_id`.

MuleSoft apply/edit: `organization_id`, `environment_id`, `api_instance_id`,
`configuration_data`, plus template identity (`asset` or
`policy_template_id`) from `get_policy_template_form`. Edit also needs
`policy_id`.

## Edit merge

`configuration_data` is a **full** object. Omitted keys are dropped. Merge
the user's delta onto the latest `configurationData` immediately before
the call. There is no bulk-edit: one user request across many instances =
one `edit_applied_policy` per instance.

**Apigee cannot be renamed.** Keep `AccessControl.@name` (or the equivalent
display-name field) identical to the applied value on every edit. Changing
it makes the background `UPDATE` fail with:

`BAD_REQUEST: "Apigee policies cannot be renamed …; delete and re-create instead"`

There is no detach tool on this surface — so do not offer delete-and-recreate.
Edit configuration values (IP rules, actions, headers) only.

## Failed operations

`list_instance_policy_operations` returns recent ops newest-first (`APPLY` /
`UPDATE` / …) with `RUNNING` / `COMPLETED` / `FAILED`. A `FAILED` row is
enriched with `error` `{code, retryable, message}`. `retryable` tells you
whether a re-apply/re-edit is worth trying. Typical `error.code` values:
`BAD_REQUEST`, `CONFLICT`, `BAD_GATEWAY`, `SCANNER_ERROR`,
`INSTANCE_NOT_FOUND`, `NO_TRANSLATION`, `UNEXPECTED_ERROR`.

The list is instance-scoped; per-operation detail is org-scoped (the tool
already joins them). Cap: `limit` max 50; at most 10 FAILED rows are
enriched (`failedDetailsTruncated` when more were skipped).

## Mapping (confirm + result)

| Native policy | API name | Instance name | Environment | Provider |
| --- | --- | --- | --- | --- |
| Access control | Payments API | prod | Production | apigee |

Plain names, not IDs. Same table before the write (GATE) and after it lands.
