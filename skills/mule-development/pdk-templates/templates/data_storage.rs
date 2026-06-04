// Copyright 2023 Salesforce, Inc. All rights reserved.
use anyhow::Result;
use pdk::data_storage::{DataStorage, DataStorageBuilder, StoreMode};
use pdk::hl::*;
use pdk::logger;

async fn request_filter(_request_state: RequestState, storage: &impl DataStorage) -> Flow<()> {
    // Insert only if key does not exist yet
    let _ = storage
        .store("my-key", &StoreMode::Absent, &"initial-value".to_string())
        .await;
    // Store modes available: Always, Absent, Cas(String)

    // Get current value with its CAS version token
    if let Ok(Some((value, version))) = storage.get::<String>("my-key").await {
        logger::info!("Current value: {value}");

        // Update atomically — only succeeds if version still matches (no concurrent write)
        let _ = storage
            .store(
                "my-key",
                &StoreMode::Cas(version),
                &"updated-value".to_string(),
            )
            .await;
    }

    // Log the updated stored value
    if let Ok(Some((value, _))) = storage.get::<String>("my-key").await {
        logger::info!("Stored value after update: {value}");
    }

    // Delete the key
    let _ = storage.delete("my-key").await;
    // Or delete all keys using: storage.delete_all().await;

    // List all remaining keys in storage
    if let Ok(keys) = storage.get_keys().await {
        logger::info!("Keys in storage: {keys:?}");
    }

    Flow::Continue(())
}

#[entrypoint]
async fn configure(
    launcher: Launcher,
    store_builder: DataStorageBuilder,
    Configuration(_bytes): Configuration,
) -> Result<()> {
    // Create local storage instance using the builder
    let storage = store_builder.local("my-namespace");
    // or remote storage instance using: let storage = store_builder.remote("my-namespace", 60000);

    let filter = on_request(|rs| request_filter(rs, &storage));
    launcher.launch(filter).await?;
    Ok(())
}