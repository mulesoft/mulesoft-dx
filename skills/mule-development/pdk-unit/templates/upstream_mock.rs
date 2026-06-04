// Mocking an outbound HTTP upstream — when your policy calls
// `client.request(&config.service)` to talk to an external service.
//
// Drop into `src/tests/upstream.rs`. Pairs with the `service` property in
// `definition/gcl.yaml` (see `pdk-templates/templates/http_call/`).
//
// Two upstreams in play here:
//   1. The default "passthrough" backend (`with_backend`) — what the policy
//      proxies the original request to.
//   2. The named outbound upstream (`with_http_upstream_from_authority`) —
//      what the policy hits directly via `client.request(...)`.
//
// The authority string MUST match exactly what the policy passes to
// `client.request(...)` — including port. A mismatch yields "no upstream
// registered" errors at runtime, not at compile time.

use pdk_unit::{UnitHttpRequest, UnitHttpResponse, UnitTestBuilder};
use std::time::Duration;

const INIT_SLEEP: Duration = Duration::from_millis(10);

// Authority string — must match what the policy code resolves
// `&config.service` to at runtime. If unsure, log it once from inside the
// policy: `info!("calling {:?}", &config.service);`
const UPSTREAM_AUTHORITY: &str = "users-api:8080";

// The default passthrough backend (status 200, body "ok").
fn passthrough_backend(_request: UnitHttpRequest) -> UnitHttpResponse {
    UnitHttpResponse::new(200).with_body(b"ok".to_vec())
}

// The mocked outbound upstream. In a real test, branch on request body,
// method, or headers and return what the policy expects.
fn users_api_backend(_request: UnitHttpRequest) -> UnitHttpResponse {
    UnitHttpResponse::new(200)
        .with_header("content-type", "application/json")
        .with_body(br#"{"id":"42","name":"Alice"}"#.to_vec())
}

#[test]
fn upstream_returns_user_data() {
    let mut tester = UnitTestBuilder::default()
        .with_backend(passthrough_backend)
        .with_http_upstream_from_authority(UPSTREAM_AUTHORITY, users_api_backend)
        // Replace this with whatever JSON satisfies your `definition/gcl.yaml`
        // required properties. The default scaffold requires `stringProperty`.
        .with_config(r#"{"stringProperty": "default"}"#)
        .with_entrypoint(crate::configure);
    tester.sleep(INIT_SLEEP);

    let response = tester.request(UnitHttpRequest::get().with_path("/api/whoami/42"));

    assert_eq!(response.status_code(), 200);
}
