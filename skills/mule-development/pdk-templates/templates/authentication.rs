// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;
use pdk::authentication::{Authentication, AuthenticationData, AuthenticationHandler};

use pdk::hl::*;
use pdk::script::Value;

async fn request_filter(request_state: RequestState, authentication: Authentication) {
    let _headers_state = request_state.into_headers_state().await;

    // read the authentication data
    let auth_data: Option<AuthenticationData> = authentication.authentication();
    if let Some(auth) = auth_data {
        let _principal: &Option<String> = &auth.principal;
        let _client_id: &Option<String> = &auth.client_id;
        let _client_name: &Option<String> = &auth.client_name;
        let _properties: &Value = &auth.properties;
    }

    // Write the authentication data
    let auth_data = AuthenticationData::new(
        Some("example-principal".to_string()),
        Some("example-client-id".to_string()),
        Some("example-client-name".to_string()),
        "example-properties"
    );
    authentication.set_authentication(Some(&auth_data))
}

async fn response_filter(response_state: ResponseState, authentication: Authentication) {
    let _headers_state = response_state.into_headers_state().await;

    // read the authentication data
    let auth_data: Option<AuthenticationData> = authentication.authentication();
    if let Some(auth) = auth_data {
        let _principal: &Option<String> = &auth.principal;
        let _client_id: &Option<String> = &auth.client_id;
        let _client_name: &Option<String> = &auth.client_name;
        let _properties: &Value = &auth.properties;
    }

    // Write the authentication data
    let auth_data = AuthenticationData::new(
        Some("example-principal".to_string()),
        Some("example-client-id".to_string()),
        Some("example-client-name".to_string()),
        "example-properties"
    );
    authentication.set_authentication(Some(&auth_data))
}

#[entrypoint]
async fn configure(launcher: Launcher) -> Result<()> {
    // We can manipulate the authentication object by injecting it into the on_request function.
    let filter = on_request(|rs, authentication| request_filter(rs, authentication))
    // We can manipulate the authentication object by injecting it into the on_response function.
        .on_response(|rs, authentication| response_filter(rs, authentication));
    launcher.launch(filter).await?;
    Ok(())
}
