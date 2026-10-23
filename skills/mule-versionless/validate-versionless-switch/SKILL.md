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

| Axis | Category | Can BLOCK? | Flags (examples) |
| --- | --- | --- | --- |
| DataWeave | `dataweave` | ✅ | DW script constructs the versionless engine's capability manifest does not support |
| Flow / core | `flow` | ✅ | connector operations/sources and core constructs absent from the versionless runtime descriptors |
| Connector switchability | `connector` | ✅ | `<os:*>` Object Store and OAuth authorization-code grants (BLOCK — store-backed connector state the versionless runtime silently drops); plus any non-bundled connector namespace whose switchability is confirmable only against RDS at switch time (INFO) |
| Config & secrets | `config` | ✅ | `${secure::…}` / `<secure-properties:config>` (BLOCK); prefix dispatchers, multiple/dynamic property files, `<global-property>` (INFO) |
| Project shape | `project` | ✅ | multi-module reactor, `mule-domain`/`mule-policy` packaging, `<import>`-based multi-file app |
| Security | `security` | ✅ | custom `<tls:context>` keystores, `<api-gateway:autodiscovery>`, `http-policy:*` |
| DX notices | `devx` | INFO only | MUnit, custom `log4j2.xml`, `<tracking:*>`, `<notifications>`, OpenTelemetry, explicit streaming (never blocks) |
| Data & state | `state` | ✅ | `<redelivery-policy>`, `<idempotent-message-validator>` (core-namespace store-backed constructs; `<os:*>` and OAuth-managed configs are connectors and report under the `connector` axis above) |

Each finding is **BLOCK** (gates the switch — counts toward `blockerCount`) or
**INFO** (resolves differently but still runs). The switch is **safe only when
`blockerCount` is 0**.

**All seven axes report by default — stricter than the wizard, by design.** The CLI
reports every category and counts `blockerCount` across all of them. This is
deliberately stricter than the ACB "Upgrade to Versionless" wizard, which gates on
`dataweave` + `flow` + `connector` only and treats `config`/`project`/`security`/`state`
as *advisory* — because, running **online**, the wizard has platform fallbacks (RDS,
the mesh/gateway that terminates TLS and runs policies). This skill validates an
**offline** switch, where there is no such fallback, so those axes are genuine
build/deploy failures and must gate.

That the extended axes are real runtime failures (not advisory) is empirically
confirmed against the versionless runtime builder: an unsupported construct **inside a
flow** fails the build (`BuildError::UnexpectedChild` — *"expected Source|Processor|ErrorHandler"*),
an unsupported **top-level** config (`<tls:context>`, `<secure-properties:config>`,
`<os:object-store>`) is **silently dropped** so the capability just disappears, and a
`${secure::…}` reference resolves to `PropertyError::Missing`. (`devx` is the lone
INFO-only axis — it never blocks.)

**`--extended` is accepted but is now a no-op.** It is retained for backward
compatibility (older scripts/callers may still pass it); its former behavior —
widening the report from three axes to seven — is now the default, so passing it
changes nothing.

