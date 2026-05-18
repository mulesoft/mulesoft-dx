#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of build-mule-integration skill.
#
# Step 16 helper — pre-mvn static validator. Catches the three top
# pre-mvn failure modes (Cluster D + Cluster A2-A5) before
# `mvn clean package` is invoked, so the agent gets a fast,
# line-numbered diagnostic instead of a 30s+ Maven failure.
#
# Three checks, executed in order; first failure exits 1:
#
#   [D]      Error-type whitelist. Every NS:ID used in
#            <on-error-propagate type="...">, <on-error-continue type="...">,
#            or <raise-error type="..."> in src/main/mule/*.xml MUST appear
#            in the union of tmp/connector-errors/*.json .errorTypes[]
#            (or be locally declared via <error:error-type name="..."/>).
#            Custom namespaces (APP:*, CUSTOM:*) are always valid in both
#            throw and catch positions. Connector namespaces can be caught
#            but not thrown via <raise-error>. Falls back to a hardcoded
#            MULE:* set when no error JSON is present. Suggests the nearest
#            whitelist member on miss.
#   [A]      Namespace ↔ dependency parity. Every xmlns:X declared
#            (excluding doc, xsi, mule, ee) MUST have a matching
#            <dependency> in pom.xml whose <artifactId> contains the
#            prefix as a token.
#   [A-XSD]  Canonical XSD URL shape. xsi:schemaLocation pairs MUST
#            use mule-<prefix>.xsd (with the documented exceptions for
#            mule.xsd → core and mule-ee.xsd → ee/core).
#
# Usage:
#   scripts/validate_before_build.sh [<project-dir>]
#
# <project-dir> defaults to the current directory. Reads pom.xml,
# src/main/mule/*.xml, and tmp/connector-errors/*.json relative to it.
#
# Exit codes:
#   0  all three checks pass; safe to invoke `mvn clean package`
#   1  first violation reported on stderr (fix and re-run)
set -euo pipefail

PROJECT_DIR="${1:-.}"
POM_FILE="$PROJECT_DIR/pom.xml"
FLOW_DIR="$PROJECT_DIR/src/main/mule"

# All other scripts (describe_connector.sh, pick_connector.sh, etc.) write
# tmp/ artifacts relative to the agent's CWD (workspace root). The agent
# invokes this validator from that same CWD with a project subdir argument,
# so resolving tmp/connector-errors against CWD finds the same files every
# other script wrote.
ERR_DIR="tmp/connector-errors"

if [ ! -d "$FLOW_DIR" ]; then
    echo "❌ no flow directory at $FLOW_DIR" >&2
    exit 1
fi

shopt -s nullglob
FLOW_FILES=( "$FLOW_DIR"/*.xml )
shopt -u nullglob
if [ "${#FLOW_FILES[@]}" -eq 0 ]; then
    echo "✅ no flow XML in $FLOW_DIR — nothing to validate" >&2
    exit 0
fi

# ----- Build error-type allowlist -----
# MULE:* runtime errors are always valid regardless of which connectors are present.
allowlist=( MULE:ANY MULE:CONNECTIVITY MULE:RETRY_EXHAUSTED MULE:EXPRESSION \
            MULE:TRANSFORMATION MULE:SECURITY MULE:NOT_PERMITTED \
            MULE:COMPOSITE_ROUTING MULE:TIMEOUT )
if [ -d "$ERR_DIR" ] && compgen -G "$ERR_DIR/*.json" > /dev/null; then
    while IFS= read -r e; do allowlist+=( "$e" ); done < <(jq -r '.errorTypes[]?' "$ERR_DIR"/*.json 2>/dev/null | sort -u)
fi
# Fold in locally declared <error:error-type name="NS:ID"/>.
while IFS= read -r local_err; do
    [ -n "$local_err" ] && allowlist+=( "$local_err" )
done < <(grep -hEo '<error:error-type[^/]*name="[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*"' "${FLOW_FILES[@]}" 2>/dev/null \
            | sed -E 's/.*name="([^"]+)".*/\1/' | sort -u)

# Build connector-namespace set. <raise-error> can only throw MULE:* or
# custom namespaces — connector namespaces (EC2, SFTP, …) are catch-only.
# Two sources, merged:
#   1) non-MULE namespaces from tmp/connector-errors/*.json (authoritative)
#   2) uppercased xmlns: prefixes from flow XMLs (fallback when error JSONs
#      are missing; excludes doc, xsi, mule, ee which are framework prefixes)
connector_ns=()
_add_cns() {
    local cns="$1" already=0 existing
    for existing in "${connector_ns[@]+"${connector_ns[@]}"}"; do [ "$existing" = "$cns" ] && { already=1; break; }; done
    if [ "$already" -eq 0 ]; then connector_ns+=( "$cns" ); fi
}
for w in "${allowlist[@]}"; do
    cns="${w%%:*}"
    case "$cns" in MULE) continue ;; esac
    _add_cns "$cns"
