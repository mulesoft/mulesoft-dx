// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::{anyhow, Result};

use pdk::hl::*;

use crate::generated::config::Config;

async fn request_filter(request_state: RequestState, _config: &Config) -> Flow<()> {
    // Transition directly to headers-body state to access both headers and body
    let state = request_state.into_headers_body_state().await;

    // Modify headers
    let original_method = state.handler().header(":method").unwrap_or_default();
    state
        .handler()
        .set_header("x-original-method", &original_method);

    // Modify body if present
    if state.contains_body() {
        let body = state.handler().body();
        let body_str = String::from_utf8_lossy(&body);
        let modified_body = format!("REQ_BODY_PREFIX-{}", body_str);

        if let Err(err) = state.handler().set_body(modified_body.as_bytes()) {
            // If body cannot be set (e.g., GET request), add as header
            pdk::logger::info!("Cannot set body: {:?}, adding as header instead", err);
            state
                .handler()
                .set_header("x-modified-body", &modified_body);
        }
    }

    Flow::Continue(())
}

async fn response_filter(response_state: ResponseState) {
    // Transition to headers-body state for response
    let state = response_state.into_headers_body_state().await;

    // Add header indicating response was modified
    state
        .handler()
        .set_header("x-stop-iteration", "response-modified");

    // Access and modify response body
    if state.contains_body() {
        let body = state.handler().body();
        let body_str = String::from_utf8_lossy(&body);
        let modified_body = format!("RESP_BODY_PREFIX:{}", body_str);

        let _ = state.handler().set_body(modified_body.as_bytes());
    }
}

#[entrypoint]
async fn configure(launcher: Launcher, Configuration(bytes): Configuration) -> Result<()> {
    let config: Config = serde_json::from_slice(&bytes).map_err(|err| {
        anyhow!(
            "Failed to parse configuration '{}'. Cause: {}",
            String::from_utf8_lossy(&bytes),
            err
        )
    })?;
    let filter = on_request(|rs| request_filter(rs, &config))
                    .on_response(|res| response_filter(res));
    launcher.launch(filter).await?;
    Ok(())
}