// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;

use pdk::hl::*;
use pdk::logger;

async fn request_filter(request_state: RequestState) {
    let _headers_state = request_state.into_headers_state().await;

    logger::debug!("debug log");
    logger::info!("info log");
    logger::warn!("warn log");
    logger::error!("error log");
}

async fn response_filter(response_state: ResponseState) {
    let _headers_state = response_state.into_headers_state().await;

    logger::debug!("debug log");
    logger::info!("info log");
    logger::warn!("warn log");
    logger::error!("error log");
}

#[entrypoint]
async fn configure(launcher: Launcher) -> Result<()> {

    logger::debug!("debug log");
    logger::info!("info log");
    logger::warn!("warn log");
    logger::error!("error log");

    let filter = on_request(|rs| request_filter(rs))
        .on_response(|rs| response_filter(rs));

    launcher.launch(filter).await?;
    Ok(())
}
