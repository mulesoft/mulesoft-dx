// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::{anyhow, Result};

use pdk::hl::*;

use crate::generated::config::Config;

// handle the body on the incoming http request.
async fn request_filter(request_state: RequestState, _config: &Config) {
    let headers_state = request_state.into_headers_state().await;

    // we can only modify the body if the original message has one.
    if !headers_state.contains_body() {
        return;
    }

    // If you plan to modify the body you need to delete the content-length header first. Since
    // once the request enters the body state the headers cannot be modified.
    headers_state.handler().remove_header("content-length");

    let body_state = headers_state.into_body_state().await;

    // read the body
    let _body = body_state.handler().body();

    // modify the body of the request with the value "new-body-example"
    let _ = body_state.handler().set_body("new-body-example".as_bytes());

}

// handle the body on the http response.
async fn response_filter(response_state: ResponseState, _config: &Config) {
    let headers_state = response_state.into_headers_state().await;

    // we can only modify the body if the original message has one.
    if !headers_state.contains_body() {
        return;
    }

    // If you plan to modify the body you need to delete the content-length header first. Since
    // once the request enters the body state the headers cannot be modified.
    headers_state.handler().remove_header("content-length");

    let body_state = headers_state.into_body_state().await;

    // read the body
    let _body = body_state.handler().body();

    // modify the body of the request with the value "new-body-example"
    let _ = body_state.handler().set_body("new-body-example".as_bytes());
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
        .on_response(|rs| response_filter(rs, &config));
    launcher.launch(filter).await?;
    Ok(())
}
