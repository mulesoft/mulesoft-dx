#!/usr/bin/env bash
# Build the upstream echo image for the cluster node arch and push it to the
# ECR repository created by `make up`. Driven by `make push-upstream`.
set -euo pipefail

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
usage: push-upstream.sh

Build the bench-upstream echo image and push it to ECR.

Reads from .env / environment:
  AWS_REGION          (required)  AWS region of the ECR repository
  CLUSTER_NAME        (required)  cluster name prefix (selects the TF workspace)
  UPSTREAM_TAG        (optional)  image tag to push          (default: latest)
  UPSTREAM_PLATFORM   (optional)  buildx target platform     (default: linux/amd64)

Requires `make up` to have run first (the ECR repo must exist).
EOF
    exit 0 ;;
esac

: "${AWS_REGION:?required}"
: "${CLUSTER_NAME:?required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/assets/terraform"

repo_url="$(terraform output -raw ecr_repository_url)"
registry="$(terraform output -raw ecr_registry)"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$registry"

cd "$ROOT/assets/docker/upstream"
tag="${UPSTREAM_TAG:-latest}"
# EKS nodes are amd64; building on an arm64 host (Apple Silicon) without
# --platform produces an arm64-only image that fails on the cluster with
# "no match for platform in manifest". buildx targets the node arch and
# pushes in one step. Override UPSTREAM_PLATFORM for arm64 node pools.
platform="${UPSTREAM_PLATFORM:-linux/amd64}"
docker buildx build --platform "$platform" -t "$repo_url:$tag" --push .
echo "Pushed $repo_url:$tag ($platform)"
