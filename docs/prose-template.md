---
name: skill-name-in-kebab-case
description: >
  [Action verb] [what it does, and the artifacts/tools it works with]. TRIGGER
  when: [concrete conditions and user phrasings — "user asks to create/build X",
  ".foo files", specific CLI commands]. Trigger phrases include "[phrase]",
  "[phrase]", "[phrase]". DO NOT TRIGGER when: [neighbor skill's job — name it],
  [another out-of-scope case]. [If this skill must run before the agent touches
  project files: "Call use_skill as your FIRST action …; it must be the only
  tool call in that response."]
license: Apache-2.0
compatibility: Requires [CLI/plugin + version], [runtime + version], [any other hard dependency]
allowed-tools: Bash Read Write Edit AskUserQuestion
metadata:
  author: your-team-or-owner
  version: "1.0.0"
---

<!--
============================================================================
 PROSE SKILL TEMPLATE (type: prose)
============================================================================
 Use this template when the agent must explore, decide, run tools/scripts, or
 edit the user's files — i.e. the job is NOT a fixed list of Anypoint API calls.

 TYPE RESOLUTION (checklist rule R6): a prose skill must resolve to `type: prose`
 via skills-metadata.yaml. Skills under a prose group (e.g. skills/mule-development/,
 skills/platform-assistant/) already inherit it. If your skill sits directly under
 skills/ (which defaults to `type: jtbd`), add a skills-metadata.yaml in the skill
 directory declaring `type: prose`.

 COHERENCE (checklist rule R7): a prose skill MUST NOT contain any YAML block with
 an `api:` key (that would make it look like a jtbd skill). Narrative
 "## Step N:" headers are fine — just no `api:` step blocks.

 Read docs/skill-checklist.md (rules R1–R7 + authoring guidance) first.
 Gold-standard reference: skills/mule-development/build-mule-integration/SKILL.md.

 KEEP SKILL.md SCANNABLE. Push deep reference material into references/*.md and
 anything mechanical/repeatable into scripts/*. This file should route to them,
 not inline them.

 Delete every HTML comment and fill every [placeholder] before publishing.
 Validate with: make validate-skills
============================================================================
-->

# [Skill Title]

<!-- OPTIONAL one-line persona framing. Keep it to a single sentence, and only if
     it genuinely helps the agent adopt the right mindset. It does NOT replace any
     required section below.
     e.g. "You are a MuleSoft security specialist securing a Mule application." -->

[One-sentence statement of what this skill helps the agent accomplish.]

## When to Use This Skill

**Use this skill when the user asks to:**

- "[Representative request]"
- "[Representative request]"
- "[Representative request]"

**Trigger keywords:** [verb list] · [noun/tool list] · [system/format list].

**Do NOT use this skill when:** [out-of-scope case → point to the right skill].
<!-- Negative triggers matter most for prose skills, where skills overlap. Be
     explicit about the boundary with neighbor skills. -->

## Prerequisites

<!-- Show the checks as runnable commands where possible, then the fix. -->

```bash
[command to verify a required tool]      # e.g. anypoint-cli-v4 --version
[command to verify runtime/env]          # e.g. java -version   (needs 11+)
```

If tools are missing:

```bash
[install / configure command]
[install / configure command]
```

## Bundled scripts

<!-- Include this section ONLY if the skill ships scripts/. Delete it otherwise.
     Prefer scripts over inline bash for anything mechanical or repeated: a
     script that persists output to disk survives across tool calls, whereas a
     shell variable set inside one Bash call is gone when the call returns. -->

This skill ships scripts under `scripts/`. Invoke them by the **absolute path**
given in the "skill is now active" message — do not construct relative
`../scripts/...` paths (the working directory shifts between turns).

| Script | Purpose | Output |
| --- | --- | --- |
| `scripts/[name].sh [args]` | [what it does and which step calls it] | [file it writes, or "stdout"] |
| `scripts/[name].sh` | [...] | [...] |

## Reference files

<!-- Include ONLY if the skill ships references/. Delete otherwise. Tell the agent
     to read each file WHEN NEEDED, not up front — that is the point of keeping
     them out of SKILL.md. -->

- **`references/[topic].md`** — [what it contains]. Read it when [condition].
- **`references/[topic].md`** — [what it contains]. Read it when [condition].

## Workflow

<!-- Structure the procedure. Choose the shape that fits:
       • Numbered Steps (like build-mule-integration) for a linear procedure.
       • Task Domains (like sf-skills agentforce-generate) when the skill covers
         several related intents — each domain has its own Required Steps.
     If the workflow has an approval/verification GATE, make it explicit and
     unmissable (see the gate convention below). -->

### [Rules that always apply]

<!-- OPTIONAL but recommended: a short list of invariants the agent must hold
     across the whole workflow — e.g. "always pass --json", "never invent a
     version; only use the value the script returned", "verify the build passed
     before declaring completion". State the WHY for each; the why is what stops
     drift. -->

1. **[Invariant]** — [why it matters; what breaks if violated.]
2. **[Invariant]** — [why.]

### Step 1: [Action-Oriented Step Name]

[What this step does and why. Give the exact command or tool call.]

```bash
[exact command, using <skill-dir>/scripts/... absolute paths]
```

[What the agent should read from the output and how it feeds the next step.]

### Step 2: [Action-Oriented Step Name]

<!-- [GATE] convention: when a step must not be crossed without an explicit
     precondition (user approval, a passing build, a file existing on disk),
     mark it loudly and state what the agent must WAIT for. Gates are the single
     biggest safeguard against prose skills going off the rails. -->

**[GATE] [What must be true before proceeding, e.g. "WAIT for explicit user
approval before continuing."]**

[Step body.]

### Step N: [Final Step — usually verify + declare completion]

[How to verify the work actually succeeded — run the build, exercise the flow,
observe the result. Then how to report completion: tight, evidence-based, no
marketing. State exactly what to include and what to leave out.]

## Best Practices

- **[Practice]** — [✅ do this / ❌ not this, with a concrete example.]
- **[Practice]** — [...]

## Troubleshooting

<!-- Symptom → cause → fix, for failures actually observed in real runs. -->

**[Error message or symptom]:** [cause and fix — name the file/flag/command.]

**[Error message or symptom]:** [cause and fix.]

## Quick Reference

<!-- OPTIONAL — a copy-pasteable command cheat sheet for a script-heavy skill.
     Delete if the workflow is short. -->

```bash
# Step 1: [purpose]
[command]

# Step N: [purpose]
[command]
```

## Related Skills

<!-- Use the literal form "skill <slug>" so checklist rule R5 can resolve the
     inter-skill link, e.g. "skill build-mule-integration". -->

- **skill related-skill-name**: [what it does and when to use it instead of this one.]
- **skill another-related-skill**: [one-line description.]
