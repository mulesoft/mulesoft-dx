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
#   deploy <jar>                  POST /apps {"path": <abs jar>} — registers one route per flow
#   run <app>/<flow> [body]       POST http://:8081/<app>/<flow> with an optional JSON body
#   list                          GET /apps
#   undeploy <app>                DELETE /apps/<app>
#
# Env: MULE_CONTROL_PORT (9090), MULE_APP_PORT (8081) are honored by both this script and the server.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"; case "${arch}" in arm64|aarch64) arch="arm64";; x86_64|amd64) arch="x86_64";; esac
SERVER="${SKILL_DIR}/bin/${os}-${arch}/mule-server"
CONTROL_PORT="${MULE_CONTROL_PORT:-9090}"
APP_PORT="${MULE_APP_PORT:-8081}"
CONTROL="http://127.0.0.1:${CONTROL_PORT}"
PIDFILE="${TMPDIR:-/tmp}/mule-server-${CONTROL_PORT}.pid"
LOGFILE="${TMPDIR:-/tmp}/mule-server-${CONTROL_PORT}.log"

cmd="${1:-}"; shift || true

case "${cmd}" in
  start)
    if [ -f "${PIDFILE}" ] && kill -0 "$(cat "${PIDFILE}")" 2>/dev/null; then
      echo "mule-server already running (pid $(cat "${PIDFILE}"))."; exit 0
    fi
    [ -x "${SERVER}" ] || { echo "ERROR: ${SERVER} missing — run scripts/setup.sh first." >&2; exit 1; }
    MULE_CONTROL_PORT="${CONTROL_PORT}" MULE_APP_PORT="${APP_PORT}" "${SERVER}" >"${LOGFILE}" 2>&1 &
    echo $! > "${PIDFILE}"
    # Poll /health rather than sleep — the server binds in well under a second, but be robust.
    for _ in $(seq 1 20); do
      if curl -fsS "${CONTROL}/health" >/dev/null 2>&1; then
        echo "mule-server up (pid $(cat "${PIDFILE}"))  control :${CONTROL_PORT}  app :${APP_PORT}"
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
    jar="$(cd "$(dirname "${1:?usage: deploy <jar>}")" && pwd)/$(basename "${1}")"
    curl -fsS -XPOST "${CONTROL}/apps" -H 'content-type: application/json' \
      -d "{\"path\":\"${jar}\"}"
    echo
    ;;
  run)
    route="${1:?usage: run <app>/<flow> [body]}"; body="${2:-{\}}"
    curl -fsS -XPOST "http://127.0.0.1:${APP_PORT}/${route}" \
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
    echo "usage: deploy-run.sh {start|stop|deploy <jar>|run <app>/<flow> [body]|list|undeploy <app>}" >&2
    exit 1
    ;;
esac
