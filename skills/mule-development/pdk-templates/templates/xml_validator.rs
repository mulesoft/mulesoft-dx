// Copyright 2023 Salesforce, Inc. All rights reserved.

mod generated;

use anyhow::Result;
use pdk::hl::*;
use pdk::xml_validator::{XmlValidator, XmlValidatorBuilder};
use std::rc::Rc;

async fn request_filter(state: RequestState, validator: &XmlValidator) -> Flow<()> {
    let headers_state = state.into_headers_state().await;

    if !headers_state.contains_body() {
        return Flow::Continue(());
    }

    let body_stream_state = headers_state.into_body_stream_state().await;
    match validator.validate_stream(body_stream_state.stream()).await {
        Ok(()) => Flow::Continue(()),
        Err(_) => Flow::Break(Response::new(400).with_body("Invalid XML")),
    }
}

#[entrypoint]
async fn configure(launcher: Launcher) -> Result<()> {
    let validator = Rc::new(XmlValidatorBuilder::new().build());
    let filter = on_request({
        let validator = Rc::clone(&validator);
        move |state| {
            let validator = Rc::clone(&validator);
            async move { request_filter(state, validator.as_ref()).await }
        }
    });

    launcher.launch(filter).await?;
    Ok(())
}