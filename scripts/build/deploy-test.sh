#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load secrets (must define AKAMAI_HOST, AKAMAI_USER, AKAMAI_PASS, AKAMAI_BASE_PATH)
source "$SCRIPT_DIR/secrets.txt"

# Environment
export BRANCH_NAME="${BRANCH_NAME:-$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)}"
export GIT_COMMIT="${GIT_COMMIT:-$(git -C "$REPO_ROOT" rev-parse --short HEAD)}"

: "${AKAMAI_HOST:?AKAMAI_HOST is required}"
: "${AKAMAI_USER:?AKAMAI_USER is required}"
: "${AKAMAI_PASS:?AKAMAI_PASS is required}"
: "${AKAMAI_BASE_PATH:?AKAMAI_BASE_PATH is required}"

# Build
echo "=== Generating portal (${BRANCH_NAME}: ${GIT_COMMIT}) ==="
make -C "$REPO_ROOT" generate-portal \
  BUILD_LABEL="${BRANCH_NAME}: ${GIT_COMMIT}" \
  BASE_URL=https://test-dev-portal.mulesoft.com

# Deploy
echo "=== Deploying to TEST ==="
lftp -u "${AKAMAI_USER},${AKAMAI_PASS}" "ftp://${AKAMAI_HOST}" -e \
  "set ftp:ssl-allow no; mirror -R --overwrite --no-perms --verbose portal/ ${AKAMAI_BASE_PATH}/test; quit"

echo "=== Done ==="
