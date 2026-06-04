// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::{anyhow, Result};

use pdk::hl::*;
use pdk::hl::grpc::*;
use crate::example::{ExampleRequest, ExampleResponse};

use crate::generated::config::Config;

include!(concat!(env!("OUT_DIR"), "/protos/mod.rs"));

async fn request_filter(request_state: RequestState, config: &Config, client: &GrpcClient) {
    let _headers_state = request_state.into_headers_state().await;

    let request = ExampleRequest {
        request: "example-request".to_string(),
        ..Default::default()
    };

    let _response: Result<GrpcResponse<ExampleResponse>, GrpcClientError> = client.request(&config.example_service)
        .service("ExampleService")
        .method("ExampleMethod")
        .protobuf()
        .send(&request)
        .await;

}

async fn response_filter(request_state: ResponseState, config: &Config, client: &GrpcClient) {
    let _headers_state = request_state.into_headers_state().await;

    let request = ExampleRequest {
        request: "example-request".to_string(),
        ..Default::default()
    };

    let _response: Result<GrpcResponse<ExampleResponse>, GrpcClientError> = client.request(&config.example_service)
        .service("ExampleService")
        .method("ExampleMethod")
        .protobuf()
        .send(&request)
        .await;
}

#[entrypoint]
// Inject the GrpClient to the configure function
async fn configure(launcher: Launcher, Configuration(bytes): Configuration, client: GrpcClient) -> Result<()> {
    let config: Config = serde_json::from_slice(&bytes).map_err(|err| {
        anyhow!(
            "Failed to parse configuration '{}'. Cause: {}",
            String::from_utf8_lossy(&bytes),
            err
        )
    })?;
    let filter = on_request(|rs| request_filter(rs, &config, &client))
       .on_response(|rs| response_filter(rs, &config, &client));

    launcher.launch(filter).await?;
    Ok(())
}
