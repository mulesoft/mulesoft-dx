#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of validate-versionless-switch skill.
#
# Refresh the bundled connector descriptors (dsl/<name>/dsl.json) the switch
# validator reads, by GENERATING them from each connector's extension-model.json
# via the versionless descriptor-gen CLI — instead of hand-copying go-runtime's
# dsl.json. This is the skill's refresh-time analogue of what the Maven packager
# (ConnectorSchemaResolver) does at build time. It is NOT on the validate path:
# validate.sh stays offline and binary-free; this runs only when refreshing.
#
# descriptor-gen reproduces http/twilio/mule-core byte-for-byte, so those three
# flip from `cp` to generated under an exact parity gate. salesforce is a known
# exception (see below) and stays a go-runtime copy.
#
# Usage: scripts/regen-dsl.sh [--check] [--descriptor-gen <path>] [--go <go-runtime-dir>]
#   --check             generate into a temp dir and diff against the committed
#                       dsl/ WITHOUT writing — exits non-zero on unexpected drift.
#                       Use this as a gate; omit it to actually refresh dsl/.
#   --descriptor-gen    path to the descriptor-gen binary (default: resolve the
#                       sibling build-run-versionless-app skill's bin/<os>-<arch>/,
#                       else `descriptor-gen` on PATH).
#   --go                go-runtime checkout (default: ../../../../go-runtime relative
#                       to this skill, i.e. the workspace sibling). Supplies the
#                       extension-model.json inputs and the salesforce golden.
#
# Exit codes: 0 clean (or refreshed), 1 unexpected drift / parity failure,
# 2 usage or missing-input error.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSL_DIR="${SKILL_DIR}/dsl"

# Connectors whose dsl.json descriptor-gen reproduces byte-for-byte from
# extension-model.json. Verified identical on 2026-10-22; the parity gate below
# re-proves it on every run, so a future divergence fails loudly rather than
# silently shipping a wrong descriptor.
GENERATED_CONNECTORS=(http twilio)

# mule-core is generated too, but via `descriptor-gen core` (model baked into the
# binary) rather than `generate --extension-model`, so it is handled separately.

# salesforce is DELIBERATELY excluded from generation. descriptor-gen hyphenizes
# the operation element names (describeSObject -> describe-s-object,
# getUserInfo -> get-user-info), but the flow axis resolves an app's XML elements
# by exactly that elementName, and the connector's own XSD + go golden use the
# camelCase form. The element name is not stored in the extension model, so
# hyphenize cannot recover it — generating salesforce would introduce a flow-axis
# false-negative on those two ops. Until descriptor-gen carries the element name,
# salesforce stays a verbatim go-runtime copy. (docs/OPEN-ITEMS.md O8.)
COPIED_CONNECTORS=(salesforce)

CHECK=0
DESCRIPTOR_GEN=""
GO_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --descriptor-gen) DESCRIPTOR_GEN="${2:?--descriptor-gen needs a path}"; shift 2 ;;
    --go) GO_DIR="${2:?--go needs a path}"; shift 2 ;;
    -h|--help) sed -n '9,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# Resolve descriptor-gen: explicit flag wins; else the sibling skill's per-os/arch
# binary (same bin/<os>-<arch>/ layout build-run-versionless-app uses); else PATH.
if [ -z "${DESCRIPTOR_GEN}" ]; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"; case "${arch}" in arm64|aarch64) arch="arm64";; x86_64|amd64) arch="x86_64";; esac
  sibling="${SKILL_DIR}/../build-run-versionless-app/bin/${os}-${arch}/descriptor-gen"
  if [ -x "${sibling}" ]; then
    DESCRIPTOR_GEN="${sibling}"
  elif command -v descriptor-gen >/dev/null 2>&1; then
    DESCRIPTOR_GEN="descriptor-gen"
  else
    echo "ERROR: descriptor-gen not found. Pass --descriptor-gen <path>, or install the" >&2
    echo "       sibling build-run-versionless-app skill's bin/${os}-${arch}/descriptor-gen." >&2
    exit 2
  fi
fi

