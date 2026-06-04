// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::{anyhow, Result};

use pdk::hl::*;

use crate::generated::config::Config;

async fn request_filter(request_state: RequestState, _config: &Config) -> Flow<()> {
    let _headers_state = request_state.into_headers_state().await;

    Flow::Break(
        Response::new(503)
            .with_headers(vec![("example-header".to_string(), "example-header-value".to_string())])
            .with_body("example-body"),
    )
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

    let filter = on_request(|rs| request_filter(rs, &config));
    launcher.launch(filter).await?;
    Ok(())
}
