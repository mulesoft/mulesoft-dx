#!/usr/bin/env bash
# Prints a validator report for humans, laid out like the ACB "Upgrade to Versionless" view.
#   show-report.sh <report.json>
set -euo pipefail

[[ $# -eq 1 && -f "$1" ]] || { echo "usage: $0 <report.json>" >&2; exit 2; }

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  red=$'\e[31m' yellow=$'\e[33m' green=$'\e[32m' dim=$'\e[2m' bold=$'\e[1m' off=$'\e[0m'
else
  red="" yellow="" green="" dim="" bold="" off=""
fi

jq -r --arg red "$red" --arg yellow "$yellow" --arg green "$green" --arg dim "$dim" --arg bold "$bold" --arg off "$off" '
  # Labels and messages from the ACB view (ui.upgrade.versionless.* in package.nls.json).
  def title: {dataweave: "DataWeave", flow: "Constructs", connector: "Connectors", config: "Configuration",
               project: "Project", security: "Security", state: "State", devx: "Developer Experience"}[.] // .;
  def order: . as $c | ["connector", "dataweave", "flow", "config", "project", "security", "state", "devx"] | index($c) // 99;
  def verdict: if . == "SWITCHABLE" then "\($green)Switchable\($off)" else "\($red)Not switchable\($off)" end;
  # Must match Main.PROFILES in mule-versionless tools/versionless-validator.
  def gates($profile): $profile == "strict" or (.category | IN("dataweave", "flow", "connector"));
  def sev: if .severity == "BLOCK" then "\($red)BLOCK\($off)" else "\($yellow)INFO \($off)" end;
  def file: .fileUri | split("/") | last;
  def finding($profile):
    "  \(sev)  \(.message)" + (if .severity == "BLOCK" and (gates($profile) | not) then " \($dim)(does not gate \($profile))\($off)" else "" end),
    (.snippet | gsub("\\s+"; " ") | .[0:100]) as $code
    | if $code != .symbol then "         \($dim)\($code)\($off)" else empty end,
    "         \(file):\(.startLine):\(.startColumn)  \($dim)\(.ruleId)\($off)";
  def section($title; $items; $profile):
    "", "\($bold)\($title)\($off)",
    (if ($items | length) == 0 then "  \($green)No issues found.\($off)" else ($items[] | finding($profile)) end);

  . as $r
  | "\($bold)Move this Mule Application to Versionless App\($off) — \(.app.name // "?")",
    if .success | not then
      "", "\($red)Couldn'\''t check runtime compatibility.\($off) \(.failureReason)"
    else
      "  \(.profile) profile: \(.verdicts[.profile] | verdict) (\(.blockerCount) blockers)   "
        + ([.verdicts | to_entries[] | select(.key != $r.profile) | "\(.key): \(.value | verdict)"] | join("   ")),
      "  \($dim)versionless \(.capabilities.versionlessMuleVersion)"
        + " · \(.filesScanned) files · \(.expressionsScanned) DW expressions\($off)",
      "", "\($bold)Current app setup\($off)",
      if .currentAppSetup == null then "  \($yellow)Not in this report: the validator jar is older than currentAppSetup.\($off)"
      else
        (.currentAppSetup["mule-artifact.json"] as $a
         | "  minMuleVersion \($a.minMuleVersion // "not set") · Java \($a.javaSpecificationVersions // [] | if length == 0 then "not set" else join(", ") end)"),
        (.currentAppSetup.connectors | if length == 0 then "  Connectors: none in pom.xml."
         else "  Connectors:", (to_entries[] | "    \(.key) \(.value.version // "?")  \($dim)\(.value.groupId // "")\($off)") end)
      end,
      ([.findings[] | select(.category == "connector")] | sort_by(.fileUri, .startLine)) as $conn
      | ([.findings[] | select(.category != "connector")]) as $rest
      | section("Connectors"; $conn; .profile),
        "", "\($bold)Runtime Compatibility\($off)",
        (if ($rest | length) == 0 then "  \($green)No runtime compatibility issues found.\($off)"
         else
           ([$rest[] | select(.severity == "BLOCK" and gates($r.profile))] | length) as $b
           | (if $b > 0 then "  \($red)\($b) item(s) won'\''t run on the versionless runtime.\($off)"
              else "  \($yellow)\($rest | length) item(s) may not run on the versionless runtime.\($off)" end),
             ($rest | group_by(.category) | sort_by(.[0].category | order)[]
              | section("  " + (.[0].category | title); sort_by(.fileUri, .startLine); $r.profile))
         end),
      "", "\($bold)Flipped runtime flags\($off) \($dim)(do not block)\($off)",
      (if .flags.evaluated | not then "  \($yellow)Not checked: mule-artifact.json has no minMuleVersion.\($off)"
       elif (.flags.flipped | length) == 0 then "  None."
       else .flags.flipped | sort_by({High: 0, Med: 1, Low: 2}[.severity] // 3, .id)[]
         | "  \(.severity | .[0:4] | . + " " * (4 - length))  \(.id)  \(.classicValue) → \(.versionlessValue)  \($dim)\(.property // "") (\(.cause))\($off)"
       end),
      if any(.findings[]; .severity == "INFO") | not then "", "\($dim)No INFO findings in this report; without --include-info the validator leaves them out.\($off)" else empty end
    end
' "$1"