done
while IFS= read -r prefix; do
    [ -z "$prefix" ] && continue
    case "$prefix" in doc|xsi|mule|ee) continue ;; esac
    _add_cns "$(printf '%s' "$prefix" | tr '[:lower:]' '[:upper:]')"
done < <(grep -hoE 'xmlns:[a-zA-Z][a-zA-Z0-9_-]*=' "${FLOW_FILES[@]}" 2>/dev/null \
            | sed -E 's/xmlns:([^=]+)=/\1/' | sort -u)

# ----- Check D: error-type whitelist -----
# Collect all error types declared via <raise-error type="NS:ID"> across the app.
# These are "app-registered" types that are valid in on-error-propagate/continue.
app_raised_types=()
while IFS= read -r rtype; do
    [ -n "$rtype" ] && app_raised_types+=( "$rtype" )
done < <(grep -hoE '<raise-error[^>]*type="[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*"' "${FLOW_FILES[@]}" 2>/dev/null \
            | sed -E 's/.*type="([^"]+)".*/\1/' | sort -u)

while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    file="${hit%%:*}"; rest="${hit#*:}"; lineno="${rest%%:*}"; rest="${rest#*:}"
    nsid="$(printf '%s\n' "$rest" | sed -E 's/.*type="([A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*)".*/\1/' | head -1)"
    ns="${nsid%%:*}"

    is_raise=0
    printf '%s\n' "$rest" | grep -q '<raise-error' && is_raise=1

    # D-raise: <raise-error> can use any namespace EXCEPT connector namespaces.
    # Connector errors are thrown by the connector itself — app code cannot throw them.
    if [ "$is_raise" -eq 1 ]; then
        is_connector_ns=0
        for cns in "${connector_ns[@]+"${connector_ns[@]}"}"; do
            [ "$cns" = "$ns" ] && { is_connector_ns=1; break; }
        done
        if [ "$is_connector_ns" -eq 1 ]; then
            mule_pool=()
            for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "${w%%:*}" = "MULE" ] && mule_pool+=( "$w" ); done
            mule_list="$(printf '%s\n' "${mule_pool[@]+"${mule_pool[@]}"}" | paste -sd, -)"
            echo "[D] $file:$lineno — <raise-error> cannot throw connector error type '$nsid' (the '$ns' namespace belongs to the connector). Use a MULE:* or custom (e.g. APP:*) error instead. Allowed MULE errors: [$mule_list]" >&2
            exit 1
        fi
        # <raise-error> with MULE:* — validate against the MULE allowlist below.
        # <raise-error> with any other non-connector namespace — valid (registers the type).
        if [ "$ns" != "MULE" ]; then
            continue
        fi
    fi

    # D-catch: <on-error-propagate/continue> — the error type must exist in either:
    #   (a) the connector/MULE allowlist, OR
    #   (b) app-registered types (declared via <raise-error> somewhere in this app)
    # Check (b) first — if this type is registered by a raise-error, it's valid.
    if [ "$is_raise" -eq 0 ]; then
        raised_found=0
        for rt in "${app_raised_types[@]+"${app_raised_types[@]}"}"; do
            [ "$rt" = "$nsid" ] && { raised_found=1; break; }
        done
        if [ "$raised_found" -eq 1 ]; then
            continue
        fi
    fi

    # Check against the connector/MULE allowlist.
    found=0
    for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "$w" = "$nsid" ] && { found=1; break; }; done
    if [ "$found" -eq 0 ]; then
        ns_pool=()
        for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "${w%%:*}" = "$ns" ] && ns_pool+=( "$w" ); done
        if [ "${#ns_pool[@]}" -eq 0 ]; then
            # No entries for this namespace in the error catalog and not app-registered.
            if [ "$is_raise" -eq 1 ]; then
                # MULE:* type that doesn't exist.
                mule_pool=()
                for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "${w%%:*}" = "MULE" ] && mule_pool+=( "$w" ); done
                mule_list="$(printf '%s\n' "${mule_pool[@]+"${mule_pool[@]}"}" | paste -sd, -)"
                echo "[D] $file:$lineno — invented MULE error type '$nsid'. Allowed MULE errors: [$mule_list]" >&2
            else
                echo "[D] $file:$lineno — error type '$nsid' uses namespace '$ns' but no '$ns:*' entries exist in tmp/connector-errors/ and no <raise-error type=\"$nsid\"> was found in the app. Either add a matching <raise-error>, run describe_connector.sh for the '$ns' connector, or use a known error type." >&2
            fi
            exit 1
        fi
        suggestion="$(python3 -c 'import sys; t=sys.argv[1]; cs=sys.argv[2:]; print(min(cs, key=lambda c: sum(1 for a,b in zip(t,c) if a!=b)+abs(len(t)-len(c))) if cs else "")' "$nsid" "${ns_pool[@]}")"
        ns_list="$(printf '%s\n' "${ns_pool[@]}" | paste -sd, -)"
        echo "[D] $file:$lineno — invented error type '$nsid'. Did you mean '$suggestion'? Whitelist for $ns: [$ns_list]" >&2
        exit 1
    fi
