---
name: validate-versionless-switch
description: >
  Check whether a classic (versioned) Mule 4 application can be switched to a
  versionless app, by running the real Upgrade-to-Versionless switch validator
  headlessly — the same seven-axis VersionlessValidator the Anypoint Code Builder
  "Upgrade to Versionless" wizard runs, outside the IDE. Scans src/main/mule and
  the pom for shapes the versionless runtime does not support, writes a JSON
  report, and prints a BLOCK/INFO summary with a switchable verdict. TRIGGER when:
  user asks to "check/validate if a Mule app can go versionless", "will this app
  switch to versionless", "run the versionless switch validator / compatibility
  check", "what blocks my app from being versionless", or "pre-check before
  switching to versionless". DO NOT TRIGGER when: the user wants to actually
  perform the switch and write project-manifest.json (skill
  switch-classic-mule-to-versionless), build/run a versionless app (skill
  build-run-versionless-app), or upgrade connector/runtime versions (skill
  upgrade-mule-app).
license: Apache-2.0
compatibility: >
  Requires JDK 17 (auto-discovered via JAVA_HOME or a standard install root) and a
  Mule 4 application (a project root with pom.xml and src/main/mule). The bundled
  validator is pure JVM — platform-independent, so no per-OS/arch binaries.
allowed-tools: Bash Read Write Edit AskUserQuestion
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Validate a Mule App's Versionless Switchability

You are a MuleSoft tooling specialist running the **Upgrade-to-Versionless switch
validator** over a classic Mule 4 application to determine, before any change is
made, whether the app can be switched to versionless — and if not, exactly what
blocks it.

This is the **same validator the Anypoint Code Builder "Upgrade to Versionless"
wizard runs** at switch time (`VersionlessValidator`, seven compatibility axes
including the Scala DataWeave parser), invoked **headlessly** — no IDE, no LSP
server, no platform connection, no network. It is a **read-only pre-check**: it
inspects the app and reports; it never edits the project.

## When to Use This Skill

**Use this skill when the user asks to:**

- "Check / validate whether this Mule app can switch to versionless"
- "Run the versionless switch validator (or compatibility check) on my app"
- "What blocks my app from being versionless?"
- "Pre-check before I switch to versionless"

**Trigger keywords:** versionless · switch validator · compatibility check · switchable · can-I-go-versionless · pre-check.

**Do NOT use this skill when:** the user wants to **perform** the switch and write
`project-manifest.json` → **skill switch-classic-mule-to-versionless** (run this
validator *first* as its pre-check); to **build/run** a versionless app → **skill
build-run-versionless-app**; or to upgrade connector/runtime **versions** →
**skill upgrade-mule-app**.

## What this skill does

Given a Mule 4 project root (a directory with `pom.xml` and `src/main/mule`), it
runs all seven switch-compatibility axes and emits a report:

| Axis | Category | Default? | Flags (examples) |
| --- | --- | --- | --- |
| DataWeave | `dataweave` | ✅ | DW script constructs the versionless engine's capability manifest does not support |
| Flow / core | `flow` | ✅ | connector operations/sources and core constructs absent from the versionless runtime descriptors |
| Connector switchability | `connector` | ✅ | element namespaces with no bundled descriptor (switchability confirmable only against RDS at switch time) — INFO, never a BLOCK |
| Config & secrets | `config` | `--extended` | `${secure::…}` / `<secure-properties:config>`, `.properties` config files (BLOCK); prefix dispatchers, multiple/dynamic property files, `<global-property>` (INFO) |
| Project shape | `project` | `--extended` | multi-module reactor, `mule-domain`/`mule-policy` packaging, `<import>`-based multi-file app |
| Security | `security` | `--extended` | custom `<tls:context>` keystores, `<api-gateway:autodiscovery>`, `http-policy:*` |
| DX notices | `devx` | `--extended` | MUnit, custom `log4j2.xml`, `<tracking:*>`, `<notifications>`, OpenTelemetry, explicit streaming (INFO-only, never blocks) |
| Data & state | `state` | `--extended` | `<os:*>` object store, `<redelivery-policy>`, `<idempotent-message-validator>`, OAuth-managed configs |

