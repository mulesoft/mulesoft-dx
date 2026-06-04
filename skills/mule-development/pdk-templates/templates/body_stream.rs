// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;

use pdk::hl::*;

async fn request_filter(request_state: RequestState) {
    let headers_state = request_state.into_headers_state().await;

    // Only one 'BodyStreamState' or 'BodyState' can be awaited per request. Selecting the body stream state
    // enables reading the payload as chunks. This also enables to read payloads of sizes greater than the underlying buffer.
    let body_stream_state = headers_state.into_body_stream_state().await;
    let mut stream = body_stream_state.stream();

    // Iterate over the chunks and work with them
    while let Some(chunk) = stream.next().await {
        let _bytes: Vec<u8> = chunk.into_bytes(); // use the chunk
    }
}

async fn response_filter(response_state: ResponseState) {
    let headers_state = response_state.into_headers_state().await;

    // Only one 'BodyStreamState' or 'BodyState' can be awaited per response. Selecting the body stream state
    // enables reading the payload as chunks. This also enables to read payloads of sizes greater than the underlying buffer.
    let body_stream_state = headers_state.into_body_stream_state().await;
    let mut stream = body_stream_state.stream();

    // the library provides syntactic sugar to collect all the chunks without having to manually iterate over all of them.
    let payload: Chunk = stream.collect().await;
    let _bytes: Vec<u8> = payload.into_bytes(); // use the chunk
}

#[entrypoint]
async fn configure(launcher: Launcher) -> Result<()> {
    let filter = on_request(|rs| request_filter(rs))
        .on_response(|rs| response_filter(rs));
    launcher.launch(filter).await?;
    Ok(())
}
