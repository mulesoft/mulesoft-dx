#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of build-mule-integration skill.
#
# Step 16 helper — pre-mvn static validator. Catches the three top
# pre-mvn failure modes before `mvn clean package` is invoked, so the
# agent gets a fast, line-numbered diagnostic instead of a 30s+ Maven
# failure.
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
# Two source-tagged arrays, then a union for catch-position checks. Keeping
# them separate is what lets (a) below reject a connector-JSON entry in a
# RAISE position while still accepting it in a CATCH position.
#
#   locally_declared[]      — valid in BOTH catch and raise positions:
#                             hard-coded MULE:* runtime errors + every
#                             <error:error-type name="NS:ID"/> the app declares.
#   connector_json_types[]  — valid in CATCH positions ONLY:
#                             tmp/connector-errors/*.json .errorTypes[]
#                             (connectors throw these themselves; app code
#                             cannot impersonate them via <raise-error>).
#   allowlist[]             — union of the two; used for catch-position
#                             checks and for nearest-match seeding.
locally_declared=( MULE:ANY MULE:CONNECTIVITY MULE:RETRY_EXHAUSTED MULE:EXPRESSION \
                   MULE:TRANSFORMATION MULE:SECURITY MULE:NOT_PERMITTED \
                   MULE:COMPOSITE_ROUTING MULE:TIMEOUT )
while IFS= read -r local_err; do
    [ -n "$local_err" ] && locally_declared+=( "$local_err" )
done < <(grep -hEo '<error:error-type[^/]*name="[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*"' "${FLOW_FILES[@]}" 2>/dev/null \
            | sed -E 's/.*name="([^"]+)".*/\1/' | sort -u)