# Resolve go-runtime (extension-model.json inputs + salesforce golden).
if [ -z "${GO_DIR}" ]; then
  GO_DIR="$(cd "${SKILL_DIR}/../../../.." && pwd)/go-runtime"
fi
if [ ! -d "${GO_DIR}/connectors" ]; then
  echo "ERROR: no go-runtime connectors at ${GO_DIR}/connectors. Pass --go <go-runtime-dir>." >&2
  exit 2
fi

echo "==> descriptor-gen: ${DESCRIPTOR_GEN}"
echo "==> go-runtime:     ${GO_DIR}"
[ "${CHECK}" -eq 1 ] && echo "==> mode: CHECK (parity gate, no writes)" || echo "==> mode: REFRESH (writes dsl/)"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/regen-dsl.XXXXXX")"
trap 'rm -rf "${STAGE}"' EXIT

# Generate each connector into the staging dir, then compare / promote.
for n in "${GENERATED_CONNECTORS[@]}"; do
  em="${GO_DIR}/connectors/${n}/descriptor/extension-model.json"
  [ -f "${em}" ] || { echo "ERROR: missing ${em}" >&2; exit 2; }
  mkdir -p "${STAGE}/${n}"
  "${DESCRIPTOR_GEN}" generate --extension-model "${em}" --out-dir "${STAGE}/${n}"
done
mkdir -p "${STAGE}/mule-core"
"${DESCRIPTOR_GEN}" core --out-dir "${STAGE}/mule-core"

# Compare each generated connector against its committed golden. In --check this is
# a GATE (drift fails the run); in refresh it is informational — refresh's job is to
# adopt whatever descriptor-gen now produces, and the git diff is the review surface.
drift=0
for n in "${GENERATED_CONNECTORS[@]}" mule-core; do
  gen="${STAGE}/${n}/dsl.json"
  gold="${DSL_DIR}/${n}/dsl.json"
  if diff -q "${gen}" "${gold}" >/dev/null 2>&1; then
    echo "    ${n}: parity OK"
  else
    echo "    ${n}: CHANGED — generated dsl.json differs from committed dsl/${n}/dsl.json"
    # `|| true`: diff exits non-zero here (files differ) and head closes the pipe;
    # under `set -o pipefail` that would abort before drift=1.
    diff "${gold}" "${gen}" | head -40 || true
    drift=1
  fi
done

if [ "${CHECK}" -eq 1 ]; then
  if [ "${drift}" -ne 0 ]; then
    echo "ERROR: descriptor-gen output drifted from the committed descriptors above." >&2
    echo "       For http/twilio/mule-core this should be byte-identical, so drift means" >&2
    echo "       either a real upstream descriptor change (re-run without --check to adopt," >&2
    echo "       then review the git diff) or a descriptor-gen regression (investigate)." >&2
    exit 1
  fi
  echo "==> parity gate passed: generated descriptors match committed dsl/."
  exit 0
fi

# REFRESH: promote generated descriptors into dsl/, and cp the quarantined ones.
# Promotion is connector-by-connector; a cp failure mid-loop (disk/permissions)
# leaves dsl/ half-updated — a filesystem failure, visible in the truncated run
# output, reviewed via git diff before commit, not a silent wrong descriptor.
for n in "${GENERATED_CONNECTORS[@]}" mule-core; do
  mkdir -p "${DSL_DIR}/${n}"
  cp "${STAGE}/${n}/dsl.json" "${DSL_DIR}/${n}/dsl.json"
  echo "    ${n}: refreshed from descriptor-gen"
done
for n in "${COPIED_CONNECTORS[@]}"; do
  src="${GO_DIR}/connectors/${n}/descriptor/dsl.json"
  [ -f "${src}" ] || { echo "ERROR: missing salesforce golden ${src}" >&2; exit 2; }
  mkdir -p "${DSL_DIR}/${n}"
  cp "${src}" "${DSL_DIR}/${n}/dsl.json"
  echo "    ${n}: copied from go-runtime (descriptor-gen hyphenize known-diff; see header)"
done
echo "==> dsl/ refreshed."
