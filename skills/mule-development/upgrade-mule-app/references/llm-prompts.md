# LLM prompt templates

One prompt: the agent runs it once per operation the flow uses. Meant to be run **inline** by the agent executing the skill.

The agent has already read `tmp/connector-metadata/<nick>-new.json` (NEW describe summary), `tmp/connector-metadata/<nick>-new-<op>.json` (per-op signature with full `attributes[]` + `childElements[]`), and `tmp/connector-usage/<nick>.json` (flow usage). This prompt runs Phase C for one op.

**Non-negotiable:** the LLM must consult the per-op JSON before writing any attribute on the operation element. Attributes not present in `per-op.attributes[]` are XSD errors; body-carrying params (`content`, `payload`, `records`, etc.) are usually in `childElements[]`, not attributes.

**Connection-provider elements are described in Mode C — always use it.** `<prefix:config>` has no `--type operation` describe, but the CLI DOES support `--type connection-provider --name <provider> --config-name <config>` (Mode C in `scripts/describe_connector.mjs`). Phase B runs Mode C once per `(config, provider)` pair the flow uses. When editing a config block:

1. Read `tmp/connector-metadata/<nick>-new-<config>-<provider>.json`.
2. Use `.elementName` at the top for the config element's local-name (e.g. `sfdc-config`, `config`, `listener-config`).
3. Use `.connectionProviders[] | select(.name == "<provider>") | .elementName` for the connection element's local-name (e.g. `basic-connection`, `active-mq-connection`, `listener-connection`).
4. Never guess a novel element name from the SDK provider identifier — the SDK name (`basic`, `basicConnection`, `activeMq`) is not the DSL name. Always read Mode C's `.elementName`.

---

## §1 Per-op upgrade prompt

**When to run:** once per entry in `usage.operations_used[]`. Also once per removed op (any op in `usage.operations_used[]` NOT present in NEW describe's operations catalog).

**Inputs to include in the prompt:**

- Op name (OLD-side, from usage) + resolved NEW-side op name (may be a rename)
- Full per-op signature from `tmp/connector-metadata/<nick>-new-<op>.json`: `attributes[].attributeName` (with types, `required`, allowed values), `childElements[].elementName`, `errorTypes[]`
- If the op has no direct rename candidate, mark as "removed" and inline the FULL NEW summary operations list as candidates
- Per-site array: `[{file, line, attributes_set: {...}}]` — one entry per usage site
- Namespace hints: {flow_prefix, new_prefix, prefix_changed: bool}
- ErrorTypes context: {caught_by_flow: [...], present_in_new: [...]}

**Prompt shape (template):**

```
Rewrite the Mule flow usage sites for operation `<op-name>` to use the new connector version.

Context:
  Connector: <nick>
  Operation: <op-name>
  Status: <"exists in NEW" | "removed in NEW">

NEW connector operation signature (if exists):
  name: <op-name>
  attributes: [ {name, type, required, description}, ... ]
  errorTypes: [ ... ]
  childElements: [ ... ]
  description: "..."

OR (if removed):
  Operation `<op-name>` no longer exists in the NEW connector.
  Available operations in NEW connector (<N> total):
    [ {name, description, attributes, errorTypes, childElements}, ... ]

Usage sites in the flow (<N> sites):
  [ {file, line, attributes_set: {attr: value, ...}}, ... ]

Namespace:
  Flow uses prefix: <flow_prefix>
  NEW connector prefix: <new_prefix>
  Prefix changed: <true | false>

ErrorTypes:
  Caught by flow in <on-error-propagate>: [ ... ]
  Present in NEW connector: [ ... ]

Instructions:

1. Read each site's file at its line for surrounding context (~10 lines each side).

2. Decide, based on NEW describe and observed usage:
   - Is this a straight rename? (NEW has an op with the same attributes/errorTypes)
   - An attribute rename? (NEW has the op but attribute names changed)
   - A semantic rewrite? (NEW has the op but signature changed significantly)
   - A true removal that needs a new flow? (no plausible rename exists in NEW catalog)

3. For each site, use the Edit tool to rewrite the element in place:
   - Preserve doc:name, DataWeave payloads, config-ref values.
   - Update attribute names to match NEW signature. **Every attribute you write MUST appear in `per-op.attributes[].attributeName`.** Anything else will fail XSD validation.
   - If an OLD attribute carries a body-like value (e.g. `content="#[payload]"`) and the NEW `per-op.attributes[]` does not contain it, check `per-op.childElements[].elementName` — it is almost certainly a child element now. Rewrite as `<prefix:child-name>#[payload]</prefix:child-name>` inside the element.
   - If op is removed and no plausible rename exists, use AskUserQuestion to mark the site as needing user attention (don't guess).

4. Update on-error-* type attributes if errorTypes changed:
   - Map the OLD errorType to the closest NEW errorType by name.

5. If namespace.prefix_changed, rewrite `<oldprefix:...>` → `<newprefix:...>` on the touched elements only.
   - Do NOT touch xsi:schemaLocation — Phase D (apply_connector_pin.mjs) handles it deterministically.

6. If a site is (or is inside) a `<prefix:config>` block, read the Mode-C describe at `tmp/connector-metadata/<nick>-new-<config>-<provider>.json` — Phase B ran one per `(config, provider)` pair used by the flow. Use `.elementName` for the config element and `.connectionProviders[] | select(.name == "<provider>") | .elementName` for the connection element. Never guess from the SDK provider identifier.

7. After all sites for the op are edited, run `xmllint --noout <file>` on each touched file to verify parseability.

Constraints:
  - Preserve business intent (DataWeave, doc:name, config-ref).
  - Never modify unrelated elements.
  - Never invent an operation that doesn't exist in NEW describe.
  - Never edit xsi:schemaLocation (Phase D handles it).
  - If you can't decide, use AskUserQuestion with plausible candidates as options.
```

**Output handling:** the LLM applies the Edits directly. No JSON return value needed. If it can't decide, it uses AskUserQuestion.

---

## Notes on running this inline

- The prompt is self-contained — it includes all the context (NEW describe, usage sites, namespace hints) so the agent doesn't need to re-open files.
- The agent should run this prompt once per operation. Do not batch multiple operations into one prompt — each operation is independent; interleaving them dilutes context.
- After all operations are processed, the agent proceeds to Phase D (apply_connector_pin.mjs) to bump pom.xml and rewrite xsi:schemaLocation URLs deterministically.
