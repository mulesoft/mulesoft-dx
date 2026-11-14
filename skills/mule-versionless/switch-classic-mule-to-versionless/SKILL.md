---
name: switch-classic-mule-to-versionless
description: >
  Switch a classic (versioned) Mule application to a versionless app: it edits the
  project's pom.xml and writes a project-manifest.json that declares the app's connectors
  by name. By default it edits the source tree in place; pass --stage to switch
  NON-DESTRUCTIVELY into a staged copy of the project under target/versionless-staging/
  instead, leaving the source untouched. First gates on switchability by running the
  switch validator and refuses to switch while any blocker remains. When the prompt also
  asks to build a jar, it builds the app into a deployable versionless jar (and
  otherwise offers to). TRIGGER when: user asks to "switch/convert/upgrade/migrate a Mule app to
  versionless", "make my Mule project versionless", "create a project-manifest.json",
  "move connectors to the manifest", or "switch and build a versionless jar"; the project
  has a pom.xml with mule-plugin connector dependencies. Trigger phrases include "switch
  to versionless", "versionless app", "classic to versionless". DO NOT TRIGGER when: the
  user wants to upgrade connector/runtime VERSIONS or Java compatibility (that is skill
  upgrade-mule-app), or to build a new integration (skill build-mule-integration).
license: Apache-2.0
compatibility: >
  Requires Node.js 18+ for the switch itself, and JDK 17 for the switchability gate
  (the bundled validator in the sibling validate-versionless-switch skill). A Mule 4
  application (a pom.xml with mule-application packaging). If JDK 17 or the validator
  sibling is unavailable, the gate cannot run and the switch stops unless the user
  explicitly opts to skip it.
allowed-tools: Bash Read Write Edit AskUserQuestion
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Switch a Classic Mule App to Versionless

You are a MuleSoft tooling specialist converting a classic (versioned connector usage) Mule 4
application into a **versionless** application.

Switching to versionless means the app no longer pins each connector to a Maven
coordinate in `pom.xml`. Instead, a `project-manifest.json` sibling of `pom.xml`
declares the connectors by name, and the versionless runtime resolves them. This
skill performs that switch standalone — no IDE, no platform connection, no network.

**By default the switch edits your source tree in place** — it rewrites `pom.xml` and
writes `project-manifest.json` next to it. The switch is idempotent, so re-running a
fully-migrated app is a no-op.

**Pass `--stage` for a non-destructive switch.** With `--stage`, the script never edits
your source tree: it stages a full copy of the project under `target/versionless-staging/`
and writes the versionless `pom.xml` and `project-manifest.json` **there**. The staged copy
is recreated fresh from source on every run, so it is deterministic and safe to re-run, and
your original `pom.xml` and `src/` are left byte-for-byte untouched. The staging dir sits
inside `target/` (which has an ancestor `pom.xml`) so the versionless runtime can still
discover the manifest when you build and deploy the staged jar. Use `--stage` when the user
asks to keep the source tree clean or wants a reversible switch.

When the prompt also asks for a jar — e.g. "switch and build a versionless jar" — this
skill builds the app via the sibling **build-run-versionless-app** skill (adding `--stage`
to the build when the switch was staged); otherwise it offers to after switching.

## When to Use This Skill

**Use this skill when the user asks to:**

- "Switch this Mule app to versionless"
- "Migrate my classic Mule project to a versionless app"
- "Create the project-manifest.json and move my connectors into it"

**Trigger keywords:** switch · migrate · versionless · project-manifest.json · classic-to-versionless.

**Do NOT use this skill when:** the user wants to upgrade connector or runtime
**versions** or fix Java compatibility → use **skill upgrade-mule-app**; or to
scaffold a new integration → use **skill build-mule-integration**.

## What this skill does

Given a Mule project root (the directory containing `pom.xml`), it **first gates on
switchability** — it runs the switch validator (the sibling
`validate-versionless-switch` skill) and, when blockers are found, stops before writing
anything. This gate is an **agent-workflow safeguard enforced by this skill, not by the
script**: `switch_to_versionless.mjs` performs no validation of its own, so a caller that
invokes the script directly (bypassing this workflow) can still switch a non-switchable
app. Run through this skill and the gate catches blockers before they reach a deploy.

