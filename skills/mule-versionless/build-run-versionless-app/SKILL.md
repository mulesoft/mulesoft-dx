---
name: build-run-versionless-app
description: >
  Build a versionless Mule application to a deployable jar and run it on the
  versionless runtime — no IDE, no platform connection, no network. Bundles the
  native build/runtime binaries (descriptor-gen, mule-ast, mule-server), the
  mule-maven-plugin snapshot, and a connector exchange stub, so `mvn package`
  generates connector schemas + the artifact AST and the runtime deploys and
  serves the flows over HTTP. TRIGGER when: user asks to "build/package a
  versionless Mule app", "run/deploy a versionless app", "test the versionless
  build end-to-end", "generate the artifact.ast", or "start the versionless
  runtime". DO NOT TRIGGER when: the user wants to convert a classic app to
  versionless (skill switch-classic-mule-to-versionless), upgrade connector or
  runtime versions (skill upgrade-mule-app), or scaffold a brand-new integration
  (skill build-mule-integration).
license: Apache-2.0
compatibility: >
  Requires JDK 17 and Maven 3.8+. Bundled native binaries are per-OS/arch
  (currently darwin-arm64); other platforms must be rebuilt from the
  mule-versionless repo (see "Unsupported platform").
allowed-tools: Bash Read Write Edit AskUserQuestion
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Build & Run a Versionless Mule App

You are a MuleSoft tooling specialist taking a **versionless** Mule application
from source to a running flow, entirely offline.

A versionless app declares its connectors by name in `project-manifest.json`
(not by Maven coordinate in `pom.xml`) and uses
`<packaging>mule-application-versionless</packaging>`. Building one is not a
plain `mvn package`: the build shells out to two native binaries and fetches
connector schemas from an exchange, and the result runs on a native runtime, not
the JVM Mule runtime. This skill bundles everything those steps need, so the
whole loop runs with no network and no separately-installed toolchain beyond a
JDK and Maven.

## When to Use This Skill

**Use this skill when the user asks to:**

- "Build / package this versionless Mule app"
- "Run / deploy my versionless app and hit its flow"
- "Test the versionless build end-to-end" or "generate the artifact.ast"
- "Start the versionless runtime server"

**Trigger keywords:** versionless · build · package · artifact.ast · deploy · run · mule-server · descriptor-gen · mule-ast.

**Do NOT use this skill when:** the user wants to **convert** a classic app to
versionless → **skill switch-classic-mule-to-versionless**; upgrade connector or
runtime **versions** → **skill upgrade-mule-app**; or scaffold a **new**
integration → **skill build-mule-integration**.

## What this skill does

Given a versionless Mule project root (a `pom.xml` with
`<packaging>mule-application-versionless</packaging>`), it:

1. **Sets up** the local toolchain once: installs the bundled
   `mule-maven-plugin:4.11.0-SNAPSHOT` into `~/.m2` and verifies the bundled
   native binaries run on this host.
