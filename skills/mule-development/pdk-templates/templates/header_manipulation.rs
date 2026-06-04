// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::{anyhow, Result};

use pdk::hl::*;

use crate::generated::config::Config;

// handle the headers on the incoming http request.
async fn request_filter(request_state: RequestState, _config: &Config) {
    let headers_state = request_state.into_headers_state().await;

    // Replace the current value of the header 'example-replaced-header' with the value 'example-replaced-value'
    headers_state.handler().set_header("example-replaced-header", "example-replaced-value");

    // Appends to the values of the header 'example-appended-header' the value 'example-appended-value'
    headers_state.handler().add_header("example-appended-header", "example-appended-value");

    // Remove all the occurrences of the header 'example-removed-header'
    headers_state.handler().remove_header("example-removed-header");

    // Read the value of the header 'example-read-header'
    let _header: Option<String> = headers_state.handler().header("example-read-header");

    // Read all the headers of the HTTP event
    let _header_list : Vec<(String, String)> = headers_state.handler().headers();

    // Replace all the headers of the Http event
    headers_state.handler().set_headers(vec![("example-header-name1", "example-header-value1"), ("example-header-name2", "example-header-value2")])
}

// handle the headers on the http response.
async fn response_filter(response_state: ResponseState, _config: &Config) {
    let headers_state = response_state.into_headers_state().await;

    // Replace the current value of the header 'example-replaced-header' with the value 'example-replaced-value'
    headers_state.handler().set_header("example-replaced-header", "example-replaced-value");

    // Appends to the values of the header 'example-appended-header' the value 'example-appended-value'
    headers_state.handler().add_header("example-appended-header", "example-appended-value");

    // Remove all the occurrences of the header 'example-removed-header'
    headers_state.handler().remove_header("example-removed-header");

    // Read the value of the header 'example-read-header'
    let _header: Option<String> = headers_state.handler().header("example-read-header");

    // Read all the headers of the HTTP event
    let _header_list : Vec<(String, String)> = headers_state.handler().headers();

    // Replace all the headers of the Http event
    headers_state.handler().set_headers(vec![("example-header-name1", "example-header-value1"), ("example-header-name2", "example-header-value2")])
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
