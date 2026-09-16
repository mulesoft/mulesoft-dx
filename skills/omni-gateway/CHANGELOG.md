# Changelog

All notable changes to the `omni-gateway` skill bundle are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Directory layout follows the [agentskills.io](https://agentskills.io/specification) convention.** `omni-gateway-benchmark` static resources moved from ad-hoc top-level dirs (`terraform/`, `charts/`, `docker/`, `k8s/`, `config/`) into `assets/`, and the design doc moved to `references/ARCHITECTURE.md`. All Makefile targets and scripts updated to the new paths.
- **Removed `package.json`.** The bundle is no longer packaged/published via npm; it is consumed directly as an agentskills skill directory.
- **Removed the root `omni-gateway/SKILL.md` router.** `omni-gateway/` is now a plain container of independent skills rather than a routing skill. Skill discovery (which descends one level only when a directory has no direct `SKILL.md`) now indexes the six sub-skills individually instead of masking them behind the router. The root `skills-metadata.yaml` (`type: prose`) is retained as the parent-level default for all sub-skills.
- **`omni-gateway-install` split per platform.** The platform walkthroughs moved into `references/linux.md`, `references/docker.md`, and `references/kubernetes.md`; `SKILL.md` is now a router that loads the matching reference on demand, bringing it under the 500-line progressive-disclosure budget. Shared sections (platform choice, Runtime Manager verification, troubleshooting) stay in `SKILL.md`.
- **Renamed all six sub-skills to an `omni-gateway-<verb>` prefix** so they read and sort as one bundle in skill listings (the cards previously showed only "gateway", obscuring the grouping). Mapping: `install-omni-gateway` → `omni-gateway-install`, `run-gateway-benchmark` → `omni-gateway-benchmark`, `inspect-gateway-logs` → `omni-gateway-logs`, `validate-gateway-config` → `omni-gateway-config`, `analyze-gateway-dump` → `omni-gateway-dump`, `diagnose-gateway-error` → `omni-gateway-diagnose`. Directory names, frontmatter `name`, eval `skill` fields, and all cross-references updated together.

### Added

- **`omni-gateway-benchmark`: Available Scripts index.** New section in `SKILL.md` mapping every `scripts/*.sh` to its driving `make` target and one-line purpose.
- **`omni-gateway-benchmark`: `--help` on every script.** All harness scripts now accept `-h` / `--help` and print usage (arguments + the `.env` variables they read) without side effects.
- **Per-skill `evals/` scaffolds.** Each sub-skill now has its own `evals/evals.json` + methodology `README.md` covering activation and behavior. `omni-gateway-install` also carries the negative-trigger cases (Mule/DataWeave, CloudHub 2.0 managed), and `omni-gateway-benchmark` carries safety anti-assertions for the destructive operations (`make up` / `make down`).

## [0.1.1] - 2026-06-16

### Added

- **`run-gateway-benchmark`** — Execute Flex Gateway performance benchmarks on Amazon EKS using the harness under `run-gateway-benchmark/`. Covers full lifecycle: prerequisites, registration, image push, infra provisioning (`make up`), Flex/upstream deploy, k6 load run, Grafana PNG export, Markdown report retrieval, and teardown. Includes safety guardrails for destructive AWS operations and a scenario cookbook for common parameter combinations.
- **`run-gateway-benchmark`: `make preflight`** — New Makefile target backed by `scripts/preflight.sh`. Read-only checklist that verifies CLIs (`terraform`, `kubectl`, `helm`, `aws`, `docker buildx`, `flexctl`, `jq`, `python3`, `envsubst`, `sha256sum`, `shellcheck`), Docker engine version + daemon liveness (`docker info`), AWS identity/region/profile, `.env`, `.run/registration/registration.yaml`, policy credentials when `client-id-enforcement` is enabled, and `flex-packages` connectivity. Exits non-zero on any gap and prints the remediation command per missing item.
- **`run-gateway-benchmark`: `make prepare-registration`** — New Makefile target backed by `scripts/prepare-registration.sh`. Generates the local-mode `.run/registration/registration.yaml` via `flexctl registration create --connected=false`, and when `POLICIES` includes `client-id-enforcement`, interactively prompts for `CLIENT_ID` / `CLIENT_SECRET` (or accepts them via env vars for non-interactive use) and writes them into `.env`. Idempotent: skips regeneration / overwriting unless `FORCE=1`, with a `.bak` backup when forcing.

## [0.1.0] - 2026-06-11

Initial release.

### Added

- **`install-omni-gateway`** — Install and register Omni Gateway on Linux (Ubuntu/Debian via APT), Docker, or Kubernetes (Helm). Includes parameter gathering, `flexctl registration create` commands per platform, artifact verification, Anypoint Runtime Manager confirmation, and a consolidated troubleshooting table.
- **`inspect-gateway-logs`** — Parse and interpret gateway log output.
- **`validate-gateway-config`** — Validate `conf.d/` YAML configuration files for all resource kinds (ApiInstance, PolicyBinding, Service, Configuration, Extension, Secret, Contract), with cross-reference checks and a structured validation report.
- **`analyze-gateway-dump`** — Interpret diagnostic dump ZIP files.
- **`diagnose-gateway-error`** — Symptom triage router with escalation guidance.
