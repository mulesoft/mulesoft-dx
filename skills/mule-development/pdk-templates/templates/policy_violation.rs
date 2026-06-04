// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use anyhow::Result;

use pdk::hl::*;
use pdk::policy_violation::{PolicyViolation, PolicyViolations};

async fn request_filter(request_state: RequestState, policy_violations: &PolicyViolations) {
    let _headers_state = request_state.into_headers_state().await;

    // Read existing policy violation.
    let _violation: Option<PolicyViolation> = policy_violations.policy_violation();

    // Mark the current ongoing request as a policy violation.
    policy_violations.generate_policy_violation();

    // Mark the current ongoing request as a policy violation and associate it with a specific client name, and client id.
    policy_violations.generate_policy_violation_for_client_app("client_name_example", "client_id_example");
}

async fn response_filter(response_state: ResponseState, policy_violations: &PolicyViolations) {
    let _headers_state = response_state.into_headers_state().await;

    // Read existing policy violation.
    let _violation: Option<PolicyViolation> = policy_violations.policy_violation();

    // Mark the current ongoing request as a policy violation.
    policy_violations.generate_policy_violation();

    // Mark the current ongoing request as a policy violation and associate it with a specific client name, and client id.
    policy_violations.generate_policy_violation_for_client_app("client_name_example", "client_id_example");
}



#[entrypoint]
// Inject the PolicyViolations struct which lets us manage policy violations.
async fn configure(launcher: Launcher, policy_violations: PolicyViolations) -> Result<()> {
    let filter = on_request(|rs| request_filter(rs, &policy_violations))
        .on_response(|rs| response_filter(rs, &policy_violations));
    launcher.launch(filter).await?;
    Ok(())
}