done < <(grep -HnE 'type="[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*"' "${FLOW_FILES[@]}" 2>/dev/null || true)

# ----- Check A: xmlns ↔ dependency parity -----
if [ ! -f "$POM_FILE" ]; then
    echo "[A] $PROJECT_DIR/pom.xml — missing pom.xml; cannot verify namespace parity" >&2
    exit 1
fi
artifact_ids="$(grep -oE '<artifactId>[^<]+</artifactId>' "$POM_FILE" 2>/dev/null | sed -E 's#</?artifactId>##g' || true)"
while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    file="${hit%%:*}"; rest="${hit#*:}"; lineno="${rest%%:*}"; rest="${rest#*:}"
    prefix="$(printf '%s\n' "$rest" | sed -E 's/.*xmlns:([a-zA-Z][a-zA-Z0-9_-]*)=.*/\1/' | head -1)"
    case "$prefix" in doc|xsi|mule|ee) continue ;; esac
    if ! printf '%s\n' "$artifact_ids" | grep -qE "(^|[^a-zA-Z0-9])${prefix}([^a-zA-Z0-9]|$)"; then
        echo "[A] $file:$lineno — orphan xmlns:$prefix — no matching <dependency> in pom.xml. Either remove the namespace declaration or run get_latest_connector.sh + pick_connector.sh + commit_connectors.sh." >&2
        exit 1
    fi
done < <(grep -HnE 'xmlns:[a-zA-Z][a-zA-Z0-9_-]*="' "${FLOW_FILES[@]}" 2>/dev/null || true)

# ----- Check A-XSD: canonical XSD URL shape -----
for f in "${FLOW_FILES[@]}"; do
    awk '/xsi:schemaLocation="/{ s=NR; b=""; sub(/.*xsi:schemaLocation="/,"") }
         s && /"/{ sub(/".*/,""); print s "\t" b " " $0; s=0; next }
         s{ b = b " " $0 }' "$f" \
    | while IFS=$'\t' read -r lineno block; do
        # shellcheck disable=SC2086
        set -- $block
        while [ $# -ge 2 ]; do
            uri="$1"; xsd="$2"; shift 2
            case "$uri" in
                */schema/mule/core)    expected_tail="mule.xsd" ;;
                */schema/mule/ee/core) expected_tail="mule-ee.xsd" ;;
                */schema/mule/*)       expected_tail="mule-${uri##*/schema/mule/}.xsd" ;;
                *) continue ;;
            esac
            actual_tail="${xsd##*/}"
            if [ "$actual_tail" != "$expected_tail" ]; then
                expected_url="${xsd%/*}/$expected_tail"
                echo "[A-XSD] $f:$lineno — non-canonical XSD URL '$xsd'. Expected '$expected_url'." >&2
                exit 1
            fi
        done
    done
done

echo "✅ validate_before_build: all checks passed for $PROJECT_DIR"
exit 0
