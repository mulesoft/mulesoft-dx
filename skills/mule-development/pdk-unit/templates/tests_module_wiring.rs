// Drop-in shape for `src/tests/mod.rs` — declares the test sub-modules.
//
// Companion: append `#[cfg(test)] mod tests;` to `src/lib.rs` (top level,
// outside any `fn`) so cargo only compiles this module when running tests.
//
// File layout this expects:
//
//   src/
//   ├── lib.rs          (your policy code, plus `#[cfg(test)] mod tests;`)
//   └── tests/
//       ├── mod.rs      (this file)
//       ├── common.rs   (TestConfig builder + tester() helpers — see test_config_helper.rs)
//       ├── hello.rs    (smallest possible test — see hello_test.rs)
//       ├── upstream.rs (HTTP upstream mock — see upstream_mock.rs)
//       ├── trace.rs    (TraceBackend assertions — see trace_backend_capture.rs)
//       └── violation.rs(policy violation assertions — see violation_assertion.rs)
//
// Add or remove `mod <name>;` lines to match the test files you actually create.

mod common;
mod hello;
mod upstream;
mod trace;
mod violation;
