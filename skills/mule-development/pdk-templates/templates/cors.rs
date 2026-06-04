// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use regex::Regex;
use pdk::cors;
use pdk::cors::{AllowedMethod, Cors, OriginGroup};
use pdk::hl::*;
use pdk::logger;

async fn request_filter(request_state: RequestState, cors: &Cors<'_>) -> Flow<Vec<(String, String)>> {
    let header_state = request_state.into_headers_state().await;

    // Determine what kind of request is incoming.
    match cors.check_headers(header_state.handler().headers().as_slice()) {
        Ok(check) => match check.response_type() {

            // A preflight request must return a 200 OK.
            cors::ResponseType::Preflight => {
                Flow::Break(Response::new(200).with_headers(check.into_headers()))
            }

            // A main request must continue.
            cors::ResponseType::Main => {
                // Forward the headers to set on the response.
                Flow::Continue(check.into_headers())
            }
        },

        // A validation problem occurred. Block the request.
        Err(message) => {
            logger::debug!("Request finished with the following error {message}");
            Flow::Break(Response::new(200))
        }
    }
}

async fn response_filter(state: ResponseHeadersState, data: RequestData<Vec<(String, String)>>) {
    // Take the Cors headers to add to the response.
    let RequestData::Continue(headers_to_add) = data else {
        return;
    };

    // Add all the Cors headers into the response.
    for (name, value) in headers_to_add.iter() {
        state.handler().set_header(name, value);
    }
}

#[entrypoint]
async fn configure(launcher: Launcher) -> anyhow::Result<()> {

    // Create the configuration for CORS.
    let cors_config = cors::Configuration::builder()
        .public_resource(false)
        .support_credentials(true)
        .origin_groups(vec![
            OriginGroup::builder()
                .origin_group_name("example-origin-name")
                .plain_origins(vec!["example.com".to_string()])
                .regex_origins(vec![Regex::new(".*\\.example\\.com")?])
                .allowed_methods(vec![
                    AllowedMethod::builder().allowed(true).method_name("GET").build()?,
                    AllowedMethod::builder().allowed(true).method_name("POST").build()?,
                ])
                .access_control_max_age(200)
                .headers(vec!["header-example".to_string()])
                .exposed_headers(vec!["exposed-header-example".to_string()])
                .build()?
        ])
        .build()?;

    let cors = Cors::new(&cors_config);

    let filter = on_request(|rs| request_filter(rs, &cors))
        .on_response(|rs, request_data| response_filter(rs, request_data));

    launcher.launch(filter).await?;
    Ok(())
}
