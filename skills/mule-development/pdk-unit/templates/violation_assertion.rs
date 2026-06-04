// Asserting that the policy generated a `PolicyViolation` — the canonical
// way to express "this request was rejected" in PDK policies.
//
// Drop into `src/tests/violation.rs`. Adapt the assertion target to a
// policy that actually emits violations (rate-limiting, JWT, OAuth2, etc).
// The default scaffold's `request_filter` does not — so this template
// shows the pattern, but expect the assertion to fail until you wire the
// violation emission into your policy code.
//
// `response.violation()` returns `Option<PolicyViolation>`:
//   - `Some(v)` when the filter called the violation API to reject.
//   - `None` for normal pass-through (status 200) or for plain error
//     responses (e.g. a `Flow::Break(Response::new(429))` without
//     accompanying violation metadata).
//
// The assertion helper below mirrors the pattern from
// `microgateway-policies/oauth2_token_introspection/src/tests/common.rs`.

use pdk::policy_violation::PolicyViolationType;
use pdk_unit::{UnitHttpMessage, UnitHttpRequest, UnitHttpResponse, UnitTestBuilder};
use std::time::Duration;

const INIT_SLEEP: Duration = Duration::from_millis(10);

fn ok_backend(_request: UnitHttpRequest) -> UnitHttpResponse {
    UnitHttpResponse::new(200).with_body(b"ok".to_vec())
}

// Reusable assertion: every policy that rejects a request should emit a
// violation matching the policy's identifier and a `Violation` type. The
// `expected_policy_name` is whatever the scaffold sets via
// `metadata/labels/title` in `definition/gcl.yaml` — print it once with
// `cargo test -- --nocapture` to confirm the value before pinning it.
pub fn assert_violation_generated(
    response: &UnitHttpResponse,
    expected_policy_name: &str,
) {
    let violation = response
        .violation()
        .expect("policy must have generated a violation for rejected requests");
    assert_eq!(violation.get_policy_name(), expected_policy_name);
    assert_eq!(
        violation.get_policy_violation(),
        PolicyViolationType::Violation,
    );
}

// Adapt this test to a request shape that actually triggers your policy's
// rejection path. For example, for rate-limiting: send N+1 requests
// quickly. For JWT: send a request with no Authorization header.
#[test]
fn rejected_request_emits_violation() {
    let mut tester = UnitTestBuilder::default()
        .with_backend(ok_backend)
        .with_config(r#"{"stringProperty": "default"}"#)
        .with_entrypoint(crate::configure);
    tester.sleep(INIT_SLEEP);

    let response = tester.request(
        UnitHttpRequest::get()
            .with_path("/protected"),
    );

    // Once the policy is wired to emit violations, replace the policy name
    // with whatever `metadata.labels.title` declares in `definition/gcl.yaml`.
    assert_eq!(response.status_code(), 401);
    assert_violation_generated(&response, "your-policy-id");
}
