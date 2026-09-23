#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of the update-runtime-binaries skill.
#
# Rebuild the native binaries bundled by the build-run-versionless-app skill
# (descriptor-gen, mule-ast, mule-server) from a local mule-versionless checkout,
# swap them in, and verify the whole build+run loop end-to-end — offline, in one
# self-contained run with no manual steps.
#
# The rule (see this skill's SKILL.md — "The build rule"):
#   mule-ast   (crate cli)                 <- origin/master
#   mule-server(crate mule_server)         <- origin/master
#   descriptor-gen (crate mule_descriptor_gen) <- origin/feat/versionless-descriptor-generation
#     (never merged to master; changes rarely — reused unless --with-descriptor-gen
#      or it is missing for this platform). If descriptor-gen ever lands on master
#      the split is gone and all three build from master; this script detects that.
#   connectors/lib<crate>.{dylib,so} (e.g. mule_connector_http) <- origin/master
#     (same ref as mule-server so the extension ABI matches; installed under
#      bin/<os>-<arch>/connectors/, where the runtime dlopens them at deploy time.)
#
# Usage:
#   update-binaries.sh --mule-repo <path> --skill <path> [options]
#
#   --mule-repo <path>      Path to a mule-versionless git checkout (required).
#   --skill <path>          Path to the build-run-versionless-app skill inside the
#                           SOURCE skills repo checkout — the version-controlled copy
#                           whose bin/ is committed (required, no default). This is
#                           NOT the installed ~/.claude/skills copy; that one is
#                           refreshed by the user separately. An installed-copy path
#                           is refused unless --allow-installed-skill is given.
#   --allow-installed-skill Permit --skill to point at an installed ~/.claude copy
#                           (escape hatch; normally you want the source repo).
#   --with-descriptor-gen   Rebuild descriptor-gen too (default: reuse the bundled
#                           one unless it is absent for this platform).
#   --no-fetch              Skip `git fetch origin` before building.
#   --no-verify             Skip the end-to-end verification run.
#   -h, --help              Show this help.
set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MULE_REPO=""
SKILL_DIR=""
WITH_DG=0
DO_FETCH=1
DO_VERIFY=1
ALLOW_INSTALLED=0

# No auto-default for --skill: the target is the build-run-versionless-app copy in the
# SOURCE skills repo (its committed bin/), which the caller must name explicitly.
# Defaulting to the sibling would silently write the installed ~/.claude copy instead.

usage() {
  cat >&2 <<'EOF'
Usage: update-binaries.sh --mule-repo <path> --skill <path> [options]

  --mule-repo <path>      Path to a mule-versionless git checkout (required).
  --skill <path>          build-run-versionless-app in the SOURCE skills repo checkout
                          — the version-controlled copy whose bin/ is committed
                          (required, no default). NOT the installed ~/.claude/skills
                          copy; an installed-copy path is refused unless
                          --allow-installed-skill is given.
  --allow-installed-skill Permit --skill to point at an installed ~/.claude copy.
  --with-descriptor-gen   Rebuild descriptor-gen too (default: reuse the bundled one
                          unless it is missing for this platform).
  --no-fetch              Skip `git fetch origin` before building.
  --no-verify             Skip the end-to-end verification run.
  -h, --help              Show this help.
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --mule-repo)          MULE_REPO="${2:?--mule-repo needs a path}"; shift 2 ;;
    --skill)              SKILL_DIR="${2:?--skill needs a path}"; shift 2 ;;
    --allow-installed-skill) ALLOW_INSTALLED=1; shift ;;
    --with-descriptor-gen) WITH_DG=1; shift ;;
    --no-fetch)           DO_FETCH=0; shift ;;
    --no-verify)          DO_VERIFY=0; shift ;;
    -h|--help)            usage; exit 0 ;;
    *)                    die "unknown argument: $1 (try --help)" ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate inputs
# ---------------------------------------------------------------------------
command -v cargo >/dev/null 2>&1 || die "cargo not found on PATH — install the Rust toolchain."
command -v git   >/dev/null 2>&1 || die "git not found on PATH."

