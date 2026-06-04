// Copyright 2023 Salesforce, Inc. All rights reserved.
mod generated;

use std::cell::RefCell;
use anyhow::Result;

use pdk::hl::*;

async fn request_filter(request_state: RequestState, example_variable: &RefCell<Vec<String>>) {
    let _headers_state = request_state.into_headers_state().await;

    // We use borrow to read the variable.
    let _size: usize = example_variable.borrow().len();

    // We use borrow_mut to write the variable.
    example_variable.borrow_mut()
        .push("example-value".to_string());

}

async fn response_filter(response_state: ResponseState, example_variable: &RefCell<Vec<String>>) {
    let _headers_state = response_state.into_headers_state().await;

    // We use borrow to read the variable.
    let _size: usize = example_variable.borrow().len();

    // We use borrow_mut to write the variable.
    example_variable.borrow_mut()
        .push("example-value".to_string());

}

#[entrypoint]
async fn configure(launcher: Launcher) -> Result<()> {

    // We create a variable in the configuration context and use it to keep track of internal status across all the requests.
    // Since each worker is single threaded we can borrow variables without locking mechanisms as long as the borrow is returned before an await operation.
    let example_variable: RefCell<Vec<String>> = RefCell::new(vec![]);

    let filter = on_request(|rs| request_filter(rs, &example_variable))
        .on_response(|rs| response_filter(rs, &example_variable));
    launcher.launch(filter).await?;
    Ok(())
}
