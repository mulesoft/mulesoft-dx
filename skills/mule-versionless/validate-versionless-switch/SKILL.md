---
name: validate-versionless-switch
description: >
  Check whether a classic (versioned) Mule 4 application can switch to a
  versionless app. Runs the versionless switch validator offline on src/main/mule,
  pom.xml and mule-artifact.json (or on a packaged *-mule-application.jar), writes a JSON report, and gives a switchable
  verdict. TRIGGER when: the user asks to "check/validate if a Mule app can go
  versionless", "will this app switch to versionless", "run the versionless switch
  validator / compatibility check", "what blocks my app from being versionless", or
  "pre-check before switching to versionless". DO NOT TRIGGER when: the user wants
  to do the switch and write project-manifest.json (skill
  switch-classic-mule-to-versionless), build or run a versionless app (skill
  build-run-versionless-app), or upgrade connector or runtime versions (skill
  upgrade-mule-app).
license: Apache-2.0
compatibility: >
  Requires a JDK 17+ (found through JAVA_HOME, a standard install root, or PATH) and
  a Mule 4 project root (a dir with pom.xml and src/main/mule) or a packaged
  *-mule-application.jar. One portable jar; no
  per-OS binaries. Each run checks the internal Nexus for the latest master jar
  (~12 MB, downloaded when new); it needs NEXUS_USERNAME and NEXUS_PASSWORD (or a
  ~/.netrc entry).
allowed-tools: Bash Read
metadata:
  author: mule-versionless
  version: "0.1.0"
---

# Validate a Mule App's Versionless Switch

This skill runs the versionless switch validator on a classic Mule 4 app. It tells
whether the app can switch to versionless, and if not, what blocks it. It is a
**read-only pre-check**: it reads the app and writes one report file. It does not
change the app.

The validator jar holds its capability data: the versionless runtime's supported
elements, its connector extension models, the DataWeave capabilities and the
runtime flag registry. All of it comes from the mule-versionless commit that built
the jar. The validator needs no network and no IDE. `validate.sh` uses the network
only to get the latest jar that the mule-versionless master build published.

## When to use this skill

- "Check / validate whether this Mule app can switch to versionless"
- "Run the versionless switch validator (or compatibility check) on my app"
- "What blocks my app from being versionless?"
- "Pre-check before I switch to versionless"

**Do not use this skill** to do the switch (skill
switch-classic-mule-to-versionless; it runs this validator first), to build or run
a versionless app (skill build-run-versionless-app), or to upgrade versions (skill
upgrade-mule-app).

## What the validator checks

| Category | Can BLOCK | Examples |
| --- | --- | --- |
| `dataweave` | yes | readers, writers and modules the versionless DataWeave engine does not support; `java!` imports |
| `flow` | yes | core and connector elements the versionless runtime does not run (for example `scatter-gather`, `until-successful`); connector elements that do not match the bundled XSD (`flow.xsd.invalid`) |
| `connector` | yes | a Mule namespace with no versionless connector (one finding per namespace); a global element the connector does not have; OAuth grants; `<os:*>` is INFO |
| `config` | yes | `${secure::…}`, `<secure-properties:config>` (BLOCK); prefix dispatchers, dynamic property file names (INFO) |
| `project` | yes | multi-module pom, in-tree parent pom, `mule-domain` / `mule-policy` packaging, top-level `<import>` |
| `security` | yes | `<tls:context>` with key or trust stores, `<api-gateway:autodiscovery>`, `http-policy:*` |
| `state` | yes | `<redelivery-policy>`, `<idempotent-message-validator>` |
| `devx` | no (INFO) | MUnit tests, custom `log4j2.xml`, tracking, notifications, OpenTelemetry, explicit streaming |

Each finding is **BLOCK** or **INFO**. A BLOCK stops the switch. An INFO is a
behavior difference; the app still runs.

The report also lists **flipped runtime flags**: flags whose value on the classic
runtime (from `minMuleVersion` in mule-artifact.json and from `-D` overrides) is
different on versionless. Flipped flags do not block.

`currentAppSetup` in the report shows what the app uses today: `minMuleVersion` and
`javaSpecificationVersions` from mule-artifact.json, the connectors in pom.xml (the
`mule-plugin` dependencies), and a count of each element in the Mule configs.

### Profiles

| Profile | Categories that gate | Use |
| --- | --- | --- |
| `strict` (default) | all | offline switch |
| `acb` | `dataweave`, `flow`, `connector` | the same gate as the ACB "Upgrade to Versionless" wizard |

The report holds the verdict of both profiles in `verdicts`. `blockerCount` and the
exit code follow the selected profile.

## Bundled files

| Path | What |
| --- | --- |
| `scripts/validate.sh` | finds a JDK 17+, gets the latest jar and runs it |

