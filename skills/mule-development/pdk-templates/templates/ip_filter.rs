// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;

use pdk::hl::*;
use pdk::ip_filter::IpFilter;

async fn request_filter(request_state: RequestState, ip_filter: &IpFilter) -> Flow<()> {
    let headers = request_state.into_headers_state().await;
    let client_ip = headers.handler().header("x-real-ip");
    match client_ip {
        Some(ip) if ip_filter.is_allowed(&ip) => Flow::Continue(()),
        _ => Flow::Break(Response::new(403).with_body("Forbidden")),
    }
}

#[entrypoint]
async fn configure(launcher: Launcher, Configuration(_): Configuration) -> Result<()> {
    // Create allowlist filter - only these IPs can access
    let ip_filter = IpFilter::allow(&["192.168.1.1", "10.0.0.0/8"])?;
    // Uncomment following line to block IPs instead:
    // let ip_filter = IpFilter::block(&["192.168.1.1", "10.0.0.0/8"])?;
    let filter = on_request(|rs| request_filter(rs, &ip_filter));
    launcher.launch(filter).await?;
    Ok(())
}
