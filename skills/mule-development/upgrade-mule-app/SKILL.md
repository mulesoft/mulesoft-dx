---
name: upgrade-mule-app
description: Workflow required before any Mule application upgrade work. Call use_skill as your FIRST action — before reading project files (pom.xml, mule-artifact.json) or editing versions yourself — whenever the user asks to upgrade, migrate, bump, modernize, or move a Mule app to a newer Java version, a newer Mule Runtime version, or both. Covers upgrading Java and/or Mule Runtime, getting latest compatible connector versions, updating connector and plugin versions, and fixing impacts from operation changes in flows, DataWeave scripts, and MUnit tests. Even a targeted single-version bump like 'move this app to Java 17' or 'upgrade the runtime to 4.6' requires this workflow — do not hand-edit pom.xml versions and attempt the change yourself. When you call this skill, it must be the only tool call in that response.
license: Apache-2.0
compatibility: Requires Anypoint CLI v4 with the `@salesforce/anypoint-cli-dx-mule-plugin` DX plugin, Java 8+, Mule Runtime
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
  cli: anypoint-cli-v4
  theme: professional
allowed-tools: Bash Read Write Edit AskUserQuestion
---

# Mule App Upgrader

Upgrade Mule applications with automated version updates and end-to-end compatibility resolution.

## When to Use This Skill

**Use this skill when users request:**

- "Upgrade my Mule app Java version"
- "Upgrade Mule runtime"
- "Upgrade Java and Mule runtime"
- "Modernize Mule application"
- "Update dependencies for new Java/runtime"

**Trigger keywords:** upgrade, migrate, update, modernize · java, java version · mule runtime, runtime version · dependencies, compatibility.

---

## Prerequisites

```bash
anypoint-cli-v4 --version
anypoint-cli-v4 dx --help
anypoint-cli-v4 conf
```

If tools are missing:

```bash
npm install -g @mulesoft/anypoint-cli-v4
npm install -g @salesforce/anypoint-cli-dx-mule-plugin
anypoint-cli-v4 conf username <username>
anypoint-cli-v4 conf password <password>
```

**Requires:** Mule Runtime **4.3+** and Java **8+**. Apps below either are not supported, upgrade to the baseline first.

**Required files in project:**
- `mule-artifact.json` - Mule application metadata
- `pom.xml` - Maven configuration
- Parent POM (if referenced in `pom.xml`)

---

## Bundled scripts

This skill ships small Node.js (ESM, zero-dep) scripts under `scripts/`. Invoke them with the `Bash` tool — do not inline their contents into a response. The scripts persist their output to disk so later steps can consume it mechanically and are not at the mercy of shell variables that vanish when a Bash tool call returns:

| Script | Purpose | Output location |
| --- | --- | --- |
| `scripts/validate_prerequisites.mjs` | Step 1 — validate app directory (`pom.xml` + `mule-artifact.json`), parent-POM availability (if referenced), Anypoint CLI v4, DX plugin, and local **Maven on the 3.9.x line** (MMP 4.x + MUnit require it; detect-and-instruct, never install). Validation-ONLY; exits non-zero when `errors[]` is non-empty | `tmp/upgrade-prereqs.json` (contains `inAppDir`, `parentDeclared`, `parentFound`, `cliPresent`, `dxPluginPresent`, `mavenVersion`, `mavenInRange`, `errors[]`, ...) |
| `scripts/detect_current_mule_version.mjs` | Step 2a — determine the current Mule Runtime version from the `app.runtime` property, searching the child `pom.xml` then its full local parent chain (parent, grandparent, …) with `${...}` resolved against the merged chain, and flag versions below the supported floor (4.3). `--user-version <v>` persists a user-supplied/corrected value (also flagged via `belowFloor`) | `tmp/current-mule-version.json` (contains `version`, `source`, `resolvedFrom` (`"child"` \| `"parent"` \| `"ancestor"`), `needsUserPrompt`, `belowFloor`, `minSupportedVersion`, `warnings[]`, ...) |
| `scripts/detect_current_java_version.mjs` | Step 2b — determine the current Java version from `mule-artifact.json` `javaSpecificationVersions`, and flag versions below the supported floor (8). `--user-version <n>` persists a user-supplied/corrected value (also flagged via `belowFloor`) | `tmp/current-java-version.json` (contains `version`, `source`, `supportedVersions`, `needsUserPrompt`, `belowFloor`, `minSupportedVersion`, `warnings[]`, ...) |
| `scripts/resolve_jdk.mjs` | Step 3 & Phase 2 — ensure a JDK for a given Java **major** is available and report a usable `JAVA_HOME`. Resolves major → full build string (e.g. `8` → `8.0.472_8`) via `dx mule runtime list` (matrix-file fallback), reuses an already-installed JDK under the Anypoint Code Builder java dir, and downloads only when none is present. MAY download (network) unless `--no-download` | `tmp/resolve-jdk-<major>.json` (contains `major`, `requestedBuild`, `javaHome`, `javaBin`, `source`, `downloaded`, `available`, `errors[]`, ...) |
| `scripts/detect_current_mmp_version.mjs` | Step 3c (pre-build) — detect the app's **current** `mule-maven-plugin` version (read from the child `pom.xml` then its local parent chain, `${...}` resolved) so Step 3c knows whether to bump MMP for the baseline. Sets `needsPluginBump: true` when the current MMP is < 4.x (3.x can't run on the required Maven 3.9.x → bump to latest 4.x for the baseline build only). Detects the MMP version only; Maven compatibility is owned by the Step 1 Maven-3.9.x pre-req. Validation-ONLY; no download, no mutation | `tmp/current-mmp.json` (contains `pluginVersion`, `pluginMajor`, `pluginDefinedIn`, `needsPluginBump`, `errors[]`, `warnings[]`, ...) |
| `scripts/set_plugin_version.mjs` | Step 3c **Case B** (literal MMP) — deterministically set a plugin's hardcoded `<version>` in `pom.xml` when `-D` can't override it. Matches the plugin block by `artifactId` (+ `groupId` when declared) and rewrites only that block's `<version>`, whitespace/tab-agnostic; leaves `${property}` versions untouched (that's the `-D` Case-A path) and safely handles POMs with multiple plugin blocks (build/plugins + pluginManagement). Callers revert the pom after the throwaway baseline build. Exit 0 on edit/no-op, 1 on not-found/error | stdout JSON `{artifactId, version, groupId, edits[]}` (mutates `pom.xml`) |
| `scripts/resolve_runtime.mjs` | Step 13 — ensure the **target** Mule Runtime distribution is present and report its `runtimePath`. Reuses an installed `mule-enterprise-standalone-<version>` under the Anypoint Code Builder runtime dir, else downloads it via `dx mule runtime download` — only if `dx mule runtime list` offers that version. MAY download (network) unless `--no-download`. Never sets a runtime path | `tmp/resolve-runtime-<version>.json` (contains `version`, `resolvedVersion`, `runtimePath`, `source`, `downloaded`, `available`, `errors[]`, ...) |
| `scripts/resolve_target_versions.mjs` | Step 4 — determine the recommended upgrade target (in-channel: highest minor, latest patch, latest non-EOL Java) from the current versions + live `dx mule runtime list`, and validate a user-requested target (`TARGET_MULE`/`TARGET_JAVA`) against the locked policy. Advisory — always exits 0; caller branches on fields | `tmp/target-versions.json` (contains `currentMule`, `currentJava`, `channel`, `options[]`, `requestedTarget` {`accepted`, `mule`, `java`, `reasonCode`, `reason`, `crossChannel`, `warning`, `belowRecommended`, `note`}, `requestedJavaOnly` {`java`, `supported`, `supportedJavas[]`, `recommendedMule`, `recommendedJava`, `note`}, `nothingToUpgrade`, `needsUserPrompt`, `warnings[]`, ...) |
| `scripts/extract_connectors.mjs` | Step 5a — extract the connector dependencies (`<classifier>mule-plugin</classifier>`, non-test-scoped) from the app's `pom.xml` and its full local ancestor chain (parent, grandparent, …), resolving each version from the local POMs: inline, `${...}` (single, nested, or composite like `${major}.${minor}`), inherited `<dependencies>`, and version-less deps managed in any local `<dependencyManagement>` (this POM's own or an ancestor's). Deterministic static parse; no CLI, no network. Advisory — always exits 0 | `tmp/connectors.json` (contains `connectors[]` {`nick`, `groupId`, `artifactId`, `version`, `versionResolved`, `resolvedFrom`, `versionManagedIn?`}, `excluded[]` (test-scoped), `customLibraries[]` (non-connector app jars — flagged for operator at Step 12, never auto-bumped), `needsUserPrompt`, `warnings[]`, ...) |
| `scripts/check_connector_java_compat.mjs` | Step 5b — for each connector from Step 5a, `exchange asset describe <groupId>/<assetId>/<version>` (exact lookup, with retries) and read its `is-java-*-supported` tags to report which Java versions the CURRENT in-use version supports. HARD-STOPS (exit 1, `stop: true`) when a connector cannot be verified: describe fails **and** an exact-GA `asset list` probe finds no matching asset (genuinely not on Exchange), or no `is-java-*` tags are present. When describe fails but the asset exists (only the pinned version was delisted), it sets `currentVersionDelisted: true` and does **not** block | `tmp/connector-java-compat.json` (contains `connectors[]` {`nick`, `groupId`, `artifactId`, `version`, `supportedJava[]`, `blocked`, `blockReason`}, `blocked[]`, `stop`, `warnings[]`, ...) |
| `scripts/resolve_target_connectors.mjs` | Step 6 — for each connector from Step 5, find the LATEST published version that supports BOTH the target Mule and target Java (from Step 4). One `exchange asset describe` per connector returns every sibling version with its own `min-mule-version` / `is-java-*-supported` tags; filters locally to versions where `is-java-<targetJava>-supported == true` AND `min-mule-version <= targetMule`, then picks the highest by semver. If describing the current version fails (delisted), it re-anchors the describe on the newest GA sibling from `asset list` so `.versions[]` is still readable. HARD-STOPS (exit 1, `stop: true`) when a connector has no target-compatible version, or is genuinely absent from Exchange. Target comes from `TARGET_MULE`/`TARGET_JAVA` env or `tmp/target-versions.json` `options[0]` | `tmp/target-connectors.json` (contains `targetMule`, `targetJava`, `connectors[]` {`nick`, `groupId`, `artifactId`, `currentVersion`, `targetVersion`, `changed`, `candidateCount`, `minMuleVersion`, `supportedJava[]`, `blocked`, `blockReason`}, `blocked[]`, `stop`, `warnings[]`, ...) |
| `scripts/_pom_utils.mjs` | Shared library (Steps 1–6) — tolerant XML parser, `${...}` property resolution (single/nested/composite, cycle-guarded), local parent-POM location (with parent-identity verification), and managed-version lookup across the local ancestor chain. Used by the detection/validation/extraction scripts above. Not invoked directly | (imported) |
| `describe_connector.mjs` | Mode-A/B/C describe of a NEW connector version (summary, per-op, per-config-provider). Invocations (flags — not positional): Mode-A `<nick>-new`; Mode-B `<nick>-new --type operation --name <op>` (or `--type source --name <src>`); Mode-C `<nick>-new --type connection-provider --name <provider> --config-name <config>`. See Step 7 (7a Mode-A, 7b Mode-B/C). | `tmp/connector-metadata/<nick>-new.json`, `<nick>-new-<op>.json`, `<nick>-new-<config>-<provider>.json` |
| `enumerate_usage_xml.mjs` | **Preferred** usage enumerator — parses `src/main/mule/**/*.xml` with `fast-xml-parser`. Identical output to `enumerate_usage.mjs` but correct on messy input (ignores commented-out elements; binds `config-ref` to its owning element). Exits rc=3 if `fast-xml-parser` isn't importable → caller falls back to the grep script. See Step 7 "Usage enumeration". | `tmp/connector-usage/<nick>.json` |
| `enumerate_usage.mjs` | Zero-dependency (regex/grep) usage enumerator — the fallback for `enumerate_usage_xml.mjs`. Scans `src/main/mule/**/*.xml` for a connector's ops, configs, error types, namespace prefix used by the app. The OLD-side source of truth — replaces re-describing the old connector version. See Step 7b (usage enumeration + output shape). | `tmp/connector-usage/<nick>.json` |
| `apply_connector_pin.mjs` | Bumps one connector's version in `pom.xml` and rewrites its `xsi:schemaLocation` in every flow XML. Reads `tmp/connector-choices/<nick>-new.json` (GAV, required) and `tmp/connector-metadata/<nick>-new.json` (namespace metadata, **optional** — absent for pom-only connectors, in which case the XSD rewrite no-ops). Deterministic — never hand-edit `xsi:schemaLocation`. | mutates `pom.xml` + `src/main/mule/**/*.xml` |
| `apply_runtime_bump.mjs` | Ensures `<app.runtime>` (bumped, or inserted if absent); bumps `<javaVersion>`, `java.version`, `jdk.version` **only if present** (never inserted); **normalizes the maven-compiler-plugin level to the target Java in place** — a `maven.compiler.{source,target,release}` property or inline `<source>/<target>/<release>` is bumped where it lives (a lone inline `<target>`/`<source>` is completed by converting it to `<release>`; `release` never coexists with `source`/`target`), inserting `maven.compiler.release` only when the app has custom Java (`src/main/java`/`src/test/java`) with no level declared anywhere; bumps/inserts `<mule.maven.plugin.version>`; bumps every MUnit version site (the `<munit.version>` property, the `munit-maven-plugin` plugin block, and the `munit-runner`/`munit-tools` dependencies) in `pom.xml`; inserts `<runtimeVersion>${app.runtime}</runtimeVersion>` into the `munit-maven-plugin` config (insert-if-absent, never clobbers an existing pin); sets `minMuleVersion` to the **`x.y.0` feature line** (platform-correct — matches ACB/Studio, the Introspection Service needs the minor-line form) and ensures `javaSpecificationVersions` contains the target Java in `mule-artifact.json`. The `runtimeVersion` pin is what lets the feature-line floor be correct without regressing tests: MUnit's embedded runtime defaults to `minMuleVersion` otherwise, and an `x.y.0` floor would boot an older runtime that fails JAVA_25-annotated connectors with `EnumConstantNotPresentException`. All values read from `tmp/upgrade-targets.json` (`.mule.to` / `.java.to` / `.muleMavenPlugin.to` / `.munit.to`) — nothing hardcoded. `.muleMavenPlugin.to` and `.munit.to` are resolved live in Step 11a; if either is absent, the corresponding versions are left unchanged. Version rewrites only — does not run java (the build is pinned to the resolved target JDK via the inline `JAVA_HOME=... mvn` prefix in Step 16). | mutates `pom.xml` + `mule-artifact.json` |
| `promote_new_connector_pins.mjs` | Copies every `tmp/connector-choices/<nick>-new.json` → `tmp/connector-versions/<nick>.json` so Phase 2's pin script can consume them. Run once, before `apply_connector_pin.mjs`. | `tmp/connector-versions/<nick>.json` |
| `apply_parent_pom_fork.mjs` | Parent-owned **connector** versions — the WRITE-side counterpart to the read-side chain walk, in two phases. Scope is **connectors only**: `app.runtime` / `mule.maven.plugin.version` / Java props are app-scoped and always child-written by `apply_runtime_bump.mjs` (never forked into a shared ancestor). **`--phase=edit` (Step 14):** for every **local ancestor** that owns a connector (in its `<dependencies>`/`<dependencyManagement>`), bump every connector version that ancestor owns to the resolved target — following `${property}` refs — for **all** connectors declared in that ancestor (fork-wide scope; an app-unused connector with no resolved target is a warning, never a hard stop). The ancestor's own `<version>` and the child's `<parent>` ref are left untouched, so the local build resolves the new versions via `<relativePath>`. **`--phase=fork` (Step 18, after a green build):** bump each owning ancestor's own `<version>` (computed from the pristine `tmp/pom-backups/` snapshot, so it is idempotent) and repoint the downstream `<parent><version>`. Both phases process the chain **deepest-first** and **verify** — re-resolving each connector from the child's perspective (same walk as the extractor), and in the fork phase confirming each `<parent>` link points at the fork. Reads `tmp/connectors.json` (provenance), `tmp/target-connectors.json` (target versions). `--phase=edit\|fork` (default `edit`); `--fork-bump=major\|minor\|patch` (default `minor`, fork phase only); `--dry-run` prints the plan without writing. Exit 1 on verify failure or missing/bad inputs; a no-op (no ancestor owns a connector) exits 0. No Exchange publish — purely local edits. | mutates ancestor `pom.xml`(s) (edit phase: managed connector versions; fork phase: own `<version>` + downstream `<parent>` refs); full result JSON `{phase, ancestorsForked[], edits[], backedUp[], verify{}, warnings[]}` written to `tmp/parent-pom-<phase>[-dryrun].json` (edit phase snapshots each ancestor it edits to `tmp/pom-backups/` pristine, create-if-absent, before its first write); stdout gets a short summary only (so a long chain never clips) |
| `verify_metadata_coverage.mjs` | Step 11.5 gate — for every op / source / provider in `tmp/connector-usage/*.json`, verify a Mode-B / Mode-C JSON exists in `tmp/connector-metadata/`. Exits 1 with FAIL rows when any required per-op / per-provider describe is missing. Configs whose Mode-A `.connectionProviders[]` is empty (D7 fallback — some DB configs) emit INFO and do not fail; Phase C reads Mode-A `.configs[]` directly for those. Optional `--strict` also fails on WARN rows (renamed / removed ops that lack a `<nick>-op-renames.json` entry). | stdout FAIL/WARN/INFO rows |
| `verify_dependency_tree.mjs` | Cross-checks what the static POM walk discovered against what Maven actually resolves (`mvn dependency:tree`, scoped to the connector GAVs) — the authority on the *resolved value*, catching imported-BOM / transitive / stale-`~/.m2` sources the local walk can't see. Two gates, one engine: **Step 12.0 `--against=existing`** diffs current versions vs `tmp/connectors.json` (SOFT — annotate plan + raise at approval); **Step 14.5 `--against=target`** diffs the just-written pins vs `tmp/target-connectors.json` (HARD — stop before the build). `--expected=<path>` overrides the file. The caller positions it: existing BEFORE Step 14 writes, target AFTER. Exit **0** all match, **1** operational error (Maven missing / tree failed / expected file unreadable — always a stop), **2** mismatch(es) — caller decides soft vs hard. | `tmp/dep-tree-verify-<mode>.json` (`matched[]`, `mismatches[]`, `missingFromTree[]`, `resolvedOnlyByTree[]`) |

Shared helpers live in `lib/*.mjs` alongside `scripts/`: `anypoint.mjs` (CLI env scrubbing), `fsx.mjs` (I/O), `platform.mjs` (Java version parsing), `pom-edit.mjs` (pom.xml + mule-artifact.json + XSD rewrites), `xml-flow.mjs` (flow XML grep primitives). Steps 1–6's detection/validation/extraction scripts share `scripts/_pom_utils.mjs` (tolerant XML + `${...}` + parent-POM location + managed-version lookup); Steps 7–20's edit scripts use `lib/pom-edit.mjs` — the two POM helpers are independent.

Invoke scripts by the absolute path you were given in the "skill is now active" message (it is the directory containing this `SKILL.md`). Do **not** construct relative paths like `../scripts/...` — Cline's working directory shifts across turns and relative paths have produced "No such file or directory" errors in real runs. The inline step examples below write `scripts/...` as shorthand; substitute `<skill-dir>/scripts/...` when you actually execute them.

**Why scripts instead of inline bash:** Persisting to a file on disk makes data available across responses. Shell variables die when the `Bash` tool call returns, but files persist and can be read by later steps.

---

## Workflow shape (two phases)

This workflow has two phases separated by a hard user-approval gate.

- **Phase 1: Plan (Steps 1–12).** Validate prerequisites, get current versions, build baseline, determine target versions, extract connectors and check their current Java compatibility, resolve target-compatible connector versions, analyze plugin/DataWeave/MUnit compatibility, present upgrade plan, wait for user approval. Phase 1 writes **nothing** to project files — all artifacts live under workspace-relative `tmp/` directory. No modifications to `mule-artifact.json`, `pom.xml`, or flows until approval.
- **Phase 2: Execute (Steps 13–20).** Download runtime/Java, update versions, update application code (flows/configs/DW/custom Java), run build loop, run MUnit loop, cleanup workspace, declare completion. Phase 2 is the only phase that modifies project files.

Phase 2 MUST NOT start until Step 12's approval gate has been passed explicitly. Skipping the plan or modifying files before approval defeats the purpose of the two-phase structure.

---

## Workflow-Wide Discipline (read before Phase 1)