The jar is not in the skill folder. Each master build of mule-versionless publishes
it to the internal Nexus as
`org.mule.tools.versionless:versionless-validator:0.0.1-SNAPSHOT`. On each run,
`validate.sh` reads the snapshot metadata. When master published a new build, it
downloads the jar (~12 MB), checks it against the `.sha256` file from Nexus, and keeps
only that jar in `~/.cache/mule-versionless/` (or `$XDG_CACHE_HOME/mule-versionless/`).
When Nexus is not reachable, it uses the cached jar and prints a warning. To use a
different jar, set `VERSIONLESS_VALIDATOR_JAR`.

## Workflow

Use the **absolute path** of `scripts/validate.sh` from the "skill is now active"
message. Do not make relative `../scripts/...` paths; the working directory can
change between turns.

### Step 1: Find the project root or the app jar

Use the dir the user names, else the current working dir. It must hold `pom.xml`
and `src/main/mule`:

```bash
ls <project-dir>/pom.xml <project-dir>/src/main/mule
```

When the user names a deployed or built app (`*-mule-application.jar`, for example
in `target/`), give the jar path instead of `<project-dir>`. The validator then reads
the Mule files the jar lists in `META-INF/mule-artifact/mule-artifact.json`.

If the pom has `<packaging>mule-application-versionless</packaging>`, the app is
already versionless. Tell the user and stop.

### Step 2: Run the validator

```bash
<skill-dir>/scripts/validate.sh <project-dir|app.jar>
```

Options (all pass through to the jar):

| Option | Effect |
| --- | --- |
| `--out <file>` | report path; default `<project-dir>/<dir-name>-versionless-switch-report.json`, or `<jar-dir>/<jar-name>-versionless-switch-report.json` |
| `--profile strict\|acb` | gate profile; default `strict` |
| `--include-info` | also write INFO findings to the report; the gate does not change |
| `--app-id <id>` | put an app id in the report, for pipelines that collect many reports |
| `-D<key>=<value>` | a classic runtime `-D` override, for the flag check |
| `--capabilities <dir\|zip>` | use other capability data than the embedded data |

Use the **exit code** to decide, not the text:

| Exit | Meaning |
| --- | --- |
| `0` | SWITCHABLE: no blockers |
| `3` | NOT SWITCHABLE: one or more blockers |
| `1` | FAIL-CLOSED: the app could not be validated (malformed XML, bad capability data, no JDK) |
| `2` | usage error (bad arguments, no `src/main/mule`, or a jar with no `mule-artifact.json`) |

### Step 3: Report to the user

Give **three things only**, in prose: the verdict, the blocker count and the report
path.

> **Not switchable — 8 blockers.** Full report: `<path>/<app>-versionless-switch-report.json`

> **Switchable — 0 blockers.** Full report: `<path>/<app>-versionless-switch-report.json`

**Do not show the findings in chat.** No tables, no lists of findings, no
remediation section. The findings are in the JSON report. Show finding details only
when the user asks for them (for example "show me the blockers"). Each finding has
`category`, `ruleId`, `symbol`, `severity`, `message`, `fileUri` (relative to the
project root, or to the jar root) and `startLine` / `startColumn`.

If the exit code is 1, say that the app could not be validated and give
`failureReason` from the report. Do not say that the app is switchable.

When the user is ready to switch, hand off to skill
switch-classic-mule-to-versionless.

## Troubleshooting

**`could not read` or `could not download`:** the internal Nexus needs
credentials. Set `NEXUS_USERNAME` and `NEXUS_PASSWORD` (or add a `~/.netrc` entry for
`nexus-proxy.repo.local.sfdc.net`), and check the VPN. Or set
`VERSIONLESS_VALIDATOR_JAR` to a local jar.

**`does not match its .sha256`:** the download is damaged, or a master build was
publishing at the same time. Run again.

**Exit 2, `no src/main/mule`:** the path is not the project root. Give the dir that
holds `pom.xml`, not a file or `src/main/mule`.

**Exit 2, `no META-INF/mule-artifact/mule-artifact.json`:** the jar is not a packaged
Mule app. Give the `*-mule-application.jar` (or the `*-mule-application-light-package.jar`), not a library jar.

**Exit 2, `is a plugin`:** the jar is a connector or XML SDK plugin. Give the app that uses it.

**`no JDK 17+ found`:** set `JAVA_HOME` to a JDK 17+ install, or install one
(`brew install openjdk@17`, or a temurin or openjdk 17 package on Linux). On some
machines the PATH `java` is a wrapper stub; `JAVA_HOME` has priority.

**`ARTIFACT_MALFORMED`:** `mule-artifact.json` is not valid JSON, or the jar's
`mule-artifact.json` has no `configs` list, an empty one, or an entry that is not a file name. Rebuild the jar with the Mule Maven plugin.

**`XML_MALFORMED`:** a file under `src/main/mule` (or `pom.xml`) is not well-formed
XML. `failureReason` gives the file and the position.

**`IO_ERROR`:** a file can not be read, for example a jar with no read permission.

**`CAPABILITIES_UNAVAILABLE`:** the capability data is missing or its sha256 does
not match `bundle.json`. With the embedded data, the jar is damaged: delete it from the cache and run again.
With `--capabilities`, check the dir or zip.
