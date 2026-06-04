// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;
use std::collections::HashMap;

use pdk::hl::*;
use pdk::jwt::model::SigningAlgorithm;
use pdk::jwt::model::{JWTClaims, SigningKeyLength};
use pdk::jwt::JwtGenerator;
use serde_json::Value;

async fn request_filter(
    request_state: RequestState,
    generator: &JwtGenerator,
) {
    let _headers_state = request_state.into_headers_state().await;

    // Create the claims to add to the JWT
    let mut claims: HashMap<String, Value> = HashMap::new();
    claims.insert("example-claim".to_string(), "example-claim-value".into());

    // Create the headers to add to the JWT
    let mut headers: HashMap<String, Value> = HashMap::new();
    headers.insert("example-header".to_string(), "example-header-value".into());

    // Create the JWT claims object
    if let Ok(jwt_claims) = JWTClaims::new(None, None, None, claims, headers) {
        // Create the JWT
        if let Ok(_jwt) = generator.jwt(jwt_claims) {
            // Do something with the JWT
        };
    };
}

#[entrypoint]
async fn configure(launcher: Launcher) -> Result<()> {
    // Create the JWT generator outside the request filter
    let generator = JwtGenerator::new(
        SigningAlgorithm::Hmac, // Hmac, Rsa, Es
        SigningKeyLength::Len256, // Len256, Len384, Len512
        "example-key", // This key should be a pkcs8 pem if the signing algorithm is Rsa or Es
    )?;

    // forward the generator to the request filter
    let filter = on_request(|rs| request_filter(rs, &generator));

    launcher.launch(filter).await?;

    Ok(())
}
