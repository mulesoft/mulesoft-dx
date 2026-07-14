# Changelog

All notable changes to `@salesforce/mulesoft-vibes-skills` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.3] - 2026-07-13

### Fixed

- **`manage-api-version`** — Step 9's rescaffold (`mvn clean package -DskipTests`) required a manual approval click in the VS Code Vibes/Agentforce UI even when the exact command was allowlisted, because the model was emitting it as `cd <projectDir> && mvn clean package -DskipTests 2>&1`. The `2>&1` stream redirection is flagged as an unsafe operator by the extension's command-approval layer (`A4dSafeCommandsController.containsUnsafeOperators()`), which forces manual approval unconditionally, before any allowlist pattern is even consulted. Step 9 now explicitly instructs the agent never to append `2>&1` or any other redirection/pipe to the `mvn` invocation — the tool call already captures full stdout/stderr, so the redirection was redundant as well as harmful. Also made explicit that this rescaffold step must run immediately with no user confirmation prompt, matching the real Anypoint Studio behavior where rescaffolding fires automatically on a `pom.xml` change or a Project Properties → API Specs tab edit and is never a user-facing decision.

### Changed

- Added `cd ...` and an exact-match `mvn clean package -DskipTests` line to the local `a4d_safe_commands` allowlist (developer machine config, not part of this repo) so the two sub-commands produced by Step 9 — split independently by the extension's `parseMultiCommand()` — both auto-approve once the `2>&1` redirection is removed.

## [1.6.2] - 2026-07-13

### Fixed

- **`manage-api-version`** — Step 7c ("present available versions and handle selection") told the agent to display the version list and prompt as plain narrated chat text, then separately invoke the `AskUserQuestion` tool for the actual interactive selection — producing two renderings of the same question in the VS Code Vibes/Agentforce UI (one plain-text, one interactive). Step 7c is rewritten so the version list and prompt are presented *only* via a single `AskUserQuestion` tool call per API, with the version list as the tool's `options`; the skill no longer narrates the same content as chat text before or after the tool call.

## [1.6.1] - 2026-07-13

### Fixed

- **`manage-api-version`** — fixed a false-negative bug in version discovery (Steps 5, 6, 7b). The skill previously relied solely on `anypoint-cli-v4 exchange asset describe <groupId>/<artifactId>/<currentVersion>` and its `otherVersions` field to enumerate an asset's available versions. That field is anchored to the queried version and has been observed to return empty when the queried version is not the latest published version on Exchange — exactly the case CHECK ALL/CHECK SPECIFIC/CHANGE hit every time, since they query from whatever version is currently pinned in `pom.xml`. This caused the skill to report "no updates available" or "only one version published" even when newer versions genuinely existed. Version discovery now uses `anypoint-cli-v4 exchange asset list <artifactId> --output json` filtered to the target `groupId`/`assetId` as the primary lookup — an asset-identity-scoped query with no version-anchoring failure mode, matching the pattern already used by `build-mule-integration/scripts/search_templates.sh` and `manage-global-configurations/scripts/get_latest_connector.sh`. The old `describe`-based lookup is retained only as a degraded fallback when `list` itself fails, with an explicit caveat surfaced to the user that the resulting list may be incomplete.

### Changed

- **`manage-api-version`** — added a bundled `scripts/fetch_versions.sh` helper and rewired the Version Discovery procedure (Steps 5, 6, 7b) to call it once per operation instead of looping and invoking `anypoint-cli-v4` once per API dependency. Each direct CLI invocation pays a full Node cold start plus a network round trip; the new script fires the Exchange lookup for every target API **in parallel** and returns a single JSON array, cutting wall-clock time roughly N-fold on projects with multiple API dependencies. Same pattern already used by `build-mule-integration/scripts/search_templates.sh` and `manage-global-configurations/scripts/get_latest_connector.sh`.

## [1.6.0] - 2026-06-30

### Added

