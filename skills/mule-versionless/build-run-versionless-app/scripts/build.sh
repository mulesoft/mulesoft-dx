#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of build-run-versionless-app skill.
#
# Package a versionless Mule app: `mvn package` drives the bundled descriptor-gen +
# mule-ast binaries and the bundled connector exchange stub, producing a
# *-mule-application-versionless.jar with META-INF/mule-artifact/artifact.ast inside.
#
# Usage: scripts/build.sh <project-dir>
#   <project-dir>  a versionless Mule app root (pom.xml with
#                  <packaging>mule-application-versionless</packaging>). Defaults to CWD.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(cd "${1:-$PWD}" && pwd)"

if [ ! -f "${PROJECT_DIR}/pom.xml" ]; then
  echo "ERROR: no pom.xml in ${PROJECT_DIR} — not a Mule project root." >&2
  exit 1
fi

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"; case "${arch}" in arm64|aarch64) arch="arm64";; x86_64|amd64) arch="x86_64";; esac
BIN_DIR="${SKILL_DIR}/bin/${os}-${arch}"
EXCHANGE="${SKILL_DIR}/exchange-stub"

for bin in descriptor-gen mule-ast; do
  [ -x "${BIN_DIR}/${bin}" ] || { echo "ERROR: ${BIN_DIR}/${bin} missing — run scripts/setup.sh first." >&2; exit 1; }
done

echo "==> Packaging ${PROJECT_DIR}"
echo "    binaries:     ${BIN_DIR}"
echo "    exchange stub: file://${EXCHANGE}"

# The plugin resolves the two build-time CLIs by absolute path (-D) and fetches connector
# extension-model.json from the bundled file:// exchange stub — no PATH mutation, no network.
( cd "${PROJECT_DIR}" && mvn clean package \
    -DdescriptorGenBinary="${BIN_DIR}/descriptor-gen" \
    -DmuleAstBinary="${BIN_DIR}/mule-ast" \
    -DconnectorExchangeBase="file://${EXCHANGE}" )

JAR="$(ls -1 "${PROJECT_DIR}"/target/*-mule-application-versionless.jar 2>/dev/null | head -1 || true)"
if [ -z "${JAR}" ]; then
  echo "ERROR: build finished but no *-mule-application-versionless.jar in target/." >&2
  echo "       Confirm the pom's packaging is mule-application-versionless." >&2
  exit 1
fi

echo ""
echo "Built: ${JAR}"
# Capture the listing first: piping unzip straight into `grep -q` lets grep close the
# pipe on the first match, and under `set -o pipefail` unzip's SIGPIPE fails the check.
listing="$(unzip -l "${JAR}")"
if printf '%s\n' "${listing}" | grep -q 'META-INF/mule-artifact/artifact.ast'; then
  echo "       contains META-INF/mule-artifact/artifact.ast  ✓"
else
  echo "WARNING: artifact.ast NOT found in the jar — deploy will fail." >&2
fi
