// Asserting on what the policy SENT upstream, not just what came back.
//
// Drop into `src/tests/trace.rs`. `TraceBackend` wraps any `Backend` (a
// closure, a struct impl, etc.) and records every request that hits it.
// After the test request flows, drain the recording with `.next()` and
// assert on headers, body, path, etc.
//
// Use this when:
//   - Your policy injects auth headers (e.g. `Bearer ...`, `x-internal-...`)
//     and you want to prove they reached upstream.
//   - Your policy strips or rewrites headers/paths — you want to confirm
//     what made it through.
//   - Your policy makes outbound calls and you want to assert on the
//     request shape (body, query string, method).

use pdk_unit::{
    TraceBackend, UnitHttpMessage, UnitHttpRequest, UnitHttpResponse, UnitTestBuilder,
};
use std::rc::Rc;
use std::time::Duration;

const INIT_SLEEP: Duration = Duration::from_millis(10);

// The "real" backend behaviour — what the upstream would do.
fn ok_backend(_request: UnitHttpRequest) -> UnitHttpResponse {
    UnitHttpResponse::new(200).with_body(b"ok".to_vec())
}

#[test]
fn passthrough_captures_request_headers() {
    // Wrap in TraceBackend so every call is recorded. `Rc` so the test can
    // both pass it to the builder AND inspect it after.
    let captured: Rc<TraceBackend<fn(UnitHttpRequest) -> UnitHttpResponse>> =
        Rc::new(TraceBackend::new(ok_backend));

    let mut tester = UnitTestBuilder::default()
        .with_backend(Rc::clone(&captured))
        // Replace this with whatever JSON satisfies your `definition/gcl.yaml`
        // required properties. The default scaffold requires `stringProperty`.
        .with_config(r#"{"stringProperty": "default"}"#)
        .with_entrypoint(crate::configure);
    tester.sleep(INIT_SLEEP);

    let response = tester.request(
        UnitHttpRequest::get()
            .with_path("/api/foo")
            .with_header("Token", "client-token-value"),
    );
    assert_eq!(response.status_code(), 200);

    // Pull the request the upstream actually saw.
    let upstream_request = captured.next().expect("upstream received request");

    // Header lookup is case-insensitive (names are normalized to lowercase).
    // `header()` returns `Option<&str>`.
    assert_eq!(upstream_request.header("token"), Some("client-token-value"));
}
