#!/usr/bin/env bash
# Part of mule-project-generation skill
#
# Step E2 helper — search Anypoint Exchange for Mule template assets and
# print a ranked, enriched JSON array of candidates to stdout. No file
# is written; the agent reads the list, presents it to the user via
# AskUserQuestion, and then proceeds with create_mule_project using the
# chosen groupId/assetId/version.
#
# Usage:
#   scripts/search_templates.sh <search-term>
#
# Top 10 results are returned (5 private + 5 public, when available; the
# split is filled from whichever side has more matches when the other is
# short).
#
# Stdout (single JSON array, ranked best-guess-first):
#   [
#     {
#       "name":           "Salesforce to Salesforce Contact Bidirectional Sync",
#       "groupId":        "org.mule.templates",
#       "assetId":        "template-sfdc2sfdc-contact-bidirectional-sync",
#       "version":        "2.1.4",
#       "minMuleVersion": "4.1.1",
#       "description":    "Template description (may be empty)",
#       "sourceLocation": "private"
#     },
#     ...
#   ]
#
# Exit code:
#   0  >= 1 candidate found — JSON array on stdout
#   1  no candidates / CLI error — error surfaced on stderr
#
# Strategy:
#   1. Run TWO `exchange asset list` calls in parallel:
#        a) unscoped (returns public templates from org.mule.templates,
#           org.mule.examples, MuleSoft public-portal org, etc.)
#        b) `--organizationId <my-org>` (returns ONLY templates published
#           under the user's organisation — Exchange enforces server-side
#           that any org-published asset has groupId == org_id, so this
#           is the authoritative private-template source).
#      Each row's source determines its `sourceLocation` label — there is
#      no client-side comparison.
#   2. Filter to `type == "template"`, dedup (groupId, assetId) keeping the
#      highest version, rank by token overlap with the search term.
#   3. Cap to top 10 (private rows ranked first within the cap).
#   4. `exchange asset describe <gav>` on the top 10 in parallel — enriches
#      each with description and minMuleVersion (preferring the
#      `min-mule-version` attribute, falling back to `runtimeVersion`).
set -euo pipefail

SEARCH_TERM="${1:-}"
TOP_N=10

if [ -z "$SEARCH_TERM" ]; then
    echo "Usage: $0 <search-term>" >&2
    echo "  e.g. $0 \"salesforce database sync\"" >&2
    exit 1
fi

# Resolve auth-method conflicts. The CLI rejects the call when more than one
# auth method is "active" via env vars — e.g. when ANYPOINT_BEARER is set
# (the path the skill harness uses) but the shell ALSO has ANYPOINT_CLIENT_ID
# / ANYPOINT_CLIENT_SECRET (common in workspaces that ran a Connected-App
# flow earlier). The error looks like: "--client_id=... cannot also be
# provided when using --bearer". We strip the client-cred vars whenever a
# bearer is present so the harness's auth choice wins. We also always strip
# ANYPOINT_ENV — the CLI rejects the value "prod" that some shells inject
# even though it's the documented default.
CLI_ENV_FILTER=(env -u ANYPOINT_ENV)
if [ -n "${ANYPOINT_BEARER:-}" ]; then
    CLI_ENV_FILTER+=(-u ANYPOINT_CLIENT_ID -u ANYPOINT_CLIENT_SECRET -u ANYPOINT_USERNAME -u ANYPOINT_PASSWORD)
fi

# Resolve org id and environment name from the CLI's local session, with a
# bootstrap step for users who have only set `conf username`/`password` and
# never run an authenticated CLI command yet. Three-step flow:
#
#   1. Probe `conf session` (a local file read; NOT an authenticated command).
#      If a previous CLI invocation already authenticated, this returns the
#      session blob with `selectedOrganization.id` and `selectedEnvironment.name`.
#   2. If the session is empty (cold start), run ONE authenticated command
#      with `--environment ""`. The empty string routes to the CLI's
#      `getDefaultEnvironment()` helper which auto-picks a real env (prefers
#      Production, falls back to first available) — so we never have to
#      hardcode an env name like `Sandbox` that may not exist on the org.
#      This call's `init()` lifecycle reads the stored u/p (or bearer, or
#      client-creds) and writes a populated session to the local config.
#   3. Re-read `conf session` to get org id + env name from the now-populated
#      session. Used by every subsequent CLI call as `--organizationId` and
#      `--environment` values.
#
# This works on a fresh user who has only run `conf username` + `conf password`
# (no prior authenticated CLI command) — Step 2 triggers the password-grant
# OAuth login from those stored credentials and populates the session as a
# side effect.
SESSION_JSON="$("${CLI_ENV_FILTER[@]}" anypoint-cli-v4 conf session 2>/dev/null || true)"
if ! jq -e 'type == "object" and has("selectedOrganization") and has("selectedEnvironment")' <<<"$SESSION_JSON" >/dev/null 2>&1; then
    # Bootstrap: empty `--environment` → CLI auto-picks a default env, login
    # fires from stored credentials, session gets persisted.
    "${CLI_ENV_FILTER[@]}" anypoint-cli-v4 account environment list --environment "" --output json >/dev/null 2>&1 || true
    SESSION_JSON="$("${CLI_ENV_FILTER[@]}" anypoint-cli-v4 conf session 2>/dev/null || true)"
