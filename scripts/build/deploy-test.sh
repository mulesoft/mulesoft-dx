#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load secrets
source "$SCRIPT_DIR/secrets.txt"

# Environment
export BRANCH_NAME="${BRANCH_NAME:-$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)}"
export GIT_COMMIT="${GIT_COMMIT:-$(git -C "$REPO_ROOT" rev-parse --short HEAD)}"
export AKAMAI_HOST="564243.ftp.upload.akamai.com"
export AKAMAI_USERNAME="API_Portal_Team"

# Build
echo "=== Generating portal (${BRANCH_NAME}: ${GIT_COMMIT}) ==="
make -C "$REPO_ROOT" generate-portal \
  BUILD_LABEL="${BRANCH_NAME}: ${GIT_COMMIT}" \
  BASE_URL=https://test-dev-portal.mulesoft.com

# Deploy
echo "=== Deploying to TEST | Host=${AKAMAI_HOST} User=${AKAMAI_USERNAME} ==="
lftp -u "${AKAMAI_USERNAME},${AKAMAI_PASSWORD}" "ftp://${AKAMAI_HOST}" -e \
  "set ftp:ssl-allow no; mirror -R --overwrite --no-perms --verbose portal/ /564243/api-portal.mulesoft.com/test; quit"

echo "=== Done ==="
