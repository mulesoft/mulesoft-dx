#!/usr/bin/env bash
#
# Copyright (c) 2026, Salesforce, Inc.
# All rights reserved.
# For full license text, see the LICENSE.txt file
#
# Part of mule-dev skill
#
# Step 3 helper — search Exchange for MuleSoft connector candidates and
# print the ranked list to stdout. No pin file is written; no "winner"
# is named. The agent reads the list and decides: a single row is obvious,
# multiple rows of genuinely different system families are still usually
# obvious, but variant families (slack vs mule4-slack, ftp vs ftps, mq vs
# jms, db drivers) need the user's intent — the agent must escalate with
# AskUserQuestion instead of guessing.
#
# Usage:
#   scripts/get_latest_connector.sh <search-term> [<nickname>]
#
# Stdout (one line per candidate, ranked best-guess-first, no score, no emoji):
#   <groupId>:<assetId>:<version>
#   ...
#
# Exit code:
#   0  ≥1 candidate found — ranked list printed on stdout
#   1  no candidates / CLI error — error surfaced on stderr
#
# Why no auto-pin: v7 wrote the top-1 GAV to disk before the agent had
# a chance to compare candidates. In ambiguous variant families the agent
# accepted the pin silently 86% of the time (based on 535 lookups across
# the pt1/pt2/pt3 eval runs). Removing the winner signal — pin file, ✅
# banner, "score" number — forces the agent to actually read the list.
# When the list has >1 row the shape of the output is itself the ambiguity
# signal. The pick is committed later via pick_connector.sh, and all picks
# are promoted to tmp/connector-versions/ by commit_connectors.sh after
# the user approves the Technical Design Summary.
#
# Selection rules (unchanged from v7; used only for internal ranking):
#   - Only Mule 4 SDK extensions (type=="extension"). Mule 3 type=="connector"
#     assets, templates, examples, and rest-apis are excluded — they can't be
#     used as dependencies in a Mule 4 `dx project create` project.
#   - No groupId allowlist. Any groupId whose asset is type=="extension" is
#     admissible. Ranking keeps first-party connectors on top:
#       Tier 0: com.mulesoft.connectors (premium)
#       Tier 1: org.mule.connectors (community)
#       Tier 2: anything else (org.mule.examples, com.mule.modules, ...)
#   - Candidates scored by token overlap with the search term:
#       _score = 2 * exact_hits + 1 * substring_hits − unmatched_asset_tokens
#     Score is used for ordering only and is never emitted.
#   - Two pages fetched in parallel (offset 0 and offset 200) to surface
#     candidates that would otherwise fall off a single 200-row page.
set -euo pipefail

SEARCH_TERM="${1:-}"
NICKNAME="${2:-$SEARCH_TERM}"

if [ -z "$SEARCH_TERM" ]; then
    echo "Usage: $0 <search-term> [<nickname>]" >&2
    echo "  e.g. $0 mule-salesforce-connector sfdc" >&2
    exit 1
fi

# `exchange asset list` interprets --environment as a business-unit name
# (Sandbox, Production, ...). In some automation contexts ANYPOINT_ENV is
# set to a deployment short-name (e.g., "test1") which the CLI does not
# recognize. Exchange search is org-scoped, so unset it for this call only.
TMPDIR_="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_"' EXIT

# Fetch two pages in parallel. Page A (offset 0) is authoritative — if it
# fails we bail out. Page B (offset 200) is additive — if it fails, log a
# warning and proceed with Page A alone.
(env -u ANYPOINT_ENV anypoint-cli-v4 exchange asset list \
        "$SEARCH_TERM" --limit 200 --offset 0 --output json >"$TMPDIR_/page-a.json" 2>&1) &
(env -u ANYPOINT_ENV anypoint-cli-v4 exchange asset list \
        "$SEARCH_TERM" --limit 200 --offset 200 --output json >"$TMPDIR_/page-b.json" 2>&1) &
wait

if ! jq -e 'type == "array"' "$TMPDIR_/page-a.json" >/dev/null 2>&1; then
    echo "exchange asset list failed for '$SEARCH_TERM' (page 1):" >&2
    cat "$TMPDIR_/page-a.json" >&2
    exit 1
fi

if ! jq -e 'type == "array"' "$TMPDIR_/page-b.json" >/dev/null 2>&1; then
    echo "exchange asset list page 2 failed for '$SEARCH_TERM' — proceeding with page 1 only." >&2
    echo "[]" >"$TMPDIR_/page-b.json"
fi

RANKED=$(jq -s --arg search "$SEARCH_TERM" '
  (.[0] + .[1]) as $all |

  ($search | ascii_downcase | split("-") | map(select(. != "" and . != "mule" and . != "connector"))) as $search_tokens |

  [$all[] | select(.type == "extension")] |

  group_by([.groupId, .assetId]) |
  map({
    groupId: .[0].groupId,
    assetId: .[0].assetId,
    version: (sort_by([.version | split(".") | map(tonumber? // 0)]) | reverse | .[0].version),
    asset_tokens: (.[0].assetId | ascii_downcase | split("-") | map(select(. != "" and . != "mule" and . != "connector"))),
  }) |

  map(. as $c |
    ($c.asset_tokens | map(
      . as $t |
      if ($search_tokens | index($t)) then {kind: "exact", token: $t}
      elif (($t | length) >= 2) and (
             any($search_tokens[]; . as $s | ($s | length) >= 2 and (index($t) != null or ($t | index($s)) != null))
           ) then {kind: "substring", token: $t}
      else {kind: "none", token: $t}
      end
    )) as $cls |
    ($cls | map(select(.kind == "exact")) | length) as $exact |
    ($cls | map(select(.kind == "substring")) | length) as $substr |
    ($cls | map(select(.kind == "none")) | length) as $unmatched |
    $c + {
      _score: (2 * $exact + $substr - $unmatched),
      _group_pref: (
        if .groupId == "com.mulesoft.connectors" then 0
        elif .groupId == "org.mule.connectors" then 1
        else 2
        end
      ),
    }
  ) |

  sort_by([-._score, ._group_pref, (.assetId | length)])
' "$TMPDIR_/page-a.json" "$TMPDIR_/page-b.json")

COUNT=$(printf '%s' "$RANKED" | jq 'length')
if [ "$COUNT" = "0" ]; then
    echo "No Mule 4 extension matches '$SEARCH_TERM' on Exchange." >&2
    echo "Searched all groupIds; no asset of type=extension was returned." >&2
    exit 1
fi

# Ranked list to stdout, one GAV per line. No score, no emoji, no winner cue.
# A single row → the agent acknowledges it and picks. Multiple rows → the
# agent must reason about which matches the user's intent, and escalate
# to AskUserQuestion if the answer isn't obvious from the names alone.
printf '%s' "$RANKED" | jq -r '.[] | "\(.groupId):\(.assetId):\(.version)"'