- **`manage-api-version`** — new skill for reading, checking, and updating API spec dependency versions in a Mule project. Reads `<{artifactId}.version>` properties from `pom.xml`, queries Anypoint Exchange for available versions via `anypoint-cli-v4 exchange asset describe`, and applies version changes followed by an automatic `mvn clean package -DskipTests` rescaffold. Supports four paths: display all versions, display specific versions, check all APIs for newer versions, and a full interactive change flow with semver-sorted version selection, pom.xml backup/restore on failure, and batched multi-API updates in a single Maven pass.

## [1.5.0] - 2026-06-25

### Changed
- **`build-mule-integration`** — synced from the agent-evaluation lab to skill v12.2.0 internal tag. Reorders Step 1b options so "I want to generate from scratch without a template." is the first option (default-safe). Adds explicit Steps E5 / L5 continue-or-stop checkpoints at the end of the Exchange and Local sub-flows so the agent always asks the user whether to proceed to connector discovery + flow generation or stop after template setup. Local template format relaxed from `.jar`-only to `.jar` or `.zip` (the underlying `dx:mule:project:create --template-file` CLI accepts both).
- **`build-mule-integration`** — adds an absolute-path / "no relative `../scripts/...`" rule for invoking bundled scripts, plus a "why scripts instead of inline bash" rationale (loss of resolved GAVs across `Bash` tool calls), based on production-run failure analysis.
- **`build-mule-integration`** — Phase 2 step ranges renumbered (Steps 8–17 from 8–18); flow XML generation cross-references corrected (Steps 10/12 instead of 11/13); pre-mvn validation script reference added to the troubleshooting cheatsheet.

## [1.4.0] - 2026-06-23

### Added

- **`generate-connectivity-knowledge`** — new 14-step skill that produces connectivity knowledge for a SaaS API when no dedicated Mule connector exists. Researches the API from user-defined use cases and documentation, generates an OpenAPI 3.0 spec, validates every operation against the live service with auto-fix, and writes a self-contained `connectivity-schema/<apiName>/` folder (`api-reference.md` + `<apiName>.yaml` + `config.properties`). Output feeds the HTTP-fallback branch of `build-mule-integration` so HTTP-Connector flows inherit the same auth, pagination, and entity awareness a dedicated connector would carry.

## [1.3.0] - 2026-06-20

### Added

- **`mulesoft-agent-broker-builder`** — new skill that drives an end-to-end Agent Network V2 (GA, A2A v1.0) build experience: 6-phase guided requirements → asset registration → Agent Script authoring → instruction refinement → topology review, plus optional publish and deploy. CLI-first via the Anypoint CLI Agent Fabric plugin (`agent-network project create/build/publish/deploy/setup-gateways`) with the MuleSoft MCP server as fallback and a graceful no-tool degradation path. Step 0 invokes `agent-network project create` to produce a starter project with the correct `groupId`/`organizationId`, then the skill edits files in place. Bundles a canonical IT Help Investigation example (sourced from the working `stgx-it-investigation-GA-ver` reference) and a gotchas reference covering A2A v1.0 vs v0.3 (`a2a_v03`) backward-compatible card branches, GA echo update events (`a2a:status_update_event` / `a2a:artifact_update_event` with `TASK_STATE_*` enum), compile-error rules for action invocation (A2A bare reference vs `with message =` in executors; MCP `inputs:`/`with`/slot-fill rules), connection authentication (required on `kind: llm`), policies as `{inbound, outbound}` object, subagent-vs-orchestrator decision, CR-18 least-privilege binding, RULE-ASSET-MODE (inline vs Exchange registration), and the full CLI / MCP capability matrix with env-var auth.
- **`mulesoft-agent-broker-v1-to-v2-converter`** — new skill that converts an Agent Network V1 project (`schemaVersion: 1.0.0`) into a V2 project (`agentNetwork: 2.0.0`). Each V1 broker becomes a V2 broker backed by an Agent Script `.agent` file with one orchestrator node — preserves the user's prompt verbatim, does not split into routers/executors/generators. V1 agents land in the `metadata.interfaces.a2a_v03` (back-compat) branch; the broker emits A2A v1.0. Bundles a canonical V1 input (`customer-onboarding-v1`) and matching V2 output, plus a `v2-template.agent` skeleton. For richer multi-node graphs, the skill points users at `mulesoft-agent-broker-builder` as the natural next step.