**`.properties` config files are *not* flagged.** The versionless runtime loads both
`.yaml` and `.properties` (full Java-properties parity, mule-versionless PR #124), so a
`<configuration-properties file="…​.properties">` is fully supported and never blocks —
it is treated identically to a `.yaml` file. (An earlier bundled jar carried a stale
`config.properties.unsupported` BLOCK on the false premise the runtime "loads YAML only";
that rule was removed upstream in `mule-dx-mule-dev-component` and is gone from the
current bundle.)

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
- **Connector switchability (`connector`).** Two kinds of connector finding share this
  axis:
  - **Store-backed connector state (BLOCK).** `<os:*>` Object Store elements and OAuth
    authorization-code grants (`<oauth:*>` or a connector `*oauth*authorization-code`
    config) live in connector namespaces and depend on persistent state the versionless
    runtime does not yet provide — the store is a no-op, so the write/token silently
    vanishes. These are a *known* incompatibility, so they BLOCK and count toward
    `blockerCount` (one owner: the data-integrity checker).
  - **Non-bundled connector namespaces (INFO).** The runtime has no offline connector
    registry, so whether any *other* non-bundled connector is switchable can only be
    confirmed by RDS at switch time. The CLI emits one INFO per app element namespace
    that has no bundled descriptor and is not core/ee/apikit (runtime-supported without
    one), not owned by another axis (`tls`, `secure-properties`, …), and not already a
    BLOCK above (`os`, `oauth`). A missing descriptor is *not* proof of incompatibility,
    so these never BLOCK.

## What's bundled

| Path | What | Why |
| --- | --- | --- |
| `lib/*.jar` | the validator runtime classpath (5 jars, ~121 MB) | the validator and its DataWeave parser cannot run without them; provided-scope in the LSP host and not on any public registry. The plugin jar shades all seven switch axes; the CLI jar is the headless entry point. Proven-minimal via a leave-one-out sweep (see `PROVENANCE.txt`) |
| `rds-override/rds/dwx-capabilities.json` | DataWeave capability manifest, prepended to the classpath | the copy baked into the plugin jar is stale on data formats (marks `yaml`/`excel`/`properties`/`octet-stream`/`binary` writers unsupported though the engine implements them); the override is the engine's own generated manifest, corrected on three entries the generator gets wrong (`system::now`, `dw::util::Timer`, the `application/java` passthrough writer). See `PROVENANCE.txt` and `docs/UPDATING.md` §2b |
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
| `scripts/validate.sh <project-dir> [--out <file>] [--dsl-dir <dir>] [--include-info] [--extended]` | Run all seven switch axes; write the JSON report; print the summary. `--include-info` serializes INFO notices into the report too (default: blockers only). `--extended` is accepted but a no-op (all axes report by default). |

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

The report always covers all seven axes (config/project/security/devx/state included —
the wizard treats their BLOCKs as advisory, but they are real build/deploy failures for
an offline switch; see the scope note above; `devx` is INFO-only and never blocks). The
legacy `--extended` flag is accepted for backward compatibility but has no effect:

```bash
<skill-dir>/scripts/validate.sh <project-dir> --extended   # same result as without it
```

**INFO notices are behind `--include-info`.** By default the JSON report carries
**blockers only** — INFO findings are advisory (they never gate the switch), so they are
omitted to keep the report focused on what blocks. Pass `--include-info` to serialize the
INFO notices into the report too:

```bash
<skill-dir>/scripts/validate.sh <project-dir> --include-info   # report also carries INFO
```

The flag changes **only** what is serialized. `blockerCount`, the exit code, and the
stdout table are computed from the full finding set and are identical either way — INFO
is never a blocker, so the gate does not move.

The stdout summary shows files scanned, DW expressions scanned, the blocker count,
and — when there are blockers — a table of each blocker with five columns: **axis**,
**symbol** (the offending construct/format/module), **rule** (which check fired —
e.g. `dwx.writer.unsupported` vs `flow.element.unsupported`), **code** (the source
snippet, truncated), and **location** (project-relative `path:line:col`, e.g.
`src/main/mule/errors.xml:290:15`). INFO notices are never printed to stdout; with
`--include-info` they are in `report.json`. Branch on the **exit code**, not the text:

| Exit | Meaning |
| --- | --- |
| `0` | SWITCHABLE — no blockers (run with `--include-info` to review the INFO notices) |
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

Report **three things only**, in prose — the verdict, the blocker count, and the report
path:

> **Not switchable — 8 blockers.** Full report: `<path>/<app>-versionless-switch-report.json`

or, when clean:

> **Switchable — 0 blockers.** Full report: `<path>/<app>-versionless-switch-report.json`

**Do not render the findings in chat.** No per-axis tables, no per-finding bullets, no
ASCII box, no "INFO notices" section, no "Bottom line" / remediation / next-steps
section. The blockers live in the JSON report; the user reads them there. Reference the
report by **path alone** — do not annotate it with the axis count or an INFO aside (not
"Full report (all seven axes, including any INFO notices): …"); the path is enough.

Surface finding detail in chat **only if the user explicitly asks** for it (e.g. "show
me the blockers", "what's in the config axis"). INFO notices are omitted from the report
by default — re-run with `--include-info` to put them in `report.json` if asked. If the
run **failed closed** (exit 1), say the app could not be validated and why; do not imply
it is switchable.

When the user is ready to actually perform the switch, hand off to
**skill switch-classic-mule-to-versionless**.

## Best Practices

- **Pre-check, then switch.** ✅ Run this validator, resolve the blockers, then run
  **switch-classic-mule-to-versionless**. ❌ Don't switch first and discover
  blockers at deploy time.
- **Report the verdict + count + path; let the JSON carry the detail.** ✅ "Not
  switchable — 8 blockers. Full report: `<path>`." ❌ Rendering per-axis tables or a
  "Bottom line" in chat. The report already pins each blocker to `symbol` / `ruleId` /
  `path:line:col`.
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
  `project-manifest.json`, moves connectors). It runs *this* validator as its Step 2
  switchability gate and refuses to switch while any blocker remains, so switching
  implies validating. Use this validate skill on its own for a pre-check *without*
  switching.
- **skill build-run-versionless-app**: build and run a versionless app end-to-end.
- **skill upgrade-mule-app**: upgrade connector/runtime versions and Java compatibility.
