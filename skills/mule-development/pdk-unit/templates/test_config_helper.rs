// Reusable config-and-tester builder for unit tests, distilled from
// `microgateway-policies/oauth2_token_introspection/src/tests/common.rs`.
//
// The point: avoid hardcoded JSON config strings duplicated across many
// `#[test]` functions. Centralise the base config and the tester wiring
// here, then each test file calls `tester(TestConfig::base())` or a
// variation builder method.
//
// Drop into `src/tests/common.rs`. Adapt the property names in
// `TestConfig::build()` to whatever your `definition/gcl.yaml` declares.

use pdk_unit::{Backend, UnitHttpRequest, UnitHttpResponse, UnitTest, UnitTestBuilder};
use serde_json::json;
use std::time::Duration;

// Many policies await a 1ms timer in `configure` before mounting the filter.
// Without this sleep after `with_entrypoint`, the first request races filter
// setup and fails non-deterministically. Keep at 10ms — long enough to be
// reliable, short enough that a 100-test suite stays under a second.
pub const INIT_SLEEP: Duration = Duration::from_millis(10);

// Default upstream — answers every passthrough request with 200 OK.
pub fn ok_backend(_request: UnitHttpRequest) -> UnitHttpResponse {
    UnitHttpResponse::new(200).with_body(b"ok".to_vec())
}

// Reusable JSON config builder. Add `with_<aspect>()` methods as your tests
// need them — keep the JSON keys in sync with `definition/gcl.yaml`.
pub struct TestConfig;

impl TestConfig {
    fn build(extras: serde_json::Value) -> String {
        // Replace these defaults with whatever your policy treats as "no
        // overrides" — the values that 80% of your tests want.
        let mut c = json!({
            "stringProperty": "default-value",
        });
        if let Some(obj) = extras.as_object() {
            for (k, v) in obj {
                c[k] = v.clone();
            }
        }
        c.to_string()
    }

    pub fn base() -> String {
        Self::build(json!({}))
    }

    pub fn with_string_property(value: &str) -> String {
        Self::build(json!({ "stringProperty": value }))
    }
}

// Standard tester wiring: default backend + config + entrypoint + INIT_SLEEP.
// Most test bodies should be a one-line call here followed by `request(...)`.
pub fn tester(config: String) -> UnitTest {
    let mut t = UnitTestBuilder::default()
        .with_backend(ok_backend)
        .with_config(config)
        .with_entrypoint(crate::configure);
    t.sleep(INIT_SLEEP);
    t
}

// Variant: tester with a custom upstream backend (closures, structs
// implementing Backend, TraceBackend, etc).
pub fn tester_with_backend(config: String, backend: impl Backend + 'static) -> UnitTest {
    let mut t = UnitTestBuilder::default()
        .with_backend(backend)
        .with_config(config)
        .with_entrypoint(crate::configure);
    t.sleep(INIT_SLEEP);
    t
}
