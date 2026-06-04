// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;
use pdk::cache::{Cache, CacheBuilder, CacheError};
use pdk::hl::*;

const MAX_CACHE_ENTRIES: usize = 100;

async fn request_filter(request_state: RequestState, cache:&dyn Cache) {
    let _headers_state = request_state.into_headers_state().await;

    // Save a value to the cache
    let _save_result: Result<(), CacheError> = cache.save("example-key", "example-value".as_bytes().to_vec());

    // Retrieve value from the cache.
    let _retrieved_value: Option<Vec<u8>> = cache.get("example-key");

    // Retrieve value from the cache.
    let _deleted_value: Option<Vec<u8>> = cache.delete("example-key");

    // remove all keys from the cache.
    cache.purge();

}

async fn response_filter(response_state: ResponseState, cache:&dyn Cache) {
    let _headers_state = response_state.into_headers_state().await;

    // Save a value to the cache
    let _save_result: Result<(), CacheError> = cache.save("example-key", "example-value".as_bytes().to_vec());

    // Retrieve value from the cache.
    let _retrieved_value: Option<Vec<u8>> = cache.get("example-key");

    // Retrieve value from the cache.
    let _deleted_value: Option<Vec<u8>> = cache.delete("example-key");

    // remove all keys from the cache.
    cache.purge();

}

#[entrypoint]
// Inject the CacheBuilder to the 'configure' function.
async fn configure(launcher: Launcher, cache_builder: CacheBuilder) -> Result<()> {

    let cache = cache_builder
        .new("example-id".to_string())
        .max_entries(MAX_CACHE_ENTRIES)
        // .shared() // if uncommented the cache won't be isolated to the current policy.
        .build();

    let filter = on_request(|rs| request_filter(rs, &cache))
        .on_response(|rs| response_filter(rs, &cache));
    launcher.launch(filter).await?;
    Ok(())
}
