// Copyright 2023 Salesforce, Inc. All rights reserved.
use anyhow::Result;

use pdk::hl::*;
use pdk::json_validator::{JsonValidatorBuilder, ValidationError};

async fn request_filter(request_state: RequestState) -> Flow<()> {
    // Collect all body chunks before validating (or use validate_chunk for incremental streaming)
    let body_stream_state = request_state.into_body_stream_state().await;
    let payload = body_stream_state.stream().collect().await;

    let mut validator = JsonValidatorBuilder::new()
        .with_max_depth(5)           // max nesting level for objects/arrays
        .with_max_array_length(100)  // max number of elements in any array
        .with_max_string_length(500) // max character length of any string value
        .with_max_object_entries(20) // max number of key/value pairs in any object
        .with_max_key_length(50)     // max character length of any object key
        .build();

    // Validate the payload and return appropiate response if validation fails.
    if let Err(e) = validator.validate_chunk(payload.bytes(), true) {
        let msg = match e {
            ValidationError::MaxDepthExceeded => "Rejected: JSON nesting too deep (max: 5)",
            ValidationError::ArrayMaxLengthExceeded => "Rejected: JSON array too long (max: 100 elements)",
            ValidationError::StringMaxLengthExceeded => "Rejected: JSON string value too long (max: 500 chars)",
            ValidationError::ObjectMaxLengthExceeded => "Rejected: JSON object too many entries (max: 20)",
            _ => "Rejected: Invalid JSON payload",
        };
        return Flow::Break(Response::new(400).with_body(msg));
    }

    Flow::Continue(())
}