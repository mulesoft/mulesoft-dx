## Setup

Add to `Cargo.toml` under `[dev-dependencies]`:

```toml
pdk-unit = { path = "../../pdk-unit" }
# For policies using into_headers_body_state / into_body_state + outgoing calls:
# pdk-unit = { path = "../../pdk-unit", features = ["enable_stop_iteration"] }
```

The matching `pdk` feature must also be enabled when using `enable_stop_iteration`.

---

## Writing a Test

Build a `UnitTest` with `UnitTestBuilder`, send requests, and assert on the response.

```rust
use pdk_unit::{UnitTestBuilder, UnitHttpRequest, UnitHttpMessage};

#[test]
fn test_my_policy() {
    let mut tester = UnitTestBuilder::default()
        .with_config(r#"{"mode": "MY_MODE"}"#)
        .with_entrypoint(crate::configure);  // runs on_configure immediately

    let response = tester.request(
        UnitHttpRequest::get()
            .with_path("/api/resource")
            .with_header("authorization", "Bearer token")
    );

    assert_eq!(response.status_code(), 200);
    assert_eq!(response.header("x-added-by-policy"), Some("yes"));
}
```

---

## UnitTestBuilder — Configuration

Chain these before calling `with_entrypoint` (which consumes the builder):

| Method | Purpose |
|--------|---------|
| `with_config(json_str)` | Policy configuration JSON. Defaults to `"{}"`. |
| `with_backend(impl Backend)` | Default HTTP upstream (what the policy calls through to). Accepts a closure, `UnitHttpResponse`, or `TraceBackend`. |
| `with_http_upstream_from_authority("host", backend)` | Register a named HTTP upstream by authority string, e.g. `"api.example.com"`. |
| `with_http_upstream("svc-name", backend)` | Same, using the raw internal service name. |
| `with_grpc_upstream_from_authority("host", backend)` | Register a named gRPC upstream by authority. |
| `with_grpc_upstream("svc-name", backend)` | Same, using the raw internal service name. |
| `metadata(\|meta\| ...)` | Mutate the `Metadata` struct (API name, SLAs, org IDs, etc.) before building. Call this **before** `with_*_upstream_from_authority`. |

---

## UnitTest — Sending Requests and Controlling Time

```rust
// Blocking: waits for the full response (calls tick() internally as needed)
let response = tester.request(UnitHttpRequest::post().with_body("data"));

// Non-blocking: poll manually when you need to interleave ticks
let mut handle = tester.request_partial(UnitHttpRequest::get());
let response = loop {
    if let Poll::Ready(r) = handle.poll() { break r; }
    tester.tick();
};
```

