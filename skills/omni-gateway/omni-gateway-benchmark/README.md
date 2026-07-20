# Flex Gateway Performance Benchmark

POC harness for benchmarking Flex Gateway on EKS. See
[architecture doc](references/ARCHITECTURE.md).

## Quick start

    cp .env.example .env
    make push-upstream   # one-time: build & push the upstream image to ECR
    make benchmark       # full run

## Targets

Run `make help`.
