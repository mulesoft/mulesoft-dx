#!/usr/bin/env bash
# Read-only preflight: verify every CLI, daemon, credential, and one-time
# artifact the benchmark harness needs before any `make` target runs.
#
# Exits 0 if everything is green, 1 otherwise. Prints one line per check in
# the form "ok      <name>" or "MISSING <name> — <remediation>" so callers
# (humans or agents) can grep for failures.
#
# Never installs software, edits .env, or touches AWS resources. Safe to
# run anytime.
set -uo pipefail

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
usage: preflight.sh

Read-only check of every CLI, daemon, credential, and one-time artifact the
benchmark harness needs. Prints "ok" / "MISSING <name> — <remediation>" per
check; exits 0 if all green, 1 otherwise.

Never installs software, edits .env, or touches AWS resources. Reads .env (if
present) for AWS_REGION / POLICIES / CLIENT_* so it can validate them.

Takes no arguments.
EOF
    exit 0 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

# Load .env if present so AWS_REGION / POLICIES / CLIENT_* are visible to
# the policy-credential and region checks below. Don't fail the whole run
# if .env is absent — that's one of the things this script reports.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

fail=0
ok()      { printf "ok      %s\n" "$1"; }
miss()    { printf "MISSING %s — %s\n" "$1" "$2"; fail=1; }

# --- 1. Required CLIs ------------------------------------------------------
required=(terraform kubectl helm aws docker flexctl curl jq python3 envsubst sha256sum shellcheck)
for c in "${required[@]}"; do
  if command -v "$c" >/dev/null 2>&1; then
    ok "$c ($(command -v "$c"))"
  else
    case "$c" in
      flexctl)    miss "$c" "see omni-gateway-install skill or https://docs.mulesoft.com/gateway/flex-gateway-install-flexctl" ;;
      shellcheck) miss "$c" "brew install shellcheck (macOS) / apt install shellcheck (Debian)" ;;
      envsubst)   miss "$c" "brew install gettext && brew link --force gettext (macOS) / apt install gettext-base (Debian)" ;;
      sha256sum)  miss "$c" "macOS: brew install coreutils (provides gsha256sum); on coreutils-only systems alias sha256sum=gsha256sum" ;;
      *)          miss "$c" "install $c via your package manager" ;;
    esac
  fi
done

# --- 2. Docker engine + daemon liveness -----------------------------------
if command -v docker >/dev/null 2>&1; then
  if docker buildx version >/dev/null 2>&1; then
    ok "docker buildx"
  else
    miss "docker buildx" "Docker Desktop ≥ 19.03 ships buildx; on Linux: docker buildx install"
  fi

  client_v=$(docker version --format '{{.Client.Version}}' 2>/dev/null || true)
  server_v=$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)
  if [ -n "$client_v" ] && [ -n "$server_v" ]; then
    ok "docker engine (client=$client_v, server=$server_v)"
  elif [ -n "$client_v" ]; then
    miss "docker daemon" "client=$client_v but daemon unreachable — start Docker Desktop / colima start / sudo systemctl start docker"
  else
    miss "docker engine" "docker CLI not functional"
  fi

  if docker info >/dev/null 2>&1; then
    ok "docker daemon responsive"
  else
    miss "docker info" "daemon down or wrong context — try: docker context ls && docker context use <name>"
  fi
fi

# --- 3. AWS identity, region, profile -------------------------------------
if command -v aws >/dev/null 2>&1; then
  if aws_id=$(aws sts get-caller-identity 2>/dev/null); then
    arn=$(printf '%s' "$aws_id" | jq -r '.Arn'    2>/dev/null || echo "?")
    acc=$(printf '%s' "$aws_id" | jq -r '.Account' 2>/dev/null || echo "?")
    ok "aws identity ($acc, $arn)"
  else
    miss "aws auth" "aws sts get-caller-identity failed — run: aws sso login --profile \${AWS_PROFILE:-default}"
  fi

  echo "info    AWS_PROFILE=${AWS_PROFILE:-<unset, default profile>}"
  if [ -n "${AWS_REGION:-}" ]; then
    ok "AWS_REGION=$AWS_REGION"
  else
    miss "AWS_REGION" "set in .env or export AWS_REGION=<region> (Makefile passes it to terraform)"
  fi
fi

# --- 4. Required files ----------------------------------------------------
if [ -f "$ROOT/.env" ]; then
  ok ".env present"
else
  miss ".env"        "cp .env.example .env (then edit scenario knobs)"
fi

if [ -f "$ROOT/.run/registration/registration.yaml" ]; then
  ok "flex registration artifact"
else
  miss "registration" "run: make prepare-registration   (or invoke prepare-benchmark-registration skill)"
fi

# --- 5. Policy credentials, only when client-id-enforcement is in play ----
if [ -f "$ROOT/.env" ] && grep -qE '^POLICIES=.*client-id-enforcement' "$ROOT/.env"; then
  if [ -n "${CLIENT_ID:-}" ];     then ok "CLIENT_ID set";     else miss "CLIENT_ID"     "POLICIES contains client-id-enforcement — run: make prepare-registration"; fi
  if [ -n "${CLIENT_SECRET:-}" ]; then ok "CLIENT_SECRET set"; else miss "CLIENT_SECRET" "POLICIES contains client-id-enforcement — run: make prepare-registration"; fi
fi

# --- 6. Connectivity to flex-packages (Helm chart source) ----------------
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -o /dev/null -m 10 https://flex-packages.anypoint.mulesoft.com/helm/index.yaml; then
    ok "flex-packages.anypoint.mulesoft.com reachable"
  else
    miss "flex-packages connectivity" "egress to flex-packages.anypoint.mulesoft.com blocked — check VPN / firewall"
  fi
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "preflight: all checks passed — safe to run \`make up\` or \`make benchmark\`."
else
  echo "preflight: at least one check failed — fix the MISSING items above before running the harness."
fi
exit "$fail"
