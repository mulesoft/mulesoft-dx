---
name: update-runtime-binaries
description: >
  Rebuild the native binaries bundled by the build-run-versionless-app skill
  (descriptor-gen, mule-ast, mule-server) from a local mule-versionless checkout,
  swap them in, record provenance, and verify the whole build+run loop end-to-end
  — offline, in one self-contained run. Updates the build-run-versionless-app copy
  in the SOURCE skills repo (its committed bin/), NOT the installed ~/.claude copy.
  Prompts for the mule-versionless repo path and that source-repo skill path, then
  builds mule-ast + mule-server from master and (only when needed) descriptor-gen
  from its feature branch.
  TRIGGER when: user asks to "update/refresh/rebuild the versionless runtime
  binaries", "rebuild descriptor-gen / mule-ast / mule-server", "bump the bundled
  native binaries", "build the binaries for a new platform", or "run the
  UPDATING-BINARIES steps". DO NOT TRIGGER when: the user wants to build/run a
  versionless app (skill build-run-versionless-app), convert a classic app (skill
  switch-classic-mule-to-versionless), or upgrade connector/runtime versions in an
  app (skill upgrade-mule-app).
license: Apache-2.0
compatibility: >
  Requires a local mule-versionless git checkout with its vendored crates
  (third_party/crates) present, the Rust toolchain (cargo), git, plus JDK 17 and
  Maven 3.8+ for the verification run. Binaries are built for the host OS/arch.
allowed-tools: Bash Read Write Edit AskUserQuestion
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Update the Versionless Runtime Binaries

You maintain the three native binaries the **build-run-versionless-app** skill
ships in `bin/<os>-<arch>/`: `descriptor-gen`, `mule-ast`, and `mule-server`.
They are on no package registry — the only way to refresh them is to build from
the `mule-versionless` repo. This skill *is* that runbook, in **one
self-contained script**: it builds from
the correct branches, backs up the current binaries, swaps the new ones in,
writes provenance, and verifies the full build → deploy → run loop before
declaring success — rolling back automatically if verification fails.

**Target the source repo, not the installed copy.** The binaries are updated in
the `build-run-versionless-app` directory of the **source skills repo checkout**
(the version-controlled copy whose `bin/` is committed), so the refreshed binaries
can be committed there. The installed `~/.claude/skills/build-run-versionless-app`
copy is a separate local install the user refreshes on their own — this skill does
**not** write it (the script refuses a `~/.claude` path unless
`--allow-installed-skill` is passed).

## When to Use This Skill

**Use this skill when the user asks to:**

- "Update / refresh / rebuild the versionless runtime binaries"
- "Rebuild `descriptor-gen` / `mule-ast` / `mule-server`"
- "Bump the bundled native binaries" or "run the UPDATING-BINARIES steps"
- "Build the versionless binaries for a new platform (linux-x86_64, etc.)"

**Trigger keywords:** versionless · binaries · descriptor-gen · mule-ast · mule-server · rebuild · refresh · bin/ · UPDATING-BINARIES.

**Do NOT use this skill when:** the user wants to **build/run** a versionless app
→ **skill build-run-versionless-app**; **convert** a classic app → **skill
switch-classic-mule-to-versionless**; or upgrade connector/runtime **versions** in
an app → **skill upgrade-mule-app**.

## The build rule

| Binary | Crate | Branch | Phase |
| --- | --- | --- | --- |
| `mule-ast` | `cli` | `master` | build (XML → `artifact.ast`) |
| `mule-server` | `mule_server` | `master` | runtime (serves flows) |
| `descriptor-gen` | `mule_descriptor_gen` | `feat/versionless-descriptor-generation` | build (connector schemas) |
| `connectors/lib*.{dylib,so}` | `mule_connector_*` (e.g. `mule_connector_http`) | `master` | runtime (dlopened at deploy) |

Connector libraries build from the **same `master` ref as `mule-server`** — their
extension ABI must match the server's, or the runtime skips the library and deploy
fails with `connectors not installed on this host`. They land in
`bin/<os>-<arch>/connectors/`, which `build-run-versionless-app`'s `deploy-run.sh`
points `MULE_CONNECTOR_DIR` at.