Each finding is **BLOCK** (gates the switch — counts toward `blockerCount`) or
**INFO** (resolves differently but still runs). The switch is **safe only when
`blockerCount` is 0**.

**Default scope mirrors the wizard.** By default the report (and `blockerCount`)
covers the three categories the ACB "Upgrade to Versionless" switch gate surfaces —
`dataweave`, `flow`, and `connector`. Pass **`--extended`** to add the other five
axes (`config`, `project`, `security`, `devx`, `state`) as advisory findings. The
validator always runs all seven internally; `--extended` only widens what the CLI
reports and counts.

**Two signals the CLI adds on top of the raw axes:**

- **Core constructs the runtime can't run (`flow`, BLOCK).** The versionless runtime
  builder implements only a subset of mule-core (`flow`, `sub-flow`, `flow-ref`,
  `set-payload`/`set-variable`/`remove-variable`, `logger`, `foreach`, `async`,
  `choice`/`when`/`otherwise`, the error-handler family). Constructs/operations the
  mule-core descriptor lists but the runtime does **not** implement — `try`,
  `scatter-gather`, `parallel-foreach`, `round-robin`, `first-successful`,
  `until-successful`, and `raise-error` — are flagged `flow.element.unsupported`. (The
  guided walk reports the **outermost** unsupported element and does not descend into
  it, so a `raise-error` nested in a flagged `try` is covered once the `try` is
  resolved.)
- **Connector switchability (`connector`, INFO).** The versionless runtime has no
  offline connector registry, so whether a non-bundled connector is switchable can only
  be confirmed by RDS at switch time. The CLI emits one INFO per app element namespace
  that has no bundled descriptor and is not core/ee/apikit (runtime-supported without
  one) nor owned by another axis (`tls`, `os`, `secure-properties`, …). It is **never a
  BLOCK** — a missing descriptor is not proof of incompatibility.

## What's bundled