By default the edits below land **in the source tree**. With `--stage`, the script instead
copies the project into `target/versionless-staging/` (excluding `target/` and `.git/`) and
writes everything into that staged copy, leaving source untouched. Either way, once the gate
passes it:

1. Reads `pom.xml` (and its local parent chain) and finds every **connector** —
   a `<dependency>` with `<classifier>mule-plugin</classifier>` that is **not**
   test-scoped — then keeps only the ones **actually used in the app's Mule code**
   (their XML namespace appears in `src/main/mule`). A connector declared as a
   dependency but never referenced in a flow is dropped from the manifest; if it is
   declared in the **child** pom it is also commented out there (it serves no purpose
   on the versionless runtime, and the comment keeps its coordinates recoverable),
   while one inherited from a **parent** pom is left in place (parent POMs are never
   edited) and the script warns. Test-scoped mule-plugins (MUnit tooling) are
   skipped. **Runtime-provided modules** — currently
   `org.mule.modules:mule-apikit-module` (APIkit) — are a special case: their
   `<dependency>` is commented out of the child pom like a migrated connector, but they
   are deliberately **not** written to the manifest, because the versionless runtime
   supplies them itself.
2. Derives each connector's versionless **name** — its Mule XML namespace / prefix
   (the identity the versionless runtime resolves against, e.g. `http`, `salesforce`,
   `os`) — cross-checking the namespaces actually declared in the app's Mule XML.
3. **Writes** `project-manifest.json` next to `pom.xml` (in the staged copy under
   `--stage`), merging in any manifest already present. Connectors are
   **name-only** — the versionless name (XML namespace / prefix) is the identity the
   runtime resolves against:
   ```json
   {
     "version": "1.0.0",
     "connectors": [
       { "name": "http" },
       { "name": "salesforce" }
     ]
   }
   ```
   A source manifest's connectors are **retained**; only genuinely-new connectors
   (used in code and still uncommented in the pom) are appended. A core-only app (no
   connectors) still becomes versionless — the manifest is written with an empty
   `connectors` array.
4. **Comments out** each newly-migrated connector `<dependency>` block in the
   `pom.xml` (the staged copy under `--stage`), so the coordinates are no longer active but stay recoverable
   (`<!-- [versionless] moved to project-manifest.json ... -->`). Runtime-provided
   modules that are excluded from the manifest get a distinct note instead
   (`<!-- [versionless] removed (runtime-provided; not in project-manifest.json) ... -->`).
   Connectors inherited from a parent pom are added to the manifest but their dependency
   is left in place (the script never edits a parent pom).
5. **Makes the pom itself versionless**: flips
   `<packaging>mule-application</packaging>` to
   `<packaging>mule-application-versionless</packaging>` and raises the
   `mule-maven-plugin` version (inline or via its `${property}`) to one that
   understands the versionless build path (`4.11.0-SNAPSHOT`). Both are required — a
   versionless `<packaging>` is unknown to a pre-versionless plugin and the build fails
   with `Unknown packaging: mule-application-versionless`. This is why a core-only app
   still has its pom rewritten even though no connector deps are commented out.

The switch is **deterministic and idempotent**: re-running a fully-migrated app leaves
`pom.xml` and `project-manifest.json` byte-identical (the parser strips comments, so
already-migrated deps are invisible on re-run). Under `--stage` it is additionally
**non-destructive**: each run recreates the staged copy from pristine source, the source
tree is only read, and there is nothing to revert if you decide not to go versionless —
just delete `target/versionless-staging/`. Without `--stage`, the source `pom.xml` is
rewritten in place, so commit or stash first if you want an easy way back.

## Prerequisites

```bash
node --version    # needs 18+ (the switch itself)
java -version     # needs JDK 17 (the switchability gate, Step 2) — or set JAVA_HOME
```

The current working directory (or the path you pass) must be a Mule application
root — it must contain a `pom.xml`. The gate also needs the sibling
`validate-versionless-switch` skill present alongside this one (it ships the
validator). If either the JDK or the sibling is missing, the gate cannot run — see
Step 2 for how that is handled.

## Bundled scripts

