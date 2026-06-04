// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;

use pdk::hl::*;
use pdk::metadata::{ApiMetadata, ApiSla, FlexMetadata, Metadata, PlatformMetadata, PolicyMetadata};

async fn request_filter(_request_state: RequestState, _metadata: &Metadata) {
}

async fn response_filter(_response_state: ResponseState, _metadata: &Metadata) {
}

#[entrypoint]
// inject the Metadata on the configure function.
async fn configure(launcher: Launcher, metadata: Metadata) -> Result<()> {

    // FlexMetadata includes information regarding the flex replica
    let flex_metadata: &FlexMetadata = &metadata.flex_metadata;
    let _flex_name: &String = &flex_metadata.flex_name;
    let _flex_version: &String = &flex_metadata.flex_version;

    // PlatformMetadata includes information regarding the management plane.
    let platform_metadata: &PlatformMetadata = &metadata.platform_metadata;
    let _organization_id: &String = &platform_metadata.organization_id;
    let _environment_id: &String = &platform_metadata.environment_id;
    let _root_organization_id: &String = &platform_metadata.root_organization_id;

    // ApiMetadata includes information regarding the Api instance
    let platform_metadata: &ApiMetadata = &metadata.api_metadata;
    let _id: &Option<String> = &platform_metadata.id;
    let _name: &Option<String> = &platform_metadata.name;
    let _version: &Option<String> = &platform_metadata.version;
    let _base_path: &Option<String> = &platform_metadata.base_path;
    let _slas: &Option<Vec<ApiSla>> = &platform_metadata.slas;

    // PolicyMetadata includes information regarding the current policy.
    let policy_metadata: &PolicyMetadata = &metadata.policy_metadata;
    let _policy_name: &String = &policy_metadata.policy_name;
    let _policy_namespace: &String = &policy_metadata.policy_namespace;

    let filter = on_request(|rs| request_filter(rs, &metadata))
        .on_response(|rs| response_filter(rs, &metadata));
    launcher.launch(filter).await?;
    Ok(())
}
