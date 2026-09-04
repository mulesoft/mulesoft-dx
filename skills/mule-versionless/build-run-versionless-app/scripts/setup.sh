#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of build-run-versionless-app skill.
#
# Install the bundled mule-maven-plugin snapshot into the local ~/.m2 and verify the
# bundled native binaries can run. Idempotent: re-running overwrites the same coordinates.
#
# The versionless build needs mule-maven-plugin:4.11.0-SNAPSHOT, which is published to no
# remote repo (see SKILL.md "Why bundle the plugin"). This copies the bundled jar+pom set
# into the user's repository so `mvn package` resolves it locally.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
M2_REPO="${HOME}/.m2/repository"
PLUGIN_SRC="${SKILL_DIR}/m2-plugin/org/mule/tools/maven"
PLUGIN_DST="${M2_REPO}/org/mule/tools/maven"

echo "==> Installing mule-maven-plugin 4.11.0-SNAPSHOT into ${PLUGIN_DST}"
for module in mule-artifact-tools mule-classloader-model mule-deployer mule-packager mule-maven-plugin; do
  src="${PLUGIN_SRC}/${module}/4.11.0-SNAPSHOT"
  dst="${PLUGIN_DST}/${module}/4.11.0-SNAPSHOT"
  if [ ! -d "${src}" ]; then
    echo "ERROR: bundled artifact missing: ${src}" >&2
    exit 1
  fi
  mkdir -p "${dst}"
  cp "${src}"/*.jar "${dst}/" 2>/dev/null || true   # mule-artifact-tools is pom-only
  cp "${src}"/*.pom "${dst}/"
  echo "    installed ${module}"
done

# Detect the host platform and confirm a matching binary set is bundled.
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "${arch}" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x86_64" ;;
esac
BIN_DIR="${SKILL_DIR}/bin/${os}-${arch}"

echo "==> Verifying native binaries for ${os}-${arch}"
if [ ! -d "${BIN_DIR}" ]; then
  echo "ERROR: no bundled binaries for this platform (${os}-${arch})." >&2
  echo "       Bundled platforms: $(cd "${SKILL_DIR}/bin" && ls -1 | tr '\n' ' ')" >&2
  echo "       Rebuild from the mule-versionless repo (see SKILL.md 'Unsupported platform')." >&2
  exit 1
fi
for bin in descriptor-gen mule-ast mule-server; do
  if [ ! -x "${BIN_DIR}/${bin}" ]; then
    echo "ERROR: missing or non-executable binary: ${BIN_DIR}/${bin}" >&2
    exit 1
  fi
done
# descriptor-gen core needs no input — the cheapest end-to-end proof a binary runs on this host.
smoke="$(mktemp -d)"
trap 'rm -rf "${smoke}"' EXIT
if ! "${BIN_DIR}/descriptor-gen" core --out-dir "${smoke}" >/dev/null 2>&1; then
  echo "ERROR: '${BIN_DIR}/descriptor-gen' failed to run on this host." >&2
  echo "       Likely an OS/arch mismatch — rebuild per SKILL.md 'Unsupported platform'." >&2
  exit 1
fi

echo "==> Checking toolchain"
command -v mvn  >/dev/null 2>&1 || { echo "ERROR: mvn not found on PATH (need Maven 3.8+)." >&2; exit 1; }
command -v java >/dev/null 2>&1 || { echo "ERROR: java not found on PATH (need JDK 17)." >&2; exit 1; }

echo ""
echo "Setup complete. Binaries: ${BIN_DIR}"
echo "Next: scripts/build.sh <project-dir>"