[ -n "${MULE_REPO}" ] || die "missing --mule-repo <path to a mule-versionless checkout>."
[ -d "${MULE_REPO}" ] || die "--mule-repo path does not exist: ${MULE_REPO}"
MULE_REPO="$(cd "${MULE_REPO}" && pwd)"
git -C "${MULE_REPO}" rev-parse --git-dir >/dev/null 2>&1 || die "--mule-repo is not a git repository: ${MULE_REPO}"

[ -n "${SKILL_DIR}" ] || die "missing --skill <path to build-run-versionless-app in the SOURCE skills repo> (there is no default; do not point at the installed ~/.claude/skills copy)."
[ -d "${SKILL_DIR}" ] || die "--skill path does not exist: ${SKILL_DIR}"
SKILL_DIR="$(cd "${SKILL_DIR}" && pwd)"
[ -x "${SKILL_DIR}/scripts/setup.sh" ] || die "--skill dir has no scripts/setup.sh — is this build-run-versionless-app? (${SKILL_DIR})"

# Guard: refuse an installed ~/.claude copy. The binaries must be updated in the
# version-controlled source repo so they can be committed; the installed copy is
# refreshed by the user separately. Override with --allow-installed-skill.
case "${SKILL_DIR}" in
  */.claude/skills/*|*/.claude/plugins/*)
    [ "${ALLOW_INSTALLED}" = 1 ] || die "--skill points at an installed copy under ~/.claude (${SKILL_DIR}). Point at the build-run-versionless-app dir in the SOURCE skills repo checkout instead, or pass --allow-installed-skill to override."
    echo "==> WARNING: updating an installed ~/.claude copy (--allow-installed-skill)." >&2
    ;;
esac

# Detect host os/arch — same normalization the bundled scripts use.
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"; case "${ARCH}" in arm64|aarch64) ARCH="arm64";; x86_64|amd64) ARCH="x86_64";; esac
BIN="${SKILL_DIR}/bin/${OS}-${ARCH}"
CONN_BIN="${BIN}/connectors"
mkdir -p "${BIN}" "${CONN_BIN}"

# Runtime connector libraries the skill bundles, built as cdylibs FROM THE SAME REF
# as mule-server so their extension ABI matches (a mismatch makes the server skip the
# library and deploy fails with "connectors not installed on this host"). One crate per
# connector the runtime must serve. The shared-library name is lib<crate>.<ext>.
CONNECTOR_CRATES=(mule_connector_http)
case "${OS}" in darwin) LIB_EXT="dylib";; *) LIB_EXT="so";; esac

echo "==> mule-versionless : ${MULE_REPO}"
echo "==> target skill bin : ${BIN}"

# ---------------------------------------------------------------------------
# Temp workspace + cleanup (worktrees are always removed, even on failure)
# ---------------------------------------------------------------------------
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/mv-binupdate-XXXXXX")"
WORKTREES=()
VERIFY_STARTED=0
VERIFY_CTRL_PORT="${VERIFY_CONTROL_PORT:-19090}"
VERIFY_APP_PORT_="${VERIFY_APP_PORT:-18081}"

cleanup() {
  local rc=$?
  # Stop the verification server if we started it.
  if [ "${VERIFY_STARTED}" = 1 ]; then
    MULE_CONTROL_PORT="${VERIFY_CTRL_PORT}" MULE_APP_PORT="${VERIFY_APP_PORT_}" \
      "${SKILL_DIR}/scripts/deploy-run.sh" stop >/dev/null 2>&1 || true
  fi
  # Detach any worktrees we created, then prune the registry.
  local wt
  for wt in "${WORKTREES[@]:-}"; do
    [ -n "${wt}" ] && git -C "${MULE_REPO}" worktree remove "${wt}" --force >/dev/null 2>&1 || true
  done
  git -C "${MULE_REPO}" worktree prune >/dev/null 2>&1 || true
  rm -rf "${TMP_ROOT}" 2>/dev/null || true
  exit "${rc}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Decide what to build from where
# ---------------------------------------------------------------------------
if [ "${DO_FETCH}" = 1 ]; then
  echo "==> git fetch origin"
  git -C "${MULE_REPO}" fetch origin --quiet
fi

git -C "${MULE_REPO}" rev-parse --verify --quiet origin/master >/dev/null \
  || die "origin/master not found in ${MULE_REPO} — fetch it first (or drop --no-fetch)."

DG_BRANCH="feat/versionless-descriptor-generation"
SPLIT_GONE=0
if git -C "${MULE_REPO}" ls-tree -r --name-only origin/master | grep -q 'descriptor-gen'; then
  SPLIT_GONE=1
  echo "==> NOTE: descriptor-gen is now on origin/master — the branch split is gone."
  echo "         Building all three from master; simplify this skill (drop the feature-branch special case)."
fi

# descriptor-gen: rebuild if explicitly asked, if missing for this platform, or
# if it now lives on master (then it comes for free with the master build).
NEED_DG=0
if [ "${WITH_DG}" = 1 ] || [ ! -x "${BIN}/descriptor-gen" ] || [ "${SPLIT_GONE}" = 1 ]; then
  NEED_DG=1
fi

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
add_worktree() {   # add_worktree <dir> <ref>
  local dir="$1" ref="$2"
  git -C "${MULE_REPO}" rev-parse --verify --quiet "${ref}" >/dev/null \
    || die "ref not found in ${MULE_REPO}: ${ref}"
  echo "==> worktree ${ref} -> ${dir}"
  git -C "${MULE_REPO}" worktree add --detach "${dir}" "${ref}" >/dev/null
  WORKTREES+=("${dir}")
}

WT_MASTER="${TMP_ROOT}/master"
add_worktree "${WT_MASTER}" "origin/master"

MASTER_TARGETS=(-p cli --bin mule-ast -p mule_server --bin mule-server)
if [ "${NEED_DG}" = 1 ] && [ "${SPLIT_GONE}" = 1 ]; then
  MASTER_TARGETS+=(-p mule_descriptor_gen --bin descriptor-gen)
fi

echo "==> cargo build (master): ${MASTER_TARGETS[*]}"
( cd "${WT_MASTER}" && cargo build --offline --release "${MASTER_TARGETS[@]}" )

# Connectors build from the same master worktree (ABI must match mule-server). They
# need their own invocation: a `--bin` target filter above suppresses cdylib targets,
# so mixing the connector packages into that build would silently skip their libraries.
CONNECTOR_TARGETS=()
for crate in "${CONNECTOR_CRATES[@]}"; do CONNECTOR_TARGETS+=(-p "${crate}"); done
echo "==> cargo build (master, connectors): ${CONNECTOR_TARGETS[*]}"
( cd "${WT_MASTER}" && cargo build --offline --release "${CONNECTOR_TARGETS[@]}" )

DG_SRC=""
DG_REF="origin/master"
if [ "${NEED_DG}" = 1 ] && [ "${SPLIT_GONE}" != 1 ]; then
  WT_FEAT="${TMP_ROOT}/descriptor-gen"
  DG_REF="origin/${DG_BRANCH}"
  add_worktree "${WT_FEAT}" "${DG_REF}"
  echo "==> cargo build (${DG_BRANCH}): descriptor-gen"
  ( cd "${WT_FEAT}" && cargo build --offline --release -p mule_descriptor_gen --bin descriptor-gen )
  DG_SRC="${WT_FEAT}/target/release/descriptor-gen"
elif [ "${NEED_DG}" = 1 ] && [ "${SPLIT_GONE}" = 1 ]; then
  DG_SRC="${WT_MASTER}/target/release/descriptor-gen"
fi

# ---------------------------------------------------------------------------
# Back up current binaries, then swap in the freshly built ones
# ---------------------------------------------------------------------------
BACKUP="${TMPDIR:-/tmp}/mv-bin-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP}"
UPDATED=()

install_bin() {   # install_bin <name> <src>
  local name="$1" src="$2"
  [ -f "${src}" ] || die "expected built binary missing: ${src}"
  if [ -f "${BIN}/${name}" ]; then cp -p "${BIN}/${name}" "${BACKUP}/" ; fi
  cp -p "${src}" "${BIN}/${name}"
  chmod +x "${BIN}/${name}"
  UPDATED+=("${name}")
}

install_bin mule-ast    "${WT_MASTER}/target/release/mule-ast"
install_bin mule-server "${WT_MASTER}/target/release/mule-server"
if [ -n "${DG_SRC}" ]; then install_bin descriptor-gen "${DG_SRC}"; fi

# Connector libraries: install into bin/<os>-<arch>/connectors/. Backed up under the
# same timestamped dir (namespaced so a connector never collides with a top-level binary).
install_connector() {   # install_connector <lib-filename> <src>
  local lib="$1" src="$2"
  [ -f "${src}" ] || die "expected connector library missing: ${src}"
  if [ -f "${CONN_BIN}/${lib}" ]; then mkdir -p "${BACKUP}/connectors"; cp -p "${CONN_BIN}/${lib}" "${BACKUP}/connectors/"; fi
  cp -p "${src}" "${CONN_BIN}/${lib}"
  chmod +x "${CONN_BIN}/${lib}"
  UPDATED+=("connectors/${lib}")
}
for crate in "${CONNECTOR_CRATES[@]}"; do
  install_connector "lib${crate}.${LIB_EXT}" "${WT_MASTER}/target/release/lib${crate}.${LIB_EXT}"
done

echo "==> updated: ${UPDATED[*]}   (backup: ${BACKUP})"

# ---------------------------------------------------------------------------
# Provenance — the binaries carry no version string, so record the source
# ---------------------------------------------------------------------------
git_line() { # git_line <ref>  ->  "<short>  (<subject>)"
  local ref="$1"
  printf '%s  (%s)' \
    "$(git -C "${MULE_REPO}" rev-parse --short "${ref}")" \
    "$(git -C "${MULE_REPO}" log -1 --format='%s' "${ref}")"
}
MASTER_LINE="$(git_line origin/master)"
NOW="$(date +%Y-%m-%d)"

{
  echo "Bundled native binaries — ${OS}-${ARCH}"
  echo "(binaries carry no version string; this file records their source)"
  echo
  echo "mule-ast"
  echo "  repo:    mule-versionless"
  echo "  branch:  master"
  echo "  commit:  ${MASTER_LINE}"
  echo "  crate:   cli  --bin mule-ast"
  echo "  built:   ${NOW} (cargo build --offline --release)"
  echo
  echo "mule-server"
  echo "  repo:    mule-versionless"
  echo "  branch:  master"
  echo "  commit:  ${MASTER_LINE}"
  echo "  crate:   mule_server  --bin mule-server"
  echo "  built:   ${NOW} (cargo build --offline --release)"
  echo
  echo "descriptor-gen"
  echo "  repo:    mule-versionless"
  if [ -n "${DG_SRC}" ]; then
    echo "  branch:  ${DG_REF#origin/}"
    echo "  commit:  $(git_line "${DG_REF}")"
    echo "  crate:   mule_descriptor_gen  --bin descriptor-gen"
    echo "  built:   ${NOW} (cargo build --offline --release)"
  else
    echo "  branch:  ${DG_BRANCH}  (never merged to master)"
    echo "  crate:   mule_descriptor_gen  --bin descriptor-gen"
    echo "  built:   reused — NOT rebuilt this run (it changes rarely)."
    echo "           origin/${DG_BRANCH} is currently $(git_line "origin/${DG_BRANCH}"),"
    echo "           but the bundled artifact may predate that."
  fi
  echo
  echo "connectors/  (runtime connector libraries, dlopened by mule-server)"
  echo "  branch:  master  (built from the same ref as mule-server so the ABI matches)"
  echo "  commit:  ${MASTER_LINE}"
  echo "  built:   ${NOW} (cargo build --offline --release)"
  for crate in "${CONNECTOR_CRATES[@]}"; do
    echo "  - lib${crate}.${LIB_EXT}   (crate ${crate})"
  done
  echo
  echo "Recorded by update-runtime-binaries on ${NOW}."
} > "${BIN}/PROVENANCE.txt"
echo "==> wrote ${BIN}/PROVENANCE.txt"

# ---------------------------------------------------------------------------
# Verify end-to-end (setup -> build -> deploy -> run -> undeploy -> stop)
# ---------------------------------------------------------------------------
if [ "${DO_VERIFY}" = 0 ]; then
  echo "==> verification skipped (--no-verify). Binaries swapped in."
  exit 0
fi

restore_backup() {
  echo "==> restoring previous binaries from ${BACKUP}" >&2
  local f
  for f in "${BACKUP}"/*; do
    # The connectors backup is a subdirectory; restore its libraries separately.
    [ "${f}" = "${BACKUP}/connectors" ] && continue
    [ -e "${f}" ] && cp -p "${f}" "${BIN}/"
  done
  chmod +x "${BIN}"/* 2>/dev/null || true
  if [ -d "${BACKUP}/connectors" ]; then
    for f in "${BACKUP}/connectors"/*; do [ -e "${f}" ] && cp -p "${f}" "${CONN_BIN}/" ; done
    chmod +x "${CONN_BIN}"/* 2>/dev/null || true
  fi
}

verify_fail() {
  echo "ERROR: verification failed — ${1}" >&2
  restore_backup
  echo "       previous binaries restored; nothing shipped." >&2
  exit 1
}

echo "==> verifying: setup.sh"
"${SKILL_DIR}/scripts/setup.sh" >/dev/null || verify_fail "setup.sh (binary smoke test) failed"

VAPP="${TMP_ROOT}/verify-app"
cp -R "${SKILL_DIR}/example-app" "${VAPP}"
echo "==> verifying: build.sh (example-app)"
"${SKILL_DIR}/scripts/build.sh" "${VAPP}" >/dev/null || verify_fail "build.sh failed"
JAR="$(ls "${VAPP}"/target/*-mule-application-versionless.jar 2>/dev/null | head -1)"
[ -n "${JAR}" ] || verify_fail "no versionless jar produced"

DEMO_JAR="${TMP_ROOT}/vselftest.jar"
cp "${JAR}" "${DEMO_JAR}"

export MULE_CONTROL_PORT="${VERIFY_CTRL_PORT}" MULE_APP_PORT="${VERIFY_APP_PORT_}"
echo "==> verifying: runtime (control :${VERIFY_CTRL_PORT}  app :${VERIFY_APP_PORT_})"
"${SKILL_DIR}/scripts/deploy-run.sh" start  >/dev/null || verify_fail "mule-server did not start"
VERIFY_STARTED=1
"${SKILL_DIR}/scripts/deploy-run.sh" deploy "${DEMO_JAR}" >/dev/null || verify_fail "deploy failed"
RESP="$("${SKILL_DIR}/scripts/deploy-run.sh" run vselftest/flowtotestpayload '{"msg":"hi"}' 2>/dev/null || true)"
"${SKILL_DIR}/scripts/deploy-run.sh" undeploy vselftest >/dev/null 2>&1 || true

case "${RESP}" in
  *"ready to rock"*) : ;;
  *) verify_fail "flow returned unexpected response: '${RESP}'" ;;
esac

echo
echo "VERIFICATION PASSED ✓"
echo "  setup.sh          : binaries smoke-tested"
echo "  build.sh          : artifact.ast generated, versionless jar built"
echo "  deploy + run flow : ${RESP}"
echo
echo "Updated ${UPDATED[*]} in ${BIN}"
echo "Backup of the previous binaries: ${BACKUP} (safe to delete once you're happy)."
