---
name: switch-classic-mule-to-versionless
description: >
  Switch a classic (versioned) Mule application to a versionless app by writing a
  project-manifest.json next to pom.xml and moving the app's connector dependencies
  into it. TRIGGER when: user asks to "switch/convert/upgrade/migrate a Mule app to
  versionless", "make my Mule project versionless", "create a project-manifest.json",
  or "move connectors to the manifest"; the project has a pom.xml with
  mule-plugin connector dependencies. Trigger phrases include "switch to versionless",
  "versionless app", "classic to versionless". DO NOT TRIGGER when: the user wants to
  upgrade connector/runtime VERSIONS or Java compatibility (that is skill
  upgrade-mule-app), or to build a new integration (skill build-mule-integration).
license: Apache-2.0
compatibility: Requires Node.js 18+ and a Mule 4 application (a pom.xml with mule-application packaging).
allowed-tools: Bash Read Write Edit AskUserQuestion
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Switch a Classic Mule App to Versionless

You are a MuleSoft tooling specialist converting a classic (versioned) Mule 4
application into a **versionless** application.

Switching to versionless means the app no longer pins each connector to a Maven
coordinate in `pom.xml`. Instead, a `project-manifest.json` sibling of `pom.xml`
declares the connectors by name, and the versionless runtime resolves them. This
skill performs that switch standalone — no IDE, no platform connection, no network.

## When to Use This Skill

**Use this skill when the user asks to:**

- "Switch this Mule app to versionless"
- "Convert my classic Mule project to a versionless app"
- "Create the project-manifest.json and move my connectors into it"

**Trigger keywords:** switch · convert · versionless · project-manifest.json · classic-to-versionless.

**Do NOT use this skill when:** the user wants to upgrade connector or runtime
**versions** or fix Java compatibility → use **skill upgrade-mule-app**; or to
scaffold a new integration → use **skill build-mule-integration**.

## What this skill does

Given a Mule project root (the directory containing `pom.xml`), it:

1. Reads `pom.xml` (and its local parent chain) and finds every **connector** —
   a `<dependency>` with `<classifier>mule-plugin</classifier>` that is **not**
   test-scoped — then keeps only the ones **actually used in the app's Mule code**
   (their XML namespace appears in `src/main/mule`). A connector declared as a
   dependency (in the child pom or an inherited parent) but never referenced in a
   flow is dropped from the manifest. Test-scoped mule-plugins (MUnit tooling) are
   skipped.
2. Derives each connector's versionless **name** — its Mule XML namespace / prefix
   (the identity the versionless runtime resolves against, e.g. `http`, `salesforce`,
   `os`) — cross-checking the namespaces actually declared in the app's Mule XML.
3. **Merges into** `project-manifest.json` next to `pom.xml` (creating it if absent).
   Connectors are **name-only** — the versionless name (XML namespace / prefix) is the
   identity the runtime resolves against:
   ```json
   {
     "version": "1.0.0",
     "connectors": [
       { "name": "http" },
       { "name": "salesforce" }
     ]
   }
   ```
   An existing manifest's connectors are **retained**; only genuinely-new connectors
   (used in code and still uncommented in the pom) are appended. A core-only app (no
   connectors) still becomes versionless — the manifest is written with an empty
   `connectors` array.
4. **Comments out** each newly-migrated connector `<dependency>` block in the child
   `pom.xml`, so the coordinates are no longer active but stay recoverable. Connectors
   inherited from a parent pom are added to the manifest but their dependency is left
   in place (the script never edits a parent pom).

This design is **idempotent and incremental**: because the commented-out blocks are
invisible to the pom parser, re-running only ever picks up connectors added since the
last run, and re-running a fully-migrated project is a no-op.

## Prerequisites

```bash
node --version    # needs 18+
```

The current working directory (or the path you pass) must be a Mule application
root — it must contain a `pom.xml`.

## Bundled scripts

This skill ships scripts under `scripts/`. Invoke them by the **absolute path**
given in the "skill is now active" message — do not construct relative
`../scripts/...` paths (the working directory shifts between turns).