- **Build → cleanup → completion separation.** Separate responses, in order, each with a single tool call: `mvn clean package`, then `rm -r tmp/`, then `rm -rf` the ephemeral `node_modules` (Step 19), then the completion signal. Do not bundle them — never chain the two `rm`s into one line. Wait for each result before moving on.
- **One mvn invocation per response.** When re-running a build after a fix, emit only the `mvn` command in that response. Do not bundle it with further edits, follow-up shell commands, or the completion signal.
- **"Completion" means the build already passed.** You may only declare completion after a response that ran `mvn clean package` came back with `BUILD SUCCESS` and `mvn test` came back with all tests passing.
- **Use the bundled scripts — do not reimplement them.** When a step ships a script (see "Bundled scripts"), run *that script* and read its JSON output. Do **not** hand-roll its logic with raw `anypoint-cli-v4 exchange asset list`/`describe` + `jq`, and do not "verify" or "double-check" its result by querying Exchange yourself. The scripts are the source of truth; they use exact `asset describe` lookups (and use `asset list` only as an internal exact-GA existence probe when a version is delisted), whereas ad-hoc `asset list` for version-picking is fuzzy and paginated (it silently misses versions and returns sibling assets), which produces wrong answers. If a script seems wrong, say so and stop — don't route around it. In particular, Step 6 connector target versions come **only** from `resolve_target_connectors.mjs`.
- **Version resolution from scripts/CLI only.** All versions come from the bundled scripts (or, where a step has no script, the CLI command that step names), never hardcoded. Never paste versions from memory or documentation.
- **One step at a time.** Do the current step's work and stop. Do not jump ahead to gather data for later steps (e.g. plugin versions, flow/DataWeave review) while still on Step 6 — each step has its own script and instructions.
- **Java 17+ REQUIRED for every `describe_connector.mjs` call.** Under Java 8 or 11 the Anypoint CLI's `dx mule describe-connector` still exits 0 but returns a DEGRADED response — `configs[]` collapse to `{name, connectionProviders: []}` with no `parameters` / `attributes`, silently hiding required-attribute breaking changes. The skill's Phase-C diff then signs off on a config that is actually broken, and `mvn` fails at `process-classes` with an XSD-validation error (`cvc-complex-type.4: Attribute 'X' must appear on element '<prefix>:<config>'`). Before invoking `describe_connector.mjs` (Mode-A/B/C) in Step 7 — or the lazy single-connector re-describe in Step 16 class 6 — export a Java 17+ `JAVA_HOME` (see Step 13). The script itself refuses to run under < Java 17 and exits with a fix-it message, so a stale `JAVA_HOME` is caught immediately, not seven steps later at packaging.
- **`not_in_use` skip — the ONLY pre-Mode-B/C skip.** If Step 7's `enumerate_usage.mjs` prints a `not_in_use` JSON on stdout, the connector is declared in `pom.xml` but has zero flow usage. Reduce the plan for that connector to "bump the pom version only — no flow edits, no per-op describe." Skip Mode-B and Mode-C, but keep the connector in the plan under a `pom-only` section so Phase 2 still runs `apply_connector_pin.mjs`. Do NOT invent any other "stable connector" short-circuit — for every connector with real usage, run Mode-B / Mode-C unconditionally and let Step 12's plan synthesis surface "no rewrites" naturally by finding zero per-symbol diffs against the Mode-B / Mode-C JSONs.

---

# Phase 1: Plan

## Step 1: Validate Prerequisites

Run the prerequisite validation script. It only validates — it writes nothing to the project and never prompts:

```bash
node scripts/validate_prerequisites.mjs .
```

It writes the validation findings to `tmp/upgrade-prereqs.json` (read fields with `jq`, e.g. `jq -r '.parentFound' tmp/upgrade-prereqs.json`). **If the script exits non-zero (i.e. `errors[]` is non-empty), STOP and act on the errors before progressing.** The most common ones:

