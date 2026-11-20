#!/usr/bin/env bash
# Runs the skill with the local claude CLI in headless mode on a Mule project, then prints what the agent did and the report.
#   run-skill.sh <project-dir> [prompt]
# Set VERSIONLESS_VALIDATOR_JAR to run a local validator jar, not the master jar from Nexus.
# Exit codes: 0 the skill ran, 1 the agent did not invoke the skill, 2 usage.
set -euo pipefail

[[ $# -ge 1 && -d "$1" ]] || { echo "usage: $0 <project-dir> [prompt]" >&2; exit 2; }
project="$(cd "$1" && pwd)"
prompt="${2:-Can this app switch to versionless?}"
skill_src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy the skill into a throwaway plugin so it runs as it ships: self-contained, no repo paths.
tmp="${TMPDIR:-/tmp}"
# No "//" in the path: it goes into the --allowed-tools pattern.
work="$(mktemp -d "${tmp%/}/run-skill.XXXXXX")"
plugin="$work/plugin"
skill="$plugin/skills/validate-versionless-switch"
mkdir -p "$plugin/.claude-plugin" "$skill"
cp -R "$skill_src/." "$skill"
printf '{"name":"versionless-validator","version":"0.1.0"}\n' >"$plugin/.claude-plugin/plugin.json"

# -p denies tools that are not listed; allow only what the skill workflow needs.
transcript="$work/transcript.jsonl"
(cd "$project" && claude -p "$prompt" \
  --plugin-dir "$plugin" \
  --output-format stream-json --verbose \
  --allowed-tools "Skill" "Read" "Bash($skill/scripts/validate.sh:*)" "Bash(ls:*)" "Bash(echo:*)") \
  >"$transcript"

tool_uses='select(.type=="assistant") | .message.content[] | select(.type=="tool_use")'
echo "== tool calls"
jq -r "$tool_uses | \"\(.name): \(.input.skill // .input.command // .input.file_path // \"\")\"" "$transcript"
echo "== denied"
jq -r 'select(.type=="result") | .permission_denials[]? | "\(.tool_name): \(.tool_input.command // .tool_input | tostring)"' "$transcript"
echo "== answer"
jq -r 'select(.type=="result") | .result' "$transcript"
echo "== transcript: $transcript"
if [[ -n "${VERSIONLESS_VALIDATOR_JAR:-}" ]]; then
  echo "== validator: local $VERSIONLESS_VALIDATOR_JAR, built $(date -r "$VERSIONLESS_VALIDATOR_JAR" '+%Y-%m-%d %H:%M %Z')"
else
  # validate.sh keeps only the latest snapshot in the cache, named with the Nexus timestamp (UTC) and build number.
  jar="$(ls -t "${XDG_CACHE_HOME:-$HOME/.cache}"/mule-versionless/versionless-validator-*.jar 2>/dev/null | head -1 || true)"
  if [[ "$jar" =~ versionless-validator-([0-9.]+)-([0-9]{4})([0-9]{2})([0-9]{2})\.([0-9]{2})([0-9]{2})([0-9]{2})-([0-9]+)\.jar$ ]]; then
    m=("${BASH_REMATCH[@]}")
    echo "== validator: ${m[1]}-SNAPSHOT build ${m[8]}, published ${m[2]}-${m[3]}-${m[4]} ${m[5]}:${m[6]}:${m[7]} UTC"
  else
    echo "== validator: no cached jar"
  fi
fi

jq -e "$tool_uses | select(.name==\"Skill\" and (.input.skill | endswith(\"validate-versionless-switch\")))" "$transcript" >/dev/null \
  || { echo "FAIL: the agent did not invoke the skill"; exit 1; }

# The agent picks the report path; take its --out, else the validator default.
out="$(jq -r "$tool_uses | .input.command // empty | select(contains(\"validate.sh\")) | capture(\"--out[ =]+\\\"?(?<p>[^\\\" ;&]+)\").p" "$transcript" | tail -1)"
report="${out:-$project/$(basename "$project")-versionless-switch-report.json}"
[[ "$report" = /* ]] || report="$project/$report"
echo
if [[ -f "$report" ]]; then
  "$(dirname "${BASH_SOURCE[0]}")/show-report.sh" "$report"
else
  echo "no report at $report"
fi