## [1.2.1] - 2026-06-12

### Changed
- **`build-mule-integration`** — absorbed `create-project-template` as a conditional sub-file (`references/template-project-creation.md`). Template-based project creation (Exchange search, local .jar) is now a branch within Step 1b, loaded only when the user wants a template. `search_templates.sh` moved to `build-mule-integration/scripts/`.
- **`build-mule-integration`** — Step 8 `dx mule project create` example now passes `--skip-environment` for scratch projects to avoid an unnecessary environment-resolution API call.

### Removed
- **`create-project-template`** — removed as standalone skill. Its workflow lives in `build-mule-integration/references/template-project-creation.md`.

## [1.1.1] - 2026-06-09

### Changed

- **`build-mule-integration`** — broader connector-search guidance so private (UUID-groupId) connectors published to a customer's Exchange tenant surface alongside public ones, and the prose now tells the agent to escalate via `AskUserQuestion` when both a public and a private connector match the same system family. Step 3's "Common search terms" table uses broader system names (`salesforce`, `database`, `http`, `netsuite`, `servicenow`, `jms`, `slack`) so private assets whose `assetId` does not share tokens with the public connector still surface.
- **`build-mule-integration`** — Step 16 gains a pre-`mvn` static validator (`scripts/validate_before_build.sh`) that checks the connector error-type allowlist (Cluster D), namespace ↔ `pom.xml` dependency parity (Cluster A2-A5), and canonical XSD URL shape — fast line-numbered diagnostics instead of a 30 s+ Maven failure.
- **`build-mule-integration`** — `scripts/describe_connector.sh` now caches per-connector and per-operation `errorTypes` to `tmp/connector-errors/`, which the new validator reads.
- **`build-mule-integration`** — `scripts/get_latest_connector.sh` ranking/scoring tweaks to keep the broader-term searches stable.

### Added

- **`build-mule-integration`** — `scripts/_suggest_nearest.py`, a fuzzy nearest-match helper invoked by `validate_before_build.sh` to suggest the closest allowed error-type when the user's `namespace:id` miss has no exact match. Reduces time-to-fix on Cluster D validation failures.
- **`build-mule-integration`** — `scripts/.gitattributes` to keep shell script line endings stable across contributor platforms.

## [1.1.0] - 2026-05-18

### Added

- **`develop-pdk-policy`** — new skill that drives the full lifecycle of a custom Flex Gateway policy with the Policy Development Kit (PDK): prerequisite checks, `anypoint-cli-v4 pdk policy-project create`, `make setup` / `build-asset-files` / `build`, local execution via the scaffolded `playground/` (`make run` against a Dockerized Flex Gateway in local-disconnected mode), then `make publish` and `make release` to Anypoint Exchange. Includes an upgrade-PDK runbook and troubleshooting for the most common toolchain failure modes. Lets agents take a developer from "I want a custom policy" through to a released Exchange asset without leaving the IDE.
- **`pdk-templates`** — companion prose-only reference skill bundling 30 vetted, compilable PDK feature templates locally under `templates/`. Pulled from the upstream `mulesoft-mcp-server` `mule-flex-pdk-service` snapshots so the skill works offline with no MCP dependency. Covers JWT (validate + generate), OAuth2 introspection, header/body manipulation, body streaming, rate limiting, spike control, caching, distributed locks, worker variables, control flow, contracts, CORS, IP filtering, JSON/XML validators, outbound HTTP calls, gRPC, DataWeave evaluation, data storage, timers, logging, metadata, policy violations, `stop_iteration`, outbound-policy marker, and PDK unit testing setup. Multi-file bundles (`grpc/`, `dataweave/`, `http_call/`, `stop_iteration/`) ship as subdirectories with explicit destination guidance for each companion file (`Cargo.toml.snippet`, `gcl.yaml`, `build.rs`, `proto/`). Pairs with `develop-pdk-policy`, which owns scaffold/build/publish lifecycle.
- **`pdk-unit`** — new skill that drives the unit-testing workflow for custom Flex Gateway PDK policies: deciding unit vs integration coverage, wiring `src/tests/` (the scaffold ships `tests/` for integration tests but not `src/tests/` for unit tests), writing a first `UnitTestBuilder` test against `crate::configure`, factoring reusable `TestConfig` helpers, mocking HTTP upstreams via closures or `TraceBackend` capture, asserting on status / headers / `PolicyViolation`, and running `make test` / `cargo test`. Bundles six drop-in templates (hello test, config helper, upstream mock, trace-backend capture, violation assertion, `src/tests/` module wiring) under `templates/`. Cross-links to `pdk-templates/templates/unit_testing.md` for the full `pdk-unit` API reference (no duplication) and to `develop-pdk-policy` for scaffold / build / publish lifecycle. Closes the testing gap left by those two skills.
- **`pdk-test`** — new skill that drives the integration-testing workflow for custom Flex Gateway PDK policies: scaffolding `tests/` with `common/` helpers, writing `RequestBuilder` + `assert_response!` tests against a real Flex Gateway instance via `make run`, handling multi-request flows, testing configuration variants, and debugging test failures with `RUST_LOG` and Docker log inspection. Bundles templates for test structure and common patterns.

