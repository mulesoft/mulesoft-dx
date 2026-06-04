// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use std::time::Duration;
use anyhow::Result;

use pdk::hl::*;
use pdk::lock::{LockBuilder, TryLock};

const LOCK_EXPIRATION: Duration = Duration::from_secs(10);

async fn request_filter(request_state: RequestState, try_lock: &TryLock) {
    let headers_state = request_state.into_headers_state().await;

    // Try to acquire the lock, the logic will be executed only if it is acquired.
    // If we need to block until we can acquire the lock, we'll need to combiner with the 'timer' feature and do a busy wait.
    if let Some(lock) = try_lock.try_lock() {
        // We have entered the critical section.

        // After the 'await' of an async call we MUST refresh the lock.
        // Here we use into_body_state as an example, but the same applies to http calls, grpc calls, etc...
        let _body_state = headers_state.into_body_state().await;
        if lock.refresh_lock() {
         // continue the critical section.
        }
    }

}

async fn response_filter(response_state: ResponseState, try_lock: &TryLock) {
    let headers_state = response_state.into_headers_state().await;

    // Try to acquire the lock, the logic will be executed only if it is acquired.
    // If we need to block until we can acquire the lock, we'll need to combiner with the 'timer' feature and do a busy wait.
    if let Some(lock) = try_lock.try_lock() {
        // We have entered the critical section.

        // After the 'await' of an async call we MUST refresh the lock.
        // Here we use into_body_state as an example, but the same applies to http calls, grpc calls, etc...
        let _body_state = headers_state.into_body_state().await;
        if lock.refresh_lock() {
            // continue the critical section.
        }
    }

}

#[entrypoint]
// Inject the LockBuilder to the 'configure' function.
async fn configure(launcher: Launcher, lock_builder: LockBuilder) -> Result<()> {

    // We create a lock to synchronize the different worker threads.
    let try_lock: TryLock = lock_builder
        .new("example-id".to_string())
        .expiration(LOCK_EXPIRATION) // Amount of time in which the lock will be automatically released.
        //.shared() // if uncommented the lock won't be isolated to the current policy.
        .build();

    // We can use the lock in the configuration context and even inside an async task.
    if let Some(lock) = try_lock.try_lock() {
        // We have entered the critical section.

        // After the 'await' of an async call we MUST refresh the lock. This applies to http calls, grpc calls, etc...
        if lock.refresh_lock() {
            // continue the critical section.
        }
    }


    let filter = on_request(|rs| request_filter(rs, &try_lock))
        .on_response(|rs| response_filter(rs, &try_lock));
    launcher.launch(filter).await?;
    Ok(())
}
