// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::{anyhow, Result};

use pdk::hl::*;
use pdk::logger::{error, warn};
use pdk::metadata::Tier;
use pdk::rl::{RateLimit, RateLimitBuilder, RateLimitError, RateLimitInstance, RateLimitResult, RateLimitStatistics};
use crate::generated::config::Config;

async fn request_filter(_request_state: RequestState, _config: &Config, rate_limit: &RateLimitInstance) -> Flow<RateLimitStatistics> {
    match rate_limit.is_allowed("default", "bucket", 1).await {
        Ok(RateLimitResult::Allowed(stats)) => Flow::Continue(stats),
        Ok(RateLimitResult::TooManyRequests(stats)) => {
            let response = Response::new(429).with_body("Too Many Requests");
            let expose_headers = vec![
                ("x-ratelimit-limit".to_string(), stats.limit.to_string()),
                ("x-ratelimit-remaining".to_string(), stats.remaining.to_string()),
                ("x-ratelimit-reset".to_string(), stats.reset.to_string()),
            ];
            Flow::Break(response.with_headers(expose_headers))
        }
        Err(RateLimitError::MaxHops) => {
            warn!("Unexpected error: Hops reached");
            Flow::Break(Response::new(503).with_body("Internal Gateway Error"))
        }
        Err(RateLimitError::Unexpected(_error)) => {
            warn!("Unexpected error: Request error");
            Flow::Break(Response::new(503).with_body("Internal Gateway Error"))
        }
        Err(e) => {
            warn!("Unexpected error: {e}");
            Flow::Break(Response::new(503).with_body("Internal Gateway Error"))
        }
    }
}

#[entrypoint]
async fn configure(launcher: Launcher,
   Configuration(bytes): Configuration,
   rate_limit_builder: RateLimitBuilder,
) -> Result<()> {
    let config: Config = serde_json::from_slice(&bytes).map_err(|err| {
        anyhow!(
            "Failed to parse configuration '{}'. Cause: {}",
            String::from_utf8_lossy(&bytes),
            err
        )
    })?;

    let mut builder = rate_limit_builder.new("rate-limit-filter".to_string());

    let mut tiers = vec![];
    tiers.push(Tier {
        requests: 2,
        period_in_millis: 5000,
    });
    // You can make the rate limit to share state across flex instances by uncomenting the following line
    // builder = builder.clustered(Rc::new(clock.period(Duration::from_millis(100))));
    builder = builder.buckets(vec![("default".to_string(), tiers)]);
    let rate_limit = builder.build().map_err(|e| {
        error!("Failed to build the rate limit handler: {e}");
        LaunchError {}
    })?;


    let filter = on_request(|rs| request_filter(rs, &config, &rate_limit));
    launcher.launch(filter).await?;
    Ok(())
}
