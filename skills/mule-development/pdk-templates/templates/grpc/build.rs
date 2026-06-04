// Copyright 2023 Salesforce, Inc. All rights reserved.

fn main() {
    protobuf_codegen::Codegen::new()
        .pure()
        .includes(["proto"])
        .input("proto/example.proto")
        .cargo_out_dir("protos")
        .run_from_script();
}
