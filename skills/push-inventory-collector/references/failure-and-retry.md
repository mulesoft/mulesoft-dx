# Failure, retry, and expired credentials

Copy this policy into every generated script. Do not invent a second scanner,
a second host, or `complete: true` after a partial run.

Agent Scanner owns ZIP validation, the RUNNING workspace, Temporal
scan-and-publish, review, and Exchange. The script owns provider calls, ZIP
build, `/push`, and `/commit`. It does not poll Temporal, Exchange, or scan
history.

## Retry once vs give up

| Event | Script does | Does not |
|---|---|---|
| HTTP 429, 502, 503, 504, or connection reset on `/push` or `/commit` | Retry the **same** request up to 3 times. Honor `Retry-After` when present, else 1s, 2s, 4s. | Change ZIP bytes, switch Anypoint mode, or create another configuration |
| HTTP 0 / connection refused | Retry once, then FAILED | Point at `localhost` |
| Anypoint HTTP 401 after a token was already used successfully | Remint **once** with the **same** `ANYPOINT_AUTH_MODE`, retry the same `/push` or `/commit` | Probe the other Anypoint mode; loop remints |
| Anypoint HTTP 401 on the first token request | FAILED. Creds are wrong, MFA, or missing `manage:exchange` | Retry |
| Provider HTTP 401/403 after a successful identity test | If their auth doc has refresh/expiry: remint **once**, retry that provider call. Else FAILED for that account | Fall back to another scheme or leftover CLI session |
| Provider HTTP 401 on the identity test | FAILED before list | Continue |
| `/push` HTTP 400 / 415 / 422 | FAILED. Same bytes will fail again | Retry |
| `/push` HTTP 404 | FAILED. Wrong org, config, or host | Retry |
| `/push` 422 asset cap of 1000 | Stop uploads. Commit `complete: false` if anything is staged | Retry the refused ZIP |
| `/commit` HTTP 409 stale workspace run | `GET .../workspace` once, commit again with that `workspaceRunId` | Reuse the stale id; create a new scanner |
| `/commit` already started / already complete | Treat as success. Print the `scanRunId` | Start a second workflow |
| `/commit` HTTP 400 missing `workspaceRunId`/`complete` | FAILED | Guess `complete: true` |
| Org capacity (server default 20000) | FAILED with the server message | Tell them the cap is 10000; retry |
| Temporal scan fails **after** `/commit` 202 | Tell them to wait until that run is no longer RUNNING, then re-run the collector against the **same** configuration | `POST /commit` again with the old `workspaceRunId` (reuse is rejected) |

One RUNNING workspace per configuration. Concurrent uploads to that id share it.
A re-run before commit replaces the same ZIP directory name (`action: replaced`).
Do not create a second scanner to recover.

## Completeness after failure

Unchanged from `scanner-contract.md`:

- First list page failed, nothing staged → do not `/commit`
- Anything staged, then a later page, account, detail, or `/push` failed →
  `/commit` with `complete: false`, no prompt, exit 2
- Full list and every `/push` succeeded → ask, or `--commit` / `PUSH_COMMIT=yes`
  for `complete: true`
- Never promote a retried partial run to `complete: true`

`complete: false` publishes what was pushed and must not retire assets that
were absent.

## Expired credentials

Provider and Anypoint secrets never go in the ZIP. Expiry is a runtime remint,
not a stored scanner credential (push create forbids `authParameters`).

- Connected App: remint `client_credentials` once. If still 401, rotate the
  secret on **that** app.
- Username/password: remint `POST /accounts/login` once. MFA or 401 after remint
  → FAILED; use `connected-app` for unattended CI.
- Provider OAuth: use the refresh field from **their** document, once. No
  refresh documented → FAILED and name the expired input.
- Temporary cloud keys (example: an `ASIA…` key whose session token expired) →
  FAILED; ask for a fresh token. Do not call the default CLI chain.

Never log the old token, the new token, or the secret.

## Scan failure vs push failure

| What failed | Who owns it | Customer next step |
|---|---|---|
| Provider list/detail | Script | Fix creds or inventory; re-run. Partial workspace already committed `false` if anything was uploaded |
| `/push` refused the ZIP | Script + zip | Fix `specification/` against `schemas/`; re-run same config |
| `/push` / `/commit` transient | Script retry | If retries exhaust and something is staged, `complete: false` |
| `/commit` 202, Exchange/Temporal later fails | Agent Scanner | Wait for RUNNING to finish; re-run the same collector; do not seal the old workspace id |
| Review queued (`ask-for-review`) | Agent Scanner | Not a script failure |

Do not poll scan status. Do not call `/seal`, `/complete`, or `/push-assets`.
