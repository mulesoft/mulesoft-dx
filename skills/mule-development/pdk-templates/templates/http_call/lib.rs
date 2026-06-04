// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use std::collections::HashMap;
use std::time::Duration;
use anyhow::{anyhow, Result};

use pdk::hl::*;


use crate::generated::config::Config;


async fn request_filter(request_state: RequestState, config: &Config, client: HttpClient) {
    let _headers_state = request_state.into_headers_state().await;

    if let Ok(response) = client.request(&config.service)
        .path("/example-path")
        .headers(vec![("example-header", "example-header-value")])
        .body("example-body".as_bytes())
        .timeout(Duration::from_millis(10000))
        .get().await {

        let _body: &[u8] = response.body();
        let _headers: &HashMap<String, String> = response.headers();
        let _status_code: u32 = response.status_code();
    }
}

async fn response_filter(request_state: ResponseState, config: &Config, client: HttpClient) {
    let _headers_state = request_state.into_headers_state().await;

    if let Ok(response) = client.request(&config.service)
        .path("/example-path")
        .headers(vec![("example-header", "example-header-value")])
        .body("example-body".as_bytes())
        .timeout(Duration::from_millis(10000))
        .get().await {

        let _body: &[u8] = response.body();
        let _headers: &HashMap<String, String> = response.headers();
        let _status_code: u32 = response.status_code();
    }

}

#[entrypoint]
// We can execute http calls on the configuration context by injecting the client to the configure function.
async fn configure(launcher: Launcher, Configuration(bytes): Configuration, client: HttpClient) -> Result<()> {
    let config: Config = serde_json::from_slice(&bytes).map_err(|err| {
        anyhow!(
            "Failed to parse configuration '{}'. Cause: {}",
            String::from_utf8_lossy(&bytes),
            err
        )
    })?;

    if let Ok(response) = client.request(&config.service)
        .path("/example-path")
        .headers(vec![("example-header", "example-header-value")])
        .body("example-body".as_bytes())
        .timeout(Duration::from_millis(10000))
        .get().await {

        let _body: &[u8] = response.body();
        let _headers: &HashMap<String, String> = response.headers();
        let _status_code: u32 = response.status_code();
    }

    // We can execute http calls on the request context by injecting the client to the on_request function.
    let filter = on_request(|rs, client| request_filter(rs, &config, client))
        // We can execute http calls on the response context by injecting the client to the on_response function.
        .on_response(|rs, client| response_filter(rs, &config, client));

    launcher.launch(filter).await?;
    Ok(())
}
