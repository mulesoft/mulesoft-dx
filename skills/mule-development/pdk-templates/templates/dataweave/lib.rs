// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use std::collections::HashMap;
use anyhow::{anyhow, Result};
use pdk::authentication::{Authentication, AuthenticationHandler};
use pdk::hl::*;
use pdk::script::{EvaluationError, HandlerAttributesBinding, Value};
use crate::generated::config::Config;


async fn request_filter(request_state: RequestState, stream_properties: StreamProperties, authentication: Authentication, config: &Config) {
    let headers_state = request_state.into_headers_state().await;

    // Create an evaluator of the dataweave expression provided in the configuration.
    let mut eval = config.example_dateweave_property.evaluator();

    // bind "attributes" to the dataweave expression. Only necessary if the binding "attributes" was set to true in the gcl.yaml.
    eval.bind_attributes(&HandlerAttributesBinding::new(headers_state.handler(), &stream_properties));

    // bind "authentication" to the dataweave expression. Only necessary if the binding "authentication" was set to true in the gcl.yaml.
    eval.bind_authentication(&authentication.authentication());

    let body_state = headers_state.into_body_state().await;

    // bind "payload" to the dataweave expression. Only necessary if the binding "payload" was configured in the gcl.yaml.
    eval.bind_payload(&body_state);

    // bind the var "exampleVar" to the dataweave expression. Only necessary if the binding "vars" was configured in the gcl.yaml.
    eval.bind_vars("exampleVar", "exampleValue");

    let result: Result<Value, EvaluationError> = eval.eval();

    match result.unwrap_or_default() {
        Value::Array(array) => {
            let _array: Vec<Value> = array;
        },
        Value::Null => {},
        Value::Bool(_boolean) => {},
        Value::Number(_number) => {},
        Value::String(_string) => {},
        Value::Object(object) => {
            let _value: HashMap<String, Value> = object;
        }
    }
}

async fn response_filter(response_state: ResponseState, stream_properties: StreamProperties, authentication: Authentication, config: &Config) {
    let headers_state = response_state.into_headers_state().await;

    // Create an evaluator of the dataweave expression provided in the configuration.
    let mut eval = config.example_dateweave_property.evaluator();

    // bind "attributes" to the dataweave expression. Only necessary if the binding "attributes" was set to true in the gcl.yaml.
    eval.bind_attributes(&HandlerAttributesBinding::new(headers_state.handler(), &stream_properties));

    // bind "authentication" to the dataweave expression. Only necessary if the binding "authentication" was set to true in the gcl.yaml.
    eval.bind_authentication(&authentication.authentication());

    let body_state = headers_state.into_body_state().await;

    // bind "payload" to the dataweave expression. Only necessary if the binding "payload" was configured in the gcl.yaml.
    eval.bind_payload(&body_state);

    // bind the var "exampleVar" to the dataweave expression. Only necessary if the binding "vars" was configured in the gcl.yaml.
    eval.bind_vars("exampleVar", "exampleValue");

    let result: Result<Value, EvaluationError> = eval.eval();

    match result.unwrap_or_default() {
        Value::Array(array) => {
            let _array: Vec<Value> = array;
        },
        Value::Null => {},
        Value::Bool(_boolean) => {},
        Value::Number(_number) => {},
        Value::String(_string) => {},
        Value::Object(object) => {
            let _value: HashMap<String, Value> = object;
        }
    }
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

    // Inject the StreamProperties and Authentication to the on_request function.
    let filter = on_request(|rs, stream_properties, authentication| request_filter(rs, stream_properties, authentication, &config))
        // Inject the StreamProperties and Authentication to the on_response function.
        .on_response(|rs, stream_properties, authentication| response_filter(rs, stream_properties, authentication, &config));


    launcher.launch(filter).await?;
    Ok(())
}