2. **Builds** the app with `mvn package`, driving the bundled `descriptor-gen`
   (connector `dsl.json` + `schema.xsd`, and the baked mule-core descriptor) and
   `mule-ast` (the app's flow XML → `META-INF/mule-artifact/artifact.ast`), with
   connector `extension-model.json` fetched from the bundled `file://` exchange
   stub. Output: a `*-mule-application-versionless.jar`.
3. **Deploys and runs** the jar on the bundled `mule-server`: the runtime reads
   only `META-INF/mule-artifact/artifact.ast` from the jar, builds the flows, and
   registers one HTTP route per flow at `/<app>/<flow>`.

The three phases correspond to the three bundled scripts (`setup.sh`,
`build.sh`, `deploy-run.sh`).

## What's bundled

| Path | What | Why |
| --- | --- | --- |
| `bin/<os>-<arch>/{descriptor-gen,mule-ast,mule-server}` | native build + runtime binaries | the build and runtime cannot run without them; they are not on any package registry |
| `m2-plugin/org/mule/tools/maven/**` | `mule-maven-plugin:4.11.0-SNAPSHOT` (5 modules, jar+pom) | the versionless build path lives in this snapshot, published to no remote repo (see "Why bundle the plugin") |
| `exchange-stub/assets/{http,salesforce,twilio}-1.0.0.zip` | connector `extension-model.json` bundles | the build fetches connector schemas from here via `file://`; shipping the zips removes the go-runtime-sibling dependency |
| `example-app/` | a ready-to-build versionless demo app | a self-contained target to prove the loop end-to-end |

### Why bundle the plugin

`mule-maven-plugin:4.11.0-SNAPSHOT` is **not** on any remote Maven repository —
it exists only as a local `mvn install` from the plugin's feature branch. A
versionless `mvn package` therefore fails on any machine that hasn't installed
it. `setup.sh` copies the bundled jar+pom set into the user's `~/.m2` so the
build resolves it locally, offline. It writes only under
`~/.m2/repository/org/mule/tools/maven/` and is idempotent.

## Prerequisites

```bash
java -version   # needs JDK 17
mvn -version    # needs Maven 3.8+
```

The bundled binaries are **per-OS/arch**. Check that a directory matching this
host exists under `bin/` (e.g. `bin/darwin-arm64/`). If not, see
[Unsupported platform](#unsupported-platform).

## Bundled scripts

Invoke them by the **absolute path** given in the "skill is now active" message —
do not construct relative `../scripts/...` paths (the working directory shifts
between turns). Each script locates the bundled assets relative to its own
location, so they work from any CWD.

| Script | Purpose |
| --- | --- |
| `scripts/setup.sh` | Install the bundled plugin into `~/.m2`; verify binaries + toolchain. Run once per machine. |
| `scripts/build.sh <project-dir>` | `mvn clean package` with the bundled binaries + exchange stub. Produces the versionless jar. |
| `scripts/deploy-run.sh {start\|stop\|deploy <jar>\|run <app>/<flow> [body]\|list\|undeploy <app>}` | Drive the bundled runtime. |

## Workflow

### Rules that always apply

1. **Confirm the packaging first.** This skill only builds
   `mule-application-versionless` projects. If the pom's packaging is
   `mule-application` (classic), stop and point the user at
   **skill switch-classic-mule-to-versionless**.
2. **Run `setup.sh` before the first build on a machine.** It is idempotent — a
   redundant run is harmless — but skipping it on a fresh machine makes the build
   fail resolving the plugin.
3. **Never mutate the user's app to make it build.** The binaries and exchange
   base are passed to Maven as `-D` flags by `build.sh`; do not edit the pom to
   hardcode paths.
4. **Copy the jar to a short name before deploying** if you care about the route.
   The app name (and thus the route prefix) is the jar's file stem, so
   `foo-1.0.0-SNAPSHOT-mule-application-versionless.jar` yields a long
   `/foo-1.0.0-SNAPSHOT-mule-application-versionless/<flow>` route.

### Step 1: Confirm the project and set up the toolchain

Determine the project root — the directory containing `pom.xml`. If the user did
not name one, use the current working directory. Confirm the packaging:

```bash
grep -m1 '<packaging>' <project-dir>/pom.xml   # expect mule-application-versionless
```

If it is not versionless, stop (see Rule 1). Otherwise run setup (safe to repeat):

```bash
<skill-dir>/scripts/setup.sh
```

This installs the plugin and smoke-tests the binaries. If setup reports an
unsupported platform or a binary that won't run, resolve that first
([Unsupported platform](#unsupported-platform)) — the build can't succeed otherwise.

> **No project of your own?** Use the bundled demo: copy `example-app/` to a
> writable directory and build that. It is a one-flow app whose `<choice>`
> branches on `payload.msg`, ideal for proving the loop.

### Step 2: Build

```bash
<skill-dir>/scripts/build.sh <project-dir>
```

Watch the Maven log for the versionless markers — they confirm the pipeline fired:

- `'versionlessMode' enabled: … generating the AST via the mule-ast binary …`
- `Generated artifact.ast at …/target/META-INF/mule-artifact/artifact.ast`
- `Building zip: …-mule-application-versionless.jar`

On success the script prints the jar path and confirms
`META-INF/mule-artifact/artifact.ast  ✓`. That file is the deploy contract — if
the check fails, deploy will fail; see [Troubleshooting](#troubleshooting).

### Step 3: Start the runtime

```bash
<skill-dir>/scripts/deploy-run.sh start
```

Starts `mule-server` in the background: **control** server on `127.0.0.1:9090`
(deploy/undeploy/list, localhost-only) and **app** server on `0.0.0.0:8081`
(flow traffic). If either port is taken, set `MULE_CONTROL_PORT` /
`MULE_APP_PORT` (the script and server both honor them) and re-run. The server
keeps running until `deploy-run.sh stop`.

### Step 4: Deploy and run

Copy the jar to a short name for a clean route, then deploy:

```bash
cp <project-dir>/target/*-mule-application-versionless.jar /tmp/demo.jar
<skill-dir>/scripts/deploy-run.sh deploy /tmp/demo.jar
# → {"name":"demo","flow_count":1,"routes":["/demo/flowtotestpayload"],"status":"deployed"}
```

Invoke a flow at `/<app>/<flow>` (the app is the jar stem). The request body
becomes the message payload; pass JSON to exercise expression-driven flows:

```bash
<skill-dir>/scripts/deploy-run.sh run demo/flowtotestpayload '{"msg":"hi"}'
# → Versionless is ready to rock!
<skill-dir>/scripts/deploy-run.sh run demo/flowtotestpayload '{}'
# → Are you sure you want to build your integration with Classic Mule?
```

Use the exact route from the deploy response. List and clean up as needed:

```bash
<skill-dir>/scripts/deploy-run.sh list
<skill-dir>/scripts/deploy-run.sh undeploy demo
<skill-dir>/scripts/deploy-run.sh stop
```

### Step 5: Report

Report concisely: the jar produced, that `artifact.ast` is present, the routes
registered, and the flow responses observed. If anything needed manual
follow-up (a port override, a platform rebuild), state it plainly.

## Best Practices

- **Set up once, build many.** ✅ Run `setup.sh` a single time per machine, then
  iterate with `build.sh`. ❌ Don't re-install the plugin before every build.
- **Deploy from a short-named copy.** ✅ `cp … /tmp/demo.jar` keeps routes
  readable. ❌ Deploying the raw `target/` jar gives a route named after the full
  artifact filename.
- **One app name at a time.** ✅ `undeploy` before redeploying the same app —
  the runtime rejects a duplicate name with `409`. ❌ Don't expect a second
  `deploy` of the same name to replace the first.
- **Leave the app's files alone.** ✅ Everything the build needs is passed as
  `-D` flags. ❌ Don't hardcode binary paths or the exchange base into the pom.

## Troubleshooting

**`grep` shows packaging `mule-application` (not versionless):** this is a
classic app; this skill does not build it. Use
**skill switch-classic-mule-to-versionless** to convert it first.

**Build fails resolving `mule-maven-plugin:4.11.0-SNAPSHOT`:** `setup.sh` was not
run (or ran against a different `~/.m2`). Re-run `scripts/setup.sh` and confirm
it prints "installed mule-maven-plugin".

**Build fails: `Cannot run program "…/descriptor-gen"` or `mule-ast`:** the
binary for this OS/arch is missing or not executable. See
[Unsupported platform](#unsupported-platform).

**`artifact.ast NOT found in the jar`:** the app has no `src/main/mule/*.xml`
with a named `<flow>`, or the packaging isn't versionless so the AST step never
ran. Confirm the flow XML and the packaging, then rebuild.

**Deploy `400`, `JAR missing META-INF/mule-artifact/artifact.ast`:** the jar was
built without the AST (a classic jar, or a build where the AST step was skipped).
Rebuild with `build.sh` and confirm the `✓` line.

**Deploy `400`, `artifact contains no flows`:** the AST has only configs/sources
(e.g. just an `<http:listener-config>`), no `<flow>`. Add a named flow.

**Deploy `409`, `already deployed`:** that app name is live. `undeploy <name>`
first, or deploy from a differently-named jar copy.

**Run `404`, `no route matches path`:** wrong `<app>/<flow>`. Use the exact entry
from the deploy response's `routes[]` (or `deploy-run.sh list`).

**`start` fails, `Address already in use`:** port 9090 or 8081 is taken. Re-run
with `MULE_CONTROL_PORT=19090 MULE_APP_PORT=18081 <skill-dir>/scripts/deploy-run.sh start`
(carry the same vars into `deploy`/`run`).

### Unsupported platform

The bundled binaries are compiled per OS/arch. If `bin/<os>-<arch>/` for this
host is absent, build the three binaries from the `mule-versionless` repo and
drop them in:

```bash
# in a mule-versionless checkout:
cargo build --release -p mule_descriptor_gen --bin descriptor-gen
cargo build --release -p cli                 --bin mule-ast
cargo build --release -p mule_server         --bin mule-server
# then copy target/release/{descriptor-gen,mule-ast,mule-server}
#   into this skill's bin/<os>-<arch>/  (e.g. bin/linux-x86_64/)
```

Re-run `setup.sh`; its smoke test will confirm the new binaries run.

## Related Skills

- **skill switch-classic-mule-to-versionless**: convert a classic Mule app to versionless (writes `project-manifest.json`, moves connectors) — run it *before* this skill if the app is still classic.
- **skill upgrade-mule-app**: upgrade connector/runtime versions and Java compatibility.
- **skill build-mule-integration**: scaffold a new Mule integration from scratch.
