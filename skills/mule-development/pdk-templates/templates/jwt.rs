// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;

use pdk::hl::*;
use pdk::jwt::{model, JWTClaimsParser, SignatureValidator};
use pdk::jwt::error::JWTError;
use pdk::jwt::model::JWTClaims;

async fn request_filter(request_state: RequestState, signature_validator: &SignatureValidator) {
    let headers_state = request_state.into_headers_state().await;

    // In this example, we retrieve the jwt token from the request headers.
    let token = headers_state.handler().header("authorization")
        .map(|header| header.replace("Bearer ", ""))
        .unwrap_or_default();

    // Validate the signature of the jwt and parse the internal claims.
    let _validation_result: Result<JWTClaims, JWTError> = signature_validator.validate(token.clone());

    // If no signature validation is need, JWTClaimsParser can parse the claims directly.
    let validation_result: Result<JWTClaims, JWTError> = JWTClaimsParser::parse(token);

    if let Ok(claims) = validation_result {
        // Read a specific header from the jwt.
        let _example_header: Option<String> = claims.get_header("example-header");
        // Read a specific claim from the jwt.
        let _example_claim: Option<serde_json::Value> = claims.get_claim("example-claim");
    }
}

#[entrypoint]
async fn configure(launcher: Launcher) -> Result<()> {

    // We create a signature validator
    let signature_validator = SignatureValidator::new(
        model::SigningAlgorithm::Hmac, //Hmac, Rsa, Es
        model::SigningKeyLength::Len256, //Len256, Len384, Len512
        "example-hmac-secret-with-256-bits-long".to_string(),
    )?;

    let filter = on_request(|rs| request_filter(rs, &signature_validator));
    launcher.launch(filter).await?;
    Ok(())
}