`descriptor-gen` was **never merged to `master`** — it builds from its feature
branch, and it changes rarely, so the script **reuses** the bundled one unless
you pass `--with-descriptor-gen` or it is missing for the target platform. The
script also detects the trap case: if `descriptor-gen` ever appears on `master`,
the split is gone — it then builds all three from `master` and tells you to
simplify this skill (drop the feature-branch special case).

## What the script does (in order)

1. Validates the two paths and the toolchain (`cargo`, `git`; `mvn`/`java` for verify).
2. `git fetch origin`, then decides which binaries build from which branch.
3. Builds in **detached worktrees** off `origin/*` — your checkout is never touched
   — with `cargo build --offline --release` (the repo vendors crates in
   `third_party/crates`, so no network is needed).
4. Backs up the current binaries to a timestamped `/tmp` dir, copies the new ones
   into `bin/<os>-<arch>/` (and the connector libraries into
   `bin/<os>-<arch>/connectors/`, built from the same master worktree), marks them
   executable.
5. Writes `bin/<os>-<arch>/PROVENANCE.txt` (branch + commit + date per binary).
6. **Verifies** end-to-end on isolated ports: `setup.sh` → build the bundled
   `example-app` → start `mule-server` → deploy → run a flow (expects
   `Versionless is ready to rock!`) → undeploy → stop. On any failure it restores
   the backup and exits non-zero, so a bad build never ships.
7. Removes its worktrees and temp files (always, even on error).

## Workflow

### Step 1: Get and confirm the two paths

The script needs two inputs. **Always confirm both with the user before running**
— neither has a default, and this holds on every machine. You may *infer*
candidate values from context (the git status, the working directory, an
`ls`/`git remote` probe), but an inferred path is a **guess, not consent**: you
must present each candidate back to the user and get an explicit yes before
invoking the script. If you cannot confirm a path, ask for it with
**AskUserQuestion** rather than proceeding on the guess. This applies to **both**
paths equally — do not confirm one and silently assume the other.

- **mule-versionless repo path** — a local checkout of the `mule-versionless`
  git repo (must contain the vendored `third_party/crates` tree so the offline
  build works). There is no sensible default; you must obtain this.
- **build-run-versionless-app path in the SOURCE skills repo** — the
  version-controlled `build-run-versionless-app` directory (holding `bin/` and
  `scripts/`) inside the skills repo checkout, e.g.
  `<skills-repo>/.../build-run-versionless-app`. This is the copy whose `bin/` is
  committed. **Do not** pass the installed `~/.claude/skills/build-run-versionless-app`
  copy — the script refuses a `~/.claude` path unless `--allow-installed-skill` is
  given, and updating the installed copy would not land the new binaries in the repo.
  There is no default; ask for it every time.

Once the user has confirmed both, verify they exist (and that the skill path is
inside the source repo, not under `~/.claude`) — this existence check is in
addition to, not a substitute for, the user's explicit confirmation above:

```bash
ls -d <mule-repo>/.git <skill-dir>/scripts/setup.sh
```

### Step 2: Run the update

Invoke the bundled script by its **absolute path** (given in the "skill is now
active" message — do not build relative `../scripts/...` paths):

```bash
<skill-dir>/scripts/update-binaries.sh \
  --mule-repo <mule-versionless-checkout> \
  --skill <source-repo>/.../build-run-versionless-app
```

The `--skill` path must be the **source-repo** copy (see Step 1); the script
rejects a `~/.claude` installed path unless `--allow-installed-skill` is passed.

Useful flags:

- `--with-descriptor-gen` — also rebuild `descriptor-gen` (default: reuse the
  bundled one). Use when the user says descriptor-gen changed or you are seeding a
  new platform.
- `--no-verify` — swap the binaries without the end-to-end run (rarely wanted; the
  verify is the whole point).
- `--no-fetch` — build from whatever `origin/*` you already have (offline / air-gapped).
- `--allow-installed-skill` — escape hatch to let `--skill` point at an installed
  `~/.claude` copy. Normally unwanted: those binaries can't be committed.

> **This is a long-running, filesystem-heavy command.** It writes under the
> mule-versionless repo (a temporary worktree), `~/.m2` (via `setup.sh`), `/tmp`,
> and the skill's `bin/`. Run it as a single invocation and let it finish; if your
> environment sandboxes writes outside the working directory, approve/allow it —
> it is one self-contained script, not many steps.

### Step 3: Report

Report concisely: which binaries were rebuilt and from which commits, that
verification passed (the flow response), where the backup was kept, and — if the
script flagged the trap case — that this skill needs simplifying (drop the
feature-branch special case) because `descriptor-gen` reached `master`.

Because the target is the source repo, the refreshed binaries now show as changes
in that repo's working tree — remind the user to review and commit them (the
updated `bin/<os>-<arch>/` files plus `PROVENANCE.txt`), and to refresh their
installed `~/.claude` copy separately if they use it.