fi

ORG_ID="$(jq -r '.selectedOrganization.id // empty' <<<"$SESSION_JSON" 2>/dev/null || true)"
ENV_NAME="$(jq -r '.selectedEnvironment.name // empty' <<<"$SESSION_JSON" 2>/dev/null || true)"

if [ -z "$ENV_NAME" ]; then
    echo "Could not resolve an Anypoint environment for the current CLI session." >&2
    echo "Run one of:" >&2
    echo "  anypoint-cli-v4 conf username <user> && anypoint-cli-v4 conf password <pwd>" >&2
    echo "or set ANYPOINT_BEARER (with ANYPOINT_HOST), then retry." >&2
    exit 1
fi

TMPDIR_="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_"' EXIT

# Step 1 — list. Four parallel CLI calls:
#   public:  unscoped, two pages (offset 0 + offset 200)
#   private: org-scoped via --organizationId, two pages
# Page A on each side is authoritative; Page B is additive (failure ⇒ skip
# that page with a warning rather than aborting the whole search).
("${CLI_ENV_FILTER[@]}" anypoint-cli-v4 exchange asset list \
        "$SEARCH_TERM" --environment "$ENV_NAME" --limit 200 --offset 0 --output json \
        >"$TMPDIR_/public-a.json" 2>&1) &
("${CLI_ENV_FILTER[@]}" anypoint-cli-v4 exchange asset list \
        "$SEARCH_TERM" --environment "$ENV_NAME" --limit 200 --offset 200 --output json \
        >"$TMPDIR_/public-b.json" 2>&1) &
if [ -n "$ORG_ID" ]; then
    ("${CLI_ENV_FILTER[@]}" anypoint-cli-v4 exchange asset list \
            "$SEARCH_TERM" --environment "$ENV_NAME" --organizationId "$ORG_ID" \
            --limit 200 --offset 0 --output json \
            >"$TMPDIR_/private-a.json" 2>&1) &
    ("${CLI_ENV_FILTER[@]}" anypoint-cli-v4 exchange asset list \
            "$SEARCH_TERM" --environment "$ENV_NAME" --organizationId "$ORG_ID" \
            --limit 200 --offset 200 --output json \
            >"$TMPDIR_/private-b.json" 2>&1) &
else
    echo "[]" >"$TMPDIR_/private-a.json"
    echo "[]" >"$TMPDIR_/private-b.json"
fi
wait

if ! jq -e 'type == "array"' "$TMPDIR_/public-a.json" >/dev/null 2>&1; then
    echo "exchange asset list failed for '$SEARCH_TERM' (public, page 1):" >&2
    cat "$TMPDIR_/public-a.json" >&2
    exit 1
fi

# Page-B failures and the org-scoped failures are non-fatal — we just lose
# those candidates and continue with whatever else we have.
for f in public-b private-a private-b; do
    if ! jq -e 'type == "array"' "$TMPDIR_/$f.json" >/dev/null 2>&1; then
        echo "exchange asset list page failed ($f) for '$SEARCH_TERM' — skipping that page." >&2
        echo "[]" >"$TMPDIR_/$f.json"
    fi
done

# Tag each row with its origin (private vs public) BEFORE dedup, so the
# private label survives even if a row happened to also appear in the
# unscoped result set. Then merge the four pages into a single array.
PUBLIC_ROWS=$(jq -s '(.[0] + .[1]) | map(. + {_origin: "public"})'  "$TMPDIR_/public-a.json"  "$TMPDIR_/public-b.json")
PRIVATE_ROWS=$(jq -s '(.[0] + .[1]) | map(. + {_origin: "private"})' "$TMPDIR_/private-a.json" "$TMPDIR_/private-b.json")

