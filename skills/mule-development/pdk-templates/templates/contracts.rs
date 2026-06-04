// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use futures::join;
use std::time::Duration;
use anyhow::Result;
use pdk::contracts::{AuthenticationError, AuthorizationError, ClientData, ClientId, ClientSecret, ContractValidator};
use pdk::hl::*;
use pdk::hl::timer::Clock;

const CONTRACT_POLL_FREQUENCY: Duration = Duration::from_secs(15);

async fn request_filter(request_state: RequestState, contract_validator: &ContractValidator) {
    let _headers_state = request_state.into_headers_state().await;

    let client_id = ClientId::new("example-client-id".to_string());
    let client_secret = ClientSecret::new("example-client-secret".to_string());

    // Check for authorization
    let _validation_result: Result<ClientData, AuthorizationError> = contract_validator.authorize(&client_id);

    // Check for authentication
    let validation_result: Result<ClientData, AuthenticationError> = contract_validator.authenticate(&client_id, &client_secret);

    if let Ok(client_data) = validation_result {
        let _client_name: String = client_data.client_name;
        let _sla_id: Option<String> = client_data.sla_id;
    }
}

async fn response_filter(response_state: ResponseState, contract_validator: &ContractValidator) {
    let _headers_state = response_state.into_headers_state().await;

    let client_id = ClientId::new("example-client-id".to_string());
    let client_secret = ClientSecret::new("example-client-secret".to_string());

    // Check for authorization
    let _validation_result: Result<ClientData, AuthorizationError> = contract_validator.authorize(&client_id);

    // Check for authentication
    let validation_result: Result<ClientData, AuthenticationError> = contract_validator.authenticate(&client_id, &client_secret);

    if let Ok(client_data) = validation_result {
        let _client_name: String = client_data.client_name;
        let _sla_id: Option<String> = client_data.sla_id;
    }
}

#[entrypoint]
// Inject the ContractValidator and the Clock on the configure function.
async fn configure(launcher: Launcher, contract_validator: ContractValidator, clock: Clock) -> Result<()> {

    let timer = clock.period(CONTRACT_POLL_FREQUENCY);

    // Initial collection of contracts.
    contract_validator.update_contracts().await?;

    // Create task to update contracts periodically
    let update_contracts = async {
        // Sleep for one period
        while timer.sleep(CONTRACT_POLL_FREQUENCY).await {
            // update the contracts
            let _ = contract_validator.update_contracts().await;
        }
    };

    let filter = on_request(|rs| request_filter(rs, &contract_validator))
        .on_response(|rs| response_filter(rs, &contract_validator));

    let launched_filter = launcher.launch(filter);

    // join the two async functions, the one that handles the http request and the periodic update_contracts
    let _ = join!(launched_filter, update_contracts);

    Ok(())
}
