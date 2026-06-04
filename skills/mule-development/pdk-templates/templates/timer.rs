// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use std::time::Duration;
use anyhow::{anyhow, Result};

use pdk::hl::*;
use pdk::hl::timer::{Clock, Timer};
use futures::join;

use crate::generated::config::Config;

async fn request_filter(request_state: RequestState, _config: &Config, timer: &Timer) {
    let _headers_state = request_state.into_headers_state().await;
    // sleep in the request flow for 200 milliseconds.
    let _ = timer.sleep(Duration::from_millis(200)).await;
}

async fn response_filter(response_state: ResponseState, _config: &Config, timer: &Timer) {
    let _headers_state = response_state.into_headers_state().await;
    // sleep int the response flow for 200 milliseconds.
    let _ = timer.sleep(Duration::from_millis(200)).await;
}

async fn periodic_task(timer: &Timer) {
    // the loop will execute after sleeping 1 second
    while timer.sleep(Duration::from_secs(1)).await {
        // recurrent tasks
    }
}

#[entrypoint]
// Inject the clock on the configure function.
async fn configure(launcher: Launcher, Configuration(bytes): Configuration, clock: Clock) -> Result<()> {
    let config: Config = serde_json::from_slice(&bytes).map_err(|err| {
        anyhow!(
            "Failed to parse configuration '{}'. Cause: {}",
            String::from_utf8_lossy(&bytes),
            err
        )
    })?;

    // configure the timer granularity
    let timer = clock.period(Duration::from_millis(100));

    let filter = on_request(|rs| request_filter(rs, &config, &timer))
        .on_response(|rs| response_filter(rs, &config, &timer));

    // taking advantage of the timer we can execute recurrent tasks independent of the http request flow.
    let task = periodic_task(&timer);

    let launched_filter = launcher.launch(filter);

    // join the two async functions, the one that handles the http request and the periodic tasks
    let _ = join!(launched_filter, task);

    Ok(())
}
