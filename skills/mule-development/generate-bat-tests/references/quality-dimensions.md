<!--
Copyright (c) 2026, Salesforce, Inc.
All rights reserved.
For full license text, see the LICENSE.txt file in the repo root.
-->

# Quality dimensions / test categories

Every generated test carries `{ dimension, subdimension }` so the report can
roll up coverage per category. Pick exactly **one primary** dimension
(Accuracy / Robustness / Security) per test; a test additionally contributes to
one or more **Coverage** subdimensions for reporting.

The taxonomy below is for **Mule integration apps** — endpoints + flows + state
machines + persistence.

## Accuracy — does the flow produce the *right answer* for legitimate input?

| Subdimension | What it asserts |
|---|---|
| **structural** | Response body has the OpenAPI-declared shape (required fields present, types correct, enums respected). |
| **data-integrity** | Server-computed fields are correct: e.g. `total = sum(qty * unitPrice)`, `id` non-empty, `createdAt` ISO-8601, `status` initialized correctly. |
| **idempotency** | Re-issuing the same `GET` returns the same body; persistent state survives between calls. |

## Robustness — does the flow fail *gracefully* on bad input or unhappy paths?

| Subdimension | What it asserts |
|---|---|
| **input-validation** | Required field missing → 400 + the app's validation error code. Type-wrong field → 400. Out-of-range numeric → 400. |
| **state-machine** | Invalid transitions return 409 + the invalid-transition error code with the correct message (cancel-shipped, confirm-confirmed, ship-pending, …). |
| **resource-not-found** | Operating on a non-existent id → 404 + the not-found error code. |
| **dependency-failure** | A downstream check fails → 409 (or the app's mapped status) with the dependency error code. |

## Security — does the flow enforce authentication and authorization?

| Subdimension | What it asserts |
|---|---|
| **authentication** | Missing or malformed `Authorization: Bearer` → 401 + the unauthorized error code. Applies to every protected endpoint. |
| **authorization** | Per-user / per-scope access where the app implements it. |

## Coverage — does the suite *touch* every code path? (meta dimension)

| Subdimension | What it asserts |
|---|---|
| **endpoint** | Every HTTP listener path × method has at least one happy-path test. |
| **error-type** | Every `raise-error` type in the source has at least one test that triggers it. |
| **branch** | Every `<choice>/<when>` branch has a test that takes the `when` and another that takes the `otherwise`. |
| **state-transition** | Every legal transition in the state diagram is exercised end-to-end. |

## Sizing the suite

A "good enough" first suite covers, at minimum:

- One happy-path test per **endpoint × method** → *Accuracy / Coverage:endpoint*
- One trigger per distinct **`raise-error` type** in the source → *Robustness / Coverage:error-type*
- One walk per legal **state transition** → *Robustness:state-machine*
- Filter/query behavior where the endpoint takes query params → *Accuracy:structural*

Aim for **~12–20 tests** for a typical small API. Cover every `raise-error`
type and every endpoint, but don't bloat — a redundant test is noise in the
report.

## Out of scope for generation

Performance (latency, concurrency) needs a load harness, not functional BAT —
leave it out unless the user explicitly asks.
