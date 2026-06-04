// Minimal pdk-unit smoke test: build a tester, send a GET, assert 200.
//
// Drop into `src/tests/hello.rs`. The default scaffold's `request_filter`
// logs a header and lets the request flow through — the upstream backend
// returns 200 OK with body `b"ok"`.
//
// **Config gotcha**: pass a JSON object that satisfies every required
// field declared in `definition/gcl.yaml`. The default scaffold declares
// `stringProperty` as required, so `"{}"` fails configuration parsing
// and the policy answers 503. Replace the value below with whatever your
// `gcl.yaml` requires.
//
// Run with:
//   cargo test hello_world -- --nocapture
// or:
//   make test

use pdk_unit::{UnitHttpMessage, UnitHttpRequest, UnitHttpResponse, UnitTestBuilder};

// Default upstream — answers every passthrough request with 200 OK.
fn ok_backend(_request: UnitHttpRequest) -> UnitHttpResponse {
    UnitHttpResponse::new(200).with_body(b"ok".to_vec())
}

#[test]
fn hello_world() {
    let mut tester = UnitTestBuilder::default()
        .with_backend(ok_backend)
        .with_config(r#"{"stringProperty": "default"}"#)
        .with_entrypoint(crate::configure);

    let response = tester.request(UnitHttpRequest::get().with_path("/"));

    assert_eq!(response.status_code(), 200);
    assert_eq!(response.body(), b"ok");
}
