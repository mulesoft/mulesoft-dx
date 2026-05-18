# Changelog

All notable changes to `@salesforce/mulesoft-vibes-skills` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
