// Copyright 2023 Salesforce, Inc. All rights reserved.
use anyhow::Result;

use pdk::hl::*;
use pdk::metadata::Tier;
use pdk::rl::RateLimitStatistics;
use pdk::spike_control::{SpikeControlBuilder, SpikeControlError, SpikeControlHandler};

async fn request_filter(
    request_state: RequestState,
    spike_handler: &SpikeControlHandler,
) -> Flow<RateLimitStatistics> {
    let _headers_state = request_state.into_headers_state().await;

    // Use with_retry true to enable retry logic or false to reject immediately when the quota is exhausted
    match spike_handler.is_allowed("default", "spike", 1, true).await {
        Ok(stats) => Flow::Continue(stats),
        Err(SpikeControlError::TooManyRequests(stats)) => {
            // Return a 429 response with rate limit information
            let response = Response::new(429)
                .with_headers(vec![
                    ("x-ratelimit-limit".to_string(), stats.limit.to_string()),
                    (
                        "x-ratelimit-remaining".to_string(),
                        stats.remaining.to_string(),
                    ),
                    ("x-ratelimit-reset".to_string(), stats.reset.to_string()),
                ])
                .with_body("Too Many Requests");
            Flow::Break(response)
        }
        Err(_) => Flow::Break(Response::new(503).with_body("Service Unavailable")),
    }
}

#[entrypoint]
async fn configure(launcher: Launcher, spike_control: SpikeControlBuilder) -> Result<()> {
    let spike_handler = spike_control
        .new("spike-control".to_string())
        .with_bucket(
            "default".to_string(),
            vec![Tier {
                requests: 5,
                period_in_millis: 1000,
            }], // 5 requests per second
        )
        .with_retry(200, 3) // retry up to 3 times with 200 ms delay between attempts
        .build()
        .map_err(|e| anyhow::anyhow!("{e}"))?;

    launcher
        .launch(on_request(|rs| request_filter(rs, &spike_handler)))
        .await?;
    Ok(())
}