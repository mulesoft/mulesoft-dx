---
name: create-flex-gateway-custom-policy
description: |
  Scaffold and implement a custom Flex Gateway policy in Rust using the MuleSoft
  Policy Development Kit (PDK). Use when the user wants to create a new custom
  policy, extend Flex Gateway with custom logic, build a WASM-based policy from
  the official template, or run unit and integration tests for a PDK policy.
---

# Create a Flex Gateway Custom Policy with PDK

## Overview

Walks through creating a custom [MuleSoft Flex Gateway](https://docs.mulesoft.com/gateway/) policy with the [Policy Development Kit (PDK)](https://docs.mulesoft.com/pdk/latest/): scaffolding the project from the official template, understanding its structure, implementing filter logic in Rust, and validating it with unit and integration tests. The policy compiles to WebAssembly (`wasm32-wasip1`) and runs as a [proxy-wasm](https://github.com/proxy-wasm/spec) filter inside Flex Gateway.

This workflow defers to two MCP tools when available:

- `manage_flex_gateway_policy_project` — canonical lifecycle commands (create, build, publish).
- `get_flex_gateway_policy_example` — feature-specific Rust/GCL snippets (header manipulation, JWT, rate limiting, etc.).

If those tools are not registered in the user's environment, the equivalent CLI / `make` commands shown below produce the same result.

**What you'll build:** A PDK policy project compiled to a `.wasm` artifact, with passing unit tests (`cargo test`) and passing integration tests (`make test`).

**Out of scope:** Publishing to Exchange and deploying to a Flex Gateway instance. Once tests pass, follow the publish/release commands returned by `manage_flex_gateway_policy_project` (or the [PDK publish docs](https://docs.mulesoft.com/pdk/latest/policies-pdk-publish-policies)).

## Prerequisites

Before starting this workflow, ensure you have:

1. **Tooling installed**
   - Rust 1.88.0+ ([rustup](https://sh.rustup.rs))
   - WASI target: `rustup target add wasm32-wasip1`
   - cargo-generate 0.22.0: `cargo install --locked cargo-generate@0.22.0`
   - [anypoint-cli-v4](https://docs.mulesoft.com/anypoint-cli/4.x/) 1.4.4+
   - PDK plugin: `anypoint-cli-v4 plugins:install anypoint-pdk-plugin`
   - `make`
   - Docker daemon running (required for integration tests)

2. **Anypoint Platform access**
   - An account with a Connected App that has these scopes: **View Organization**, **View Environment**, **Exchange Contributor**.
   - Client ID and Client Secret available locally.

3. **Reference docs**
   - Full prerequisites checklist: [PDK Prerequisites](https://docs.mulesoft.com/pdk/latest/policies-pdk-prerequisites)

## Step 1: Scaffold the Project

Generate a new policy project from the official template ([mulesoft/microgateway-custom-policy-template](https://github.com/mulesoft/microgateway-custom-policy-template)). The Anypoint CLI PDK plugin wraps `cargo-generate` and pre-fills the Anypoint metadata.

**What you'll need:**
- A policy name in kebab-case (e.g. `header-injection-policy`).
- Anypoint organization ID and (for development versions) Connected App credentials.

**Action:** If the `manage_flex_gateway_policy_project` MCP tool is available, call it with no parameters and run the **Create** command it returns. Otherwise run the canonical command directly.

```bash
anypoint-cli-v4 pdk policy-project create --name <policy-name>
cd <policy-name>
make setup
```

**What happens next:** A new directory `<policy-name>/` contains a working policy skeleton. `make setup` installs the supporting build tooling (`cargo-anypoint`, `cargo-llvm-cov`).

**Tips:**
- If `CARGO_TARGET_DIR` is set in your shell, unset it before running `make`: `unset CARGO_TARGET_DIR`.
- The plugin may prompt for organization metadata; have your Connected App credentials ready.

## Step 2: Understand the Project Structure

Open the scaffolded project and locate the four files you will edit. Everything else is generated or boilerplate.

**What you'll need:**
- The scaffolded project from Step 1.

**Action:** Inspect these files to orient yourself:

```
.
├── definition/gcl.yaml          # Policy schema (configurable properties)
├── src/
│   ├── lib.rs                   # Filter logic — request_filter / response_filter
│   └── generated/config.rs      # AUTO-GENERATED from gcl.yaml — do NOT edit by hand
├── tests/
│   ├── requests.rs              # Integration tests (Docker-backed)
│   ├── common/mod.rs
│   └── config/registration.yaml # Required Flex Gateway registration
├── Cargo.toml
└── Makefile
```

**What happens next:** You will edit `definition/gcl.yaml` to declare configurable properties, edit `src/lib.rs` to implement filter logic, and edit `tests/requests.rs` to add integration tests. The full layout is documented at [PDK Create Project](https://docs.mulesoft.com/pdk/latest/policies-pdk-create-project).

**Important:** After every change to `definition/gcl.yaml`, run `make build-asset-files` to regenerate `src/generated/config.rs`. Do not edit `config.rs` by hand — it will be overwritten.

## Step 3: Implement the Policy

Write the filter logic in `src/lib.rs` and declare its configuration schema in `definition/gcl.yaml`. Reuse a working starter snippet for the feature you need rather than writing from scratch.

**What you'll need:**
- A clear description of what the policy should do (e.g. "inject header `x-tenant`", "validate JWT", "limit to N requests per minute").

**Action:** If the `get_flex_gateway_policy_example` MCP tool is available, call it once per feature you need:

```
get_flex_gateway_policy_example feature=<feature>
```

Valid `feature` values include: `authentication`, `body_manipulation`, `body_stream`, `cache`, `contracts`, `control_flow`, `cors`, `data_storage`, `dataweave`, `grpc`, `header_manipulation`, `http_call`, `ip_filter`, `json_validator`, `jwt`, `jwt_generate`, `lock`, `logger`, `metadata`, `oauth2_token_introspection`, `outbound`, `policy_violation`, `rate_limiting`, `request_data`, `spike_control`, `stop_iteration`, `timer`, `unit_testing`, `worker_variable`, `xml_validator`.

For multi-feature policies, call once per feature and compose the snippets in `src/lib.rs`.

If the MCP tool is not available, browse the public examples repository: [mulesoft/pdk-custom-policy-examples](https://github.com/mulesoft/pdk-custom-policy-examples).

**What happens next:** You have a `src/lib.rs` with a `request_filter` and/or `response_filter`, plus a `definition/gcl.yaml` that exposes any configurable knobs. Run `make build-asset-files` to refresh the generated config struct, then `make build` to verify it compiles to WASM.

**Important — forbidden features:** Do not enable any of the following. They are experimental or low-level, may break without notice between releases, and are not part of the PDK public contract:

- `experimental_*` (any feature with this prefix)
- `ll`
- `script_stream`
- `enable_stop_iteration`
- `experimental_metrics`
- `experimental_datastorage_formats`
- `experimental_disable_body_limit_check`

If a use case seems to require one of these, raise it with the PDK team before adding it to your policy.

**Common issues:**
- **State machine errors:** `into_headers_state()` consumes `RequestState`; `into_body_stream_state()` consumes `HeadersState`. Read everything you need from the previous state before transitioning.
- **WASM build fails on `Arc` / `Mutex` / `block_on`:** proxy-wasm is single-threaded inside the policy runtime. Avoid cross-thread synchronization, blocking I/O, and full async runtimes (Tokio multi-thread). Use the async model PDK exposes.
- **`unsafe` or nightly Rust:** forbidden in policy code; the toolchain is stable-only.

## Step 4: Run Unit Tests

Add unit tests inside a `#[cfg(test)]` module **at the end of the same file** that contains the logic under test (typically `src/lib.rs`). The `pdk-unit` framework stubs proxy-wasm so tests run in-process without Envoy or Docker.

**What you'll need:**
- A built project (`make build-asset-files` has been run since the last `gcl.yaml` change).

**Action:** Pull a starter unit test via `get_flex_gateway_policy_example feature=unit_testing`, adapt it to your policy, then run:

```bash
make build-asset-files
cargo test
```

A minimal test looks like:

```rust
#[cfg(test)]
mod test {
    use pdk_unit::{UnitTestBuilder, UnitHttpRequest, UnitHttpResponse};
    use serde_json::json;

    #[test]
    fn adds_custom_header() {
        let mut tester = UnitTestBuilder::default()
            .with_backend(UnitHttpResponse::new(200))
            .with_config(json!({"stringProperty": "custom"}).to_string())
            .with_entrypoint(super::configure);

        let response = tester.request_full(UnitHttpRequest::get());
        assert_eq!(response.status_code(), 200);
    }
}
```

**What happens next:** All tests should pass. For mocking upstreams, identity providers, contracts/SLAs, gRPC backends, and DataWeave expressions, request the `unit_testing` example from the MCP tool — it includes those advanced patterns.

**Tips:**
- If `configure` accepts a `Clock` parameter, call `tester.sleep(...)` after `with_entrypoint(...)` so async initialization completes before the first request.
- New builder-style APIs use `.property_name()` setters, not `.with_property_name()` (the legacy `with_*` setters in `pdk-unit` are an exception kept for backwards compatibility).

## Step 5: Run Integration Tests

Integration tests in `tests/requests.rs` spin up a real Flex Gateway and a backend container via Docker. They validate the policy end-to-end against a running gateway.

**What you'll need:**
- Docker daemon running.
- `tests/config/registration.yaml` populated. Generate it by registering Flex Gateway in [Local Mode](https://docs.mulesoft.com/gateway/latest/flex-local-reg-run).

**Action:**

```bash
make test
```

**What happens next:** Each test starts containers, sends requests through the gateway, and asserts on the response. Tests are slow because of container startup — use unique `hostname` values per test to avoid collisions and keep the test count reasonable.

**Common issues:**
- **`registration.yaml` missing:** Without it, Flex Gateway will not start in Local Mode. Re-register and copy the file into `tests/config/`.
- **Docker daemon not running:** start Docker Desktop or `dockerd`, then re-run `make test`.
- **Path / query string mismatches:** URL paths and query strings are percent-encoded. Decode with `percent_encoding::percent_decode_str` before pattern matching.

## Completion Checklist

After completing all steps, verify the policy is ready for publication:

- [ ] `make build-asset-files` runs cleanly after every `gcl.yaml` change
- [ ] `make build` succeeds and produces `.wasm` under `target/wasm32-wasip1/release/`
- [ ] `cargo test` passes
- [ ] `make test` passes
- [ ] No `experimental_*`, `ll`, `script_stream`, or `enable_stop_iteration` features enabled
- [ ] No `unsafe` blocks in policy code
- [ ] Every source file starts with a copyright header

## What You've Built

✅ **Custom Flex Gateway Policy** — A WebAssembly policy compiled from Rust, validated by unit and integration tests, ready to publish to Exchange and apply to API instances.

## Next Steps

1. **Publish the policy** — Use the publish/release commands returned by `manage_flex_gateway_policy_project` (or follow [PDK Publish Policies](https://docs.mulesoft.com/pdk/latest/policies-pdk-publish-policies)) to upload a development or release version to Exchange.

2. **Apply the policy to an API** — Follow the **apply-policy-to-api-instance** skill to enforce your custom policy on a managed API.

3. **Layer additional policies** — Combine your custom policy with built-in templates (rate limiting, OAuth2). The **protect-api-with-policies** skill walks through the catalog.

4. **Iterate on coverage** — Run `make test-coverage` (`FORMAT=json|html` optional) to identify untested branches in your filter logic.

## Troubleshooting

### Build fails after editing `gcl.yaml`

**Symptoms:** `cargo build` errors complaining about missing fields in `Config`.

**Possible cause:** `src/generated/config.rs` is out of date.

**Solution:** Run `make build-asset-files` to regenerate it from `definition/gcl.yaml`.

### Integration test fails with "Anypoint registration"

**Symptoms:** `make test` errors before any test logic runs.

**Possible causes:**
- `tests/config/registration.yaml` is missing or stale.
- The same file is also required at `playground/config/registration.yaml` for `make run`.

**Solution:** Re-register Flex Gateway in Local Mode, copy the new `registration.yaml` into both locations.

### Policy panics at runtime under Flex Gateway but unit tests pass

**Symptoms:** Local `cargo test` is green, but the policy crashes when loaded by Flex Gateway.

**Possible causes:**
- Code uses `Arc`, `Mutex`, `RwLock`, `block_on`, or a multi-thread async runtime — invalid under proxy-wasm.
- Standard network or filesystem crates (e.g. `reqwest`, `tokio::fs`) — not supported under `wasm32-wasip1`.
- An `.unwrap()` is panicking on production input.

**Solutions:**
- Replace cross-thread primitives with `thread_local!` for process-wide state.
- Replace standard I/O crates with PDK-provided APIs (`HttpClient`, etc.).
- Audit `.unwrap()` calls; production code should propagate errors instead.

## Related Jobs

- **apply-policy-to-api-instance** — Apply the published policy to an API Manager instance.
- **protect-api-with-policies** — Layer multiple policies (custom + built-in) on a managed API.
- **protect-mcp-server-with-policies** — Apply the same flow to an MCP server fronted by Flex Gateway.