# Filter to templates, dedup (private wins on collisions), rank.
RANKED=$(jq -n --arg search "$SEARCH_TERM" \
    --argjson pub  "$PUBLIC_ROWS" \
    --argjson priv "$PRIVATE_ROWS" '
  ($priv + $pub) as $all |

  ($search | ascii_downcase | split(" ") | map(select(. != "" and . != "mule" and . != "template"))) as $search_tokens |

  [$all[] | select(.type == "template")] |

  group_by([.groupId, .assetId]) |
  map({
    name:         (.[0].name // .[0].assetId),
    groupId:      .[0].groupId,
    assetId:      .[0].assetId,
    version:      (sort_by([.version | split(".") | map(tonumber? // 0)]) | reverse | .[0].version),
    # Private wins if any duplicate row had _origin == "private"; the
    # private branch is concatenated first so .[0] is private-when-present.
    _origin:      (if any(.[]; ._origin == "private") then "private" else "public" end),
    asset_tokens: (.[0].assetId | ascii_downcase | split("-") | map(select(. != "" and . != "mule" and . != "template"))),
  }) |

  map(. as $c |
    ($c.asset_tokens | map(
      . as $t |
      if ($search_tokens | index($t)) then {kind: "exact"}
      elif (($t | length) >= 2) and (
             any($search_tokens[]; . as $s | ($s | length) >= 2 and (index($t) != null or ($t | index($s)) != null))
           ) then {kind: "substring"}
      else {kind: "none"}
      end
    )) as $cls |
    ($cls | map(select(.kind == "exact"))     | length) as $exact |
    ($cls | map(select(.kind == "substring")) | length) as $substr |
    ($cls | map(select(.kind == "none"))      | length) as $unmatched |
    $c + { _score: (2 * $exact + $substr - $unmatched) }
  ) |

  # Private rows first, then by score, then by shorter-assetId tiebreak.
  sort_by([(if ._origin == "private" then 0 else 1 end), -._score, (.assetId | length)]) |
  map(del(._score, .asset_tokens))
')

COUNT=$(printf '%s' "$RANKED" | jq 'length')
if [ "$COUNT" = "0" ]; then
    echo "No Mule template matches '$SEARCH_TERM' on Exchange." >&2
    echo "Searched private (org-scoped) and public; no asset of type=template was returned." >&2
    exit 1
fi

# Cap to top N for enrichment.
TOP_LIST=$(printf '%s' "$RANKED" | jq --argjson n "$TOP_N" '.[:$n]')

# Step 2 — describe each top row in parallel and write enriched JSON to
# per-row files. We use describe to surface description and minMuleVersion.
mkdir -p "$TMPDIR_/desc"
ROW_COUNT=$(printf '%s' "$TOP_LIST" | jq 'length')
i=0
while [ "$i" -lt "$ROW_COUNT" ]; do
    GAV=$(printf '%s' "$TOP_LIST" | jq -r ".[$i] | \"\(.groupId)/\(.assetId)/\(.version)\"")
    OUT="$TMPDIR_/desc/$i.json"
    ("${CLI_ENV_FILTER[@]}" anypoint-cli-v4 exchange asset describe "$GAV" \
            --environment "$ENV_NAME" --output json >"$OUT" 2>"$OUT.err" || echo "{}" >"$OUT") &
    i=$((i + 1))
done
wait

# Merge list-side fields with describe-side fields per row. `sourceLocation`
# comes straight from the per-row `_origin` we tagged at fetch time —
# server-side scoped search is the source of truth, no client-side
# comparison.
ENRICHED=$(printf '%s' "$TOP_LIST" | jq --slurpfile descs <(
    j=0
    while [ "$j" -lt "$ROW_COUNT" ]; do
        FILE="$TMPDIR_/desc/$j.json"
        if jq -e 'type == "object"' "$FILE" >/dev/null 2>&1; then
            cat "$FILE"
        else
            echo "{}"
        fi
        j=$((j + 1))
    done
) '
  [
    range(0; length) as $i |
    .[$i] as $row |
    ($descs[$i] // {}) as $d |
    ($d.attributes // []) as $attrs |
    {
      name:           ($d.name // $row.name),
      groupId:        $row.groupId,
      assetId:        $row.assetId,
      version:        $row.version,
      minMuleVersion: (
        ([$attrs[]? | select(.key == "min-mule-version") | .value] | .[0])
        // $d.runtimeVersion
        // null
      ),
      description:    ($d.description // null),
      sourceLocation: $row._origin,
    }
  ]
')

printf '%s' "$ENRICHED"
