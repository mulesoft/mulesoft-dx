#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of build-run-versionless-app skill.
#
# Drive the bundled mule-server runtime: start it, deploy a packaged jar, invoke a flow,
# list, or undeploy. The server reads only META-INF/mule-artifact/artifact.ast from the jar.
#
# Subcommands:
#   start                         start mule-server in the background (control :9090, app :8081)
#   stop                          stop a mule-server started by `start`
#   deploy <jar> [name]           POST /apps {"name": <name>, "path": <abs jar>} — registers one route per flow.
#                                 <name> defaults to the jar's file stem, sanitized to A-Za-z0-9._-
#   run <path> [body]             POST http://:8081/<path> with an optional JSON body and the
#                                 x-muleversionless-appname header ($MULE_APP_NAME, or the only deployed app)
#   list                          GET /apps
#   undeploy <app>                DELETE /apps/<app>
#
# Env: MULE_CONTROL_PORT (9090), MULE_APP_PORT (8081) are honored by both this script and the server.
#      MULE_APP_NAME — app name sent in the x-muleversionless-appname header by `run`. Set it when more
#      than one app is deployed; otherwise `run` uses the only deployed app.
#      MULE_CONNECTOR_DIR — where the runtime dlopens connector libraries from. If unset, this
#      script points the server at the skill's bundled bin/<os>-<arch>/connectors/ so a versionless
#      app that declares connectors (e.g. http) deploys offline. The runtime's own default is
#      /opt/mule/connectors, which the skill does not populate — hence this override.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"; case "${arch}" in arm64|aarch64) arch="arm64";; x86_64|amd64) arch="x86_64";; esac
BIN_DIR="${SKILL_DIR}/bin/${os}-${arch}"
SERVER="${BIN_DIR}/mule-server"
# The runtime loads connectors as native libraries from this directory at deploy time. Honor a
# caller-provided MULE_CONNECTOR_DIR; otherwise default to the bundled set shipped with the skill.
CONNECTOR_DIR="${MULE_CONNECTOR_DIR:-${BIN_DIR}/connectors}"
CONTROL_PORT="${MULE_CONTROL_PORT:-9090}"
APP_PORT="${MULE_APP_PORT:-8081}"
CONTROL="http://127.0.0.1:${CONTROL_PORT}"
PIDFILE="${TMPDIR:-/tmp}/mule-server-${CONTROL_PORT}.pid"
LOGFILE="${TMPDIR:-/tmp}/mule-server-${CONTROL_PORT}.log"

APP_NAME_HEADER="x-muleversionless-appname"

# The runtime accepts 1-128 characters of A-Za-z0-9._- and rejects "." and "..".
app_name_of() {
  local name
  name="$(basename "$1")"; name="${name%.jar}"
  name="$(printf '%s' "${name}" | LC_ALL=C tr -c 'A-Za-z0-9._-' '-' | cut -c1-128)"
  case "${name}" in ""|"."|"..") name="app";; esac
  printf '%s' "${name}"
}

# The app a `run` request is for: $MULE_APP_NAME, else the only deployed app.
run_app_name() {
  [ -z "${MULE_APP_NAME:-}" ] || { printf '%s' "${MULE_APP_NAME}"; return; }
  local names
  names="$(curl -fsS "${CONTROL}/apps" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)"
  if [ "$(printf '%s\n' "${names}" | grep -c .)" -ne 1 ]; then
    echo "ERROR: set MULE_APP_NAME — expected exactly one deployed app, found: ${names:-none}" >&2; return 1
  fi
  printf '%s' "${names}"
}

cmd="${1:-}"; shift || true

case "${cmd}" in
  start)
    if [ -f "${PIDFILE}" ] && kill -0 "$(cat "${PIDFILE}")" 2>/dev/null; then
      echo "mule-server already running (pid $(cat "${PIDFILE}"))."; exit 0
    fi
    [ -x "${SERVER}" ] || { echo "ERROR: ${SERVER} missing — run scripts/setup.sh first." >&2; exit 1; }
    MULE_CONTROL_PORT="${CONTROL_PORT}" MULE_APP_PORT="${APP_PORT}" MULE_CONNECTOR_DIR="${CONNECTOR_DIR}" \
      "${SERVER}" >"${LOGFILE}" 2>&1 &
    echo $! > "${PIDFILE}"
    # Poll /health rather than sleep — the server binds in well under a second, but be robust.
    for _ in $(seq 1 20); do
      if curl -fsS "${CONTROL}/health" >/dev/null 2>&1; then
        echo "mule-server up (pid $(cat "${PIDFILE}"))  control :${CONTROL_PORT}  app :${APP_PORT}"
        echo "connectors: ${CONNECTOR_DIR}"
        echo "log: ${LOGFILE}"; exit 0
      fi
      sleep 0.25
    done
    echo "ERROR: mule-server did not become healthy; see ${LOGFILE}" >&2
    cat "${LOGFILE}" >&2; exit 1
    ;;
  stop)
    if [ -f "${PIDFILE}" ]; then
      kill "$(cat "${PIDFILE}")" 2>/dev/null || true; rm -f "${PIDFILE}"; echo "stopped."
    else
      echo "no pidfile; nothing to stop."
    fi
    ;;
  deploy)
    jar="$(cd "$(dirname "${1:?usage: deploy <jar> [name]}")" && pwd)/$(basename "${1}")"
    name="${2:-$(app_name_of "${jar}")}"
    curl -fsS -XPOST "${CONTROL}/apps" -H 'content-type: application/json' \
      -d "{\"name\":\"${name}\",\"path\":\"${jar}\"}"
    echo
    ;;
  run)
    route="${1:?usage: run <path> [body]}"; body="${2:-{\}}"
    route="${route#/}"
    app="$(run_app_name)"
    curl -fsS -XPOST "http://127.0.0.1:${APP_PORT}/${route}" \
      -H "${APP_NAME_HEADER}: ${app}" \
      -H 'content-type: application/json' -d "${body}"
    echo
    ;;
  list)
    curl -fsS "${CONTROL}/apps"; echo
    ;;
  undeploy)
    curl -fsS -XDELETE "${CONTROL}/apps/${1:?usage: undeploy <app>}"; echo
    ;;
  *)
    echo "usage: deploy-run.sh {start|stop|deploy <jar> [name]|run <path> [body]|list|undeploy <app>}" >&2
    exit 1
    ;;
esac