- **Not in an app directory** (`pom.xml` / `mule-artifact.json` missing) → tell the user to run from the Mule application root.
- **An ancestor POM declared but not found locally** → the check walks the **full** `<relativePath>` chain (parent → grandparent → …) and lists each found POM in `ancestorChain[]`, because the whole chain is required for version detection (Step 2/5) and Phase 2 edits (a connector version can live in the grandparent; Steps 14/18 edit and fork every owning ancestor). A missing hop at **any** depth is a hard error here (`parentFound: false` for a missing immediate parent; a deeper miss still populates `errors[]`) — do not let it slip to Step 5. Ask the user to make the missing POM available at a local relative path (resolvable from the declaring POM's `<parent><relativePath>`, or the default `../pom.xml`) and re-run. **Do not attempt to download it.**
- **Toolchain missing** (`cliPresent` / `dxPluginPresent` false) → point the user at the install commands in Prerequisites.
- **Maven not on the 3.9.x line** (`mavenInRange: false`) → MMP 4.x and MUnit require Maven **3.9.x**, and the baseline build (Step 3c) runs on a 4.x MMP. Tell the user to switch to an Apache Maven 3.9.x distribution (put its `bin/` first on `PATH` for this session) and re-run. **Do not download or auto-install Maven, and do not suggest a bare package-manager `install maven`** — those pull whatever is latest (often 4.x, or an old 3.6.x), which fails this very check. Maven is a standard developer toolchain, treated as a pre-req like the CLI/DX plugin.

Only proceed to Step 2 once the script exits zero.

Do **not** gate on JAVA_HOME pointing at Java 17 here. Step 3 builds the app on its **current** Java (usually 8 or 11); Step 13 is the Java-17 gate.

---

## Step 2: Get Current Versions

### 2a. Current Mule Runtime version

Run the detection script (do not parse the POM inline — the script reads the `app.runtime` property from the child, then parent `pom.xml`, resolving `${...}`):

```bash
node scripts/detect_current_mule_version.mjs .
```

It writes the result to `tmp/current-mule-version.json`. Read fields from the file with `jq` (e.g. `jq -r '.version' tmp/current-mule-version.json`) and branch on it:

- **`belowFloor: true`** → the detected `version` is below the minimum supported Mule Runtime (`minSupportedVersion`, currently 4.3). This app is **out of scope** — there is no valid version to prompt for. **Stop** and tell the user to upgrade the app to at least that version before running this skill (see `warnings`).
- **`version` set, `needsUserPrompt: false`** → use `version` as the current Mule Runtime version. Continue.
- **`needsUserPrompt: true`** → the script could not settle on a trustworthy version. Inspect `warnings`:
  - parent declared but not found locally → ask the user to make the parent POM available locally, then re-run this step. **Do not attempt to download it.**
  - otherwise (nothing resolvable) → ask the user for the current Mule Runtime version via `AskUserQuestion` (header `Current Mule version`, question *"I couldn't detect your app's current Mule Runtime version. Which version does it run on today?"*). Offer the common current-runtime lines as options (e.g. **4.3.0**, **4.4.0**, **4.6.x**) so the user selects rather than free-types; they can always supply another via the "Other" choice. If they cannot provide it, **stop**.

  Then **persist the answer** by re-running the script with `--user-version` so downstream steps read a real value (not `null`) from the file — the answer lives only in this conversation until you write it back:

  ```bash
  node scripts/detect_current_mule_version.mjs . --user-version <v>
  ```

  This rewrites `tmp/current-mule-version.json` with `version: <v>`, `source: "user-supplied"`, and sets `belowFloor: true` if `<v>` is below the floor (4.3) — treat that as the stop below.

**Floor also applies to a user-supplied version.** The `--user-version` re-run applies the floor for you (`belowFloor: true`) — if it flags below-floor, the app is out of scope: **stop** and tell the user to move the app to at least Mule 4.3 first.

Detection source (implemented by the script): the `app.runtime` property — checked in the child `pom.xml`, then the parent `pom.xml` — resolving `${...}` against the merged child+parent properties. This is the only source used for the MRT version. An unresolvable reference falls through to the prompt rather than being accepted literally.

### 2b. Current Java version

Run the detection script (do not read `mule-artifact.json` inline — the script reads `javaSpecificationVersions`):

```bash
node scripts/detect_current_java_version.mjs .
```

It writes the result to `tmp/current-java-version.json`. Read fields from the file with `jq` (e.g. `jq -r '.version' tmp/current-java-version.json`) and branch on it:

- **`belowFloor: true`** → the detected `version` is below the minimum supported Java (`minSupportedVersion`, currently 8). This app is **out of scope** — **stop** and tell the user to upgrade the app to at least Java 8 before running this skill (see `warnings`).
- **`version` set, `needsUserPrompt: false`** → use `version` as the current Java version. Continue.
- **`needsUserPrompt: true`** → inspect `warnings` / `supportedVersions`, and ask via `AskUserQuestion` (header `Current Java version`) — never free-text:
  - `supportedVersions` has multiple entries → `mule-artifact.json` declares support for several Java versions; ask *"Your app declares support for multiple Java versions. Which one does it currently run on?"* with **one option per entry in `supportedVersions`** (e.g. **8**, **17**).
  - otherwise (`javaSpecificationVersions` absent/empty, or no `mule-artifact.json`) → ask *"I couldn't detect your app's current Java version. Which one does it run on today?"* Derive the options from the current runtime's `compatibleJDKs` in `anypoint-cli-v4 dx mule runtime list --output json` (Mule version from Step 2a) — never a hardcoded set. The one runtime not in the list is the EOL floor **4.3.x** → offer Java **8**/**11**. If the user cannot provide it, **stop**.

  Then **persist the answer** by re-running the script with `--user-version` so downstream steps read a real value (not `null`) from the file — the answer lives only in this conversation until you write it back:

  ```bash
  node scripts/detect_current_java_version.mjs . --user-version <n>
  ```

  This rewrites `tmp/current-java-version.json` with `version: <n>`, `source: "user-supplied"`, and sets `belowFloor: true` if `<n>` is below the floor (8) — treat that as the stop below.

**Floor also applies to a user-supplied version.** The `--user-version` re-run applies the floor for you (`belowFloor: true`) — if it flags below-floor, the app is out of scope: **stop** and tell the user to move the app to at least Java 8 first.

Detection source (implemented by the script): `mule-artifact.json` `javaSpecificationVersions` — one entry → use it; multiple → prompt which one; absent/empty (or no `mule-artifact.json`) → prompt the user. This is the only source used for the Java version; `pom.xml` compiler settings are not used as a fallback (they are the compile target, not the deployed runtime Java). Values are normalized (`1.8` → `8`).

---

## Step 3: Build Baseline

Establish that the app builds **on its current versions** before changing anything. A green baseline is the reference point every later step is measured against — if the app doesn't build now, upgrade findings are meaningless.

### 3a. Confirm current versions (detected values only)

Read `tmp/current-mule-version.json` and `tmp/current-java-version.json` from Step 2. For each value that was **auto-detected** (`needsUserPrompt: false`), confirm it with the user before building — **never as a free-text yes/no.** Use `AskUserQuestion` so the user picks from concrete options rather than typing a reply:

> **AskUserQuestion** — header `Current versions`, question *"I detected your app's current versions as Mule Runtime **{muleVersion}** and Java **{javaVersion}**. Is that correct so I can build the baseline?"*
> Options (include only those that apply — see the conditional rules below):
> - **Yes, both correct** — proceed to the baseline build with the detected values.
> - **Correct the Mule version** — the detected runtime is wrong; I'll ask which version to use.
> - **Correct the Java version** — the detected Java is wrong; I'll ask which version to use.
> - **Correct both** — both detected values are wrong; I'll ask for the Mule version, then the Java version.
>
> Which options to present, by how many values were auto-detected in Step 2:
> - **Both auto-detected** → offer all four: *Yes, both correct* / *Correct the Mule version* / *Correct the Java version* / *Correct both*.
> - **Only one auto-detected** (the other was user-supplied in Step 2, so it is already confirmed — do not re-ask it) → phrase the question about the single detected value and offer just two options: *Yes, correct* and *Correct the {detected} version*. Omit the other "Correct …" options and *Correct both*.
> - **Both user-supplied** → skip 3a entirely.
>
> When the user picks any "Correct …" option (including *Correct both* — handle each value in turn), ask for the specific version — itself via `AskUserQuestion` when the candidate set is known (e.g. offer the Java majors from `supportedVersions`) — then apply each correction via the matching `--user-version` re-run below.

- Confirm **only** detected values. A value the user already supplied in Step 2 (via a prompt) is already confirmed — **do not re-ask it.** If both came from the user, skip 3a entirely.
- If the user corrects a value, use the corrected value from here on, and persist it the same way as Step 2 so Step 4 reads the corrected value (each re-run re-applies the floor, flagging `belowFloor` if below it):
  - corrected **Mule** → `node scripts/detect_current_mule_version.mjs . --user-version <v>`
  - corrected **Java** → `node scripts/detect_current_java_version.mjs . --user-version <n>`

The **confirmed current Java major** that comes out of this step — the `version` field from `tmp/current-java-version.json` (when 2b auto-detected), or the value the user supplied/corrected — is `<current-java-major>` below. Use that same value in both 3b and 3c; do not fall back to the raw detected value if it was corrected here.

### 3b. Ensure the current Java JDK is available

The baseline must build on the app's **current** Java, which may differ from whatever `$JAVA_HOME` currently points at. Run the helper with the **confirmed current Java major** from Step 3a (`<current-java-major>`):

```bash
node scripts/resolve_jdk.mjs <current-java-major> .
```

It writes `tmp/resolve-jdk-<major>.json`. Read it and branch:

- **`available: true`** → use `javaHome` for the build. It may have come from an already-installed JDK under the Anypoint Code Builder java dir, or a fresh download (`source` / `downloaded` say which).
- **`errors[]` non-empty (exit 1)** → STOP and surface the errors. Common cause: no JDK of that major installed and no build string resolvable (CLI/DX plugin missing or not authenticated).

This is the same helper Phase 2 uses for the target Java — run it once per Java version needed.

### 3c. Build

**First, make the baseline buildable on a modern Maven.** The baseline builds on the app's **current** `mule-maven-plugin` (MMP) — whatever version the app declares (detected below, not assumed). MMP 3.x was built against Maven 3.8's Eclipse Aether; Maven 3.9 replaced it with Maven Resolver, so a 3.x plugin crashes on Maven 3.9.x with a cryptic `NoClassDefFoundError: org/eclipse/aether/connector/basic/BasicRepositoryConnectorFactory` at packaging time. The toolchain requires **Maven 3.9.x** (already gated in Step 1 — MMP 4.x and MUnit need it); we do **not** ask users to downgrade to EOL Maven 3.8. Instead, if the current MMP can't run on 3.9.x, bump it to the latest 4.x **for the baseline build only**.

**Determine whether the current MMP needs a bump for the baseline:**

```bash
node scripts/detect_current_mmp_version.mjs .
```

Read `tmp/current-mmp.json`. If `needsPluginBump: false` (current MMP is already **4.x**) → go straight to the build. If `needsPluginBump: true` (current MMP is **3.x** and would crash on Maven 3.9.x) → establish the baseline on the latest 4.x MMP.

**Resolve the latest MMP live from Maven metadata** (`<release>` element — authoritative "latest published"; never hardcode a version). Cache it to `tmp/latest-mmp.txt` so Step 11a reuses this value instead of re-fetching the same metadata:

```bash
MMP=$(curl -s "https://repository.mulesoft.org/nexus/content/repositories/releases/org/mule/tools/maven/mule-maven-plugin/maven-metadata.xml" \
  | grep -oE '<release>[^<]+</release>' | sed -E 's/<\/?release>//g')
echo "$MMP" > tmp/latest-mmp.txt
echo "latest MMP: $MMP"   # this is <latest-4.x> below
```

Then apply it for the baseline build only. Two cases, by how the pom pins the plugin version:

- **Case A — version is a property** (e.g. `<version>${mule.maven.plugin.version}</version>`): override on the command line, **no file change**:
  ```bash
  JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<major>.json) \
    mvn clean package -Dmule.maven.plugin.version="$MMP"
  ```
- **Case B — version is a literal** (e.g. `<version>3.5.4</version>`): a `-D` flag cannot override a hardcoded plugin version, so the pom must be edited. **Do not hand-edit with `Edit`/`sed`** — tab-indented poms and multiple `mule-maven-plugin` blocks (build/plugins + pluginManagement) make that error-prone. Use the deterministic writer, which rewrites only the `<version>` inside the matched plugin block(s), whitespace-agnostic:
  ```bash
  cp pom.xml tmp/pom.baseline.bak
  node scripts/set_plugin_version.mjs mule-maven-plugin "$MMP" . --group-id org.mule.tools.maven
  JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<major>.json) mvn clean package
  cp tmp/pom.baseline.bak pom.xml   # ALWAYS revert — on success AND failure. The real bump happens in Phase 2 after approval.
  ```
  Log clearly: *"current MMP <old> can't run on Maven 3.9.x; building baseline on $MMP (not persisted — reverted after build)."*

For a 4.x MMP with no bump needed, just run the build with the resolved `JAVA_HOME` (one `mvn` invocation, nothing else in the response):

```bash
JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<major>.json) mvn clean package
```

Branch on the result:

- **`BUILD SUCCESS`** → baseline established (Case B: confirm the pom was reverted). Continue to Step 4.
- **Build fails** → STOP. In Case B, **revert the pom first**, then surface the failure. Inform the user the app must build cleanly on its current versions (with a compatible toolchain) before an upgrade can proceed. Do not attempt upgrade edits to fix a pre-existing baseline failure.

---

## Step 3.5: Flow-XML Hygiene Scan (Phase-1 gate — every flow file)

**Why this step exists.** `mule-maven-plugin` 3.x `process-classes` is a no-op — it never parses flow XML at build time. 4.9+ `process-classes` builds a Mule Runtime AST and namespace-aware SAX-parses **every** flow file, so it rejects any prefixed element/attribute (`doc:name`, `<ee:transform>`, `db:config`, …) whose prefix is **not** declared on an in-scope ancestor with `The prefix "<p>" ... is not bound`. This defect ships fine on 4.3 and is latent until the upgrade — the upgrade is simply the first toolchain that reads the XML. Because the baseline build (Step 3c) runs on the app's **current** (pre-4.9) runtime, it does **not** catch this. It must be found here, at plan time, on **every** flow file — not just the ones later steps happen to edit. (Step 15.1's per-file gate only fires on edited files; a latent prefix in an untouched file would otherwise reach Step 16's `mvn` and fail. This step is what closes that hole.)

Scan every flow file. `xmllint --noout` reports an unbound prefix as a *warning* and still **exits 0**, so an exit-code check is not a gate — grep its stderr instead. This parses real XML, so it does **not** false-positive on DataWeave tokens (`accountId:`), error-type values (`VALIDATION:INVALID_VALUE`), or other `word:` text the way a raw prefix regex does:

```bash
hygiene_fail=0
for file in $(find src/main/mule -name '*.xml'); do
  errs="$(xmllint --noout "$file" 2>&1)"
  if printf '%s' "$errs" | grep -qE 'namespace error|not defined|not bound'; then
    echo "⚠️  $file — unbound namespace prefix (latent; fails on Mule 4.9+):"
    printf '%s\n' "$errs" | grep -E 'namespace error|not defined|not bound'
    hygiene_fail=1
  fi
done
[ "$hygiene_fail" = 1 ] && echo "→ record every file above in the plan's §Flow-XML hygiene section"
```

- **Clean (nothing printed)** → no latent unbound prefixes; continue to Step 4.
- **One or more files flagged** → do **not** stop, and do **not** edit anything here (Phase 1 writes nothing to project files). Record **each** affected file and its offending prefix so Step 12's plan enumerates the fix. The error text names the prefix; the fix is to add that prefix's `xmlns:<prefix>="<namespace-uri>"` binding to the root `<mule>` of **that** file (look the URI up from a working flow file or the connector's Mode-A `.namespace`). The frequently-seen instance is `doc:name` without `xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"`. **Never** delete the prefixed attribute/element to silence the error — it is metadata/functionality, not noise.

Every file flagged here MUST appear in the plan (Step 12) under a **§Flow-XML hygiene** section as an explicit per-file edit (`add xmlns:<prefix>="<uri>" to root <mule>`), **including files no other plan section touches** — that is the whole point of scanning up front. Step 15 then applies those additions, and Step 15.1's per-file gate re-verifies them.

---

## Step 4: Determine Target Versions

Determine the upgrade target from the confirmed current versions and the **live** runtime list. Never hardcode versions or channels — the script derives everything from `anypoint-cli-v4 dx mule runtime list`.

Run the resolver. It reads the current versions from Step 2's `tmp/` files (or accepts `CURRENT_MULE` / `CURRENT_JAVA` overrides), and — **only if the user has already named a specific target** — validates it when you pass `TARGET_MULE` (and optionally `TARGET_JAVA`):

```bash
# User has NOT named a target yet — just compute the recommendation:
node scripts/resolve_target_versions.mjs .

# User explicitly asked for a specific target (e.g. "move me to 4.11"):
TARGET_MULE=4.11 node scripts/resolve_target_versions.mjs .
```

**A target is a Mule version.** `TARGET_MULE` is what defines a requested target — only pass it when the user named a specific Mule runtime. Do **not** set `TARGET_MULE` to the current version to express "keep Mule"; that would be read as a downgrade/no-op and refused.

A **bare Java mention** ("upgrade my app to Java 17/11/8/21") is not a separate target — the recommendation always moves Java to the latest non-EOL Java as part of the Mule upgrade. Pass the Java they named via `TARGET_JAVA` alone (no `TARGET_MULE`) so the script can check it against what the recommended runtime supports:

```bash
# User mentioned only a Java version (e.g. "upgrade to Java 17"):
TARGET_JAVA=17 node scripts/resolve_target_versions.mjs .
```

Then always present `options[0]` (the Mule + Java path), and read `requestedJavaOnly`:
- **`requestedJavaOnly: null`** → the Java they named is the one we recommend (or they named none). Just present the recommendation; no extra message.
- **`requestedJavaOnly` set** → the named Java is EOL (8/11) or unsupported by the recommended runtime (e.g. 21). Present the recommendation **and** surface `requestedJavaOnly.note` verbatim — it states their Java isn't a supported target and names the Java we do support.

It writes `tmp/target-versions.json`. Read fields with `jq` and branch:

- **`needsUserPrompt: true`** → the script could not settle on a target (no current versions, or the runtime list could not be fetched). Inspect `warnings`: a fetch failure means the CLI is not authenticated (`anypoint-cli-v4 conf`) or offline — surface it and re-run. Do not invent versions.
- **`nothingToUpgrade: true`** → the app is already on the latest runtime in its channel at the latest patch, on the latest non-EOL Java. Tell the user there is nothing to upgrade and **stop** — do not proceed to Phase 2.
- **`options[]` non-empty** → this is the **recommended** target (always in-channel: highest minor in the current channel, latest patch, latest non-EOL Java). There is exactly one entry today. Present it as the recommendation.

### 4a. Present the recommendation and get the user's target

The recommendation in `options[0]` is what you propose by default. **Always recommend staying in-channel**, regardless of what the user later chooses. Show it to the user:

> Recommended upgrade: **Mule {options[0].mule}, Java {options[0].java}** ({kind}). {options[0].note, if present}

Then ask whether they want the recommended target or a different one (Java + Mule vs. a specific Mule version). Use `AskUserQuestion` when the choice is not already clear from their original request.

### 4b. If the user names a specific target, validate it

When the user asks for a target other than the recommendation, re-run the script with `TARGET_MULE` (and `TARGET_JAVA` if they named a Java). Read `requestedTarget` from the output and branch on it:

- **`accepted: false`** → the target violates the locked policy. Surface `requestedTarget.reason` verbatim and re-offer the recommendation. Do **not** hand-edit around the refusal. `reasonCode` is one of:
  - `downgrade` — target is not strictly higher than current (this skill only upgrades).
  - `eol-java` — target keeps/selects EOL Java (8/11); the skill exists to move apps off EOL Java.
  - `unsupported-combo` — the target Mule does not support the requested Java.
  - `unknown-version` — the requested Mule is not in the runtime list.
- **`accepted: true` and `crossChannel: false`** → in-channel target (including a valid intermediate like 4.4→4.6, or 4.4→latest-LTS). Present **both** the recommendation and their validated target via `AskUserQuestion` (not free-text) and let the user pick — unless their request already equals `options[0]` (same Mule + Java), in which case there is no choice to make and you proceed directly:

  > **AskUserQuestion** — header `Upgrade target`, question *"Which target do you want to upgrade to?"*
  > Options:
  > - **Recommended: Mule {options[0].mule}, Java {options[0].java}** — the latest in-channel runtime.
  > - **Your requested: Mule {requestedTarget.mule}, Java {requestedTarget.java}** — the validated target you asked for.

  When `requestedTarget.belowRecommended: true` (their valid target is lower than the latest in-channel runtime), surface `requestedTarget.note` verbatim in the requested option's description — it states their target isn't the latest and names the one we recommend. Proceed with whichever the user picks (`requestedTarget.mule` / `requestedTarget.java` if they keep their choice, else `options[0]`).
- **`accepted: true` and `crossChannel: true`** → the target switches support channels (LTS↔Edge). This is **allowed, but you MUST warn first.** Surface `requestedTarget.warning` verbatim and get explicit confirmation via `AskUserQuestion` (never free-text):

  > ⚠️ {requestedTarget.warning}
  >
  > **AskUserQuestion** — header `Channel switch`, question *"This target switches support channels. How do you want to proceed?"*
  > Options:
  > - **Proceed with the channel switch** — continue to Step 5 with **Mule {requestedTarget.mule}, Java {requestedTarget.java}** (cross-channel).
  > - **Stay on the recommended target** — fall back to the in-channel recommendation **Mule {options[0].mule}, Java {options[0].java}**.

  Only continue to Step 5 with the cross-channel target once the user picks "Proceed with the channel switch." If they pick the recommended target, fall back to the in-channel recommendation.

### 4c. Lock the target

The values you carry into Step 5 and Phase 2 are: **target Mule** and **target Java** — either `options[0]` (recommendation accepted) or `requestedTarget` (a validated, user-confirmed target). Note whether Java changes (`javaChanged`) and whether the parent POM will need touching later. Do not proceed until the user has confirmed a single concrete target.

---

## Step 5: Extract Connectors and Check Current Java Compatibility

Identify every connector the app depends on, then report — for the version each one is **currently** pinned to — which Java versions Exchange says it supports. This is what the user sees in the plan: the connectors in use and where each stands on Java today. Resolving the *target*-compatible version is a later step (Step 6).

### 5a. Extract connectors from the POM

Run the extractor. It parses the child `pom.xml` and its full local ancestor chain (parent, grandparent, …) and collects every `<dependency>` carrying `<classifier>mule-plugin</classifier>` that is **not** `<scope>test</scope>`. It captures public and custom connectors identically (the classifier is publisher-agnostic) and, for the same `groupId:artifactId` declared at more than one level, keeps the **nearest** declaration (child over parent over grandparent — Maven's "nearest wins").

```bash
node scripts/extract_connectors.mjs .
```

It writes `tmp/connectors.json`. Read it and branch:

- **`connectors[]`** → the connectors to check. Each has `groupId`, `artifactId`, `version`, `versionResolved`, `resolvedFrom` (`"child"` | `"parent"` | `"ancestor"` for grandparent+), and — when the version is owned by an ancestor (inline in an ancestor's `<dependencies>` or via any `<dependencyManagement>`) — `versionManagedIn` (the ancestor POM path that owns the version). Step 12 surfaces this as the plan's **Owned by** column, and Steps 14/18 consume it: a non-child owner routes the bump to `apply_parent_pom_fork.mjs` — Step 14 (`--phase=edit`) writes the new versions into that ancestor in place, and Step 18 (`--phase=fork`) bumps the ancestor's own `<version>` + repoints the child, instead of editing the child. `version` is `null` **only** when it cannot be resolved from any local POM (see below); Step 5b treats an unresolved version as a block.
- **`excluded[]`** → test-scoped mule-plugins (MUnit tooling). Not application connectors; their versions are handled later with the other build plugins, not via Exchange. Do not check them here.
- **`customLibraries[]`** → the app's non-connector, non-test/provided, non-platform jars (a shared error-handler lib, a util jar, a direct third-party dependency). The skill does **not** upgrade these (no Exchange target exists), but they may have been compiled against the old Java/runtime. Carry them to Step 12: they populate the plan's **Custom / non-connector libraries** section and trigger the proactive operator-confirmation prompt (Step 12.4). Do not attempt to resolve or bump them here.
- **`needsUserPrompt: true`** → no connectors found, or the child POM was missing. Inspect `warnings[]` and confirm with the user before continuing.

**How versions are resolved** (build-free static parse of the local POM chain — no Maven, no network):

- inline `<version>`;
- a `${property}` from any local POM's `<properties>` — single (`${http.version}`), nested/chained (`${a}` → `${b}` → `1.7.3`), or composite (`${major}.${minor}.${patch}`, `1.7.${patch}`), with descendant properties overriding ancestors';
- a version-less `<dependency>` whose version is managed in a local `<dependencyManagement>` — the declaring POM's own, or any ancestor's up the chain;
- a connector declared on an ancestor's `<dependencies>` and inherited by the child.

`version` stays `null` **only** when the value is not available in any local POM: a parent that is not on the filesystem (remote / `~/.m2`), an imported BOM (`<scope>import</scope>`), a `<profiles>` block, or a `${...}` that is unknown or forms a reference cycle. These are the cases that genuinely require Maven's effective model — and they are also cases the version cannot be edited locally — so they are reported as unresolved rather than guessed. A declared-but-missing parent is already a hard stop at Step 1, so it should not reach here; if the extractor still warns about it, stop and ask for the parent POM.

### 5b. Check current-version Java compatibility in Exchange

Run the compatibility check. For each connector it calls `anypoint-cli-v4 exchange asset describe <groupId>/<assetId>/<version>` (an exact lookup — not the fuzzy `asset list`), retrying a few times so a transient network/auth blip is not mistaken for a genuine miss, and reads the `is-java-*-supported` tags.

```bash
node scripts/check_connector_java_compat.mjs .
```

It writes `tmp/connector-java-compat.json` and **exits 1 when `stop: true`**. Read it and branch:

- **`stop: false` (exit 0)** → every connector was resolved locally **and** verified on Exchange. This is the go-ahead. Confirm it to the user with a short success line before continuing, e.g.:

  > ✅ Resolved and verified all {N} connector(s) on Exchange. Current Java support: http 1.7.3 → 8, 11, 17; db 1.13.5 → 8, 11; …

  Then read `connectors[].supportedJava` for each — the Java majors the current version declares support for (e.g. `[8, 11, 17]`). An empty `supportedJava` on a non-blocked connector means the tags are present but all `false`; surface the matching `warnings[]` entry (no supported Java version found for that version). With no blockers, **proceed to Step 6.**

  - **`currentVersionDelisted: true`** (surfaced as a `warnings[]` entry) → the app's current pinned version is delisted from Exchange (its Java compatibility tags are unreadable), but the connector itself is still available on Exchange. Not a block. **Warn the user clearly** that this connector's current version is delisted from Exchange, so its current Java compatibility could not be verified — then continue (the target version is verified normally).

  **Report the current facts only — do not draw target conclusions here.** State what each current version supports today and stop there. Do **not** compare against the target Java/Mule, do **not** say a connector "will need a bump" or "only supports 8/11 so it needs upgrading for 17", and do **not** name any target version. Whether a bump is needed, and to which version, is decided **only** by Step 6 (`resolve_target_connectors.mjs`), which fetches the latest version of each connector that supports **both** the target Java and the target Mule Runtime. Anticipating that in Step 5b pre-empts the script and risks a wrong guess.
  - ✅ Allowed: "db 1.13.5 currently supports Java 8, 11."
  - ❌ Not allowed: "db, file, and sockets support only 8/11 — these will need version bumps for Java 17."
- **`stop: true` / `blocked[]` non-empty (exit 1)** → one or more connectors **could not be verified**, and the upgrade **cannot proceed**. Each blocked connector carries a `blockReason`:
  - **Not found in Exchange** (describe failed **and** an exact-GA `asset list` probe found no matching asset) — the connector is genuinely not on Exchange: missing, different published coordinates, a custom connector belonging to another org, or an auth failure. The raw CLI error is included so a genuine miss can be told apart from an authentication problem (`anypoint-cli-v4 conf`). This is different from `currentVersionDelisted` above (asset exists, only the old version is gone).
  - **No Java compatibility information** — describe succeeded but the asset carries no `is-java-*-supported` tags, so nothing can be said about Java support.
  - **Version not resolvable** — the connector's version is inherited/unresolved (see Step 5a), so no Exchange coordinate could be formed.

  For a genuinely-absent connector (not on Exchange at all), we can't resolve a target or verify compatibility. **Ask the user** whether to proceed anyway (keep it at its current pin, compatibility unknown) or stop. For the other block reasons, surface them and stop. Do not continue to Step 6 or Phase 2 until resolved.

---

## Step 6: Resolve Target-Compatible Connector Versions

Step 5 reported where each connector stands on Java *today*. This step picks the version each connector will move **to**: the latest published version that runs on the **target** Mule Runtime and Java (from Step 4). This is what the plan proposes as the new pin for every connector.

Run the resolver. It reads the connectors from Step 5a and the target from Step 4.

```bash
node scripts/resolve_target_connectors.mjs .
```

The target defaults to `tmp/target-versions.json` `options[0]` (the recommended target). To resolve against a different target — e.g. a user-confirmed `requestedTarget` from Step 4 — pass that confirmed pair explicitly (use the values from `tmp/target-versions.json`; never invent them):

```bash
TARGET_MULE=<confirmed-mule> TARGET_JAVA=<confirmed-java> node scripts/resolve_target_connectors.mjs .
```

**How it selects (one Exchange call per connector).** A single `exchange asset describe <groupId>/<assetId>/<currentVersion>` returns a `.versions[]` array listing *every* sibling version, each already carrying its own `min-mule-version` and `is-java-<major>-supported` tags. So the whole version history is filtered locally from one describe — no paging of the fuzzy `asset list`, no per-version calls. Among all versions it keeps those where **both** hold:

- `is-java-<targetJava>-supported == "true"` — the version supports the target Java, **and**
- `min-mule-version <= targetMule` — the version's runtime floor fits the target Mule (a version with no `min-mule-version` tag does **not** qualify).

It then picks the **highest** qualifying version by semver ("latest that fits target"). This **always** moves each connector to the latest target-compatible version — even a connector whose current pin already runs on the target is bumped to the newest version that fits. A connector stays put only when its current version already **is** that latest target-compatible version (nothing higher to move to), not merely because it happens to be compatible.

It writes `tmp/target-connectors.json` and **exits 1 when `stop: true`**. Read it and branch:

- **`stop: false` (exit 0)** → every connector has a target-compatible version. Present the moves to the user: each `connectors[]` entry has `currentVersion` → `targetVersion`, `changed` (false only when the current version is already the latest target-compatible one — not merely compatible), `minMuleVersion`, and `supportedJava[]`. This is the connector portion of the upgrade plan. Proceed to Step 7.
- **`stop: true` / `blocked[]` non-empty (exit 1)** → one or more connectors have **no** published version that supports the target runtime. The upgrade **cannot proceed** to that target. Each blocked connector carries a `blockReason` (e.g. *No published version supports the target runtime (Mule X, Java Y)*). Surface the blocked connectors to the user and stop. Their options are to pick a different target (re-run Step 4 → Step 6) or wait for the connector to publish a compatible version — do not continue to Phase 2 with an unresolvable connector.

---

## Step 6.5: Stage the downstream data-contracts (bridge)

Steps 7–20 and the Phase-2 mutation scripts do **not** re-read Steps 1–6's individual `tmp/*.json` files. They read two consolidated contracts that this step writes from the outputs you already have. It is the seam between the version-resolution half (Steps 1–6) and the impact-analysis + execute half (Steps 7–20). Assemble both with a `Write` (or a `jq` construction), **not a new script** — no CLI, no network here.

**Why a remap is needed.** Steps 5–6 key each connector by a nickname derived from its **artifact slug** (`mule-amazon-s3-connector` → `amazon-s3`, `mule-objectstore-connector` → `objectstore`). Steps 7/14 key on the **XSD prefix** the flow XML actually binds (`xmlns:s3=…` → `s3`, `xmlns:os=…` → `os`, `xmlns:sfdc=…` → `sfdc`). The Step-7 join between usage (`connector-usage/<prefix>.json`) and metadata/choices (`…/<nick>-new.json`) is an exact string match — so the choices/targets files this step writes **must** be keyed by the XSD prefix, not the slug. Read the bindings from `src/main/mule/**/*.xml` (`grep -ho 'xmlns:[a-zA-Z0-9_-]*=' src/main/mule/*.xml`), and for each connector in `tmp/target-connectors.json` map its `groupId:artifactId` to the prefix whose namespace URI matches that connector (agent judgment — the same mapping the old Step 4.5 used to assign nicks).

**Used vs pom-only — classification falls out of that same xmlns read:**
- **Used** (the connector has an `xmlns:<prefix>` binding somewhere under `src/main/mule/`) → key it by that **prefix**. It gets the full Step 7 (Mode-A + usage + Mode-B/C).
- **pom-only** (no binding anywhere) → key it by its **slug** nick. It gets a choices file only — **no metadata, no describe.** Its version still gets bumped in Phase 2; its (absent) flow XSD URLs no-op harmlessly.

### 6.5a. Per-connector choices — `tmp/connector-choices/<nick>-new.json`

For every connector in `tmp/target-connectors.json`, write one file keyed by its resolved `<nick>` (prefix for used, slug for pom-only):

```json
{ "groupId": "com.mulesoft.connectors", "assetId": "mule-amazon-s3-connector", "version": "<targetVersion>" }
```

- `groupId` / `assetId` ← the connector's `groupId` / `artifactId` from `tmp/target-connectors.json` (verbatim).
- `version` ← its `targetVersion` (the **target** pin — we describe NEW only, and Phase 2 pins to this).

`describe_connector.mjs <nick>-new` and `apply_connector_pin.mjs <nick>` both read this file. Write **no** metadata stub for pom-only connectors — `apply_connector_pin.mjs` treats `tmp/connector-metadata/<nick>-new.json` as optional and no-ops the XSD rewrite when it is absent.

### 6.5b. The upgrade-targets contract — `tmp/upgrade-targets.json`

`apply_runtime_bump.mjs` reads `.mule.to` / `.java.to`; the `.connectors[].nick` loops in Steps 7/14 iterate `.connectors[]`. Shape:

```json
{
  "mule":            { "from": "<current>", "to": "<locked target>" },
  "java":            { "from": "<current>", "to": "<locked target>" },
  "muleMavenPlugin": { "to": "<latest MMP from Step 11a>" },
  "munit":           { "to": "<latest MUnit from Step 11a>" },
  "connectors": [
    { "nick": "s3", "groupId": "com.mulesoft.connectors", "artifactId": "mule-amazon-s3-connector", "from": "5.8.4" }
  ]
}
```

Fill each field from a source you already produced — **never hardcode a version**:

- **`mule.from`** ← `jq -r '.version' tmp/current-mule-version.json` (Step 2a), or the value the user supplied/corrected in Step 3a.
- **`java.from`** ← `jq -r '.version' tmp/current-java-version.json` (Step 2b), or the Step-3a corrected value.
- **`mule.to` / `java.to`** ← the **locked target from Step 4c**. Read it from `tmp/target-versions.json`: recommendation accepted → `.options[0].mule` / `.options[0].java`; user-requested target validated and confirmed → `.requestedTarget.mule` / `.requestedTarget.java`. Use exactly the pair the user confirmed — do not re-derive.
- **`muleMavenPlugin.to`** ← the **latest MMP resolved live in Step 11a** from Maven metadata. Not known yet at this step — Step 11a writes it back into this file before Step 14. `apply_runtime_bump.mjs` reads it to bump `<mule.maven.plugin.version>`; if absent it leaves the property untouched.
- **`munit.to`** ← the **latest MUnit resolved live in Step 11a** from Maven metadata. Not known yet at this step — Step 11a writes it back into this file before Step 14. `apply_runtime_bump.mjs` reads it to bump every MUnit version site (property + plugin + `munit-runner`/`munit-tools` dependencies); if absent it leaves them untouched.
- **`connectors[]`** ← one entry per connector in `tmp/target-connectors.json`: `nick` remapped to the XSD prefix (used) or slug (pom-only), `groupId`/`artifactId` verbatim, `from` ← its `currentVersion`.

After writing, sanity-check: `jq -e '.mule.to and .java.to and (.connectors|type=="array")' tmp/upgrade-targets.json`. Every downstream step reads `mule.to`/`java.to` and iterates `.connectors[]` — if either target is null or `connectors` is missing, fix it here before proceeding to Step 7.

---

## Step 7: Check Operations/Configs/Error Types Changes

Discover, from the NEW connector versions, what changed in operations, configs, and error types — so Step 12 can synthesize a mechanical, per-symbol upgrade plan. Four describe modes feed this: 7a Mode-A summary, 7b usage enumeration (the OLD-side source of truth — a flow-XML scan, **not** a second describe), 7b Mode-B per-op, and 7b Mode-C per-config-provider. Each mode's output shape is documented inline below.

**Prerequisite: Java 17+ (before any `describe_connector.mjs` call).** Export a Java 17 `JAVA_HOME` for the shell that runs this step (see Step 13 for resolving one). The script hard-refuses to run under Java 8/11 because those JDKs return a degraded describe (empty `configs[].parameters`) that would silently miss required-attribute breaking changes. If Step 3b resolved only the current (pre-17) JDK, resolve a Java-17 JDK now with the same helper, and re-verify `$JAVA_HOME` before the Mode-B / Mode-C fan-out (a subshell or `cd` may have reset it):

```bash
node <skill-dir>/scripts/resolve_jdk.mjs 17 .
export JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-17.json)
```

**Prerequisite: a Mule ≥ 4.9 runtime registered for describe.** `describe-connector` loads the connector's bundled poms through a locally installed Mule Runtime, **independent of the app's target runtime** (the app may still target 4.6 for deploy). Runtimes older than 4.9 fail with a silent `Java exited with code 1` because the CLI plugin calls `mule-runtime-ast.ErrorTypeBuilder.builder()`, a static method that only exists in Mule 4.9+. Ensure a ≥ 4.9 runtime is on disk, then register its path with the CLI (this is a one-time global CLI-config write; the resolve script itself never sets it). Reuse the finalized target when `mule.to` ≥ 4.9, otherwise use a 4.9+ substrate:

```bash
# Pick a >=4.9 substrate: reuse mule.to when it already qualifies, else 4.9.19.
SUBSTRATE=$(jq -r 'if (.mule.to | split(".") | map(tonumber)) as $v | ($v[0] > 4 or ($v[0] == 4 and $v[1] >= 9)) then .mule.to else "4.9.19" end' tmp/upgrade-targets.json)
node <skill-dir>/scripts/resolve_runtime.mjs "$SUBSTRATE" .
anypoint-cli-v4 dx mule runtime path --set "$(jq -r .runtimePath tmp/resolve-runtime-$SUBSTRATE.json)"
```

If a describe still fails silently later, capture the hidden exception with `_JAVA_OPTIONS='-Xlog:exceptions*=info:file=/tmp/xlog.log' node <skill-dir>/scripts/describe_connector.mjs <nick>-new` then `grep NoSuchMethodError /tmp/xlog.log` — a hit on `ErrorTypeBuilder.builder()` confirms the registered path is still < 4.9.

### 7a. Mode-A summary describe (the NEW version each connector was pinned to in Step 6)

For each **used** connector nickname `<nick>` in `tmp/upgrade-targets.json` (skip pom-only — they have no flow usage to introspect):

```bash
node <skill-dir>/scripts/describe_connector.mjs <nick>-new
```

**Nickname discipline (BLOCKER).** `<nick>` MUST equal the XSD prefix the flow XML uses (`crypto`, `os`, `xml-module`, `saml`), NOT the artifact slug (`cryptography`, `objectstore`, `xml`). Step 6.5 already remapped the choices/targets files to the prefix; keep it consistent across Mode-A → Mode-B → Mode-C. `enumerate_usage.mjs` will still resolve a mismatched nick by scanning every `*-new.json` for `.namespace.prefix == <nick>`, but relying on that fallback means every downstream script has to be called with the right stem too — cheaper to keep the prefix.

Verify `tmp/connector-metadata/<nick>-new.json` exists before proceeding, and that its `.namespace` is an object with a non-empty `.prefix`. `describe_connector.mjs` refuses to persist a Mode-A file whose `.namespace` is a bare string — if the CLI describe is blocked (entitlement-gated connector) and you're hand-drafting metadata, follow the object shape `{"prefix": "...", "namespace": "...", "schemaLocation": "..."}` or the usage extractor below will exit with a jq indexing error.

`describe_connector.mjs` forwards `-Dmule.jvm.version.extension.enforcement=LOOSE` so the new connector still describes under Java 17 even when its extension model declares `supportedJavaVersions=[1.8, 11]`.

Writes `tmp/connector-metadata/<nick>-new.json` — the top-level summary. **Mode-A JSON shape:**

- `operations[]` — top-level operation names (strings)
- `sources[]` — top-level source names
- `configs[]` — each `{name, connectionProviders: [...bare strings...]}`. Providers are **bare strings** in the summary; the DSL `.elementName` is populated only in the Mode-C output (see 7b).
- `errorTypes[]` — connector-wide error-type union
- `supportedJavaVersions[]` — declared Java compatibility window

The summary does NOT carry per-op attribute lists or per-config-provider DSL element names — those come from Mode-B (per-op) and Mode-C (per-config-provider) in 7b.

**Mode-A ≠ Mode-B — do NOT grep Mode-A for attribute names.** The summary lists `.operations[].name` and `.configs[].name` only; it does NOT carry `.operations[<op>].attributes[]` or `.childElements[]`. Attribute renames, required-attribute additions, and attribute→child promotions are only visible in Mode-B (`<nick>-new-<op>.json`). Building the plan's per-op attribute diff off Mode-A will silently miss XSD-breaking changes — the build then fails at `process-classes` with `cvc-complex-type.3.2.2` errors that could have been caught at plan time. If you need an attribute, run Mode-B for that op.

**Describe is NEW-only.** Do NOT describe the OLD connector version — the OLD-side source of truth is `enumerate_usage.mjs` (flow XML scan) below, not a second describe. Pre-4.6-era connectors often fail to describe under a Java-17 JDK; the skill is designed to work without OLD describe. See `feedback_upgrade_describe_new_only`.

### 7b. Usage enumeration and per-symbol fan-out

**Usage enumeration — parser-preferred, grep-fallback.** Two interchangeable scripts write the identical `tmp/connector-usage/<nick>.json` shape:

- `enumerate_usage_xml.mjs` — parses each flow with `fast-xml-parser`. Correct on messy input: ignores commented-out elements and binds `config-ref` to the element that actually carries it. **Preferred.**
- `enumerate_usage.mjs` — zero-dependency regex/grep. Always available; the fallback.

The skill is stateless, so install the parser ephemerally, run it, and remove it. `fast-xml-parser` attaches to the nearest package root — `skills/mule-development/node_modules` (already gitignored; `--no-save` never touches `package.json`). Resolve that root to its **physical path** (`pwd -P`) so the package lands where Node's ESM resolver looks: Node walks up from the script's real path, so `--prefix` on a textual `<skill-dir>/..` can install where Node never searches, and every parser call would fall back to grep. Run enumeration for every in-scope connector like this:

```bash
SKILL_PKG="$(dirname "$(cd "<skill-dir>" && pwd -P)")"   # skills/mule-development (physical package root)
npm install --no-save --prefix "$SKILL_PKG" fast-xml-parser >/dev/null 2>&1 || true

for nick in $(jq -r '.connectors[].nick' tmp/upgrade-targets.json); do
  # Prefer the parser; rc=3 means fast-xml-parser wasn't importable → grep fallback.
  # Capture the exit code into a named var immediately (portable across bash/zsh;
  # a bare `[ $? -eq 3 ]` misfires if anything runs between the call and the test).
  node <skill-dir>/scripts/enumerate_usage_xml.mjs "$nick" .
  rc=$?
  [ "$rc" = 3 ] && node <skill-dir>/scripts/enumerate_usage.mjs "$nick" .
done
```

The ephemeral `node_modules` (fast-xml-parser's install closure) is removed in Step 19. If `npm install` is blocked (offline/locked-down), every parser call exits rc=3 and the grep fallback carries the whole step — no manual intervention needed.

**Usage JSON shape** — both scripts write the identical `tmp/connector-usage/<nick>.json`:

- `operations_used[]` — element names classified as NEW-side operations OR unknown-to-metadata
- `sources_used[]`, `configs_used[]`, `config_providers_used[]`
- `child_elements_used[]` — element names classified as known child elements of `<prefix:config>` OR unknown-to-metadata inline child elements (e.g. `content`, `objectContent`, `records`). Surfaced explicitly so grep noise isn't misread as "the flow uses this operation".
- `usage_sites[]` — per-site `{file, line, attributes_set}`. `doc:name` is filtered out.
- `errorTypes_caught[]`, `errorTypes_raised[]`
- `namespace_prefix` — the DSL prefix the flow uses (e.g. `s3` for `<s3:create-object .../>`)
- `namespace_prefix_changed` — `{from, to}` when the NEW prefix differs from what the flow uses (e.g. SFDC `sfdc` → `salesforce`), otherwise `null`

**Prefix-fallback rule.** If the NEW-metadata prefix doesn't appear as an element opener in any flow XML, the script looks for another `xmlns:<candidate>="<same namespace URI>"` binding in the flow and re-runs the grep with that candidate prefix.

**`not_in_use` skip contract.** If `enumerate_usage.mjs` returns a `not_in_use` JSON for a connector (declared in `pom.xml` but zero flow usage), skip Mode-B and Mode-C for that connector. Keep it in the plan under a `pom-only` section so Phase 2 still runs the pin script. Do NOT invent any other pre-Mode-B/C short-circuit — for every connector with real usage, run Mode-B / Mode-C unconditionally; the "no rewrites" verdict falls out of Step 12's plan synthesis when the per-symbol diffs against Mode-B / Mode-C JSONs come back empty.

**Why Mode-B exists.** The Mode-A summary returns only top-level operation names — no attribute lists, no child elements. Without per-op detail the plan would have to guess NEW-side attribute renames (e.g. `bucketName` → `bucket`) and child-vs-attribute placement (e.g. `<s3:content>` is a childElement in NEW `putObject`, not an attribute) — those guesses only surface at `mvn` time. **Mode-B output shape** — each `tmp/connector-metadata/<nick>-new-<op>.json` contains:

- `attributes[]` — every attribute the NEW operation accepts, keyed on `.attributeName` (NOT `.name`), with types, `required` flag, and `allowedValues`
- `childElements[]` — every child element the NEW operation accepts (name, prefix, required, attributes)
- `errorTypes[]` — the per-op error catalog
- `.output*` keys — populated when the op declares an output type; consumed by Step 9's DW diff

**Before invoking Mode-B**, intersect `usage.operations_used[]` with `<nick>-new.json .operations[]`:

- Op present in `.operations[]` → run Mode-B on it.
- Op **absent** from `.operations[]` → the op was renamed or removed. Pick the closest rename candidate (Levenshtein-close or same semantic role — e.g. S3 8.x: `createObject` → `putObject`, `readObject` → `getObject`) and run Mode-B on the **candidate**. Log the guessed rename in `tmp/connector-metadata/<nick>-op-renames.json` so Step 12's plan enumerates it explicitly. Never silently skip an op — the flow XML still calls it. A Mode-B call that returns non-zero or empty is itself a strong rename signal (the op likely doesn't exist under that name) — cross-check against `.operations[]` and re-run on the candidate.

**Concrete invocations — flag-based, not positional.** The bundled scripts table (top of file) lists the syntax; repeat here so a subagent doesn't have to scroll:

```bash
# Mode-B — per operation or source
node <skill-dir>/scripts/describe_connector.mjs <nick>-new --type operation --name <op>
node <skill-dir>/scripts/describe_connector.mjs <nick>-new --type source    --name <src>

# Mode-C — per config-provider (both --name and --config-name are required)
node <skill-dir>/scripts/describe_connector.mjs <nick>-new --type connection-provider --name <provider> --config-name <config>
```

Passing operation names as positional args (`describe_connector.mjs <nick>-new <op>`) is NOT supported and will trigger a "missing/partial args" exit — a real run in July 2026 burned 2–4 tool calls trial-and-erroring the flag order.

**Why Mode-C exists, and the `--name` / `--config-name` discipline (BLOCKER).** The connection element inside `<prefix:config>` (e.g. `<s3:basic-connection>`, `<jms:active-mq-connection>`) can't be derived from the summary — Mode-A reports only the provider's SDK identifier, not its DSL element name. **`--config-name` and `--name` are the connector's SDK-side identifiers, taken from Mode-A `<nick>-new.json`, NEVER from the flow XML:**

- `--config-name` ← `.configs[].name` (single lower-case word — usually literally `"config"` or `"listenerConfig"`)
- `--name` ← `.configs[].connectionProviders[]` entry (single lower-case word — e.g. `"oracle"`, `"connection"`, `"active-mq"`, `"listener"`)

Do NOT pass: the user's XML config identifier (`Warehouse_DB_Config` — those go in `config-ref` at call sites); the OLD DSL provider element name (`basic-connection`, `oracle-connection` — those are what Mode-C **returns** in `.elementName`, not what you send); or anything from `tmp/connector-usage/<nick>.json` `configs_used[]` / `config_providers_used[]` (those are populated from OLD flow XML). **Mode-C output shape** — each `tmp/connector-metadata/<nick>-new-<config>-<provider>.json` contains:

- `.elementName` — the config element name (e.g. `sfdc-config`)
- `.connectionProviders[]` — the connection providers on this config, each with `elementName` (e.g. `basic-connection`), `attributes[]`, and `childElements[]`

Use the `elementName` from this Mode-C file when writing the connection-element rewrite — do not guess from the SDK provider name, and do not read `.elementName` from Mode-A (it isn't there).

**Mandatory fan-out loop — one Mode-B per op, one Mode-C per provider, NO exceptions.** Do not "sample one op per connector" — every op / source / provider in `tmp/connector-usage/<nick>.json` MUST have its own describe file before Step 11.5. Skipping the fan-out leaves Step 12 blind on attribute renames and required-attribute additions; Step 16's retry loop then burns its whole budget guessing.

Execute the fan-out for every connector via this loop (paste verbatim — do not re-implement it inline). It is idempotent — an existing `<nick>-new-<op>.json` is skipped, so re-running after a partial run is cheap:

```bash
for usage in tmp/connector-usage/*.json; do
    nick="$(basename "$usage" .json)"
    usage_status="$(jq -r '.status // ""' "$usage")"   # NOT `status` — read-only in zsh
    [ "$usage_status" = "not_in_use" ] && continue

    modeA="tmp/connector-metadata/${nick}-new.json"
    [ -f "$modeA" ] || { echo "❌ Mode-A missing for $nick — re-run Step 7a"; exit 1; }

    # Mode-B per operation (intersect with Mode-A .operations[])
    for op in $(jq -r '.operations_used[]? // empty' "$usage"); do
        known="$(jq -r --arg n "$op" '[.operations[]? | if type == "string" then . else .name end] | index($n) // "none"' "$modeA")"
        if [ "$known" = "none" ]; then
            echo "⚠️  $nick/$op — op absent from Mode-A .operations[] (rename/removed); Step 12 must consult <nick>-op-renames.json"
            continue
        fi
        out="tmp/connector-metadata/${nick}-new-${op}.json"
        [ -f "$out" ] && continue
        node <skill-dir>/scripts/describe_connector.mjs "${nick}-new" --type operation --name "$op"
    done

    # Mode-B per source
    for src in $(jq -r '.sources_used[]? // empty' "$usage"); do
        out="tmp/connector-metadata/${nick}-new-${src}.json"
        [ -f "$out" ] && continue
        node <skill-dir>/scripts/describe_connector.mjs "${nick}-new" --type source --name "$src"
    done

    # Mode-C per (config, provider) — driven from Mode-A .configs[], per the
    # "--name / --config-name discipline" block above.
    # Do NOT drive from usage.configs_used[] / config_providers_used[]: those
    # hold flow-instance names (config-ref values like db-config-primary, and
    # camelCase child names like genericConnection) that never equal Mode-A's
    # SDK names (config, generic) — the old join matched nothing and silently
    # wrote zero Mode-C files, so Phase C never saw reparenting like db's
    # <pooling-profile> and the first mvn broke on XSD validation.
    # --config-name ← .configs[].name; --name ← .configs[].connectionProviders[]
    # entry. Configs with an empty connectionProviders[] are skipped (D7
    # fallback — Phase C reads Mode-A .configs[] directly there).
    jq -r '.configs[]? as $cfg
             | $cfg.connectionProviders[]?
             | "\($cfg.name)\t\(if type == "string" then . else (.name // .elementName) end)"' "$modeA" \
      | while IFS=$'\t' read -r cfg prov; do
        [ -z "$cfg" ] && continue
        [ -z "$prov" ] && continue
        out="tmp/connector-metadata/${nick}-new-${cfg}-${prov}.json"
        [ -f "$out" ] && continue
        node <skill-dir>/scripts/describe_connector.mjs "${nick}-new" --type connection-provider --name "$prov" --config-name "$cfg"
    done
done
```

**Post-condition (self-check) — must pass before Step 7 declares "done".** Do not defer this to Step 11.5:

```bash
node <skill-dir>/scripts/verify_metadata_coverage.mjs || { echo "❌ Mode-B/C fan-out incomplete — re-run the loop above until coverage passes"; exit 1; }
```

If `verify_metadata_coverage.mjs` prints FAIL rows, re-run the fan-out loop for just those `(nick, op)` / `(nick, cfg, prov)` pairs. The loop is idempotent — it only re-invokes describe when the target file is missing.

**After Mode-B / Mode-C complete**, run these mandatory diffs (they feed Step 12's Phase-C completeness checklist):

- Mode-B `.attributes[].attributeName` (NOT `.name`) vs `usage.usage_sites[].attributes_set` keys → attribute renames
- `usage.errorTypes_caught[]` vs Mode-B `.errorTypes[]` ∪ Mode-A `.errorTypes[]` → error-type renames (**mandatory**, not opportunistic — deferring these to build-time self-correction consumes retry budget)
- **Mode-C `.connectionProviders[].elementName` (the whole set for the connector) vs the OLD flow's `<prefix:config>` connection-element local-name → provider-element rename.** This is the provider element's OWN name changing, not its child-tree — the child-tree bullet below yields zero residue when the provider's children are unchanged, so it will NOT catch this. Test = **set membership after case-normalizing** (Mode-C `elementName` is kebab-case, `usage.config_providers_used[]` is camelCase — fold both to one form before comparing, else a connector that did NOT rename false-positives): if the OLD local-name is **absent from the union of NEW `elementName`s** for that connector, the provider was renamed → plan the `<prefix:config>` child rewrite to the surviving element. A missed provider rename is a guaranteed `process-classes` XSD failure.
- Mode-C child-tree diff — **recursive**, at BOTH scopes:
  - `.childElements[]` (config-level, walked recursively into every nested `.childElements[]` / `.containedElements[]`) vs OLD flow config-child tree
  - `.connectionProviders[].childElements[]` (provider-level, walked recursively) vs OLD flow provider-child tree
  Catches reparenting between config ↔ provider (e.g. `mule-db-connector` 1.16.x moves `<db:pooling-profile>` from `<db:config>` child to `<db:oracle-connection>` child) AND catches nested-structure diffs like `<vm:queues><vm:queue …/></vm:queues>` where the whole subtree lives under a config-level child, not a provider. Do not stop at the top-level names — a rename or restructure two levels deep will be missed.

Every diff residue MUST appear in Step 12's plan (`tmp/upgrade-plan.md`) as an explicit per-symbol edit.

- Describe connector operations for version changes
- Identify changes to operations, configs, error types
- Flag impacts on flows and configuration components

---

## Step 8: Check Custom Java Compatibility

**No scripts, and nothing deterministic here.** Unlike the connector steps (Mode-A/B/C metadata → mechanical per-symbol rewrites) or even DataWeave (Step 9's fixed pattern catalog), custom Java in a Mule app has **no machine-readable contract and no canonical fix**. There is no describe, no XSD, no `tmp/*.json` to diff against. The agent reads the app's own Java **source** directly at plan-synthesis time (Step 12) with the `Read` tool and reasons about each site using its own knowledge of the Java migration. The bar for this step is **functional correctness**: an upgraded app that invokes custom Java classes must still compile *and* behave the same at runtime — not merely produce a green `mvn package`.

**Run this step only when the upgrade crosses a Java version boundary — the one deterministic gate here.** Compare `currentJava` (`tmp/current-java-version.json` `.version`) with `targetJava` (the confirmed target from Step 4). If `targetJava == currentJava` (e.g. a Mule-runtime-only bump that keeps the app on the same Java), **no Java version boundary is crossed, so no version-introduced breaking changes are possible** — record "skipped — Java unchanged (`<currentJava>` → `<targetJava>`)" for the plan and move on. Only when `targetJava > currentJava` do the FIX/FLAG analysis below. (This skill never downgrades.)

**Flag only what actually changes between `currentJava` and `targetJava`.** Each breakage below is anchored to the Java version that introduced it — flag a hit only when that version falls **inside the source→target span**. This self-gates for any span without a hardcoded ceiling: an 8→17 move crosses the Java 11 removals *and* the 16/17 encapsulation; an 11→17 move only the latter; and a change introduced *above* `targetJava` (e.g. the UTF-8-default flip at Java 18) is out of span and must not be flagged. Don't chase generic "behavior might drift" concerns that aren't tied to a concrete removed/encapsulated/deprecated API at a known version.

**Why a green build is not enough here.** Only the source-compile surfaces (below) are caught by `mvn`. The majority of custom-Java breakage — reflection blocked by module encapsulation, a Spring bean that fails to instantiate, a serialization graph that no longer round-trips, a security provider that was removed — surfaces **only at deploy/runtime**, which a `-DskipTests` build never exercises. So this step splits into two dispositions:

- **Fix** — surfaces the agent can read and rewrite. Propose the concrete edit in the plan.
- **Flag** — runtime-only surfaces the skill can neither verify nor safely auto-edit. Record them as operator-attention items so the user knows, at the approval gate, that build-success does not prove these are safe.

**Scope — the app's own source and flow touchpoints, never opaque jars.** The opaque `customLibraries[]` jars from Step 5 are pre-compiled binaries the skill can't read or fix; they already have their own operator-confirmation path (Step 5a → plan §Custom / non-connector libraries → Step 12.4). Do **not** re-examine or make compatibility claims about them here.

First, find what exists. If there is no custom Java source and no `<java:*>` / `java!` / `<spring:bean>` usage, this step is a no-op — record "none — no custom Java in app" for the plan and continue:

```bash
find src/main/java src/test/java -name '*.java' 2>/dev/null
grep -rlE '<java:(invoke|new|invoke-static)|java!|<spring:bean' src/main/mule src/main/resources 2>/dev/null
```

### 8a. FIX surfaces — read the source and propose edits

Read every `.java` under `src/main/java/**` and `src/test/java/**` (test Java breaks the Step 17 MUnit run just as surely as main Java breaks the Step 16 build), plus the classes reached from flows via `<java:invoke>` / `<java:new>` / `<java:invoke-static>` and from DataWeave `java!` callouts into app classes. The three that actually bite a Mule app — each flagged only if its version falls inside the `currentJava`→`targetJava` span:

1. **Removed JDK / Java EE modules (JEP 320, gone in Java 11)** — `import javax.xml.bind.*` (JAXB), `javax.xml.ws.*`/`javax.jws.*` (JAX-WS), `javax.activation.*`, `javax.annotation.*`, `javax.xml.soap.*`, `javax.transaction.*`, CORBA (`org.omg.*`). Compiles on 8, fails on 11+ with `package … does not exist`. Fix = add the standalone `jakarta.*` dependency (or migrate the namespace). **Record the exact coordinate in the plan — the dependency add is a Step 15.4 edit.**
2. **Restricted JDK internals (JEP 396/403, encapsulated in Java 16/17)** — `sun.*`, `com.sun.*` internal, `jdk.internal.*` (`sun.misc.Unsafe`, `BASE64Encoder`, `sun.security.*`). May compile but throw `InaccessibleObjectException` at runtime. Prefer the public replacement (`BASE64Encoder` → `java.util.Base64`, `Unsafe` → `VarHandle`); only when none exists, record the `--add-opens`/`--add-exports` (runtime config, not `pom.xml`).
3. **Locale default (JEP 252, Java 9+)** — `SimpleDateFormat` / `DateTimeFormatter` / `NumberFormat` **without an explicit `Locale`** picks up CLDR data; month/day names and separators drift. Pin the `Locale`. (The related UTF-8-default flip, JEP 400, lands at Java 18 — flag it only if `targetJava >= 18`.)
4. **Removed / deprecated-for-removal methods** — `Class.newInstance()` → `getDeclaredConstructor().newInstance()`; boxed-primitive constructors `new Integer(…)` → `Integer.valueOf(…)`; `Thread.stop`/`Thread.destroy`, `Runtime`/`System.runFinalizersOnExit()`, and the removed `SecurityManager.check*` variants → the documented replacement. Most of these compile-warn rather than hard-fail at ≤17, so rank them below (1)/(2); still record them.

This is a **memory aid, not an allow-list** — reason about *any* API the file uses that changed between source and target Java, not only the four above. For each hit, record in Step 12's plan: **`file:line`** · **the problematic line** · **category (removed package / restricted internal / deprecated method / locale)** · **proposed fix**. Never claim "no custom-Java impact" without having read the files the `find`/`grep` above turned up.

### 8b. FLAG surfaces — runtime-only, operator must confirm

These involve custom Java but fail (if they fail) only when the app deploys or runs — a compile-clean, `-DskipTests` build will not catch them, and the skill has no way to verify them. Record each occurrence as a **Known risk / operator-attention** bullet in the plan, with the `file:line` and why it might break — do **not** auto-edit:

- **Reflection into JDK modules** — `setAccessible(true)` on `java.*` members, cross-module `Field`/`Method` access: throws `InaccessibleObjectException` at runtime on Java 16/17+ even though it compiles. Note the `--add-opens` / `--add-exports` the app would need (these belong in the app's launch/runtime config, not `pom.xml`).
- **Spring beans instantiated by class** — `<spring:bean class="…">` in `src/main/resources/**` and imported bean files: the class must load and construct on the target Java; a constructor that trips an 8a pattern fails at context startup.
- **Serializable state crossing a boundary** — objects persisted to Object Store, put on a VM queue, or replicated in a cluster: a serialization graph referencing removed `javax.*` types, or a changed `serialVersionUID`, breaks deserialization of already-persisted data after the upgrade.
- **Custom security / crypto / TLS Java** — a custom `java.security.Provider`, hardcoded algorithm/provider names, custom `KeyStore`/`TrustManager`: Java 17 removed and re-ordered providers and disabled weak algorithms; behavior can change silently.
- **Custom logging appenders** — a Java `log4j2` appender class referenced from `log4j2.xml`: compiled against the old Java, loaded at startup.

This step is **discovery only** — read and flag, but make **no edits** (Phase 1 writes nothing to project files). 8a findings become the plan's "Custom Java downstream impact" section; 8b findings fold into the plan's "Known risks / operator-attention items" section. The actual 8a source rewrites and dependency additions happen in Step 15.4; 8b items are surfaced to the operator at the Step 12.4 gate.

- Identify custom Java in the app (`src/main/java`, `src/test/java`, `<java:*>` flow calls, `java!`, Spring beans)
- Flag potential Java version incompatibilities against the target Java — fix the readable source, flag the runtime-only surfaces

---

## Step 9: Check DataWeave Compatibility

**No scripts for this step.** The agent reads DW sources directly at plan-synthesis time (Step 12) using the `Read` tool. Compare symbols against Mode-B `.output*` keys from `tmp/connector-metadata/<nick>-new-<op>.json`:

- Symbols present in Mode-B → no change
- Symbols absent, sibling present → propose a rewrite in the plan
- Symbols absent AND Mode-B has NO `.output*` keys → mark as `SITE FLAGGED FOR OPERATOR`

Sources to read:
- Every `<ee:transform>` block under `src/main/mule/**/*.xml`
- Every inline `#[...]` expression under `src/main/mule/**/*.xml`

**Java 17 upgrade patterns — check every DW file (inline + `.dwl` under `src/main/resources/**`) for these eight, and add each hit to the plan under "DataWeave downstream impact":**

1. **`as Number` / `as Integer` on external strings** — Java 17's `NumberFormat` rejects thousands separators and whitespace that Java 8 tolerated. Wrap with a `sanitizeNumeric()` helper (strip `,` and trim) before the cast.
2. **`sizeOf(x as Object)` / `keysOf(x as Object)` / any `as Object` on a Map or Array** — the `as Object` cast used to opaque-wrap the value; Java 17 + newer DW rejects it. Drop the cast.
3. **`now() + <Number>` / `<DateTime> + <Number>`** — implicit Number→Period coercion is gone. Convert to an explicit period literal, e.g. `now() + |P7D|` or `now() + |PT1H|`.
4. **`formatDate(x, pattern)` / `parseDate(s, pattern)` without `{locale: ...}`** — JEP 252 flipped the default locale provider to CLDR; month/day names drift. Add `{locale: "en-US"}` (or the app's canonical locale) explicitly.
5. **Hardcoded reliance on `Charset.defaultCharset()`** or reading/writing files without an explicit charset — JEP 400 flipped the JVM default to UTF-8. Pin the charset explicitly on every read/write.
6. **`dw::Runtime::run(..., engine: "javascript")` or any Nashorn callout** — JEP 372 removed Nashorn. Rewrite in native DW (`reduce`, `map`, etc.); if the logic genuinely needs a JVM callout, use `java!` and audit that path against pattern 7.
7. **`java!` prefix into `sun.*` / `jdk.internal.*` / any encapsulated JDK internals** — JEP 403 hard-blocks reflective access to JDK internals. Rewrite using DataWeave native representations (locale as `{language, country}` map, timezone as canonical ID string).
8. **Three-letter timezone identifiers** (`"PST"`, `"CST"`, `"EST"`, `"PST8PDT"`) — tzdb drift + ambiguous mappings. Replace with canonical IANA IDs (`"America/Los_Angeles"`, `"America/Chicago"`, `"America/New_York"`).

The model already knows the fix for each pattern from public Java-17 migration guides — you don't need a bundled scanner script. Read each DW source with the `Read` tool, apply the checklist inline, and record every hit as `file:line — pattern-N — proposed fix` in Step 12's plan.

The connector-specific coercion checks (`as Number` on a connector op's payload, `now() as String` for a connector attribute, `error.errorType.identifier` against Mode-B error catalog) also happen during this same read pass — no separate scan.

This step is **discovery only** — grep/read the DW sources, flag every mismatch, but make **no edits** here (Phase 1 writes nothing to project files). Findings roll into the plan's "DataWeave downstream impact" section, authored in Step 12; the actual DW rewrites happen in Step 15.

- Identify DataWeave scripts in flows
- Check for Java version incompatibilities
- Flag deprecated functions or syntax

---

## Step 10: Check MUnit Compatibility

**No scripts for this step.** The agent reads every `src/test/munit/**/*.xml` directly at plan-synthesis time (Step 12) using the `Read` tool. For each operation the plan will rewrite, flag:

- `<munit-tools:mock-when processor="<old-op>">` → rename plan entry
- `<munit-tools:then-return>` payload shapes → schema-mismatch flag
- `<munit-tools:assert-that>` reading op-response fields → cross-reference DW flags
- `<on-error-propagate type="...">` in MUnit error paths → apply error-type map from the plan

This step is **discovery only** — grep/read the tests and flag every mismatch, but make **no edits** here. Findings roll into the plan's "MUnit downstream impact" section, authored in Step 12. Actual test edits happen in Step 15 and are validated by Step 17 (`mvn test`).

- Identify MUnit test files
- Check for connector operation changes that impact tests
- Flag test configurations that need updates
- Identify mock/assertion changes needed

---

## Step 11: Get Plugin Versions

Resolve the target **Mule Maven Plugin (MMP)** and **MUnit** versions the upgraded app should adopt. Both follow the same two-part model: the **version** is resolved live (deterministic, never hardcoded); the **compatibility envelope** for that version is read from release notes.

### 11a — Resolve the latest version (live, deterministic)

Both plugins publish every release to Maven metadata, so the newest version is a deterministic lookup — take the `<release>` element (authoritative "latest published"; more reliable than `<latest>`, which can point at a snapshot/RC):

- **MMP** — `https://repository.mulesoft.org/nexus/content/repositories/releases/org/mule/tools/maven/mule-maven-plugin/maven-metadata.xml`
- **MUnit** — `https://repository.mulesoft.org/nexus/content/repositories/releases/com/mulesoft/munit/tools/munit-maven-plugin/maven-metadata.xml`

```bash
curl -s "<metadata-url>" | grep -oE '<release>[^<]+</release>' | sed -E 's/<\/?release>//g'
```

Keeping projects on the **latest** MMP/MUnit is the recommended strategy.

**Write both resolved versions back into `tmp/upgrade-targets.json`.** Step 14's `apply_runtime_bump.mjs` reads `.muleMavenPlugin.to` to bump `<mule.maven.plugin.version>` and `.munit.to` to bump every MUnit version site (the `<munit.version>` property, the `munit-maven-plugin` plugin block, and the `munit-runner` / `munit-tools` dependencies) — set them here so the bumps use the live latest, never a hardcoded pin. **Reuse the MMP value Step 3c already resolved** (`tmp/latest-mmp.txt`) when present — Step 3c only fetches for 3.x apps, so fall back to a fresh fetch when the cache is absent (the app was already on 4.x MMP):

```bash
MMP=$(cat tmp/latest-mmp.txt 2>/dev/null)
[ -z "$MMP" ] && MMP=$(curl -s "https://repository.mulesoft.org/nexus/content/repositories/releases/org/mule/tools/maven/mule-maven-plugin/maven-metadata.xml" | grep -oE '<release>[^<]+</release>' | sed -E 's/<\/?release>//g')
MUNIT=$(curl -s "https://repository.mulesoft.org/nexus/content/repositories/releases/com/mulesoft/munit/tools/munit-maven-plugin/maven-metadata.xml" | grep -oE '<release>[^<]+</release>' | sed -E 's/<\/?release>//g')
tmp=$(mktemp); jq --arg m "$MMP" --arg u "$MUNIT" '.muleMavenPlugin = {to: $m} | .munit = {to: $u}' tmp/upgrade-targets.json > "$tmp" && mv "$tmp" tmp/upgrade-targets.json
```

### 11b — Determine that version's Java / Maven / Mule compatibility

<!--
  KNOWN LIMITATION — no API / machine-readable compat source (verified 2026-08). Maven
  metadata and the plugin POM give the version + compile floor only, not the
  supported Java/Maven/Mule envelope. Release notes are the only authoritative source.
-->

Because there is **no API for it today**, the agent reads compatibility from the release-notes pages. These are stable, human-navigable, and self-linking — **do not construct version-specific URLs**; the index page lists every version as a hyperlink, so follow the link it gives you:

- **MUnit index:** `https://docs.mulesoft.com/release-notes/munit/munit-release-notes` — lists each `MUnit <x.y.z> Release Notes` link (and marks deprecated ones). Follow the link for the version resolved in 11a; **skip any entry tagged "Deprecated."**
- Read that version's page for: supported **OpenJDK** versions, supported **Maven** range, supported **Mule runtime** range.

**Shape-sanity guard (the extraction is prose-read, so validate it).** After reading, confirm the extracted values are well-formed before trusting them: Java list is a non-empty subset of the known set (`8, 11, 17, 21, …`); Maven value is a valid range; Mule value is a valid version constraint. If the read comes back **empty or malformed**, do **not** guess or proceed — stop and surface it for the user to confirm.

**Reference values (verified against MUnit 3.7.3 / MMP 4.10.1 release notes, 2026-08 — re-verify per resolved version):**

- MUnit 3.7.3 → OpenJDK **8, 11, 17, 21** · Maven **3.9.0–3.9.15** · Mule runtime **≥ 4.3**
- MMP 4.10.1 → OpenJDK **8, 11, 17, 21** · Maven **3.9.0–3.9.15**

Confirm the target Java (from Step 2b) and target Mule (from Step 6) fall inside the resolved envelope. Record the resolved versions + compat for use by Step 12 (plan) and the Maven pre-req range check.

---

## Step 11.5: Verify Metadata Coverage (gate)

Run the coverage gate before touching Step 12. It cross-references every op / source / provider in `tmp/connector-usage/*.json` against the Mode-A / Mode-B / Mode-C JSONs on disk and refuses to advance the plan if any required describe is missing.

```bash
node <skill-dir>/scripts/verify_metadata_coverage.mjs
```

Behavior:

- **FAIL** (exit 1) — a required Mode-B or Mode-C JSON is missing on disk for an op/provider that IS present in Mode-A. Re-run `describe_connector.mjs` for those (op, provider) pairs, then re-run this gate.
- **WARN** — an op/provider appears in `usage_sites` but is NOT in Mode-A `.operations[]` / `.configs[].connectionProviders[]`. Usually a rename or removal; Step 7 should have written `<nick>-op-renames.json` with the candidate. Non-fatal by default — pass `--strict` to fail on WARN rows too.
- **INFO** — the connector is `not_in_use`, OR a used config has zero declared providers in Mode-A (D7 fallback). Phase C consumes Mode-A `.configs[]` directly for the empty-provider case; no Mode-C is required.

Do not proceed to Step 12 until this gate exits 0. A blind plan built on a missing per-op describe silently ships a "no rewrites needed" verdict for whatever the missing JSON would have revealed.

---

## Step 12: Present Plan & Get Approval

This is the plan-authoring step and the hard approval gate. No CLI calls, no scripts — the LLM reads the metadata + usage JSON already on disk and writes an explicit, **mechanical, per-symbol** change list to `tmp/upgrade-plan.md`. Everything Execution will do to the project must appear in this file so the user can approve or reject each edit before it touches the working tree. The plan MUST describe **exactly which `file:line` changes to what** — never intent ("update the s3 operations").

Concrete flow for this step:

### 12.0 Cross-check discovery against Maven (soft gate)

Before authoring the plan, confirm the static POM walk (Step 5) discovered the **right current versions** by asking Maven what each connector actually resolves to. The walk is deliberately local — it does **not** follow `<scope>import</scope>` BOMs or transitive pulls — so a connector whose real version lives in an imported BOM can be silently mislabeled (right value, wrong owner), and a Step 14 edit to the discovered site would then no-op. `mvn dependency:tree` is the one authority on the *resolved value*; this check diffs it against `connectors.json`.

```bash
# Reads tmp/connectors.json; runs `mvn dependency:tree` scoped to the connector GAVs.
# Piggybacks on the warm Maven state from the Step 3 baseline build.
node <skill-dir>/scripts/verify_dependency_tree.mjs . --against=existing
```

Exit codes: **0** every connector resolves to the discovered version (proceed); **1** operational error (Maven missing / tree build failed / `connectors.json` unreadable) — resolve it, this is a real stop; **2** one or more mismatches. This gate is **SOFT** — a mismatch does **not** halt the workflow, because nothing has been written yet. Instead:

- Read `tmp/dep-tree-verify-existing.json`. For each entry in `mismatches[]` (our value ≠ Maven's) and `resolvedOnlyByTree[]` (we couldn't resolve it locally but Maven did — the source is outside the editable local chain), record the connector, our discovered value/owner, Maven's resolved value, and the `likelyCause` (imported BOM / transitive / stale `~/.m2`).
- Fold each into the plan's **Known risks / operator-attention items** section as an explicit line, and annotate the affected connector's **Owned by** cell with `— Maven resolves from outside the local chain (see risks)`. This tells the operator, at the approval gate, that a Step 14/18 edit to the discovered site may not take.
- Do **not** auto-proceed past a mismatch silently: the operator decides at the Step 12.4 gate whether the discrepancy is acceptable (e.g. an intentionally BOM-managed connector) or a blocker.

Entries in `missingFromTree[]` (declared but pruned from the resolved tree — e.g. provided by the runtime) are informational; note them only if they concern a connector the plan intends to bump.

### 12.1 Completeness checklist (run BEFORE authoring the plan)

Every connector must have all four artifacts on disk, fully cross-checked against usage, before a plan is presented:

- [ ] `tmp/connector-choices/<nick>-new.json` — drafted GAV
- [ ] `tmp/connector-metadata/<nick>-new.json` — Mode-A summary
- [ ] `tmp/connector-metadata/<nick>-new-<op>.json` — Mode-B per-op **for every op in `usage.operations_used[]` that intersects `new.operations[]`**
- [ ] `tmp/connector-metadata/<nick>-new-<config>-<provider>.json` — Mode-C **for every (config, provider) pair the flow uses**
- [ ] Every file flagged by the Step 3.5 hygiene scan is enumerated in the plan's §Flow-XML hygiene section (or the scan was clean and the section says so)

Step 11.5's `verify_metadata_coverage.mjs` gate already ran the mechanical version of this presence check; if it exited 0 the artifacts are all present. If any artifact is missing, loop back to Step 5/6/7 and do **not** present a partial plan. Step 7's mandatory diffs (attribute-rename, error-type, provider-element set-membership, recursive child-tree) must already be complete — this checklist confirms their residues all landed as plan bullets below. **If any diff surfaces a symbol the plan does not enumerate, that plan is incomplete — go back to Step 7, re-describe, and re-synthesize.** "Build breaks after the skill claims success" is almost always metadata-present-but-ignored.

### 12.2 Resolve renames from the data you already have

**Do not defer to Step 16.** Every WARN row emitted by Step 11.5 is a rename signal (`WARN <nick>/<op-or-provider> — not in Mode-A ...`). For each WARN:
   - **Op renames**: cross-reference `tmp/connector-metadata/<nick>-new.json` `.operations[]` (all new op names). Pick the semantically closest match to the old op name and confirm by reading its Mode-B `tmp/connector-metadata/<nick>-new-<newOp>.json` `.attributes[]` — does the new op accept the attributes the flow XML sets on the old element? If yes, encode the rewrite as a plan bullet: `Rewrite <ns>:<oldOp> → <ns>:<newOp>` with attribute deltas listed inline (renamed, removed, newly-required).
   - **Provider renames**: cross-reference Mode-A `.configs[].connectionProviders[]` (all new provider names for that config) and read the Mode-C describe `tmp/connector-metadata/<nick>-new-<config>-<newProvider>.json` for each candidate. Pick the new provider whose attributes best cover what the flow XML sets on the old provider element (grep the flow XML: `grep -c 'ns:oldProvider' src/main/mule/*.xml` and then list its attributes). Emit `Rewrite <ns>:<oldProvider> → <ns>:<newProvider>` with attribute deltas.
   - The LLM already has every input needed — old names (from `tmp/connector-usage/<nick>.json` `.config_providers_used[]` / `.operations_used[]`), new names (from Mode-A `.operations[]` / Mode-A `.configs[].connectionProviders[]`), and per-target attribute shape (from Mode-B / Mode-C JSONs). No new script, no new AskUserQuestion — just synthesize the rename bullets into `tmp/upgrade-plan.md` before presenting it. Halt via `AskUserQuestion` only if a match is genuinely ambiguous (2+ new candidates with equal attribute coverage).
   - **Required-attribute additions** — beyond renames, diff each used op / provider / config's Mode-B/Mode-C `.attributes[]` where `required: true` against the attributes actually set on the corresponding element in flow XML. For every new-required attribute not present in the current flow XML:
     - If `.default` is set → emit `Add <ns>:<element> @<attr>="<default>"` (Example: crypto 2.x `<crypto:jce-config>` now requires `type` with `.default = "JCEKS"` → plan bullet `Add crypto:jce-config @type="JCEKS"`).
     - Else if `.type == "enum"` → pick `.values[0]` and note it in the bullet as `(picked first enum value; verify)`.
     - Else → surface as an `AskUserQuestion` bullet (`Connector <nick> op/provider <name> requires new attribute <attr> (<type>) — please supply a value`) before finalizing the plan.
   - This catches the "XSD says attribute X is required and you didn't set it" class of failure at plan time using Mode-B/C data you already fetched, instead of letting Step 16 burn retries reverse-engineering enum values from mvn error text.

### 12.3 Author `tmp/upgrade-plan.md`

Write `tmp/upgrade-plan.md` with the rename bullets from 12.2 folded in. Plan **inputs** (all already on disk): `tmp/upgrade-targets.json` (from/to for mule, java, connectors), `tmp/connector-metadata/<nick>-new.json` (Mode-A), `…-new-<op>.json` (Mode-B, with `attributes[]`, `childElements[]`, `errorTypes[]`, `.output*`), `…-new-<config>-<provider>.json` (Mode-C), `tmp/connector-usage/<nick>.json` (usage sites, `attributes_set`, errorTypes caught/raised, `namespace_prefix_changed`). Every section MUST cite the specific JSON file(s) it derives from — reviewers verify a plan by cross-checking citations.

```markdown
# Upgrade Plan — <project-name>

## Targets
- Mule runtime: <from> → <to>
- Java: <from> → <to>

### Connectors

**Connectors (<N>)** — recommended to move to the **latest version supporting Java <targetJava> + Mule <targetMule>**.

| Connector | Current version and Java compatibility | Updated version | Owned by | Notes |
|---|---|---|---|---|
| <name> | <currentVersion> — Java <supportedJava…> | <targetVersion> | <owner> | <note> |

Render this as a single table — one row per connector. **Sort rows so any with a non-`—` Note float to the top.** Column sources (all already on disk — cite, never invent):

- **Connector** — the human-readable connector name (not the internal `<nick>`).
- **Current version and Java compatibility** — `<currentVersion>` + its Java window from `connector-java-compat.json .connectors[].supportedJava` (Step 5b). Keep the version and its Java window in this one column — the Java window is an attribute of that version. Bold `Java 8 only` when `supportedJava == [8]` (no fallback). When `currentVersionDelisted: true`, `supportedJava` is empty — show `<currentVersion> — delisted from Exchange` instead of a blank Java window.
- **Updated version** — `targetVersion` from `target-connectors.json` (Step 6): the latest version supporting **both** the target Java and target Mule. When `changed: false` (current already IS the latest compatible), show the same version and set the Note to `already latest compatible — no change`.
- **Owned by** — provenance from `connectors.json` (Step 5). Key off `resolvedFrom`: `child` → **child**; `parent` → **parent**; `ancestor` → **grandparent+**. When `versionManagedIn` is present (the `<dependencyManagement>` case), append its basename so the operator sees the exact owning POM — e.g. `parent (parent/pom.xml)`; for a version inherited inline from an ancestor's `<dependencies>`, `versionManagedIn` is null, so just show `parent` / `grandparent`. A non-`child` owner is where the bump will actually be **written**: Step 14's `apply_parent_pom_fork.mjs --phase=edit` writes the new versions into that ancestor in place, and Step 18's `--phase=fork` bumps its `<version>` and repoints the downstream `<parent>` — rather than editing the child. Surfacing it here lets the operator see, at the approval gate, exactly which shared POMs the upgrade will touch and fork.
- **Notes** — derived deterministically from data already on disk; **never** free-text impression. Empty → `—`. Compose from:
  - MAJOR bump — `major(targetVersion) != major(currentVersion)` (semver on `target-connectors.json`).
  - prefix `<from>` → `<to>` — `usage.namespace_prefix_changed` (Step 7b).
  - operation / config / error-type change — the connector has ≥1 rewrite bullet in the §Operations / §Configs / §error-type sections below (Step 7 diffs).
  - `current is Java 8 only` — `supportedJava == [8]`.
  - `custom — verify manually` — connector was unverifiable on Exchange (custom/private).
  - `current version delisted from Exchange` — `currentVersionDelisted: true` (current Java compat unverified; target resolved from the newest available version).
  - `already latest compatible — no change` — `changed: false`.

**Do NOT repeat the target-Java window per row** (it is constant — every Updated version supports the target by construction; the header states this once). **A `—` Note is only trustworthy after the Step 11.5 coverage gate passed** — it means Step 7's diffs came back empty, not that analysis was skipped.

## Namespace prefix changes
- <nick>: <old-prefix> → <new-prefix>   (source: usage.namespace_prefix_changed)

## Operations
For each op the flow uses:

### <op-name> (op_OLD → op_NEW)
- Kind: straight-match | rename | true-removal
- Sources: usage.operations_used[], per-op JSON (<nick>-new-<op>.json)
- Sites (from usage.usage_sites[]):
  - <file>:<line>   attributes_set: [a="…", b="…"]
- Per-site edit contract:
  - Element rename: <old-prefix>:<old-op> → <new-prefix>:<new-op>
  - Attribute renames:
    - `bucketName` → `bucket`
    - `content`    → PROMOTE TO CHILD ELEMENT `<s3:content>#[payload]</s3:content>`
      (source: <nick>-new-<op>.json .childElements[])
  - Removed attributes:
    - `useVersioning` — dropped
  - New required attributes/children:
    - <name> (required=true, defaultValue=<x>) — insert with default
- Error-type mapping (per-op):
  - S3:BUCKET_NOT_FOUND → S3:NO_SUCH_BUCKET   (source: <nick>-new-<op>.json .errorTypes[])

## Configs / connection providers
For each (config, provider) pair the flow uses:

### <config-nick> (<config-name>, provider <provider-name>)
- Sources: <nick>-new-<config>-<provider>.json
- Config element:  <old-prefix>:<old-config-element> → <new-prefix>:<.elementName>
- Connection element:  <old-prefix>:<old-connection-element> → <new-prefix>:<.connectionProviders[…].elementName>
- Attribute renames (on the connection element)
- Removed connection attributes / Added required connection attributes-children
- Sites (from usage.usage_sites[])

## Connector-wide error type renames
Enumerated from <nick>-new.json .errorTypes[] (OLD types from usage.errorTypes_caught[] / errorTypes_raised[]):
- <OLD_TYPE> → <NEW_TYPE>
  - **Catch sites (where the edit actually happens):** grep the flow XML for the OLD type — `grep -rn 'type="<OLD_TYPE>"' src/main/mule/*.xml` — and list **every** `<on-error-propagate type="…">` / `<on-error-continue type="…">` `<file>:<line>` that names it. These handler sites are what Step 15 edits, NOT the operation that *raises* the error. Citing only the raise-site (the `<prefix:op>` element) leaves the `on-error-*` handler untouched and the build fails at `process-classes` with `Could not find error '<OLD_TYPE>'`. Enumerate one bullet per catch site.

## DataWeave downstream impact
For every DW consumer that reads output from an op the plan will rewrite:
- Symbol list read from the op's response
- Diff against Mode-B .output* keys:
  - Present in Mode-B: no change
  - Absent, sibling present (probable rename): proposed rewrite (with source citation)
  - Absent AND Mode-B has NO .output* keys: SITE FLAGGED FOR OPERATOR

## Custom Java downstream impact
Findings from Step 8a (read from `src/main/java/**`, `src/test/java/**`, `<java:invoke>`/`<java:new>`/`<java:invoke-static>` targets, and `java!` callouts). One bullet per site the upgrade must edit for the app to compile/run on the target Java, in the format `file:line · problematic line · category · proposed fix`:
- `<file>:<line>` · `<verbatim problematic line>` · <category: removed package / restricted internal / deprecated method / locale> · <proposed fix> (e.g. `src/main/java/com/acme/XmlBinder.java:12 · import javax.xml.bind.*; · removed package (JEP 320, gone in Java 11) · add jakarta.xml.bind:jakarta.xml.bind-api:4.0.x + jaxb-runtime, or migrate to jakarta.*`)
- For any fix that adds a dependency, state the exact coordinate here — the add is applied in Step 15.4.
- (write "none — no custom Java source impact" if Step 8a found nothing; do NOT write this without having read the files `find`/`grep` surfaced)

Step 8b runtime-only surfaces (Spring beans, Serializable state, custom security/TLS, custom log4j appenders, JDK-module reflection) are NOT listed here — they go under §Known risks / operator-attention items because the skill can't verify them and a green build doesn't prove them safe.

## Parent-POM forks (shared ancestor edits)
The ancestor counterpart to the child edits below — lists exactly which shared POMs the upgrade will bump (Step 14) then version-fork + repoint (Step 18). **Do NOT hand-derive this from `connectors.json` and do NOT recall owners from memory** — that is the class of error a free-authored list introduces (a connector reported under the wrong ancestor). Instead render it from the fork script's own owner→connector computation. Run its edit-phase dry-run once (writes nothing — it only reads Step 5's `connectors.json` and Step 6's `target-connectors.json`, both already on disk):

```bash
node <skill-dir>/scripts/apply_parent_pom_fork.mjs . --phase=edit --dry-run >/dev/null
jq -r '.ancestorsForked[] | "- `\(.pomPath)` (\(.artifactId)) owns: " + (.connectors | join(", "))' tmp/parent-pom-edit-dryrun.json
```

Render **one bullet per `ancestorsForked[]` entry, verbatim from that JSON** — `pomPath` is the owning POM, `connectors[]` are its `"<artifactId> -> <target>"` bumps. Do not reassign, merge, or re-label owners; the script already resolved each connector to the POM that actually declares its version (walking `<dependencies>` and `<dependencyManagement>` across the full chain).
- `<pomPath>` (`<artifactId>`) owns: `<connectorA> -> <to>`, `<connectorB> -> <to>`, …
- (when `ancestorsForked[]` is empty, write "none — every connector is child-owned; no ancestor is forked")

Also surface the dry-run's `warnings[]` if any (`jq -r '.warnings[]' tmp/parent-pom-edit-dryrun.json`) — e.g. an ancestor-declared connector with no resolved target — so the operator sees it at the approval gate.

Caption these bullets for the operator without citing internal step numbers — the plan reader cares *what* happens, not the skill's step index: "Connector versions bumped in place first; each owning ancestor's own `<version>` is forked and the child `<parent>` repointed only after a green build. Local edits only — no Exchange publish." Fork-wide scope means an ancestor also bumps any **other** connector it declares that the app happens to use (e.g. a duplicate the child also pins) — those show under the ancestor here even though nearest-wins keeps the child's copy effective. Running the dry-run now (rather than transcribing provenance) guarantees the plan matches exactly what the edit phase will write.

## pom.xml
These are **always written to the child** (`apply_runtime_bump.mjs`), never forked into an ancestor — even when the property currently lives only in a parent/grandparent (a child override is inserted; Maven nearest-wins makes it effective without mutating the shared POM). The connector table's **Owned by** column covers connectors; this section is child-only.
- <app.runtime>: <from> → <to> (inserted if absent)
- <javaVersion> / java.version / jdk.version: <from> → <to> (each bumped only if present; never inserted)
- maven-compiler-plugin **build-level** config → Java <to>: **Include this bullet only when the run-bump actually touches a build-level level** — i.e. the app compiles Java (`src/main/java`/`src/test/java`) **or** a build-level `maven.compiler.*` is already declared (a property under the project/profile `<properties>`, or an inline `<source>/<target>/<release>` in the `maven-compiler-plugin`). Otherwise **omit it entirely** — a pure flow/DataWeave app with no build-level config gets no compiler line at all. A `maven.compiler.*` found in any other scope — e.g. inside a plugin/deployment `<properties>` such as `cloudHubDeployment` — is NOT the build level, is NOT auto-bumped, and does not count as "declared" here; do not list it as an auto-edit — it reaches the operator through the Step-14 WARN/confirm path (below). When the bullet **is** shown: the level is bumped **in place** wherever it lives (no manual edit, minimal diff, stays in its own scope — e.g. inside a `<profile>`); a declared property or inline level is bumped where it sits; a lone inline `<target>`/`<source>` is completed by converting it to `<release><to></release>` (`release` never coexists with `source`/`target`); and `maven.compiler.release` = <to> is **inserted** when the app has custom Java and no level is declared anywhere.
  - Never auto-bumped. The run-bump `WARN`s each at write time (Step 14) with the exact `tag=value`; **relay every WARN to the operator, ask whether to update each, and apply only the confirmed ones** at the reported location (don't guess). When relaying any such item, describe it **factually** — the exact tag, where it lives (e.g. inside `cloudHubDeployment`), and what it does or doesn't affect — and **never characterize the operator's POM config as "non-standard" or deviant** — it may simply be outside what these scripts auto-own. Covers: test-compile levels (`maven.compiler.testSource/testTarget/testRelease`) or a level set via `<compilerArgs>` / `-source` / `--release`; a stale `maven.compiler.*` inside a plugin/deployment `<properties>` (e.g. `cloudHubDeployment`); a `maven-toolchains-plugin` `<jdk><version>` off-target; a `maven-enforcer-plugin` `<requireJavaVersion>` whose range may reject the target JDK.
- <mule.maven.plugin.version>: bumped to the latest MMP (`.muleMavenPlugin.to`, resolved live in Step 11a)

## mule-artifact.json
- minMuleVersion: <from> → <to-feature-line> (truncated to `x.y.0` — e.g. `4.9.19` → `4.9.0`; declares the app's required features by the MINOR line, matching ACB/Studio and the Introspection Service. The test-runtime hazard this creates is neutralized by the `<runtimeVersion>${app.runtime}</runtimeVersion>` pin in the munit config)
- javaSpecificationVersions: ensure it contains <to> (array inserted if absent, for any target Java)

## pom.xml — munit-maven-plugin
- MUnit versions: `<munit.version>` property / `munit-maven-plugin` plugin / `munit-runner` / `munit-tools` bumped to the latest MUnit (`.munit.to`, resolved live in Step 11a)
- <runtimeVersion>: inserted as `${app.runtime}` into the munit config if absent (never clobbers an existing pin) — forces MUnit's embedded test runtime to the full target patch instead of falling back to the `x.y.0` minMuleVersion floor, which would boot an older runtime and fail JAVA_25-annotated connectors with `EnumConstantNotPresentException`

## xsi:schemaLocation URLs
- apply_connector_pin.mjs will rewrite mule-<connector>.xsd URLs deterministically

## Flow-XML hygiene (from Step 3.5 scan)
For every file the Step 3.5 hygiene scan flagged (latent unbound prefix — fails on 4.9+), one bullet, **including files no other section touches**:
- <file>: add `xmlns:<prefix>="<namespace-uri>"` to root <mule>   (offending prefix: <prefix>; source: Step 3.5 xmllint stderr)
- (write "none — all flow files namespace-well-formed" if the scan was clean)

## Custom / non-connector libraries (operator confirmation required)
Enumerated from `connectors.json .customLibraries[]` (Step 5) — the app's non-connector, non-test/provided, non-platform dependencies (e.g. a shared error-handler jar, a util lib, a direct third-party jar). The skill does **not** upgrade these — there is no Exchange target to resolve — but they were likely compiled against the OLD Java/runtime and may break after the upgrade (`UnsupportedClassVersionError`, `NoSuchMethodError`, or a `ClassCastException` whose stack trace lives entirely in the library's own package, often only at deploy/runtime — a green `-DskipTests` build will not catch it). One bullet per library:
- `<groupId>:<artifactId> <version>` (owned by `<resolvedFrom>`) — confirm it is compatible with Java `<targetJava>` + Mule `<targetMule>`, or supply an updated coordinate. Not auto-upgraded.
- (write "none — no custom/non-connector libraries detected" if `customLibraries[]` is empty)

## Known risks / operator-attention items
- Java-window warnings, DW sites flagged for operator, true-removal ops with no rename target, etc.
- **Custom-Java runtime-only surfaces (Step 8b)** — Spring beans instantiated by class, Serializable state crossing Object Store / VM / cluster, custom security/crypto/TLS Java, custom log4j2 appenders, and JDK-module reflection (`setAccessible` / `--add-opens`). One bullet per `file:line` with why it may break on the target Java. These compile clean and a `-DskipTests` build will NOT exercise them — the operator must confirm at the Step 12.4 gate that they are safe on Java `<targetJava>`, since build-success does not prove it.
- Dependency-tree cross-check discrepancies (from Step 12.0 `dep-tree-verify-existing.json`): any connector whose Maven-resolved version disagrees with our discovery, or resolves from outside the editable local chain (imported BOM / transitive / stale `~/.m2`) — a Step 14/18 edit to the discovered site may not take. One bullet per mismatch, citing our value, Maven's value, and the likely cause.
```

Authoring rules:

- **Never invent an operation, attribute, or child element.** Every rename claim must have a corresponding entry in a Mode-B / Mode-C JSON on disk.
- **Preserve business intent in the plan.** `doc:name`, DataWeave payloads, `config-ref` values, error-handler shapes are not part of the upgrade; they must survive Execution unchanged. Note it explicitly in the plan when a site has DW / config-ref / doc:name so reviewers can spot an accidental drop.
- **Flag ambiguity.** If an OLD op has no plausible NEW rename target, mark the site as `true-removal — operator attention required`. Do NOT silently guess. If a DW site has no Mode-B `.output*` shape catalog, list every symbol read and flag the site for operator confirmation.

### 12.4 Present and gate

1. `Read` the file `tmp/upgrade-plan.md` (with the rename bullets folded in).
2. Print its full contents inline in the response as fenced markdown so the user can review without opening another file.
3. **Custom-library confirmation (only if `connectors.json .customLibraries[]` is non-empty).** Before the main approval gate, raise these proactively with a dedicated `AskUserQuestion` — the skill can neither verify nor upgrade a non-connector jar, so the operator must make the call while the target Java/Mule is in view. **State the coordinates only — do NOT assert or imply whether they support the target Java/Mule.** You have no compatibility source for these jars (not on Exchange, source not in the workspace, a green `-DskipTests` build will not exercise the library's own bytecode), so any "these support Java N" claim is an unverifiable guess and must not appear — even if you happen to believe it from background knowledge; the whole point of this gate is that the *operator* owns that judgment, not the skill. Phrase the question neutrally, e.g. *"Your app depends on these non-connector libraries the skill can't verify or auto-upgrade: `<list>`. Confirm they work on Java `<targetJava>` + Mule `<targetMule>`, or tell me what to change."* List every `customLibraries[]` coordinate and offer three options: `I've confirmed these are compatible — keep as-is`, `Some need a version change — I'll supply coordinates`, `Not sure — flag and continue at my own risk`. On "supply coordinates," collect them and fold the replacements into the plan's pom.xml section (the operator's explicit version is a normal version edit — not an auto-resolved bump). If `customLibraries[]` is empty, skip this sub-step entirely — do not prompt.
4. Use `AskUserQuestion` with three options:
   - `Yes, proceed to Execution`
   - `No, I want to change the plan`
   - `No, cancel the upgrade`
5. **WAIT for the explicit "Yes, proceed to Execution."** before advancing to Step 13.

On `No, change`: collect specifics via a follow-up `AskUserQuestion`, loop back to the affected step (5/6/7/9/10), re-synthesize the plan, re-present. Do NOT rerun Step 1.

On `No, cancel`: stop the workflow. Leave `tmp/` in place for inspection.

- Display all version updates
- Show connector version changes
- Show operation/config/error type changes
- Show plugin updates
- Flag blockers
- **⚠️ APPROVAL GATE:** Wait for user approval before proceeding to execution

---

# Phase 2: Execute

## Step 13: Download Target Runtime and Java

Ensure the **finalized target** Mule Runtime and target JDK are present on disk before the build. Both are driven by the approved target in `tmp/upgrade-targets.json` (`.mule.to` = full Mule version, `.java.to` = Java major) — never a hardcoded pair. Each resolver checks the local install dir first and only downloads when the version is absent. **A version can be downloaded only if `anypoint-cli-v4 dx mule runtime list` returns it** — that list is the sole source of truth for what is downloadable, so the target must always be one it offers (Step 4 already resolves the target against this same list).

```bash
# Target JDK — reads the target Java MAJOR from tmp/upgrade-targets.json.
node <skill-dir>/scripts/resolve_jdk.mjs "$(jq -r '.java.to' tmp/upgrade-targets.json)" .

# Target Mule Runtime — reads the full target Mule version from tmp/upgrade-targets.json.
node <skill-dir>/scripts/resolve_runtime.mjs "$(jq -r '.mule.to' tmp/upgrade-targets.json)" .
```

- `resolve_jdk.mjs <major>` reuses an installed JDK of that major under `~/AnypointCodeBuilder/java`, else downloads the build the runtime list names for that major (`dx mule jdk download`). Writes `tmp/resolve-jdk-<major>.json` (`javaHome`). Exit 1 on failure.
- `resolve_runtime.mjs <version>` reuses an installed `mule-enterprise-standalone-<version>` under `~/AnypointCodeBuilder/runtime`, else downloads it (`dx mule runtime download`) — but only if the runtime list offers that version. Writes `tmp/resolve-runtime-<version>.json` (`runtimePath`). Exit 1 on failure.

Neither script sets `JAVA_HOME` or any runtime path — they only ensure the distribution is present and report where. If either exits non-zero, surface its stdout to the user via `AskUserQuestion` and WAIT (a download needs working CLI auth/network). The target JDK resolved here (`tmp/resolve-jdk-<target-java>.json`) is what Step 16's build consumes via the inline `JAVA_HOME=$(jq -r .javaHome ...) mvn` prefix.

> **Scope:** this step provisions the app's **target** runtime/JDK only.

---

## Step 14: Update Files - Versions Only

Deterministic version rewrites — each script call in its own `Bash` response. Order matters: promote drafts → runtime bump → per-connector pin.

```bash
node <skill-dir>/scripts/promote_new_connector_pins.mjs
node <skill-dir>/scripts/apply_runtime_bump.mjs .
```

`apply_runtime_bump.mjs` only rewrites versions in `pom.xml` / `mule-artifact.json` — it does not run java. Correct-JDK enforcement comes from **pinning the build to the resolved target JDK inline**: Step 16's `mvn` is invoked as `JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<target-java>.json) mvn clean package …`, exactly like the baseline build (Step 3c). The user's ambient `JAVA_HOME`/`PATH` is never consulted — the JDK is the one `resolve_jdk.mjs` found-or-installed in Step 13 (under the ACB java dir, or downloaded if absent).

Then per connector:

```bash
for nick in $(jq -r '.connectors[].nick' tmp/upgrade-targets.json); do
  node <skill-dir>/scripts/apply_connector_pin.mjs "$nick" .
done
```

**Reading the loop output — `deferred-to-parent` is NOT a failure.** `apply_connector_pin.mjs` edits the **child** `pom.xml` only. For a connector whose version lives in an ancestor POM (inherited dep, or a version-less child dep managed by an ancestor's `<dependencyManagement>`), the child has nothing to edit — the script consults Step-5 provenance (`resolvedFrom` / `versionManagedIn`) and reports that pin as `"status": "deferred-to-parent"` (with `ownedBy` naming the owning ancestor POM, e.g. `parent/pom.xml`), **not** `error`. Those bumps are owned by `apply_parent_pom_fork.mjs --phase=edit` below. A `"status": "error"` here means a genuine **child-owned** write failure — that is the only pin status that should halt Step 14.

**No re-describe here.** Plan Phase already introspected every pinned connector into `tmp/connector-metadata/<nick>-new.json` (Step 7), and that is the file every downstream reader consumes — `apply_connector_pin.mjs` (namespace), `verify_metadata_coverage.mjs` (the coverage gate), and Step 16 classes 1–5. A second describe of the pinned connector (writing the no-suffix `<nick>.json`) is only ever read by Step 16's **class 6** recovery (`xsi:schemaLocation` 404), which almost never fires — so re-describing all N connectors unconditionally here spends N Java-17 CLI calls to populate a file that a green build never opens. **It is therefore done lazily**: Step 16 class 6 re-describes the single failing connector on demand if and only if a schema-URL failure needs the pinned-namespace ground truth. See Step 16 · 16.1 · class 6.

**Then, if any connector is owned by a local ancestor POM (parent/grandparent), edit the versions it owns in place.** The two child writers above only edit the child `pom.xml`; a connector declared on a parent's `<dependencies>`/`<dependencyManagement>` is theirs to no-op — `apply_parent_pom_fork.mjs --phase=edit` owns those. It reads the read-side provenance (`resolvedFrom` / `versionManagedIn` from Step 5) and the resolved targets (Step 6), and writes the bump into the POM that actually owns it. **Runtime/plugin properties are NOT forked** — `app.runtime` / `mule.maven.plugin.version` / Java props are app-scoped and were already written to the child by `apply_runtime_bump.mjs` above (insert-if-absent when the property lives only in an ancestor; Maven nearest-wins makes the child value effective without mutating the shared ancestor). Run it once (it processes the whole chain):

```bash
node <skill-dir>/scripts/apply_parent_pom_fork.mjs . --phase=edit
```

The script snapshots each ancestor it is about to edit into `tmp/pom-backups/` **pristine, before its first write** (create-if-absent, so an edit-phase re-run keeps the original) — no separate backup step is needed. That snapshot serves two purposes: a Step-16 build give-up can restore a pristine ancestor (the edit must never leave a SHARED ancestor dirty on failure), and Step 18 computes the fork `<version>` from it so the fork is idempotent across `--fork-bump` re-runs. Because the script backs up exactly the POMs it mutates, the snapshot set can never drift from the edited set.

Prints a short summary (including `backed up N ancestor POM(s) pristine → tmp/pom-backups/`); the full result is written to `tmp/parent-pom-edit.json` (with a `backedUp[]` array of the snapshotted paths). Step 18's conditional keys off whether `ancestorsForked[]` was non-empty, so read that file (`jq '.ancestorsForked' tmp/parent-pom-edit.json`) for the durable record.

`apply_parent_pom_fork.mjs --phase=edit` bumps the connector versions each owning ancestor manages **in place** — it does **not** touch the ancestor's own `<version>` or the child's `<parent>` ref. That is deliberate: leaving the ancestor's `<version>` unchanged means the child's existing `<parent><version>` still matches, so the Step 16/17 local build resolves the new versions straight from the on-disk ancestor via `<relativePath>`. The `<version>` bump + child repoint (the "fork") happens later, in **Step 18**, only after a green build. It processes the chain deepest-first, applies the fork-wide connector scope (bumps **all** connectors declared in an owning ancestor, warning on any it has no target for — never a hard stop), and **verifies** each bump re-resolves from the child (through the unchanged parent link) before exiting. It touches **connectors only** — `app.runtime` / `mule.maven.plugin.version` / Java props are never forked (already child-written by `apply_runtime_bump.mjs`). A non-zero exit means a write didn't take — STOP and inspect its `verify.checks[]` rather than proceeding to the build. When every connector is child-owned it prints a "nothing to do" note and exits 0. **Edit-in-place, build, then fork:** the in-place edit runs pre-build so Step 16 tests exactly the versions that ship; if the build loop gives up, restore the ancestors from `tmp/pom-backups/` (revert the child via git) so no shared ancestor is left mutated.

The fixed order above (promote drafts → runtime bump → per-connector pin → parent-POM edit-in-place) **is** the pre-build preparation — no separate validator pass is needed before Step 16's `mvn`. `apply_connector_pin.mjs` owns the `xsi:schemaLocation` rewrite deterministically (one call per connector nickname); never hand-edit those URLs. `apply_runtime_bump.mjs` reads `.mule.to` / `.java.to` from `tmp/upgrade-targets.json` and bumps `pom.xml` plus `mule-artifact.json`:

- **`<app.runtime>`** — always ensured: bumped if present, else **inserted** into `<properties>` (an app that never declared it still gets pinned to the target runtime).
- **Java version properties** — `<javaVersion>`, `java.version`, `jdk.version` are each bumped **only if already present** (never inserted — a POM that doesn't declare a tag shouldn't sprout it).
- **Compiler level (`normalizeCompilerLevel`)** — the maven-compiler-plugin level is bumped to the target Java **in place**, wherever it lives, so the diff is minimal and the level never leaves its scope. The invariant it guarantees: `release` never coexists with `source`/`target` (which maven-compiler-plugin rejects: *"Cannot have both release and target/source"*), and a lone `target`/`source` is completed rather than left half-declared. By case:
    - **Level in the plugin config only** — bumped in the block where it sits (including inside `<execution>`s, `<pluginManagement>`, and `<profile>` compiler blocks, so a profile-scoped level stays profile-scoped): `<release>` bumped; `<source>`+`<target>` both bumped; a **lone `<target>` or `<source>` is converted to `<release><target-java></release>`** (a lone target leaves source at the plugin default, which newer JDKs reject — so a bare `<target>1.8</target>` is fixed automatically, no manual edit).
    - **Level in properties only** — `maven.compiler.release` bumped (stray `source`/`target` props dropped); else `source`/`target` props both set to the target (a missing sibling filled).
    - **Level in BOTH plugin config and properties** (rare, conflict-prone) — collapsed into the property home (inline stripped) so no `release`-beside-`source/target` conflict can result.
    - **Nothing declared + custom Java** (`src/main/java`/`src/test/java`) — `maven.compiler.release` **inserted** = target Java (a `<properties>` block is created if the POM has none), **guarded**: if the level is already set via `<compilerArgs>` (`-source`/`--release`), it is *not* inserted (that would create a javac conflict) — a `WARN` is emitted instead. Pure flow/DataWeave/MUnit-XML apps with no declared level get nothing.
  - Deployment `<target>` inside mule-maven-plugin is never touched (only `maven-compiler-plugin` blocks). **Not auto-bumped — the run-bump emits a `WARN` at write time (Step 14) with the exact value. Relay every WARN to the operator, ask whether to update each, and apply only the confirmed ones at the reported location.** Before applying any confirmed edit, **re-`Read` `pom.xml` first** — `apply_runtime_bump.mjs` has already rewritten it, so edit against the current file. The WARN cases:
      - test-compile levels (`maven.compiler.testSource/testTarget/testRelease`, inline `<testSource>/<testTarget>/<testRelease>`) and a level set via `<compilerArgs>`/`<compilerArgument>` (`-source`/`--release`).
      - a `maven.compiler.{source,target,release}` left stale **inside a plugin/deployment `<properties>`** (e.g. `mule-maven-plugin > cloudHubDeployment > <properties>`) — deployment key/values, not the build level, so never rewritten; the WARN reports the exact `tag=value` for the operator to update if they want.
      - **maven-toolchains-plugin** pinning a `<jdk><version>` that isn't the target Java — the toolchain picks the JDK regardless of `JAVA_HOME`, so a stale pin can silently compile on the old JDK (verify/update the pin).
      - **maven-enforcer-plugin** `<requireJavaVersion>` — its range may reject the target JDK and fail the build; verify the range permits the target Java.
- **`<mule.maven.plugin.version>`** — bumped if present, else inserted, to `.muleMavenPlugin.to` (the latest MMP resolved live in Step 11a). If that field is absent from `tmp/upgrade-targets.json`, the property is left unchanged.
- **MUnit versions** — all three sites bumped to `.munit.to` (the latest MUnit resolved live in Step 11a): the `<munit.version>` property (if declared), the `munit-maven-plugin` plugin block, and the `munit-runner` / `munit-tools` dependency blocks. `${property}`-driven versions ride the property bump; hardcoded literals are rewritten in place. **Do not hand-edit MUnit versions** — this script owns them, same as the connector pins and MMP. If `.munit.to` is absent, the sites are left unchanged.
- **`munit-maven-plugin` `<runtimeVersion>`** — inserted as `${app.runtime}` into the plugin's `<configuration>` (a `<configuration>` block is created if the plugin has none). **Insert-if-absent**: an existing `<runtimeVersion>` (a team's deliberate pin) is never overwritten. This pins MUnit's embedded test runtime to the full target patch. Without it, MUnit falls back to `minMuleVersion` — which we (correctly) write as the `x.y.0` feature line — and would boot the older `x.y.0` runtime, whose `mule-sdk-api` `JavaVersion` enum can lack newer constants (e.g. `JAVA_25`); connectors compiled against the target patch's `@SupportedJavaVersions` then fail extension-model parsing at deploy with `EnumConstantNotPresentException` and MUnit never runs.
- **`mule-artifact.json`** — `minMuleVersion` set to the **`x.y.0` feature line** (e.g. target `4.9.19` → `minMuleVersion 4.9.0`). This is the platform-correct form: `minMuleVersion` declares the *features* the app needs, scoped to the minor line — ACB and Studio write it the same way, and the Introspection Service depends on it. `<app.runtime>` keeps the full patch version. The test-runtime hazard the floor would otherwise create is neutralized by the `<runtimeVersion>${app.runtime}</runtimeVersion>` pin above. `javaSpecificationVersions` always ensured to contain the target Java (the array is **inserted if absent**).

- Update mule-artifact.json (minMuleVersion, javaSpecificationVersions)
- Update pom.xml (runtime version, Java version, connector versions, plugin versions)
- Edit-in-place any ancestor POM that owns a version (`apply_parent_pom_fork.mjs --phase=edit`) — owned connector/runtime versions bumped in the owning parent/grandparent, ancestor `<version>` left untouched so the local build resolves via `<relativePath>`; verified. The `<version>` fork + child repoint happen later in Step 18, after a green build.

---

## Step 14.5: Verify Pins Took (hard gate)

The writes above are done; now prove Maven actually resolves each connector to its **target** version **before** spending a full build on it. `apply_parent_pom_fork.mjs`'s own verify re-runs the static walk, but the static walk shares the discovery blind spot — it can't see an imported BOM or a stale `~/.m2` overriding a pin. `mvn dependency:tree` is the authority on the resolved value: it answers the one question that matters here — *did the edit take?* This is the acceptance test for Step 14.

```bash
# Reads tmp/target-connectors.json; runs `mvn dependency:tree` against the POMs
# as just written. Must run AFTER Step 14's writes and BEFORE the Step 16 build.
node <skill-dir>/scripts/verify_dependency_tree.mjs . --against=target
```

Exit codes: **0** every connector resolves to its `targetVersion` — proceed to Step 15/16; **1** operational error (Maven missing / tree failed / `target-connectors.json` unreadable) — stop and resolve; **2** one or more pins did **not** take. Unlike Step 12.0, this gate is **HARD**: on exit 2, **STOP — do not proceed to the build.** A build on wrong versions would pass packaging and hand back a false green, hiding the defect until deploy.

On a mismatch, read `tmp/dep-tree-verify-target.json` and act on `mismatches[]`:
- Each entry names the connector, the `expected` target, what Maven actually `resolved`, and the `likelyCause`. A `managedFrom` value means an imported BOM / `<dependencyManagement>` outside the edited site is winning — the edit hit the wrong POM.
- Fix at the source, then re-run this gate: if the real owner is an ancestor the walk mislabeled, correct provenance and re-run `apply_parent_pom_fork.mjs --phase=edit`; if it's an imported BOM outside the local chain, this is the same class the Step 12.0 soft gate should have surfaced — raise to the operator (the version can't be pinned by editing local POMs; the BOM itself must change or the connector be pinned explicitly in the child).
- `resolvedOnlyByTree[]` / `missingFromTree[]` are informational here; a blocked connector (no `targetVersion`) is intentionally not diffed.

Only advance to Step 15/16 once this gate exits 0 (or the operator has explicitly accepted a documented, unfixable-locally discrepancy).

---

## Step 15: Update Application Code

Apply the edits enumerated in `tmp/upgrade-plan.md` **mechanically** — no new discoveries, no new choices. Everything that could require user input was resolved during planning. Use `references/llm-prompts.md §1` verbatim as the per-op model prompt (it is self-contained per operation, so it doesn't need to re-open files).

**Global constraints (apply to every edit below):**
- Preserve business intent — `doc:name`, DataWeave payloads, `config-ref` values, error-handler shapes must survive unchanged.
- Never modify unrelated elements.
- Never invent an operation, attribute, or child element that isn't in the plan / Mode-B / Mode-C JSON.
- Never edit `xsi:schemaLocation` — the deterministic `apply_connector_pin.mjs` (Step 14) owns it.
- Never re-open a decision the plan already made — if a decision looks wrong, HALT and route back to Step 12.

### 15.1 Flow-XML edits (plan §Operations + §Configs)

**Per-operation** — for each op in the plan:

1. If the op is `true-removal — operator attention required`, use `AskUserQuestion` at edit time to confirm the manual rewrite path. Never guess a rename here; that decision belongs in the plan.
2. Open `usage_sites[i].file` at its `line` with the `Read` tool (grab ~10 lines each side for context).
3. `Edit` the element in place per the plan's contract: element rename (prefix + local-name); attribute renames from `.attributes[].attributeName`; attribute → child-element promotions from `.childElements[]`; drop removed attributes; insert new-required attributes/children with the plan's default; rewrite `<on-error-propagate type="…">` / `<on-error-continue type="…">` per the plan's error-type map.
4. **Preserve** `doc:name`, DataWeave payloads, `config-ref` values, and other unrelated children.
5. If the namespace prefix changed, update the `xmlns:<oldprefix>` → `xmlns:<newprefix>` binding on the flow's root `<mule>` element. Do NOT touch `xsi:schemaLocation`.


**Per-config** — for each (config, provider) pair in the plan:

1. Rewrite the config element's local-name to the plan's Mode-C `.elementName`.
2. Rewrite the connection element's local-name to the plan's provider `.elementName` from Mode-C.
3. Apply the attribute renames on the connection element from the plan.
4. If the namespace prefix changed, rewrite the config's element prefix — the local-names above are unchanged.

**After all edits above, verify every touched file is namespace-well-formed (per-file gate).** Run this on each file edited in the per-operation and per-config passes above. **`xmllint --noout` alone is not a gate** — it reports an unbound namespace prefix (e.g. `doc:name` with no `xmlns:doc` on the root) as a *warning* and still **exits 0**, so an exit-code / `&& echo ✅` check passes on XML that the Mule 4.9+ build-time AST parser (`mule-maven-plugin` `process-classes`) will reject. Grep the stderr and fail on any namespace error:

```bash
errs="$(xmllint --noout "$file" 2>&1)"
if printf '%s' "$errs" | grep -qE 'namespace error|not defined|not bound'; then
  echo "❌ $file — unbound namespace prefix:"; printf '%s\n' "$errs"; exit 1
fi
```

The defect is any prefixed element or attribute (`<ee:transform>`, `doc:name`, `db:config`, …) whose prefix is not declared on an in-scope ancestor — a latent problem that `mule-maven-plugin` 3.x never parsed at build time but 4.9+ does. The error text names the offending prefix; fix by adding that prefix's `xmlns:<prefix>="<namespace-uri>"` binding to the root `<mule>` element (look the URI up from a working flow file or the connector's Mode-A `.namespace`). A frequently-seen instance is `doc:name` without `xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"`. Never delete the prefixed attribute/element to silence the error.

> **Scope limit (known gap):** this gate only runs on files Step 15 actually edits. A latent unbound prefix in a flow file the plan never touches will slip past it and fail the build at Step 16. The Step 3.5 XML-hygiene gate (Phase 1) is what closes that hole by scanning **every** flow file up front — this per-file gate is the second line of defense on edited files.

### 15.2 DataWeave edits (plan §DataWeave downstream impact)

Apply exactly the DW rewrites enumerated in the plan:
- Sites where the plan proposes a rewrite (Mode-B `.output*` gave a sibling-rename mapping) → apply the `Edit` as written.
- Sites flagged `SITE FLAGGED FOR OPERATOR` → the plan couldn't determine a shape mapping. Surface via `AskUserQuestion` at edit time — do NOT silently rewrite.

Connector-specific hot spots to sanity-check even when the plan didn't flag them: `db:select` column-case flips across driver versions; Java 17 stricter number/date coercion (`as Number`, `now() as String`); `error.errorType.identifier` string content changes (`SFDC:…` → `SALESFORCE:…`, etc.).

### 15.3 MUnit edits (mirror the plan's §Operations + §DataWeave downstream impact + §Connector-wide error type renames)

> **MUnit *version* bumps are NOT here.** The `<munit.version>` property, `munit-maven-plugin`, and `munit-runner`/`munit-tools` dependency versions are bumped deterministically by `apply_runtime_bump.mjs` in Step 14 (from `.munit.to`). This section covers only MUnit **test-content** edits driven by connector op renames / shape changes — never hand-edit a MUnit version here.

MUnit has no dedicated plan section — its edits fall out of the same op renames, output-shape changes, and error-type renames the flow edits use. For every op the plan will rewrite, review each `src/test/munit/**.xml` that references it:
- Update `<munit-tools:mock-when>` `processor` attributes to the NEW element name (e.g. `processor="salesforce:query"`).
- Update mocked `<munit-tools:then-return>` payload shape if Mode-B `.output*` indicates a schema change.
- Update `<munit-tools:assert-that>` expressions that read op-response fields flagged in the plan's DW section.
- Update `<munit-tools:fail>` and `<on-error-propagate type="…">` in MUnit error paths per the plan's error-type map.

`mvn test` (Step 17) is the authoritative gate for these edits.

### 15.4 Custom Java edits (plan §Custom Java downstream impact)

Apply exactly the source rewrites the plan enumerated from Step 8a — no new discoveries, no new choices (everything requiring judgment was resolved during planning). These are ordinary `Edit`s to `.java` files plus any dependency add the plan specified:

- **Source rewrites** — for each `file:line` bullet, `Read` the file for context, then `Edit` the offending API to the plan's proposed replacement (e.g. `javax.xml.bind.*` import → the `jakarta.*` equivalent, `Class.newInstance()` → `getDeclaredConstructor().newInstance()`, `new String(bytes)` → the charset-explicit form). Preserve behavior — a charset/locale fix must pin the value the code relied on implicitly, not an arbitrary one.
- **Dependency adds** — when the plan says a removed JDK module needs a standalone dependency, add the exact `<dependency>` coordinate the plan named to `pom.xml`. This is the only case where Step 15 touches `pom.xml` for a non-version reason; it is still a plan-approved edit, not a discovery.
- **Never edit an 8b (FLAG) item here.** Runtime-only surfaces (Spring beans, Serializable state, security/TLS, log4j appenders, JDK-module reflection) were flagged for the operator, not fixed. If a build/test failure later implicates one, HALT and route back to Step 12 — do not silently rewrite a flagged site.

`mvn clean package` (Step 16) is the gate for `src/main/java` edits; `mvn test` (Step 17) is the gate for `src/test/java` and MUnit-Java edits. A compile-clean build does **not** clear the 8b runtime surfaces — those remain the operator's confirmed risk.

Summary of what Step 15 touches:

- Update flows for connector operation changes (based on Step 7 analysis)
- Update configuration components for config changes
- Update DataWeave scripts for compatibility issues (based on Step 9 analysis)
- Update custom Java classes for version incompatibilities (based on Step 8 analysis)
- Update MUnit test files for connector changes (based on Step 10 analysis)

Use metadata from `describe-connector` to ensure operations, configs, and attributes match new connector versions.

---

## Step 16: Build Loop

Bounded recovery loop with a **5-retry** cap. `mvn clean package -DskipTests` BUILD SUCCESS is packaging-only — it validates that (a) XSDs parse, (b) DataWeave compiles, (c) the `.jar` packages. It does NOT execute any flow, hit any external system, or run MUnit. Step 17 (`mvn test`) is the real runtime gate.

- Run `JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<target-java>.json) mvn clean package -DskipTests 2>&1 | tee tmp/mvn-failures/build-<attempt>.log` — set `JAVA_HOME` inline to the target JDK (each `Bash` call is a fresh shell; an earlier `export` does not carry over)
- If BUILD SUCCESS → advance to Step 17.
- If BUILD FAILURE → **do not ad-hoc patch.** Enter the classifier below (16.1). Almost every mvn failure is an XSD/DSL mismatch whose fix is already in the metadata collected during Plan Phase (Mode-A / Mode-B / Mode-C JSON) — structured recovery reuses that data instead of re-guessing. Apply **one** targeted edit, then re-run `mvn` in a NEW response.

### 16.1 Failure classifier — parse, classify, fix from metadata

**Parse the failure** — extract from the Maven output (save the raw output to `tmp/mvn-failures/<attempt>.log`):

| Field | Where it appears | Example |
|---|---|---|
| `file` | `[ERROR] Could not load flow: file:.../src/main/mule/<flow>.xml` | `/…/src/main/mule/example.xml` |
| `line`, `col` | `cvc-*: … [file:line:col]` or `line N column M` | `line 23 column 4` |
| `error_code` | `cvc-complex-type.<N>.<N>` / `cvc-enumeration-valid` / `cvc-datatype-valid.1.2.1` | `cvc-complex-type.3.2.2` |
| `element` | The `<prefix:name>` in the message | `<salesforce:basic-connection>` |
| `attribute` | The attribute (if any) named in the message | `securityType` |
| `expected` | For enum/type errors, allowed values | `[BASIC_AUTH, OAUTH_JWT, ...]` |

**Classify** into one of these classes and fix from the cited metadata:

1. **attribute-rename** — `cvc-complex-type.3.2.2` "Attribute '<X>' is not allowed to appear in element '<prefix:op>'". Fix source: `tmp/connector-metadata/<nick>-new-<op>.json` → `.attributes[].attributeName`. Recovery: find a plausible NEW attribute (Levenshtein-close or same semantic role) and edit the site; if the plan already picked a mapping, apply the plan's. Common case: `http:listener` `method="X"` → `allowedMethods="X"` (the rename applies to the listener **source** only — `http:request` keeps `method`, so do not touch request sites).
2. **missing-required-child** — `cvc-complex-type.2.4.a/b` "Invalid content was found starting with element '…'. One of '{…}' is expected". Fix source: `…-new-<op>.json` → `.childElements[]`. Recovery: an OLD attribute (e.g. `content="#[payload]"`) is now a child element (`<prefix:content>#[payload]</prefix:content>`) — rewrite accordingly.
3. **element-rename** — `cvc-elt.1.a` "Cannot find the declaration of element '<prefix:op>'". Fix source: `<nick>-new.json` → `.operations[]` / `.sources[]`. Recovery: if the plan already picked a rename target, apply it; otherwise the plan missed the rename — go back to Step 12, do NOT guess.
4. **connection-provider element name** — same code shape as (3) but inside a `<prefix:config>` block. Fix source: `…-new-<config>-<provider>.json` → `.elementName` (config) and `.connectionProviders[] | select(.name == "<provider>") | .elementName` (connection). Recovery: rewrite to Mode-C's `.elementName`. Bounded and deterministic — never guess from the SDK identifier.
5. **enum-value** — `cvc-enumeration-valid` "Value '<X>' is not facet-valid with respect to enumeration '[…]'". Fix source: the parsed message carries allowed values; cross-reference the per-op JSON's `.attributes[].allowedValues`. Recovery: pick the NEW enum value that maps to the OLD one (usually a rename — `BASIC` → `BASIC_AUTH`), or `AskUserQuestion` if genuinely ambiguous.
6. **xsi:schemaLocation URL** — `SAXException` "schema_reference.4" or `cvc-elt.1.a` on the `<mule ...>` root, with a `.../current/mule-<name>.xsd` URL that 404s. Fix source: `tmp/connector-versions/<nick>.json` (pinned GAV) + the **pinned-namespace ground truth** for the failing connector. That ground truth is the no-suffix `tmp/connector-metadata/<nick>.json`, which is NOT written up front (Step 14 no longer re-describes every connector). Re-describe the **one** failing connector now, on demand — Java 17+ required, same as Step 7. Pin the JDK **inline** (this is a single one-shot call, not the Step 7 fan-out, and each `Bash` call is a fresh shell — an earlier `export` may not have carried over); the script itself hard-refuses < Java 17:
   ```bash
   JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<target-java>.json) node <skill-dir>/scripts/describe_connector.mjs "<nick>"        # no -new suffix → writes tmp/connector-metadata/<nick>.json
   ```
   Then read `<nick>.json` → `.namespace.uri`. Recovery: re-run `apply_connector_pin.mjs <nick> .` (it reads `<nick>-new.json` for the namespace and rewrites the URL deterministically). Do NOT hand-edit `xsi:schemaLocation`.
7. **pom / plugin / runtime** — anything from the reactor before the app loads (`mule-maven-plugin` not found, `${app.runtime}` unresolved, `javaSpecificationVersions` mismatch, missing artifact in the local repo). Fix source: `tmp/upgrade-targets.json` (`.muleMavenPlugin.to`, the Step 11a MMP); `pom.xml` + `mule-artifact.json`; `tmp/connector-versions/*.json`. Recovery: re-run `apply_runtime_bump.mjs .` (runtime/plugin property wrong) or `apply_connector_pin.mjs <nick> .` (dependency version wrong). Only hand-edit `pom.xml` when both scripts report `not-found`.
8. **unknown / other** — doesn't fit the classes above. Fix source: cross-reference `tmp/connector-metadata/*.json` + `tmp/connector-versions/*.json` with Mule 4 XSD/DSL semantics. Recovery: revisit whichever earlier phase's output the failure implicates; log reasoning in `tmp/mvn-failures/<attempt>.log`. Fall through to `AskUserQuestion` only once the 5-retry budget is exhausted OR the same knowledge-based edit has already failed once.

Apply **one** targeted edit per retry (one `Edit`, or the ONE script re-run named in the recovery step) — do not batch. Re-run `mvn clean package` in a NEW response. On success → Step 17; on failure → increment the retry counter and re-parse.

### Diagnostic escalation ladder — MANDATORY on opaque failures

A "guess-fix-retry" loop that only reads the terse mvn line burns retries when the error message doesn't point at the offending file. Two failure modes are especially opaque and MUST trigger an escalation probe **before** the next code edit — not after a wasted retry.

**Trigger A — XSD "invalid content" on a pinned connector's operation/element.**
Symptom: `cvc-complex-type.2.4.a: Invalid content was found starting with element '<ns>:<op>'`.
Meaning: the flow XML calls an op that the *resolved* XSD doesn't declare. The pom pin may not have taken effect (stale local repo, transitive pin from parent POM, `current/` alias resolving to old version).

Before editing anything, run:
```bash
mvn dependency:tree -Dincludes=<groupId>:<artifactId> 2>&1 | tail -20
```
- If the resolved version ≠ the pinned version → `rm -rf ~/.m2/repository/<groupPath>/<artifactId>/<staleVer>` then re-run `mvn ... -U`.
- If versions match → the operation was genuinely renamed. Re-read the connector's Mode-B / `<nick>-op-renames.json` and apply the rename to the flow XML.

**Trigger B — opaque `ClassCastException` / `NullPointerException` with no app file in the stack.**
Symptom: `java.lang.ClassCastException: class java.lang.String cannot be cast to class java.lang.Integer` (or similar) and the stack trace lives entirely inside `org.mule.runtime.*` / `com.mulesoft.*` classes — no file/line in `src/main/mule/`.

Before editing anything, re-run with debug and grep for the failure frame + bean context:
```bash
mvn clean package -DskipTests -X 2>&1 | grep -B 20 -A 3 'ClassCastException\|NullPointerException' \
  | tee tmp/mvn-failures/build-<attempt>-debug.log
```
Then scan the preceding 20 lines for `Creating bean` / `parsing element` / `BeanDefinition` — those name the flow-XML element being constructed (e.g. `db:pooling-profile`, `http:listener-connection`). That element is where the fix lives. Common cause: a `${property}` placeholder on an attribute the new connector version now types as `xs:int`/`xs:boolean` — quote-strip or wrap in `${int(...)}` per the Mode-B `.attributes[].type`.

**Both probes are cheap (single mvn invocation, no code changes) and MUST run before the third retry** — otherwise the loop hits its 5-retry cap while still guessing.

**Trigger C — XSD error on an element/attribute that the plan already anticipated.**
Symptom, either:
- `cvc-complex-type.2.4.a: Invalid content ... element '<ns>:<name>'` AND grep shows `Rewrite <ns>:<name> →` in `tmp/upgrade-plan.md`; OR
- `cvc-complex-type.4: Attribute '<attr>' must appear on element '<ns>:<name>'` AND grep shows `Add <ns>:<name> @<attr>=` in `tmp/upgrade-plan.md`.

Do NOT re-analyze from XSD error text and do NOT guess an enum value. `grep -A2 "Rewrite <ns>:<name>\|Add <ns>:<name>" tmp/upgrade-plan.md` for the target directive, then apply that edit verbatim. The plan was written with Mode-B/C metadata already in hand (Step 12 sub-step 2) — trust it. If the plan bullet is missing but the WARN was present in Step 11.5 (or the attribute was declared `required: true` in the Mode-B/C JSON), that's a Step 12 skip; loop back to Step 12 and re-synthesize the plan (do not paper over it with a guess in Step 16).

### Retry cap and halt

- Retry budget: **5 build failures max** (log-and-diagnostic pass counts as ½ retry — see the classifier in 16.1).
- If BUILD FAILURE persists after 5 real edit-retries with both escalation probes run, HALT via `AskUserQuestion` with:
  1. First 30 lines of the last three `tmp/mvn-failures/build-<N>.log`
  2. Dependency-tree excerpt (Trigger A) or debug stack frame (Trigger B), whichever ran
  3. Classifications applied per retry
  4. 2–4 candidate next actions (typically: pin a different connector version, revert one flow-XML edit, request a Mode-C describe of the failing config)

---

## Step 17: MUnit Loop

Runs ONLY after Step 16 reports `BUILD SUCCESS`. `mvn clean package` validates packaging only — MUnit is the authoritative runtime gate.

MUnit runs only when there is **both** a wired plugin **and** at least one suite to run. Check both — the loop's pass gate below treats a missing `MUnit Run Summary` as a FAIL, so entering the loop with zero suites would burn every retry and HALT on a healthy app.

```bash
grep -c 'munit-maven-plugin' pom.xml                    # plugin wired?
find src/test/munit -name '*.xml' 2>/dev/null | wc -l   # suites present?
```

- **plugin count `0`** → no MUnit wired. Log `no runtime validation performed — no munit-maven-plugin declared` and skip the loop.
- **plugin `>= 1` but suite count `0`** → MUnit is wired but there is nothing to run (`mvn clean test` would print "no MUnit suites found" and emit no `MUnit Run Summary`). This is **not** a failure. Log `no runtime validation performed — munit-maven-plugin declared but no suites under src/test/munit` and skip the loop.
- **plugin `>= 1` and suite `>= 1`** → MUnit has suites to run. Enter the loop.

**Prefer `mvn clean test` over bare `mvn test`.** `clean` reduces stale-cache reuse, but it does NOT guarantee the `Skipping execution of munit because it has already been run` line disappears — MUnit binds its `test` execution more than once in the reactor, so a genuine run and a later `Skipping…` line routinely co-exist in the same log. `Skipping…` on its own is NOT a failure.

**The pass gate is the `MUnit Run Summary`, nothing else — not `BUILD SUCCESS`, not the absence of `Skipping…`.** Grep the WHOLE log (`grep -nE 'MUnit Run Summary|Tests run:' <log>`), never judge from the tail. MUnit passes ONLY when the log contains an actual `MUnit Run Summary` with `Tests run: N (N >= 1)`, `Failed: 0`, `Errors: 0`. Treat as a FAIL only when there is NO `MUnit Run Summary` at all, or it shows `Tests run: 0`, or `Failed`/`Errors` > 0 — even if the build says `BUILD SUCCESS`. A trailing `Skipping execution of munit` line with a real `MUnit Run Summary` earlier in the log IS a pass.

**One `mvn clean test` per response.** On failure, apply the same recovery approach as Step 16's classifier (16.1), but the applicable classes are narrower — MUnit failures are always inside test XML, not flow XML. Save each failing run's output to `tmp/mvn-failures/munit-<attempt>.log`. The five MUnit-specific classes:

1. **attribute-rename** on `<munit-tools:mock-when processor="<prefix:op>">` — an unknown mock attribute. Fix source: `tmp/connector-metadata/<nick>-new-<op>.json` `.attributes[].attributeName`.
2. **element-rename** on `<munit-tools:mock-when processor="<prefix:oldOp>">` — the `processor` attribute names an op that no longer exists. Fix source: `<nick>-new.json` `.operations[]`; apply the plan's rename mapping.
3. **connection-provider element name** — same shape as element-rename, but inside a `<munit-tools:mock-when processor="<prefix:config>">` referring to a connection-provider element. Fix source: `…-new-<config>-<provider>.json` `.elementName`.
4. **enum-value** on a mocked payload — `<munit-tools:then-return>` returns a constant that's no longer a valid enum value. Fix source: per-op `.attributes[].allowedValues`.
5. **assertion-shape** — `<munit-tools:assert-that>` reads a field the NEW op no longer emits. Fix source: cross-reference Mode-B `.output*` keys, rewrite the JSONPath / DW read.

MUnit failures classify against the same Mode-B `.attributes[] / .childElements[] / .output*` JSON as flow-XML failures.

**Retry budget: 6 attempts.** MUnit failures are more diffuse than XSD/DSL failures (test authoring style varies, and one op change often touches multiple mocks), so the budget is looser than Step 16's 5-retry cap. After the 6th failed `mvn clean test`, HALT via `AskUserQuestion` with the last three `tmp/mvn-failures/munit-<attempt>.log` excerpts (first 30 lines each), classifications, edits applied, and 2–4 candidate next actions.

Do NOT attempt a 7th retry without user direction. Treat repeated failures as a signal that the plan missed a Mode-B / Mode-C detail, not as noise to retry through.

- Run `JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<target-java>.json) mvn clean test` — pin the MUnit run to the resolved target JDK inline, same as Steps 3c and 16
- Confirm the `MUnit Run Summary` shows `Tests run: N (>= 1)`, `Failed: 0`, `Errors: 0` — `BUILD SUCCESS` alone is not a pass
- Fix MUnit tests
- Repeat until all tests pass

---

## Step 18: Fork the Parent-POM Version

**Conditional:** Only relevant when Step 14's `apply_parent_pom_fork.mjs --phase=edit` reported one or more owning ancestors — i.e. its output `ancestorsForked[]` was non-empty. If the app is child-only, the edit phase printed "nothing to do" and there is nothing to fork; skip to Step 19.

At this point the build is **green** (Steps 16/17 passed) against the new connector/runtime versions that Step 14 wrote **in place** into each owning ancestor — validated through the child's unchanged `<parent>` link + `<relativePath>`. This step performs the **fork**: bump each owning ancestor's own `<version>` and repoint the downstream `<parent><version>` so this app's chain re-links to the new ancestor version.

**First, ask the operator which version-bump level to apply.** Do not silently pick one. Run the fork in dry-run to learn each owning ancestor's *pristine* `<version>` without writing anything:

```bash
node <skill-dir>/scripts/apply_parent_pom_fork.mjs . --phase=fork --dry-run
```

Prints a short summary; the full result is written to `tmp/parent-pom-fork-dryrun.json`. Read `ancestorsForked[]` from that file (`jq '.ancestorsForked' tmp/parent-pom-fork-dryrun.json`). Each entry carries `ownVersion.from` (the pristine baseline this fork computes from), `artifactId`, and `pomPath` (the field is `pomPath`, **not** `path`; there is no per-entry `edits` key — the edit log is the single top-level `edits[]`). For each ancestor, compute the three semver candidates from `ownVersion.from`:
- **Major** — `x.0.0` with `x` incremented (e.g. `3.2.0 → 4.0.0`); for a breaking connector jump.
- **Minor** — `x.(y+1).0` (e.g. `3.2.0 → 3.3.0`); **the default** for a normal connector/runtime upgrade.
- **Patch** — `x.y.(z+1)` (e.g. `3.2.0 → 3.2.1`); for a trivial bump.

Then present **one** `AskUserQuestion` with those three levels (Minor recommended/first). The chosen level applies to **every** forked ancestor — bump level is a property of the upgrade, not of each POM — but show the concrete per-ancestor numbers in each option so the operator sees exactly what each level produces. For a two-ancestor chain the Minor option's description would read, e.g., *"grandparent 1.0.0→1.1.0, parent 3.2.0→3.3.0"*. Only prompt when `ancestorsForked[]` is non-empty (the Step 14 conditional above already guarantees this).

**Then run the fork for real** with the operator's chosen level:

```bash
node <skill-dir>/scripts/apply_parent_pom_fork.mjs . --phase=fork --fork-bump=<chosen>   # major | minor | patch
```

Prints a short summary; the full result is written to `tmp/parent-pom-fork.json` (read it with `jq` if you need the per-ancestor detail). It processes the chain deepest-first (grandparent `<version>` bumped → parent's `<parent>` ref repointed → parent `<version>` bumped → child's `<parent>` ref repointed) and **verifies** each downstream link points at the fork before exiting. Present, per forked ancestor, from its output:
- the ancestor POM path and its `<version>` change (e.g. `all-scenarios-grandparent 1.0.0 → 1.1.0`),
- the connectors/properties that were bumped inside it (already applied in Step 14),
- any **operator-attention warnings** (a connector declared in the ancestor that had no resolved target — bumped nothing, left as-is).

**Confirm with a re-build.** The fork is the workflow's **last file mutation**, and the script's link-check is a *static* verify (it confirms each downstream `<parent><version>` points at the fork), not a compile. Since every other mutating step ends in a build gate, close this one too — re-run the build once, pinned to the target JDK exactly as in Step 16, and require `BUILD SUCCESS` before cleanup:

```bash
JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<target-java>.json) mvn clean package
```

This catches a repoint that verifies statically but won't actually resolve (e.g. `<relativePath>` not pointing at the forked ancestor, or a sibling GAV mismatch). If it fails, fix the `<parent>`/`<relativePath>` link — do **not** hand-edit versions (see idempotency note below) — and re-run before proceeding to Step 19.

**Fork version numbering is idempotent.** The fork `<version>` is always computed from the *pristine* ancestor version captured in the Step-14 `tmp/pom-backups/` snapshot, not the live file — so if the operator changes their mind, just re-run with a different `--fork-bump` level (**no manual restore needed**): a second `--fork-bump=minor` run yields `1.0.0 → 1.1.0` again, never `1.1.0 → 1.2.0`, and switching to `major` recomputes `1.0.0 → 2.0.0` from the original. Do not hand-edit the ancestor `<version>` or the child's `<parent><version>` — the script keeps the two in lockstep and re-verifies; a manual edit breaks that invariant.

**These are LOCAL edits — the skill does not publish anything.** The fork changes only files on disk: the ancestor POM's `<version>` and the child's `<parent>` reference. Tell the operator plainly: the parent/grandparent POM now carries a new local version that nothing else knows about yet. If sibling apps consume this parent by GAV (e.g. from Exchange or a Maven repo), **the operator can publish the new ancestor version themselves** so those siblings can resolve it — the skill will not run any `anypoint-cli` / `mvn deploy` publish on their behalf. Until they do, this app builds locally against the on-disk fork via `<relativePath>`, and sibling apps continue resolving the old, still-published ancestor version unchanged.

---

## Step 19: Clean Up Workspace `tmp/`

Delete `tmp/` **only** after Step 16 reported `BUILD SUCCESS` and Step 17 recorded its MUnit verdict — the state files are useful for diagnosing failures, so do not clean them up mid-flight.

Run the two removals as **two separate responses**, one `rm` each — never chain them into one command, and never bundle with `mvn` or the completion signal. Both targets are gitignored, so a denial is harmless.

```bash
rm -r tmp/
```

Then, in a separate response, the ephemeral fast-xml-parser install from Step 7. Resolve the same physical path the install used (`pwd -P`), so the `rm -rf` targets the dir the package actually landed in:

```bash
rm -rf "$(dirname "$(cd "<skill-dir>" && pwd -P)")/node_modules"
```

---

## Step 20: Declare Completion

**Its own response.** No `mvn`, no `rm`, no other tool calls. This response's only job is the three-line summary. Preconditions:

1. Step 16 last returned `BUILD SUCCESS` on the upgraded project.
2. Step 17 either recorded `mvn test` passed OR wrote a `no runtime validation performed — …` skip note (no plugin, or plugin wired but no suites).
3. Step 19's two cleanup removals (`rm -r tmp/`, then `rm -rf` the ephemeral `node_modules`) each already ran in their own previous response.

Emit exactly three lines:

1. `BUILD SUCCESS` with the path to `target/<project>-*.jar`.
2. MUnit verdict from Step 17 (`mvn test: all passing` OR the exact `no runtime validation performed — …` skip note Step 17 logged: no plugin, or plugin wired but no suites under `src/test/munit`).
3. One-line from-to summary: `Mule <from> → <to>, Java <from> → <to>, connectors: <C> of <total> updated` — read the from/to values from `tmp/upgrade-targets.json` (`.mule.from`/`.mule.to`, `.java.from`/`.java.to`) before Step 19 removed it, or from your locked target in Step 4c. **`<C>` is the count of connectors that actually changed version** (`target-connectors.json .connectors[] | changed == true`) and `<total>` is all connectors in scope — so an already-latest connector (e.g. `email 1.8.0 → 1.8.0`, `changed == false`) is counted in `<total>` but not in `<C>`, and the number can never read as if every connector was bumped. Capture both counts from `target-connectors.json` **before** Step 19 removes `tmp/`. When `<C>` equals `<total>` (everything changed) this naturally reads `N of N updated`.

Do NOT include per-file diffs, "what was done" recaps, or speculative "next steps" — the user can read the diff.

Present final summary:
- Target versions achieved (Java, Mule Runtime)
- Connectors updated (count and versions)
- Build status: SUCCESS
- Tests status: ALL PASSING
- Next steps: review changes, commit, deploy

---

## Troubleshooting

**anypoint-cli-v4 not found:** `npm install -g @mulesoft/anypoint-cli-v4`

**DX plugin not found:** `npm install -g @salesforce/anypoint-cli-dx-mule-plugin`

**Runtime path required:** first use of `dx mule describe-connector` or related commands prompts for runtime location. The path is saved to `~/.mule-dx/config.json`.

**Parent POM not available:** the parent POM must be accessible locally to resolve inherited versions. Do **not** attempt to download it — ask the user to make it available locally, then re-run Step 2.

**Connector not in Exchange:** cannot upgrade automatically. Flag as blocker and inform user.

**Build fails after version update:** review connector operation changes from describe-connector output. Update flow XML to match new operation signatures.

**MUnit tests fail:** update test mocks and assertions to match new connector operation signatures and response shapes.

---

## Quick Reference

`<skill-dir>` below is the absolute path you were given in the "skill is now active" message. Use it consistently — do not construct relative `../scripts/...` paths.

```bash
# Step 1 — validate prerequisites (writes tmp/upgrade-prereqs.json; non-zero exit => STOP)
node <skill-dir>/scripts/validate_prerequisites.mjs .

# Step 2a — detect current Mule Runtime version (writes tmp/current-mule-version.json)
node <skill-dir>/scripts/detect_current_mule_version.mjs .
# When Step 2a needs a prompt (or Step 3a correction): persist the user's answer (sets belowFloor if < 4.3)
node <skill-dir>/scripts/detect_current_mule_version.mjs . --user-version <v>

# Step 2b — detect current Java version (writes tmp/current-java-version.json)
node <skill-dir>/scripts/detect_current_java_version.mjs .
# When Step 2b needs a prompt (or Step 3a correction): persist the user's answer
node <skill-dir>/scripts/detect_current_java_version.mjs . --user-version <n>

# Step 3b — ensure the current Java JDK is available (writes tmp/resolve-jdk-<major>.json)
# MAY download over the network; pass --no-download to only detect an installed JDK.
node <skill-dir>/scripts/resolve_jdk.mjs <current-java-major> .

# Step 3c — detect current MMP version (writes tmp/current-mmp.json; needsPluginBump=true when MMP is 3.x)
# 3.x can't run on the required Maven 3.9.x → Step 3c bumps MMP to latest 4.x for the baseline build only.
node <skill-dir>/scripts/detect_current_mmp_version.mjs .

# Step 3c — baseline build on the resolved JAVA_HOME (must be BUILD SUCCESS)
JAVA_HOME=$(jq -r .javaHome tmp/resolve-jdk-<major>.json) mvn clean package

# Step 4 — recommend a target (writes tmp/target-versions.json)
node <skill-dir>/scripts/resolve_target_versions.mjs .

# Step 4 — validate a user-requested target (only when the user named one; never invent one)
TARGET_MULE=<user-requested-mule> node <skill-dir>/scripts/resolve_target_versions.mjs .

# Step 5a — extract connector deps from the POM + local parent chain
# (writes tmp/connectors.json; advisory, always exits 0 — branch on connectors[]/needsUserPrompt)
node <skill-dir>/scripts/extract_connectors.mjs .

# Step 5b — check the CURRENT version's Java support in Exchange
# (writes tmp/connector-java-compat.json; non-zero exit => STOP)
node <skill-dir>/scripts/check_connector_java_compat.mjs .

# Step 6 — resolve the LATEST target-compatible version per connector
# (reads the target from tmp/target-versions.json options[0]; writes tmp/target-connectors.json; non-zero exit => STOP)
node <skill-dir>/scripts/resolve_target_connectors.mjs .

# Step 6 — resolve against a user-confirmed target instead of options[0]
# (use the confirmed pair from tmp/target-versions.json — never invent versions)
TARGET_MULE=<confirmed-mule> TARGET_JAVA=<confirmed-java> node <skill-dir>/scripts/resolve_target_connectors.mjs .

# Step 6.5 — bridge: write tmp/connector-choices/<nick>-new.json + tmp/upgrade-targets.json (Write/jq), then sanity-check
jq -e '.mule.to and .java.to and (.connectors|type=="array")' tmp/upgrade-targets.json

# Step 7 prereq — register a Mule >=4.9 runtime substrate for describe (reuse mule.to if >=4.9)
SUBSTRATE=$(jq -r 'if (.mule.to | split(".") | map(tonumber)) as $v | ($v[0] > 4 or ($v[0] == 4 and $v[1] >= 9)) then .mule.to else "4.9.19" end' tmp/upgrade-targets.json)
node <skill-dir>/scripts/resolve_runtime.mjs "$SUBSTRATE" .
anypoint-cli-v4 dx mule runtime path --set "$(jq -r .runtimePath tmp/resolve-runtime-$SUBSTRATE.json)"

# Step 7a — Mode-A summary describe of a NEW connector version (Java 17+ required)
node <skill-dir>/scripts/describe_connector.mjs <nick>-new

# Step 7b — enumerate connector usage from flow XML (parser-preferred, grep fallback rc=3)
node <skill-dir>/scripts/enumerate_usage_xml.mjs <nick> .
node <skill-dir>/scripts/enumerate_usage.mjs <nick> .

# Step 7b — Mode-B (per op/source) and Mode-C (per config-provider) describe
node <skill-dir>/scripts/describe_connector.mjs <nick>-new --type operation --name <op>
node <skill-dir>/scripts/describe_connector.mjs <nick>-new --type connection-provider --name <provider> --config-name <config>

# Step 11.5 — coverage gate (exit 1 => re-run missing describes)
node <skill-dir>/scripts/verify_metadata_coverage.mjs

# Step 12.0 — SOFT gate: cross-check discovery vs Maven (exit 2 => annotate plan + raise at approval, don't halt)
node <skill-dir>/scripts/verify_dependency_tree.mjs . --against=existing

# Step 13 — ensure the TARGET JDK + Mule Runtime are present (check local dir, else download)
# both read the finalized target from tmp/upgrade-targets.json; non-zero exit => surface stdout & WAIT
node <skill-dir>/scripts/resolve_jdk.mjs "$(jq -r '.java.to' tmp/upgrade-targets.json)" .
node <skill-dir>/scripts/resolve_runtime.mjs "$(jq -r '.mule.to' tmp/upgrade-targets.json)" .

# Step 14 — deterministic version rewrites
node <skill-dir>/scripts/promote_new_connector_pins.mjs
node <skill-dir>/scripts/apply_runtime_bump.mjs .
node <skill-dir>/scripts/apply_connector_pin.mjs <nick> .

# Step 14.5 — HARD gate: verify pins took before the build (exit 2 => STOP, don't build)
node <skill-dir>/scripts/verify_dependency_tree.mjs . --against=target
```