This skill ships scripts under `scripts/`. Invoke them by the **absolute path**
given in the "skill is now active" message — do not construct relative
`../scripts/...` paths (the working directory shifts between turns).

| Script | Purpose | Output |
| --- | --- | --- |
| `scripts/switch_to_versionless.mjs [projectDir] [--stage] [--dry-run]` | The whole switch: reads the pom + Mule XML and writes the `project-manifest.json` + versionless `pom.xml` (comments out connector deps, sets versionless packaging + mule-maven-plugin version). By default it edits the source tree in place. `--stage` writes into a copy under `target/versionless-staging/` instead, leaving source untouched. `--dry-run` plans only, writes nothing. | JSON report on stdout (and, unless `--dry-run`, the rewritten pom + manifest — in source, or under `target/versionless-staging/` with `--stage`) |

To build the app into a jar, this skill calls the sibling **build-run-versionless-app**
skill's `scripts/build.sh`. Build the source tree by pointing it at the project root; when
the switch was run with `--stage`, add `--stage` to the build too so it builds the staged
tree under `target/versionless-staging/` (or point it at the staging dir directly).

## Workflow

### Rules that always apply

1. **Never invent a connector name.** Use only the `name` the script derived. When
   the script reports `nameConfirmed: false` for a connector, stop and reconcile it
   against the app's real XML prefix before writing — a wrong name breaks runtime
   resolution.
2. **Merge, never lose entries.** A pre-existing `project-manifest.json` is read and
   its connectors are retained; this run only appends connectors that are still
   uncommented in the pom. If a same-named file exists but isn't a valid manifest, the
   script refuses to overwrite it and exits — don't force past that; fix the file.
3. **Default edits source in place; `--stage` writes only the staged tree.** Without
   `--stage`, the source `pom.xml` and `project-manifest.json` are rewritten directly.
   With `--stage`, all edits land under `target/versionless-staging/` and source is left
   untouched. Either way, connectors inherited from a parent POM are written to the
   manifest but their dependency is left declared in the parent (the script warns); and
   under `--stage`, a parent POM outside the project root is not copied into the staged
   tree, so a staged build may not resolve it — the script warns when that happens.
4. **Confirm before writing** (see the gate in Step 4).
5. **Validate before switching.** Never switch while the
   switch validator reports blockers (Step 2, which gates on all seven axes). Switching
   a non-switchable app produces a versionless project that fails to build or deploys
   broken. The only way past a blocker is to fix it in the app, or an explicit user
   override — never a silent skip.

### Step 1: Confirm the project root

Determine the Mule project root — the directory containing `pom.xml`. If the user
did not name one, use the current working directory. Confirm `pom.xml` exists; if
not, tell the user this is not a Mule application root and stop.

### Step 2: Gate on switchability (run the validator)

Before planning any change, run the read-only switch validator from the sibling
`validate-versionless-switch` skill. It is the same seven-axis check the Anypoint
Code Builder "Upgrade to Versionless" wizard runs, and it never edits the app. The
validator reports and gates on the **full** seven-axis set by default (see the scope
note below for why):

```bash
<validate-skill-dir>/scripts/validate.sh <projectDir> --out /tmp/<app>-switch-gate.json
```

`<validate-skill-dir>` is the sibling skill folder (…/mule-versionless/`validate-versionless-switch`).
Branch on the **exit code** — do not parse the text:

| Exit | Meaning | Action |
| --- | --- | --- |
| `0` | SWITCHABLE — no blockers | Proceed to Step 3. |
| `3` | NOT SWITCHABLE — one or more blockers | **STOP.** Print the blocker table (axis / symbol / rule / code / `path:line:col`) from the report and tell the user what to fix. Do **not** write the manifest or touch the pom. |
| `1` | FAIL-CLOSED — validator could not run (manifest or connector descriptors unavailable, no JDK 17) | **STOP.** Report that switchability could not be verified; do not switch. |
| `2` | usage error (bad project dir) | Fix the path and re-run. |

**Why gate on all seven axes, not the wizard's three.** The ACB wizard gates on
`dataweave` + `flow` + `connector` only, treating `config`/`security`/`state`/`project`
as *advisory* — because online it has platform fallbacks (RDS, the mesh/gateway that
terminates TLS and runs policies). **This skill switches offline**, with no such
fallback, so those four axes are genuine deploy/runtime failures here, not advisory —
empirically confirmed by driving each construct through the real versionless runtime
builder:

- An unsupported construct **inside a flow** fails the versionless build outright
  (`BuildError::UnexpectedChild` — *"expected Source|Processor|ErrorHandler"*).
- An unsupported **top-level** config (`<tls:context>`, `<secure-properties:config>`,
  `<os:object-store>`) is **silently dropped** by the builder — the capability just
  disappears, so mutual TLS / secret decryption / object-store writes stop happening
  with no error.
- A `${secure::…}` reference has no decryption subsystem; resolution fails with
  `PropertyError::Missing` (*"property '…' was not found"*).

The validator reports all seven axes by default, so a plain run blocks an app that
would compile-fail or deploy broken. This is deliberately **stricter than the ACB
wizard**. (The legacy `--extended` flag is still accepted but now a no-op — seven-axis
scope is the default — so an older gate invocation that passes it still behaves
identically.)

**`.properties` config files do not block.** The versionless runtime loads both `.yaml`
and `.properties` (full Java-properties parity, mule-versionless PR #124), so a
`<configuration-properties file="x.properties">` is fully supported and the config axis
treats it exactly like a `.yaml` file. (An earlier bundle raised a stale
`config.properties.unsupported` BLOCK here on the false premise the runtime "loads YAML
only"; that rule was removed upstream and is gone from the current validator.) Every
extended-axis BLOCK the gate now reports is real — do not wave any through; the only path
past one is to fix the app or an explicit user override.

The gate report is a **transient artifact** written to `/tmp` (never into the project
tree) so it can never be mistaken for the validate skill's own project-local report.
**Keep it when the gate blocks or fails closed** — the user needs its blocker detail to
fix the app. It is removed only after a *successful* switch (Step 5).

**If the validator sibling or a JDK 17 is absent**, the gate cannot run. State that
plainly and stop — do not switch unvalidated. Proceed only if the user **explicitly**
asks to skip the gate (e.g. "switch anyway, I know it fails to validate"); record that
they overrode it, and continue at their risk. An explicit override is the *only* path
past a blocker or a fail-closed gate.

### Step 3: Plan the switch (dry run)

**First decide the mode.** By default the switch edits the source tree in place. Add
`--stage` only when the user wants a non-destructive switch — to keep the source tree
clean, preview the result, or keep an easy way back. If in doubt, confirm with the user.
Pass the same flag to the dry run so the plan reflects the mode you will use.

Run the script in dry-run mode to see exactly what will change, writing nothing:

```bash
node <skill-dir>/scripts/switch_to_versionless.mjs <projectDir> [--stage] --dry-run
```

Read the JSON report:

- **`staged`** — `true` when `--stage` will write into a staged copy; `false` when the source tree will be edited in place.
- **`stagingDir`** — where the staged versionless copy will be written (`<projectDir>/target/versionless-staging`), or `null` when editing source in place.
- **`connectors[]`** — the final, merged manifest (name-only): retained + newly added.
- **`existingRetained[]`** — connector names carried over from a manifest found in source.
- **`newlyAdded[]`** — connectors migrated on this run (declared **and** used in code); empty means the source declares no new connectors.
- **`declaredButUnused[]`** — mule-plugin deps whose namespace is not used in `src/main/mule`; excluded from the manifest. Child-pom ones are commented out of the pom; parent-pom ones are left in place (parent POMs are not edited).
- **`manifestExcluded[]`** — runtime-provided modules (e.g. `mule-apikit-module`) that are commented out of the pom but intentionally **not** written to the manifest.
- **`skipped[]`** — test-scoped mule-plugins that are intentionally excluded.
- **`xmlPrefixes[]`** — the connector namespaces actually used in the app's Mule XML (the "used in code" set).
- **`pomEdits[]`** — the dependency blocks that will be commented out in the pom.
- **`pomVersionlessChanges[]`** — the packaging + mule-maven-plugin version edits that will be applied to the pom (empty if already versionless).
- **`warnings[]`** — unresolved versions, parent-declared connectors, unused deps, a parent pom outside the project root (under `--stage`), or a packaging/plugin edit that must be done manually (e.g. the plugin version lives in a parent pom).

Review **`declaredButUnused[]`**: an entry there is either genuinely unused (correctly
dropped) or a connector whose real XML prefix differs from what was derived from its
artifactId (a false drop). Cross-check against `xmlPrefixes[]`; if a listed connector
IS used, add its correct name to the manifest manually rather than guessing.

### Step 4: Get confirmation, then switch

**[GATE] Show the user the plan from Step 3 — the connectors to migrate, the manifest
that will be written, the pom dependencies that will be commented out, the
packaging / plugin-version edits (`pomVersionlessChanges[]`), and whether it writes to the
source tree or stages (`staged` / `stagingDir`) — and WAIT for explicit approval before
writing anything.** This gate matters most in the default (in-place) mode, where the
source `pom.xml` is rewritten; under `--stage` it mainly guards against a surprise staged
build, since source is never touched.

On approval, run the script for real with the mode you chose in Step 3:

```bash
node <skill-dir>/scripts/switch_to_versionless.mjs <projectDir> [--stage]
```

This writes `project-manifest.json` and the versionless `pom.xml` (comments out the
newly-migrated connector `<dependency>` blocks, flips `<packaging>` to
`mule-application-versionless`, and bumps the `mule-maven-plugin` version). Without
`--stage` these edits land in the source tree; with `--stage` the project is copied into
`target/versionless-staging/` and the edits land in that staged copy, leaving source
untouched.

### Step 5: Verify, then build if asked

Confirm the result against the tree the switch wrote. In the default mode that is the
**source** tree; under `--stage` it is the staged tree at `report.stagingDir`. Below,
`<outDir>` means the source root by default, or `stagingDir` with `--stage`:

- Read `<outDir>/project-manifest.json` and check it matches the planned connectors.
- Read `<outDir>/pom.xml` and confirm: each migrated connector block is wrapped in
  `<!-- [versionless] moved to project-manifest.json ... -->`, `<packaging>` is
  `mule-application-versionless`, and the `mule-maven-plugin` version is
  `4.11.0-SNAPSHOT`.
- Under `--stage`, also confirm the **source** `pom.xml` is unchanged and no
  `project-manifest.json` was written to the source root.
- Re-run the script; the `pom.xml` and `project-manifest.json` come out byte-identical
  (the switch is idempotent; under `--stage` the staged copy is rebuilt from pristine source).

**Then handle the build:**

- **If the prompt asked to build** (e.g. "switch **and build** a versionless jar"), build
  the app now by invoking the sibling **build-run-versionless-app** skill. Point its
  `scripts/build.sh` at the **project root**; if you switched with `--stage`, add `--stage`
  so it builds the staged tree under `target/versionless-staging/` (or pass the staging dir
  directly):

  ```bash
  <build-skill-dir>/scripts/build.sh [--stage] <projectDir>
  ```

  The jar lands at `<outDir>/target/*-mule-application-versionless.jar`. Per **skill
  build-run-versionless-app** (Rule 4), deploy it **in-tree** from that `target/`
  by absolute path: at deploy time the runtime resolves the app's connectors from the
  on-disk `project-manifest.json` it finds by walking up from the jar to an ancestor
  `pom.xml`, so a jar copied to a directory with no ancestor `pom.xml` can silently fail
  to load its connectors. See that skill for setup (`scripts/setup.sh`) and deploy/run.

- **If the prompt did not ask to build**, offer it: tell the user the app is ready
  and ask whether to build the versionless jar. Only build on a yes.

Report concisely: where the switch wrote (source, or the staging dir), how many connectors
were moved, which were skipped and why, any connector whose version could not be resolved
(written as `version: null`), any parent-declared connectors left in place, and — if you
built — the jar path. State plainly if anything needs manual follow-up.

Finally, **remove the transient gate report** from Step 2 — the switch succeeded, so it
has served its purpose and the rewritten project (the source tree, or the staged tree under
`target/versionless-staging/` with `--stage`) is the real deliverable:

```bash
rm -f /tmp/<app>-switch-gate.json
```

Only delete this `/tmp` gate file, and only after a successful switch. Never delete the
validate skill's own project-local report (`<app>-versionless-switch-report.json`), and
never clean up if the switch was blocked (Step 2) or the user declined at the Step 4
confirm — in those cases the report stays for the user to act on.

## Best Practices

- **Keep a way back.** ✅ In the default in-place mode, commit or stash before switching
  so the source rewrite is easy to revert. ✅ Or use `--stage` for a non-destructive
  switch: it only writes under `target/versionless-staging/`, so no commit is needed — to
  discard it, just delete that dir (keep `target/` in `.gitignore`, usually already there).
  ❌ Don't hand-edit the pom to "make it versionless" — let the script flip packaging and
  the plugin version so both stay consistent.
- **Reconcile unconfirmed names.** ✅ Trust `xmlPrefixes[]` over the artifactId when
  they disagree (e.g. `mule-objectstore-connector` → `os`). ❌ Never write a name the
  XML doesn't support just because it was derived from the artifactId.
- **Empty is valid.** ✅ A core-only app correctly produces an empty `connectors`
  array — it is still versionless. Don't treat that as an error.

## Troubleshooting

**"No pom.xml found ... not a Mule project root":** you ran the script against the
wrong directory. Pass the folder that contains `pom.xml`.

**A connector has `version: null` in the manifest:** its version lives in a parent
POM or BOM not readable on disk. This is fine for versionless resolution (name is
what matters), but make the parent available and re-run if you want the version recorded.

**A connector is missing from the manifest:** first confirm it is declared with
`<classifier>mule-plugin</classifier>` and is not `<scope>test</scope>` (test-scoped
plugins are intentionally skipped). Check `manifestExcluded[]` — runtime-provided
modules such as `mule-apikit-module` are commented out of the pom but intentionally kept
out of the manifest (the runtime supplies them), so this is expected. Otherwise check
`declaredButUnused[]` — the connector's namespace was not found in `src/main/mule`, so it
was treated as unused (and, if it was in the child pom, commented out there). If it really
is used, its XML prefix differs from the name derived from its artifactId; add the correct
name to the manifest manually and uncomment the dependency.

**A connector dependency was not commented out:** it is declared in a parent POM
(the script only edits the child pom) or the block contained a nested comment — check
`warnings[]`. Comment it out manually in that case.

**Packaging or plugin version was not changed (a warning says so):** the child pom has
no `<packaging>` element, its packaging is something other than `mule-application`, or
the `mule-maven-plugin` version is carried by a property defined in a **parent** pom
(the script only edits the child). Apply the change by hand where it lives:
`<packaging>mule-application-versionless</packaging>` and `mule-maven-plugin`
`4.11.0-SNAPSHOT`.

**Build fails `Unknown packaging: mule-application-versionless`:** the pom now declares
versionless packaging but the resolved `mule-maven-plugin` is a pre-versionless version
(e.g. `4.10.0`) — the version bump landed in a parent pom the script didn't edit, or was
skipped. Set the plugin to `4.11.0-SNAPSHOT` and rebuild.

**"refusing to overwrite" and the script exits:** a file named `project-manifest.json`
exists but isn't a valid manifest (bad JSON, or no `connectors` array). The script will
not clobber it. Inspect and fix or remove the file, then re-run.

**Later, deploy fails `app requires connectors not installed on this host: <name>`:**
this script writes each connector's `name` as its **XML namespace prefix** (e.g.
`http`), but the versionless runtime matches a connector by its **canonical extension
name**, case-sensitively (e.g. `HTTP`). If a converted app fails to deploy on the
runtime with this error even though the connector is present, correct the case of that
connector's `name` in `project-manifest.json` to the extension's canonical name and
rebuild. See **skill build-run-versionless-app** (Rule 5) for the runtime-side detail.

## Related Skills

- **skill validate-versionless-switch**: the read-only switchability pre-check this skill
  runs as its Step 2 gate. Invoke it directly to check an app *without* switching it.
- **skill upgrade-mule-app**: upgrade connector/runtime versions and Java compatibility for a Mule app — use it for version bumps, not for the versionless switch.
- **skill build-mule-integration**: scaffold a new Mule integration from scratch.
- **skill secure-mule-app**: encrypt sensitive properties in a Mule app.
