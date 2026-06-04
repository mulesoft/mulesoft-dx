# Changelog

All notable changes to `@salesforce/mulesoft-vibes-skills` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
