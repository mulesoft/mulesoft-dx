#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of validate-versionless-switch skill.
#
# Run the Upgrade-to-Versionless switch validator over a Mule project, headlessly.
# This is the same VersionlessValidator the ACB "Upgrade to Versionless" wizard runs
# (all seven compatibility axes, including the Scala DataWeave parser), invoked outside
# the IDE/LSP. It writes a JSON report and prints a short summary.
#
# Usage:  validate.sh <project-dir> [--out <report.json>] [--dsl-dir <dir>]
#   <project-dir>   project root (the directory containing pom.xml and src/main/mule)
#   --out           report path (default: <project-dir>/report.json)
#   --dsl-dir       connector descriptor dir, <name>/dsl.json (default: bundled dsl/)
#
# Exit codes mirror the CLI: 0 switchable, 3 blockers present, 1 fail-closed
# (capability manifest unavailable), 2 usage error.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="${SKILL_DIR}/lib"
DSL_DIR="${SKILL_DIR}/dsl"

if [ "$#" -eq 0 ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  echo "usage: validate.sh <project-dir> [--out <report.json>] [--dsl-dir <dir>]" >&2
  exit 2
fi

PROJECT_DIR="$1"; shift
OUT=""
EXTRA_ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out|--dsl-dir)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: $1 requires a value" >&2
        exit 2
      fi
      case "$1" in
        --out)     OUT="$2" ;;
        --dsl-dir) DSL_DIR="$2" ;;
      esac
      shift 2 ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -d "${PROJECT_DIR}" ]; then
  echo "ERROR: project dir not found: ${PROJECT_DIR}" >&2
  exit 2
fi
if [ ! -d "${PROJECT_DIR}/src/main/mule" ]; then
  echo "ERROR: ${PROJECT_DIR} has no src/main/mule — not a Mule 4 app root." >&2
  exit 2
fi

# Locate a JDK 17+ java. Prefer JAVA_HOME, then common install roots, then PATH.
# (On some corp machines the PATH `java` is a wrapper stub, so PATH is tried last.)
java_major() {
  "$1" -version 2>&1 | awk -F'"' '/version/{print $2}' | awk -F. '{print ($1=="1")?$2:$1}' | head -1
}
JAVA_BIN=""
CANDIDATES=()
[ -n "${JAVA_HOME:-}" ] && CANDIDATES+=("${JAVA_HOME}/bin/java")
CANDIDATES+=(
  "/opt/homebrew/opt/openjdk@17/bin/java"
  "/usr/local/opt/openjdk@17/bin/java"
  "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java"
  "/usr/lib/jvm/java-17-openjdk/bin/java"
  "/usr/lib/jvm/temurin-17-jdk/bin/java"
)
if command -v java >/dev/null 2>&1; then
  CANDIDATES+=("$(command -v java)")
fi
for c in "${CANDIDATES[@]}"; do
  if [ -x "${c}" ]; then
    major="$(java_major "${c}" || true)"
    if [ -n "${major}" ] && [ "${major}" -ge 17 ] 2>/dev/null; then
      JAVA_BIN="${c}"
      break
    fi
  fi
done
if [ -z "${JAVA_BIN}" ]; then
  echo "ERROR: no JDK 17+ found. Set JAVA_HOME to a JDK 17 install, or install one" >&2
  echo "       (macOS: 'brew install openjdk@17'; Linux: a temurin/openjdk 17 package)." >&2
  exit 1
fi

if [ ! -f "${LIB}/versionless-validator-cli.jar" ]; then
  echo "ERROR: bundled CLI jar missing at ${LIB}/versionless-validator-cli.jar — skill is incomplete." >&2
  exit 1
fi

# Literal lib/* — the JVM expands the classpath wildcard, so it must NOT be shell-globbed.
CP="${LIB}/*"

# The plugin jar bundles a log4j2.xml whose File appender writes to
# ${sys:mule.dx.logs.dir}/mule-dx-platform.log. Unset, log4j takes the property
# name literally and creates a "${sys:mule.dx.logs.dir}" directory in the CALLER's
# CWD. Point it at a temp dir so the (empty) log lands out of the user's project.
LOGS_DIR="${TMPDIR:-/tmp}/mule-dx-switch-logs"
mkdir -p "${LOGS_DIR}" 2>/dev/null || true

CMD=("${JAVA_BIN}" -Dmule.dx.logs.dir="${LOGS_DIR}" -cp "${CP}" VersionlessValidatorCli "${PROJECT_DIR}" --dsl-dir "${DSL_DIR}")
if [ -n "${OUT}" ]; then
  CMD+=(--out "${OUT}")
fi

# The CLI's exit code is the gate (0/3/1); surface it to the caller verbatim.
set +e
"${CMD[@]}"
rc=$?
set -e
exit "${rc}"
