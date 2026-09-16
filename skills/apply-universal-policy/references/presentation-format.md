# Presentation formats — apply-universal-policy

Users say "APIs" when they mean **deployed instances**. Accept that phrasing
and resolve API → instances yourself, but every table titles and lists
**instances**. A protected instance must not hide an unprotected sibling of
the same API.

Reuse the **same** shape for the same kind of data everywhere it appears
(pre-apply preview and post-apply confirmation use the identical mapping
layout).

How to fill columns from `find_assets` is in `references/payloads.md`.

## 1. API-instance list (discovery)

Table titled **"API instances"**.

| API name | Instance name | Environment | Provider | Policy present? |
| --- | --- | --- | --- | --- |
| Payments API | prod | Production | apigee | ✗ |
| Payments API | sandbox | Sandbox | kong | ✓ |
| Orders API | prod | Production | azure | ? |

**Policy present?** is per instance, never per API:

- **✓** — this instance has the named policy (a confirmed read)
- **✗** — this instance lacks it (a confirmed read)
- **?** — `unknown`: the read was incomplete (error or cap). Never treat `?`
  as missing and never apply to it until a re-check resolves it to ✓ or ✗.

Plus a summary counted **per instance**: "N instances found, M missing this
policy, K unknown." Do not fold unknown into missing.

Fallback for small results: a bullet list that still shows API name +
instance name + the same ✓/✗/? mark.

## 2. Policy configuration schema

Present `configurationSchema` as one table, then ask for **the whole
configuration in one shot** against the fields you showed — never field by
field.

| Field | Description | Required? | Default / allowed values |
| --- | --- | --- | --- |
| `jwksUrl` | JWKS endpoint | yes | — |
| `skipClientIdValidation` | Skip client-id check | no | `false` |

For nested objects/arrays, indent the child rows under the parent field
(or flatten with dotted paths). Count every child row toward the length
check below.

**When the schema is short** (about 12 flattened rows or fewer): show
required **and** optional. Do not hide optionals just to "simplify".

**When the schema is too long to scan** (more than about 12 flattened
rows): show **required fields only**. Immediately under the table, say
that optional fields are hidden because the schema is too long, how many
are hidden, and that they keep their defaults unless the user asks to see
them. Offer to expand:

> Showing N required fields (M optional hidden — the full schema is too
> long to display). Say if you want the hidden fields.

If they ask, show the **full** table (required + optional) and let them
add those values in the same one-shot reply. Do not walk field by field
either way. Do not invent values for hidden optionals — omit them so
schema defaults apply. Never hide a required field, even if required
alone is still long.

## 3. Policy → API + instance mapping

Used for both the pre-apply confirmation and the post-apply result.

| Native policy | API name | Instance name | Environment | Provider |
| --- | --- | --- | --- | --- |
| Spike arrest | Payments API | prod | Production | apigee |
| Rate limiting | Orders API | prod | Production | kong |

Plain native names from `list_universal_policies` → `providerMapping` (not
IDs). Join each **remaining** target instance's provider to that mapping
(after dropping unsupported providers).

## 4. Operation result

One short status line:

- **Succeeded** — every targeted instance completed.
- **Partially succeeded** — name the API instances that failed.
- **Failed** — retryable vs terminal, using the operation `error.retryable`
  flag when present.
- **Still running** — you hit the poll cap; say so. Never claim success
  while status is `RUNNING` or while you only have an acceptance (`accepted`
  / HTTP 202).