connector_json_types=()
if [ -d "$ERR_DIR" ] && compgen -G "$ERR_DIR/*.json" > /dev/null; then
    while IFS= read -r e; do connector_json_types+=( "$e" ); done < <(jq -r '.errorTypes[]?' "$ERR_DIR"/*.json 2>/dev/null | sort -u)
fi

allowlist=( "${locally_declared[@]}" "${connector_json_types[@]+"${connector_json_types[@]}"}" )

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
#
# PRECEDENCE RULE:
#   The two source-tagged arrays built above (locally_declared[] vs
#   connector_json_types[]) drive position-aware acceptance:
#
#     (a) Is the type LOCALLY DECLARED (hard-coded MULE:* OR a flow
#         <error:error-type name="..."/> declaration)? → ACCEPT (catch + raise).
#         For catch positions only, also accept any <raise-error type="..."/>
#         target the app already declares (app_raised_types[]).
#         Notably: connector_json_types[] is NOT consulted here — those are
#         catch-only acceptance, applied via (b) below.
#     (b) Is it a connector namespace AND the type is in that connector's
#         whitelist (tmp/connector-errors/<ns>.json .errorTypes[])? → ACCEPT
#         (catch position only).
#     (c) Is it a <raise-error> with a connector namespace? → REJECT —
#         connectors throw their own errors, app code can't impersonate
#         them via <raise-error type="DB:CONNECTIVITY">.
#     (d) Unknown namespace / unknown ID — REJECT, suggest nearest.
#
# The (a)-then-(b)-then-(c) ordering matters: testing connector-namespace
# rejection before the local-registration check would reject a flow that
# intentionally declared <error:error-type name="DB:CUSTOM_ERROR"/>.
#
# Collect all error types declared via <raise-error type="NS:ID"> across the app.
# These are "app-registered" types that are valid in on-error-propagate/continue.
app_raised_types=()
while IFS= read -r rtype; do
    [ -n "$rtype" ] && app_raised_types+=( "$rtype" )
done < <(grep -hoE '<raise-error[^>]*type="[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*"' "${FLOW_FILES[@]}" 2>/dev/null \
            | sed -E 's/.*type="([^"]+)".*/\1/' | sort -u)

# All D violations are collected into a single ordered list, then the FIRST
# (lowest iteration index, i.e. earliest source-file occurrence) is emitted.
# Collecting first lets the nearest-match python3 lookup batch into a single
# fork/exec instead of one per miss.
#
# Each parallel array entry holds one violation:
#   d_kinds[i]    — "connector-raise" | "invented-mule" | "invented-ns" | "miss"
#   d_files[i]    — flow file
#   d_lines[i]    — line number
#   d_nsids[i]    — the offending NS:ID
#   d_ns_pools[i] — comma-joined same-namespace allowlist entries (only for "miss")
d_kinds=()
d_files=()
d_lines=()
d_nsids=()
d_ns_pools=()

while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    file="${hit%%:*}"; rest="${hit#*:}"; lineno="${rest%%:*}"; rest="${rest#*:}"
    nsid="$(printf '%s\n' "$rest" | sed -E 's/.*type="([A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*)".*/\1/' | head -1)"
    ns="${nsid%%:*}"

    is_raise=0
    printf '%s\n' "$rest" | grep -q '<raise-error' && is_raise=1

    # (a) App-registered local types win over everything else — but ONLY local
    # declarations grant raise permission. The (a) clause walks
    # `locally_declared[]` (MULE:* + <error:error-type name="..."/>) for both
    # positions; for CATCH positions it additionally accepts any
    # <raise-error type="..."> target (`app_raised_types[]`). It deliberately
    # does NOT consult `connector_json_types[]` here — those are catch-only and
    # are accepted further down in the (b) namespace-pool check.
    locally_registered=0
    for w in "${locally_declared[@]+"${locally_declared[@]}"}"; do
        [ "$w" = "$nsid" ] && { locally_registered=1; break; }
    done
    if [ "$locally_registered" -eq 0 ] && [ "$is_raise" -eq 0 ]; then
        for rt in "${app_raised_types[@]+"${app_raised_types[@]}"}"; do
            [ "$rt" = "$nsid" ] && { locally_registered=1; break; }
        done
    fi
    if [ "$locally_registered" -eq 1 ]; then
        continue
    fi

    # (b)+(c) Connector-namespace classification — only meaningful AFTER the
    # local-registration check above. D-raise treats connector ns as
    # always-reject (connectors throw their own errors); D-catch falls
    # through to the namespace-pool whitelist test below, which already
    # accepts any NS:ID that appears in tmp/connector-errors/<ns>.json.
    if [ "$is_raise" -eq 1 ]; then
        is_connector_ns=0
        for cns in "${connector_ns[@]+"${connector_ns[@]}"}"; do
            [ "$cns" = "$ns" ] && { is_connector_ns=1; break; }
        done
        if [ "$is_connector_ns" -eq 1 ]; then
            d_kinds+=( "connector-raise" )
            d_files+=( "$file" ); d_lines+=( "$lineno" )
            d_nsids+=( "$nsid" );  d_ns_pools+=( "" )
            continue
        fi
        # <raise-error> with MULE:* — validate against the MULE allowlist below.
        # <raise-error> with any other non-connector namespace — valid (registers the type).
        if [ "$ns" != "MULE" ]; then
            continue
        fi
    fi

    # (d) Final allowlist check + nearest-match suggestion for unknown IDs.
    found=0
    for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "$w" = "$nsid" ] && { found=1; break; }; done
    if [ "$found" -eq 0 ]; then
        ns_pool=()
        for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "${w%%:*}" = "$ns" ] && ns_pool+=( "$w" ); done
        if [ "${#ns_pool[@]}" -eq 0 ]; then
            if [ "$is_raise" -eq 1 ]; then
                d_kinds+=( "invented-mule" )
            else
                d_kinds+=( "invented-ns" )
            fi
            d_files+=( "$file" ); d_lines+=( "$lineno" )
            d_nsids+=( "$nsid" );  d_ns_pools+=( "" )
        else
            d_kinds+=( "miss" )
            d_files+=( "$file" ); d_lines+=( "$lineno" )
            d_nsids+=( "$nsid" )
            d_ns_pools+=( "$(printf '%s\n' "${ns_pool[@]}" | paste -sd, -)" )
        fi
    fi
done < <(grep -HnE 'type="[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*"' "${FLOW_FILES[@]}" 2>/dev/null || true)