| Script | Purpose | Output |
| --- | --- | --- |
| `scripts/switch_to_versionless.mjs [projectDir] [--dry-run]` | The whole switch: reads pom + Mule XML, writes `project-manifest.json`, comments out connector deps. `--dry-run` plans only, writes nothing. | JSON report on stdout (and, unless `--dry-run`, the manifest + edited pom on disk) |

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
3. **Only the child pom is edited.** Connectors inherited from a parent POM are
   written to the manifest but left declared in the parent (the script warns);
   never edit a parent POM automatically.
4. **Confirm before writing** (see the gate in Step 3).

### Step 1: Confirm the project root

Determine the Mule project root — the directory containing `pom.xml`. If the user
did not name one, use the current working directory. Confirm `pom.xml` exists; if
not, tell the user this is not a Mule application root and stop.

### Step 2: Plan the switch (dry run)

Run the script in dry-run mode to see exactly what will change, writing nothing:

```bash
node <skill-dir>/scripts/switch_to_versionless.mjs <projectDir> --dry-run
```

Read the JSON report:

- **`connectors[]`** — the final, merged manifest (name-only): retained + newly added.
- **`existingRetained[]`** — connector names carried over from a pre-existing manifest.
- **`newlyAdded[]`** — connectors migrated on this run (declared **and** used in code); empty means nothing new to do.
- **`declaredButUnused[]`** — mule-plugin deps whose namespace is not used in `src/main/mule`; excluded from the manifest and left in the pom.
- **`skipped[]`** — test-scoped mule-plugins that are intentionally excluded.
- **`xmlPrefixes[]`** — the connector namespaces actually used in the app's Mule XML (the "used in code" set).
- **`pomEdits[]`** — the child-pom dependency blocks that will be commented out.
- **`warnings[]`** — unresolved versions, parent-declared connectors, unused deps.

Review **`declaredButUnused[]`**: an entry there is either genuinely unused (correctly
dropped) or a connector whose real XML prefix differs from what was derived from its
artifactId (a false drop). Cross-check against `xmlPrefixes[]`; if a listed connector
IS used, add its correct name to the manifest manually rather than guessing.

### Step 3: Get confirmation, then apply

**[GATE] Show the user the plan from Step 2 — the connectors to migrate, the manifest
that will be written, and the pom dependencies that will be commented out — and WAIT
for explicit approval before writing anything.**

On approval, run the script for real:

```bash
node <skill-dir>/scripts/switch_to_versionless.mjs <projectDir>
```

This merges into (or creates) `project-manifest.json` and comments out the
newly-migrated connector `<dependency>` blocks in the child `pom.xml`. Those are the
only two files it ever writes.

### Step 4: Verify and report

Confirm the result:

- Read `project-manifest.json` and check it matches the planned connectors.
- Read `pom.xml` and confirm each migrated connector block is wrapped in
  `<!-- [versionless] moved to project-manifest.json ... -->`.
- Re-run the script; on the second run `newlyAdded[]` and `pomEdits[]` are empty and
  the manifest is unchanged (idempotent). Adding another connector to the pom later and
  re-running appends just that one — existing entries are retained.

Report concisely: how many connectors were moved, which were skipped and why, any
connector whose version could not be resolved (written as `version: null`), and any
parent-declared connectors left in place. State plainly if anything needs manual
follow-up.

## Best Practices

- **Commit or stash first.** ✅ Have the user commit before applying so the pom edits
  and new manifest are easy to review or revert. ❌ Don't run on a dirty tree without
  telling them.
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
plugins are intentionally skipped). Otherwise check `declaredButUnused[]` — the
connector's namespace was not found in `src/main/mule`, so it was treated as unused. If
it really is used, its XML prefix differs from the name derived from its artifactId; add
the correct name to the manifest manually.

**A connector dependency was not commented out:** it is declared in a parent POM
(the script only edits the child pom) or the block contained a nested comment — check
`warnings[]`. Comment it out manually in that case.

**"refusing to overwrite" and the script exits:** a file named `project-manifest.json`
exists but isn't a valid manifest (bad JSON, or no `connectors` array). The script will
not clobber it. Inspect and fix or remove the file, then re-run.

## Related Skills

- **skill upgrade-mule-app**: upgrade connector/runtime versions and Java compatibility for a Mule app — use it for version bumps, not for the versionless switch.
- **skill build-mule-integration**: scaffold a new Mule integration from scratch.
- **skill secure-mule-app**: encrypt sensitive properties in a Mule app.