| Path | What | Why |
| --- | --- | --- |
| `lib/*.jar` | the validator runtime classpath (5 jars, ~121 MB) | the validator and its DataWeave parser cannot run without them; provided-scope in the LSP host and not on any public registry. The plugin jar shades all seven switch axes; the CLI jar is the headless entry point. Proven-minimal via a leave-one-out sweep (see `PROVENANCE.txt`) |
| `rds-override/rds/dwx-capabilities.json` | ground-truth DataWeave capability manifest, prepended to the classpath | the copy baked into the plugin jar is stale (it lists `application/java` as a *supported* writer); the override is the runtime's own manifest where `application/java` is correctly unsupported, so the DataWeave axis flags `output application/java` as the wizard does (see `PROVENANCE.txt`) |
| `dsl/<name>/dsl.json` | versionless connector descriptors (http, salesforce, mule-core, twilio) | the flow axis decides element support against these; sourced from the go-runtime descriptors (the runtime's own ground truth). The CLI prunes the mule-core constructs the versionless runtime does not implement before the flow axis runs |
| `src/VersionlessValidatorCli.java` | the CLI source | provenance + rebuild input for `versionless-validator-cli.jar` (see `docs/UPDATING.md`) |

### Why bundle jars instead of a native binary

Unlike the sibling **build-run-versionless-app** skill (per-OS/arch Rust binaries),
this validator is the JVM LSP plugin's own code. The bundle is therefore pure JVM —
the same `lib/` works on any OS with a JDK 17. The plugin jar shades all seven switch
axes directly (there is no loose-class overlay), and the headless CLI ships as its own
small jar built from the bundled `src/`. The DataWeave axis invokes a Scala parser, so
the Scala stdlib and the DW tooling-api jar (both excluded from the plugin's shaded jar
as provided-scope) are bundled explicitly. The lib set is kept to the five jars a
leave-one-out sweep proves load-bearing; gson/lsp4j/maven-model/slf4j are omitted
because `mule-dx-platform-…-all.jar` already shades them (see `PROVENANCE.txt` /
`docs/UPDATING.md`).

## Prerequisites

```bash
java -version   # needs JDK 17  (or set JAVA_HOME to a JDK 17 install)
```

`validate.sh` auto-discovers a JDK 17 from `JAVA_HOME`, then common install roots
(`/opt/homebrew/opt/openjdk@17`, Temurin, `/usr/lib/jvm/...`), then PATH. If none is
≥17 it stops with instructions. No Maven required — the validator reads `pom.xml`
directly via LemMinX, it does not invoke Maven.

## Bundled script

Invoke it by the **absolute path** given in the "skill is now active" message — do
not construct relative `../scripts/...` paths (the working directory shifts between
turns). The script locates the bundled `lib/` and `dsl/` relative to its own
location, so it works from any CWD.

| Script | Purpose |
| --- | --- |
| `scripts/validate.sh <project-dir> [--out <file>] [--dsl-dir <dir>] [--extended]` | Run the switch axes; write the JSON report; print the summary. Default scope = `dataweave` + `flow` + `connector` (what the wizard surfaces); `--extended` adds the other five axes. |

## Workflow

### Rules that always apply

1. **Read-only.** This skill never edits the user's app. It reports; it does not
   switch. To actually switch, hand off to **skill switch-classic-mule-to-versionless**.
2. **Point at the project root**, the directory containing `pom.xml` — not
   `src/main/mule` itself. The validator reads the pom (project-shape axis) and
   `src/main/mule/**/*.xml`.
3. **A missing/blank-screen result is not "clean".** If the capability manifest
   fails to load, the CLI **fails closed** (`success:false`, exit 1) — report that
   as "could not validate", never as "switchable".

### Step 1: Confirm the project

Determine the project root. If the user did not name one, use the current working
directory. A quick sanity check:

```bash
ls <project-dir>/pom.xml <project-dir>/src/main/mule   # both must exist
```

A versionless app (`<packaging>mule-application-versionless</packaging>`) is already
switched — this pre-check targets a **classic** `mule-application`. If it is already
versionless, say so and stop.

### Step 2: Run the validator

```bash
<skill-dir>/scripts/validate.sh <project-dir>
```

By default the report is written to
`<project-dir>/<app>-versionless-switch-report.json` (named after the app dir so
collected reports stay distinguishable). Pass `--out <path>` to write elsewhere
(e.g. outside the project tree):

```bash
<skill-dir>/scripts/validate.sh <project-dir> --out /tmp/<app>-switch-report.json
```

For the full seven-axis picture (config/project/security/devx/state as advisory
findings on top of the default scope), add `--extended`:

```bash
<skill-dir>/scripts/validate.sh <project-dir> --extended
```

The stdout summary shows files scanned, DW expressions scanned, the blocker count,
and — when there are blockers — a table of each blocker with five columns: **axis**,
**symbol** (the offending construct/format/module), **rule** (which check fired —
e.g. `dwx.writer.unsupported` vs `flow.element.unsupported`), **code** (the source
snippet, truncated), and **location** (project-relative `path:line:col`, e.g.
`src/main/mule/errors.xml:290:15`). INFO notices are not printed to stdout; they
remain in `report.json`. Branch on the **exit code**, not the text:

| Exit | Meaning |
| --- | --- |
| `0` | SWITCHABLE — no blockers (review INFO notices) |
| `3` | NOT SWITCHABLE — one or more BLOCK findings |
| `1` | FAIL-CLOSED — capability manifest unavailable; could not validate |
| `2` | usage error (bad/missing project dir) |

### Step 3: Read the report

The report file mirrors the wizard's `ValidationResult`:

```json
{
  "success": true,
  "filesScanned": 1,
  "expressionsScanned": 36,
  "blockerCount": 1,
  "findings": [
    {
      "category": "flow",
      "ruleId": "flow.element.unsupported",
      "symbol": "salesforce:modified-object-listener",
      "severity": "BLOCK",
      "message": "...",
      "fileUri": "file:///.../src/main/mule/app.xml",
      "startLine": 12, "startColumn": 5, "endLine": 12, "endColumn": 40
    }
  ]
}
```

(`success` is the manifest-loaded flag; `blockerCount` is the gate. Null fields such
as `failureReason` are omitted. The four `script*` positions are `-1` for non-DW
findings.)

### Step 4: Report to the user

Lead with the **blocker count** (switchable only when it is 0). Then, grouped by
axis, list each **BLOCK** with its `symbol`, `ruleId`, source `snippet`, and
project-relative `path:line:col` — these are what gate the switch. Match the CLI's
stdout table (axis / symbol / rule / code / location): blockers only.

**Report blockers only. Do not add an "INFO notices" section and do not add a
"Bottom line" / remediation / next-steps section.** INFO findings stay in
`report.json`; surface them only if the user explicitly asks for the "resolves
differently but won't block" detail. If the run **failed closed** (exit 1), say the
app could not be validated and why; do not imply it is switchable.

When the user is ready to actually perform the switch, hand off to
**skill switch-classic-mule-to-versionless**.

## Best Practices

- **Pre-check, then switch.** ✅ Run this validator, resolve the blockers, then run
  **switch-classic-mule-to-versionless**. ❌ Don't switch first and discover
  blockers at deploy time.
- **Report blockers by axis with file:line.** ✅ "config: `${secure::db.pw}` at
  app.xml:21 — no decryption subsystem." ❌ "Some config issues found."
- **Treat fail-closed as unknown, not clean.** ✅ Exit 1 → "could not validate
  (manifest unavailable)." ❌ Exit 1 → "no blockers found."
- **Leave the app untouched.** ✅ Read-only report. ❌ Don't edit flows or the pom
  to make findings disappear.

## Troubleshooting

**`no src/main/mule` / usage exit 2:** you pointed at the wrong directory. Pass the
**project root** (the dir with `pom.xml`), not a file or `src/main/mule`.

**`no JDK 17+ found` (exit 1):** set `JAVA_HOME` to a JDK 17 install, or install one
(`brew install openjdk@17`, or a temurin/openjdk 17 package on Linux), then re-run.
The PATH `java` may be a wrapper stub on some corporate machines — `JAVA_HOME` wins.

**`FAIL-CLOSED (DWX_MANIFEST_UNAVAILABLE)` (exit 1):** the capability manifest
(`rds/dwx-capabilities.json`) could not be read. It is loaded first-match-wins from the
classpath: the bundled `rds-override/` dir wins, falling back to the copy inside the
plugin jar. Exit 1 means neither was readable — the override file is missing/corrupt
*and* the `lib/` plugin jar is corrupt or truncated. Re-copy the bundle (see
`docs/UPDATING.md`).

**Expected data-format writer BLOCKs don't appear** (e.g. `output application/yaml`,
`output application/xlsx`, `output text/x-java-properties`): the `rds-override/` dir is
not first on the classpath, so the stub loaded the manifest baked into the plugin jar,
which is stale on data formats (marks these writers supported though the versionless
engine does not implement them). Confirm `scripts/validate.sh` sets
`CP="${SKILL_DIR}/rds-override:${LIB}/*"` (override first). Note `output application/java`
is *not* such a case — it is a passthrough value, not a serialized format, and correctly
produces no BLOCK (see PROVENANCE.txt, override correction (3)).

**Lots of unexpected `flow.element.unsupported` BLOCKs:** the bundled `dsl/`
descriptors are older/newer than the runtime you are targeting. Refresh them from
the go-runtime connector descriptors (`docs/UPDATING.md`), or point `--dsl-dir` at a
current staged-cache dir (`<name>/dsl.json`).

**`SLF4J: Failed to load class … StaticLoggerBinder`:** harmless if it appears — no
logging backend is bundled, so SLF4J falls back to a no-op logger; the result is
unaffected. The current 5-jar bundle does *not* print this (the only SLF4J on the
classpath is the copy shaded into the platform jar); earlier bundles that carried a
standalone `slf4j-api` jar could.

## Related Skills

- **skill switch-classic-mule-to-versionless**: perform the switch (writes
  `project-manifest.json`, moves connectors) — run *after* this validator reports
  zero blockers.
- **skill build-run-versionless-app**: build and run a versionless app end-to-end.
- **skill upgrade-mule-app**: upgrade connector/runtime versions and Java compatibility.