| Method | Purpose |
|--------|---------|
| `request(req)` | Send and block until response is ready. |
| `request_partial(req) -> UnitTestRequest` | Send and return a pollable handle; call `.poll()` to advance. |
| `tick()` | Fire one `on_tick` and process pending calls/requests. |
| `sleep(Duration)` | Advance simulated time, firing ticks until the duration is covered. Use this to let `clock.period(...)` callbacks run (e.g., contract updates). |
| `restart()` | Simulate a gateway restart — clears contexts, keeps upstreams, re-runs `on_configure`. |
| `set_chunk_size(n)` | Body chunk size in bytes (default: 3). Tune for streaming filter tests. |
| `add_contract_data(id, name, secret, sla_id)` | Register a simulated Anypoint contract for client-ID / rate-limit tests. |
| `remove_contract_data(id)` | Mark a previously registered contract as removed (simulates contract revocation). |
| `add_ldap_data(config, user, pass)` | Register a valid LDAP credential pair (see [LDAP section](#ldap)). |
| `set_host_mode(StopIterationMode)` | *(enable_stop_iteration only)* Set stop-iteration scheduling order. |

---

## HTTP Messages

### Building requests

`UnitHttpRequest` has method constructors: `::get()`, `::post()`, `::put()`, `::patch()`, `::delete()`, `::head()`, `::options()`, `::custom("METHOD")`.

Chain builder methods on both `UnitHttpRequest` and `UnitHttpResponse`:

| Method | Effect |
|--------|--------|
| `with_path(path)` | Sets `:path` pseudo-header *(request only)*. |
| `with_header(key, val)` | Adds a header. |
| `with_body(bytes)` | Sets the body. |
| `with_property(vec!["key", "path"], value)` | Sets an Envoy property. |
| `with_properties(map)` | Replaces all properties at once. |
| `with_authentication_data(data)` | Attaches `AuthenticationData`. |
| `with_policy_violation(violation)` | Attaches a `PolicyViolation`. |

`UnitHttpResponse::new(status_code)` creates a response; it also has `.status_code() -> u32`.

### Reading messages — `UnitHttpMessage` trait

Both request and response implement this trait. **Header names are always normalized to lowercase** — lookups via `header(name)` are case-insensitive and stored headers are always returned in lowercase.

| Method | Returns |
|--------|---------|
| `header(name)` | `Option<&str>` |
| `headers()` | `&Vec<(String, String)>` |
| `body()` | `&[u8]` |
| `property(vec![...])` | `Option<Bytes>` |
| `properties()` | `HashMap<Vec<String>, Bytes>` |
| `authentication()` | `Option<AuthenticationData>` |
| `violation()` | `Option<PolicyViolation>` |

---

## Backends

Implement `Backend` to mock any HTTP upstream:

```rust
fn my_backend(req: UnitHttpRequest) -> UnitHttpResponse {
    UnitHttpResponse::new(200).with_body("ok")
}
// Closures, fn pointers, Rc<B: Backend>, and UnitHttpResponse all implement Backend.
```

`GrpcBackend` works the same way for gRPC: `fn call(&self, req: UnitGrpcRequest) -> UnitGrpcResponse`.

### TraceBackend — capture upstream calls

Wrap any backend with `TraceBackend` to record every request that reaches it. Pull captured calls in FIFO order with `.next()`.

```rust
use std::rc::Rc;
use pdk_unit::{TraceBackend, UnitHttpResponse, UnitTestBuilder, UnitHttpRequest};

let back = Rc::new(TraceBackend::new(UnitHttpResponse::new(200)));
let mut tester = UnitTestBuilder::default()
    .with_backend(Rc::clone(&back))
    .with_entrypoint(crate::configure);

tester.request(UnitHttpRequest::post().with_body("payload"));

let captured = back.next().unwrap();
assert_eq!(captured.header("x-injected"), Some("value"));  // policy added it
```

### protobuf_grpc_backend — mock gRPC services

The `#[protobuf_grpc_backend]` proc-macro implements `GrpcBackend` on a struct. Annotate each handler method with `#[grpc_method(service = "...", method = "...")]`; the macro routes calls, deserializes the protobuf request, and serializes the response automatically.

```rust
use pdk_unit::protobuf_grpc_backend;

#[derive(Default)]
pub struct MyService;

#[protobuf_grpc_backend]
impl MyService {
    #[grpc_method(service = "ExampleService", method = "Greet")]
    fn greet(&self, req: GreetRequest) -> GreetResponse {
        GreetResponse { message: format!("Hello, {}!", req.name), ..Default::default() }
    }
}

// Register:
// .with_grpc_upstream_from_authority("grpc.example.com", MyService)
```

Unhandled routes return gRPC status 12 (UNIMPLEMENTED); parse errors return 3 (INVALID_ARGUMENT). Requires `protobuf = "3.x"` in the crate.

`UnitGrpcResponse` builder: `::default().with_status_code(0).with_message(bytes).with_status("OK")`.
`UnitGrpcRequest` read-only accessors: `.service()`, `.method()`, `.initial_metadata()`, `.message()`.

---

## LDAP {#ldap}

Policies using `LdapClient` are automatically routed to the internal LDAP mock. Register credentials after building the tester:

```rust
// Wildcard — matches any LDAP server config the policy uses
tester.add_ldap_data(None, "alice", "secret");

// Scoped — only matches when the policy uses this exact LDAP config
use pdk_unit::UnitLdapConfig;
let cfg = UnitLdapConfig::default()
    .server_url("ldap://ldap.example.com:389")
    .server_user_dn("cn=admin,dc=example,dc=com")
    .server_user_password("bind-pass")
    .search_base("ou=users,dc=example,dc=com")
    .search_filter("(uid={0})")
    .search_in_subtree();
tester.add_ldap_data(Some(cfg), "alice", "secret");
```

The mock checks the scoped bucket first, then falls back to the wildcard bucket. Returns 200 on match, 401 on credential mismatch or missing `Authorization`, 400 on malformed header.

---

## Contract & SLA Testing

SLAs configured via the `metadata` builder method. Use the `non_exhaustive!` macro from the `non-exhaustive` crate when constructing `ApiSla` and `Tier`.

```rust
use non_exhaustive::non_exhaustive;
use pdk::metadata::{ApiSla, Tier};
use std::time::Duration;

let slas = vec![non_exhaustive!(ApiSla {
    id: "sla-1".to_string(),
    name: "SLA 1".to_string(),
    tiers: vec![non_exhaustive!(Tier {
        requests: 1,
        period_in_millis: 1000,
    })],
})];

let mut tester = UnitTestBuilder::default()
    .metadata(|meta| meta.api_metadata.slas = Some(slas))
    .with_config(config)
    .with_entrypoint(crate::configure);

tester.add_contract_data("client-id", "App Name", Some("client-secret"), Some("sla-1"));

// Let the contract validator run its first update tick
tester.sleep(Duration::from_secs(20));

assert_eq!(make_request(&mut tester).status_code(), 200); // within quota
assert_eq!(make_request(&mut tester).status_code(), 429); // quota exceeded

// Simulate contract revocation
tester.remove_contract_data("client-id");
tester.sleep(Duration::from_secs(20));
assert_eq!(make_request(&mut tester).status_code(), 403); // contract removed
```

---

## Stop-Iteration Mode *(enable_stop_iteration feature)*

Enable this when the policy calls `into_headers_body_state()` or `into_body_state()`. Both the policy crate (`pdk`) and the test crate (`pdk-unit`) must enable the `enable_stop_iteration` feature.

The two `StopIterationMode` variants control whether outgoing call responses are processed before or after the body event arrives. A correctly-implemented policy must produce identical results under both. Use this pattern to verify:

```rust
use pdk_unit::StopIterationMode;

tester.set_host_mode(StopIterationMode::BodyThenRequests);
let resp_a = tester.request(req.clone());
let req_a = back.next().unwrap();

tester.set_host_mode(StopIterationMode::RequestsThenBody);
let resp_b = tester.request(req.clone());
let req_b = back.next().unwrap();

assert_eq!(resp_a, resp_b);
assert_eq!(req_a, req_b);
```

---

## DataWeave Helper

Use `dw2pel(expr)` to convert a DataWeave expression to PEL for use in test config JSON. Panics if the expression can't be compiled.

```rust
use pdk_unit::dw2pel;
let config = json!({ "expr": dw2pel("attributes.headers.authorization") }).to_string();
```

Supported inputs: `payload`, `attributes`, `vars`, `authentication`.
Supported functions: `++`, `--`, `contains`, `splitBy`, `trim`, `lower`, `upper`, `sizeOf`, `uuid`, `isEmpty`, `substringBefore`, `substringAfter`, `substringBeforeLast`, `substringAfterLast`, `toBase64`, `fromBase64`.