### Changed

- `package.json` `files` array now includes `*/templates/**` (added alongside `*/references/**`) so the bundled PDK templates ship in the published tarball.

## [1.0.4] - 2026-05-18

### Removed

- **`build-mule-integration`** — dropped the `mule-http-connector:1.11.2` → `1.11.1` pin in `scripts/get_latest_connector.sh`. The 1.11.2 POM has been republished on Exchange with the correct `<parent>` and `<dependencies>`, so the workaround is no longer needed and `get_latest_connector.sh` now passes through whatever Exchange returns.

## [1.0.3] - 2026-05-14

### Changed

- **`build-mule-integration`** — synced with the upstream agent-evaluation lab (v12 of the skill).
  - Surfaces private (UUID-groupId) connectors published to a customer's Exchange tenant as first-class candidates alongside public connectors. The `get_latest_connector.sh` ranking already returned these rows; the prose now tells the agent to treat them as real options instead of noise, and to escalate via `AskUserQuestion` when both a public and a private connector match the same system family.
  - Step 3 "Common search terms" table rewritten with broader system names (`salesforce`, `database`, `http`, `netsuite`, `servicenow`, `jms`, `slack`) instead of narrow `mule-<name>-connector` strings, so private assets whose `assetId` does not share tokens with the public connector still surface.
  - New "Term breadth" guidance under the mandatory-search rule, plus updates to "No HTTP fallback without evidence" explaining UUID-format groupIds.
  - Step 16 gains a pre-`mvn` static validator (`scripts/validate_before_build.sh`) that checks the connector error-type whitelist (Cluster D), namespace ↔ `pom.xml` dependency parity (Cluster A2-A5), and canonical XSD URL shape — fast line-numbered diagnostics instead of a 30 s+ Maven failure.
  - `scripts/describe_connector.sh` now caches per-connector and per-operation `errorTypes` to `tmp/connector-errors/`, which the new validator reads.
  - `scripts/get_latest_connector.sh` ranking/scoring tweaks to keep the broader-term searches stable.

### Fixed

- `package-lock.json` was pinned to `1.0.1` while `package.json` had moved to `1.0.2`; the lock file is now regenerated and consistent with the current package version.

## [1.0.2] - 2026-05-14

### Fixed

- Corrected the spelling of `@salesforce/mulesoft-vibes-skills` in package metadata.

## [1.0.1] - 2026-05-12

### Added

- `repository` field added to `package.json` so the published npm package links back to this repo.

### Fixed

- `release-skills` workflow and an earlier package-name typo.

## [1.0.0] - 2026-05-08

### Added

- Initial public release of `@salesforce/mulesoft-vibes-skills` with the following skills:
  - `build-mule-integration`
  - `create-project-template`
  - `create-mule-run-config` / `update-mule-run-config` / `delete-mule-run-config` / `execute-mule-run-config`
  - `generate-doc-description`
  - `run-system-diagnostics`
  - `secure-mule-app`
- npm publish workflow under `.github/workflows/release-skills.yml`.
