<!--
Copyright (c) 2026, Salesforce, Inc.
All rights reserved.
For full license text, see the LICENSE.txt file in the repo root.
-->

# BAT (BDD) authoring rules

These are the rules the BAT DSL parser enforces. The Phase-2 static validator
(`scripts/validate_bat_suite.sh`) checks the mechanical ones; the rest are
enforced by the `bat` CLI when the suite runs. Get them right at generation
time — a syntax slip costs a full re-run against the live endpoint.

BAT = **Blackbox API Testing** (Anypoint API Functional Monitoring). Tests are
DataWeave `.dwl` BDD files executed against a **deployed HTTP endpoint** — they
do NOT import Mule flows. There is no XSD: the only authority on whether a test
is correct is "it parses AND it passes against the running app".

---

## File skeleton

Every test file is: the imports block, optional `var` declarations for
multi-step state, a `---` separator, then exactly one `describe(...)`:

```dwl
import * from bat::BDD
import * from bat::Assertions
import * from bat::Mutable        // ONLY when the test passes state across calls
var context = HashMap()           // ONLY for multi-step tests
---
describe("POST /orders — happy path") in [
  it must 'create a 2-item order with total=40.99 and status=pending' in [
    POST `$(config.url)/orders` with {
      headers: { Authorization: config.token, "Content-Type": "application/json" },
      body: { customerId: "cust_42", items: [{ productId: "SKU_A", qty: 2, unitPrice: 15.50 }] }
    }
    assert [
      $.response.status mustEqual 201,
      $.response.body.status mustEqual "pending"
    ]
  ]
]
```

---

## The rules (R1–R10)

1. **Imports first.** `import * from bat::BDD` and `import * from bat::Assertions`
   are mandatory. Add `import * from bat::Mutable` only when you declare a
   `HashMap()` for cross-call state. Unused imports are noise — omit `Mutable`
   from single-call tests.

2. **`describe(...)` is a function call** — parentheses, not a bare string.
   The string inside `describe(...)` may use **double quotes**. Convention:
   describe the endpoint + scenario, e.g. `"PATCH /orders/{id}/cancel — pending order"`.

3. **`it must '...' in [...]`** — the scenario name is **single-quoted** and
   reads as plain English asserting the behavior
   (`it must 'cancel a pending order and update the timestamp'`).

4. **Every test is a list `in [...]` of HTTP blocks.** A block is:
   ```
   VERB `$(config.url)/path` with {
     headers: { Authorization: config.token, "Content-Type": "application/json" },
     body: { ... }
   } assert [
     $.response.status mustEqual 200,
     $.response.body.field mustEqual "value"
   ] execute [
     context.set("seededId", $.response.body.id)   // optional, state passing only
   ]
   ```
   Multi-step tests separate blocks with **commas, not newlines**:
   ```
   it must 'cancel a freshly-created order' in [
     POST `$(config.url)/orders` with {...} assert [...] execute [...],
     PATCH `$(config.url)/orders/$(context.get("seededId"))/cancel` with {...} assert [...]
   ]
   ```

5. **Cross-call state** uses `var context = HashMap()` at the top, then
   `execute [ context.set("seededId", $.response.body.id) ]` after the seed
   call, and `$(context.get("seededId"))` interpolated into the next URL.

6. **Config interpolation — always.** Use `$(config.url)` and `$(config.token)`.
   **Never** hardcode `http://localhost...` or a literal bearer token in a test
   file. The environment is selected at run time via `bat --config=local`.

7. **Matchers — `mustEqual` and `mustMatch /regex/` only.**
   - `mustNotBe` **does not exist**. Do not use it.
   - For "non-null / shaped" asserts use `mustMatch` against the expected shape,
     e.g. `$.response.body.id mustMatch /ord_\d+/`.
   - `mustMatch` is **string-only**. Applied to a JSON array it silently
     stringifies the array and the regex won't behave intuitively. For arrays,
     assert per element with `mustEqual`, or assert the count with
     `sizeOf($.response.body.items) mustEqual N`.

8. **Status codes are Number literals** — `200`, not `"200"`.

9. **Do not fabricate endpoints.** Every path + verb must exist in the app's
   Mule source (`<http:listener>` paths) and OpenAPI contract. The Phase-2
   validator checks each test's path against the allowlist derived in Phase 1.

10. **Do not mutate another test's state.** The Object Store is shared across
    the suite. Each test seeds its own data with a `customerId` / id unique
    enough not to collide. One `it must '...'` per file; multiple
    `describe(...)` blocks per file are legal but one-test-per-file is the
    convention for readability and clean reporting.

---

## `bat.yaml` manifest schema (BAT 2.0.22)

```yaml
suite:
  name: "fixture-orders BAT (generated from source)"
files:
  - file: tests/post-orders-happy-path.dwl
  # ... one entry per test file
reporters:
  - type: HTML            # case-sensitive: HTML / JSON / JUnit / stdOut
    outFile: /tmp/bat-orders.html
  - type: JSON
    outFile: /tmp/bat-orders.json
```

- **No top-level `config:` key** — it is not in the schema. The active config
  is selected with the `--config` CLI flag.
- `files:` is a list of `- file:` entries; one per `.dwl` whose test ships in
  the suite.

## Config files

- `config/default.dwl` → `config::local::main({})`
- `config/local.dwl`:
  ```dwl
  %dw 2.0
  ---
  { url: 'http://localhost:8082/api/v1', env: 'local', token: 'Bearer test-token' }
  ```
  Read `url` / `token` from here; never inline them in tests.

## `run-bat.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.bat/bat/bin:$PATH"
export JAVA_OPTS='--add-opens=java.base/java.net=ALL-UNNAMED'
bat --config=local "$@"
```

`JAVA_OPTS` opens `java.base/java.net` because BAT uses reflection to override
`HttpURLConnection.method` — without it **PATCH requests fail on JDK 17**. Make
the script `chmod +x`-able.