if [ "${#d_kinds[@]}" -gt 0 ]; then
    # Resolve nearest-match suggestions for ALL "miss" violations in a SINGLE
    # Python invocation. The batched form is unconditional even when only
    # the first violation is reported, because the cost is one fork either way.
    miss_keys=()
    for i in "${!d_kinds[@]}"; do
        [ "${d_kinds[$i]}" = "miss" ] && miss_keys+=( "${d_nsids[$i]}" )
    done
    # Parallel arrays (not associative — bash 3.2 on macOS lacks `declare -A`).
    _sugg_keys=()
    _sugg_vals=()
    if [ "${#miss_keys[@]}" -gt 0 ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        SUGGEST_PY="$SCRIPT_DIR/_suggest_nearest.py"
        # Resolve a Python 3 interpreter. `python3` is the canonical name on
        # Linux/macOS/WSL/Git-Bash; bare `python` is the fallback for stock
        # Python.org installs on Windows (where `python3.exe` may not exist).
        # `python` is only accepted if it actually reports major version >= 3
        # — older systems still alias `python` to Python 2, which would fail
        # _suggest_nearest.py's f-strings and type hints.
        PY=""
        if command -v python3 >/dev/null 2>&1; then
            PY="python3"
        elif command -v python >/dev/null 2>&1 && python -c 'import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)' >/dev/null 2>&1; then
            PY="python"
        fi
        if [ -f "$SUGGEST_PY" ] && [ -n "$PY" ]; then
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                _sugg_keys+=( "${line%% -> *}" )
                _sugg_vals+=( "${line#* -> }" )
            done < <(printf '%s\n' "${allowlist[@]+"${allowlist[@]}"}" \
                        | "$PY" "$SUGGEST_PY" "${miss_keys[@]}" 2>/dev/null || true)
        fi
        # No Python 3 on PATH: suggestion field will be empty in the [D]
        # message below. The whitelist enumeration is still printed, so the
        # diagnostic remains actionable.
    fi
    _lookup_suggestion() {
        local _t="$1" _i
        for _i in "${!_sugg_keys[@]}"; do
            [ "${_sugg_keys[$_i]}" = "$_t" ] && { printf '%s' "${_sugg_vals[$_i]}"; return; }
        done
        printf ''
    }

    # Emit ONLY the first violation. Fix and re-run.
    kind="${d_kinds[0]}"
    file="${d_files[0]}"
    lineno="${d_lines[0]}"
    nsid="${d_nsids[0]}"
    ns="${nsid%%:*}"
    case "$kind" in
        connector-raise)
            mule_pool=()
            for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "${w%%:*}" = "MULE" ] && mule_pool+=( "$w" ); done
            mule_list="$(printf '%s\n' "${mule_pool[@]+"${mule_pool[@]}"}" | paste -sd, -)"
            echo "[D] $file:$lineno — <raise-error> cannot throw connector error type '$nsid' (the '$ns' namespace belongs to the connector). Use a MULE:* or custom (e.g. APP:*) error instead. Allowed MULE errors: [$mule_list]" >&2
            ;;
        invented-mule)
            mule_pool=()
            for w in "${allowlist[@]+"${allowlist[@]}"}"; do [ "${w%%:*}" = "MULE" ] && mule_pool+=( "$w" ); done
            mule_list="$(printf '%s\n' "${mule_pool[@]+"${mule_pool[@]}"}" | paste -sd, -)"
            echo "[D] $file:$lineno — invented MULE error type '$nsid'. Allowed MULE errors: [$mule_list]" >&2
            ;;
        invented-ns)
            echo "[D] $file:$lineno — error type '$nsid' uses namespace '$ns' but no '$ns:*' entries exist in tmp/connector-errors/ and no <raise-error type=\"$nsid\"> was found in the app. Either add a matching <raise-error>, run describe_connector.sh for the '$ns' connector, or use a known error type." >&2
            ;;
        miss)
            ns_list="${d_ns_pools[0]}"
            suggestion="$(_lookup_suggestion "$nsid")"
            echo "[D] $file:$lineno — invented error type '$nsid'. Did you mean '$suggestion'? Whitelist for $ns: [$ns_list]" >&2
            ;;
    esac
    exit 1
fi

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
    while IFS=$'\t' read -r lineno block; do
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
    done < <(awk '/xsi:schemaLocation="/{ s=NR; b=""; sub(/.*xsi:schemaLocation="/,"") }
         s && /"/{ sub(/".*/,""); print s "\t" b " " $0; s=0; next }
         s{ b = b " " $0 }' "$f")
done

echo "✅ validate_before_build: all checks passed for $PROJECT_DIR"
exit 0