## Best practices

- **Confirm both paths with the user first.** ✅ Present the mule-versionless repo
  path *and* the source-repo skill path — even inferred ones — and get an explicit
  yes before running. ❌ Don't run on a guessed path (inferring one from git status
  and assuming the rest); this writes to the repo, so silent inference is the wrong
  default.
- **Let the verify run.** ✅ Default (with verification) — it proves every binary
  the way the plugin and runtime use them. ❌ `--no-verify` ships blind.
- **Reuse descriptor-gen unless it changed.** ✅ Default reuse — it moves rarely.
  ❌ Don't add `--with-descriptor-gen` reflexively; it just doubles build time.
- **Don't hand-run the individual git/cargo/cp steps.** ✅ One script call gets
  worktree isolation, offline flags, backup, provenance, verify, and cleanup right.
  ❌ Piecemeal commands are how the fragile `rm -rf`/placeholder-path mistakes creep in.
- **New platform?** ✅ Run this **on that host** (binaries are per-OS/arch); it
  creates `bin/<os>-<arch>/` and builds all three (descriptor-gen included, since
  it's missing there). ❌ Don't copy another platform's binaries.
- **Target the source repo.** ✅ Point `--skill` at the `build-run-versionless-app`
  copy in the source skills repo checkout, so the new binaries can be committed.
  ❌ Don't point it at the installed `~/.claude/skills` copy — that's rejected by
  default and wouldn't land the binaries in version control anyway.

## Troubleshooting

**`cargo not found` / `git not found`:** install the Rust toolchain / git on the
build host. The verify step additionally needs `mvn` (3.8+) and `java` (17).

**`origin/master not found` or `ref not found`:** the checkout hasn't fetched the
branches. Drop `--no-fetch` (the default fetches), or fetch manually.

**Offline build fails resolving crates:** the checkout is missing the vendored
`third_party/crates` tree (see `.cargo/config.toml` `source.vendored-sources`).
Use a checkout that has it committed, or regenerate it per that repo's docs.

**Verification failed → binaries restored:** the script rolled back to the backup
it printed; nothing shipped. Read the failure line (setup / build / deploy / run),
fix the cause in `mule-versionless`, and re-run.

**`descriptor-gen is now on origin/master — the split is gone`:** informational.
The script built all three from `master`; afterward, simplify this skill (and its
`update-binaries.sh`) to drop the feature-branch special case.

**Port already in use during verify:** it uses control `:19090` / app `:18081` by
default to avoid clashing with a running server. Override with
`VERIFY_CONTROL_PORT` / `VERIFY_APP_PORT` env vars.

**`--skill points at an installed copy under ~/.claude`:** you gave the installed
skill path instead of the source-repo copy. Re-run with `--skill` set to the
`build-run-versionless-app` directory inside the source skills repo checkout so the
binaries land in version control. Only pass `--allow-installed-skill` if you really
mean to overwrite the local install (those binaries can't be committed).

## Related Skills

- **skill build-run-versionless-app**: build and run a versionless Mule app with the binaries this skill maintains.
- **skill switch-classic-mule-to-versionless**: convert a classic Mule app to versionless.
- **skill upgrade-mule-app**: upgrade connector/runtime versions and Java compatibility in an app.
