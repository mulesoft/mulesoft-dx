# Skill Authoring Standard & Submission Checklist

This is the single source of truth for what a skill in this repo must look like.
It has two halves:

1. **[Authoring guidance](#authoring-guidance)** — how to write a skill so it
   reads and feels like every other skill (frontmatter, `description`/discovery
   discipline, required structure, style, progressive disclosure). Start here.
2. **[Submission rules R1–R7](#submission-rules-r1r7)** — the deterministic
   checks `scripts/build/validate_skills.py` runs at submission time (wired into
   `make pre-commit-hook` and CI via `make validate-skills`). The guidance above
   is what makes a skill *good*; the rules below are what makes it *mergeable*.

Run the rule checks locally before opening a PR:

```bash
make validate-skills
# or directly:
python3 scripts/build/validate_skills.py --repo-root .
```

Exit codes: `0` pass · `1` violations · `2` environment error.

---

# Authoring Guidance

## Why standardize

Skills are a federated, distributed effort — many owners, one catalog. Two
problems follow:

1. **Discovery.** An agent picks a skill almost entirely from its `description`.
   Inconsistent or vague descriptions mean the right skill never fires.
2. **Trust and maintainability.** When every skill has a different shape,
   reviewers can't reason about them, users can't predict them, and quality
   drifts. A shared structure is what lets us review, validate, and improve at
   scale.

The goal is not one rigid mold — sequential API jobs and open-ended DX workflows
legitimately differ. The goal is a **shared core** plus **two well-defined
shapes** (`jtbd` and `prose`), so anything published looks like it belongs.

## Quick start

1. **Pick your type** (see the table below) and **copy the matching template**
   into your new skill directory as `SKILL.md`:

   ```bash
   # jtbd — Sequential Job (Anypoint API operations chained in order)
   mkdir -p skills/<skill-name>
   cp docs/job-template.md skills/<skill-name>/SKILL.md

   # prose — Tool / Workflow (DX skills that run tools/scripts and edit files)
   mkdir -p skills/<skill-name>
   cp docs/prose-template.md skills/<skill-name>/SKILL.md
   ```

2. **Fill every `[placeholder]`, delete every HTML comment.**
3. **Validate** with `make validate-skills` (all skills) and, for `jtbd`,
   `python3 scripts/build/validate_jtbd.py skills/<skill-name>/SKILL.md .`.

## The two skill types

| | **jtbd — Sequential Job** | **prose — Tool / Workflow (DX)** |
|---|---|---|
| **Shape** | An ordered list of API operations chained together | An open-ended procedure the agent drives, often with tools/scripts |
| **Backed by** | Anypoint Platform REST APIs (`urn:api:*`) | CLI tools, bundled scripts, file edits, MCP tools |
| **Machine-validatable** | Yes — each step is a YAML block with `api` + `operationId` (see `validate_jtbd.py`) | Frontmatter + structure only |
| **Type declared via** | inherits `type: jtbd` from `skills/skills-metadata.yaml` | `type: prose` in the group's `skills-metadata.yaml` (e.g. `mule-development/`, `platform-assistant/`) |
| **Examples in repo** | `secure-mcp-server`, `apply-policy-to-api-instance` | `build-mule-integration`, `secure-mule-app`, `create-mule-run-config` |
| **Start from** | [`job-template.md`](./job-template.md) | [`prose-template.md`](./prose-template.md) |
| **Gold-standard example** | [`secure-mcp-server`](../skills/secure-mcp-server/SKILL.md) | [`build-mule-integration`](../skills/mule-development/build-mule-integration/SKILL.md) |

**How to choose:** If the whole job is "call these Anypoint APIs in this order,"
it's `jtbd`. If the agent has to explore, make decisions, run tools/scripts, or
edit the user's project files, it's `prose`. If a skill is *mostly* sequential
API calls but has one or two decision points, it is still `jtbd` — use the
"Execution Paths" and "Common issues" mechanisms rather than reaching for `prose`.
(Type resolution and the required structure are enforced by R6/R7 below.)

## Shared core — every skill, both types

### 1. Location and filename

```
skills/<skill-name>/SKILL.md          # top-level skills (default type: jtbd)
skills/<group>/<skill-name>/SKILL.md  # grouped skills (e.g. mule-development/*, type: prose)
```

- One skill per directory. The directory name **is** the skill name and must be
  kebab-case (R1, R2).
- The instruction file is always `SKILL.md`. Bundled scripts go in `scripts/`,
  extra docs in `references/`, and static files (schemas, templates, JARs) in
  `assets/`.

### 2. Frontmatter

Every `SKILL.md` opens with YAML frontmatter. Required and optional keys:

```yaml
---
name: skill-name-in-kebab-case          # REQUIRED. Matches the directory name (R1). ≤ 64 chars.
description: |                            # REQUIRED. ≥ 40 chars (R4), ≤ 1024. See rule 3 below.
  <action verb> <what it does>. Use when <trigger terms for discovery>.
license: Apache-2.0                       # Optional but recommended for shipped prose skills.
compatibility: <one line of runtime/tooling requirements>  # Optional. prose especially.
allowed-tools: Bash Read Write Edit AskUserQuestion         # prose skills that use tools.
user-invocable: true                      # Optional. Set when a user runs the skill by name.
metadata:                                 # Optional but recommended.
  author: <team-or-owner>
  version: "1.0.0"                        # Semver, quoted.
---
```

- **`name`** must equal the directory name (R1) and be kebab-case (R2).
- **`description`** is the most important field in the whole file — it is what an
  agent reads to decide whether to fire the skill. See rule 3.
- Do **not** invent frontmatter keys. If you need something not listed here,
  raise it so we can standardize it rather than diverging.

### 3. The `description` field — discovery rules

This is where most skills fail. A good description does two jobs, in order:

1. **States what the skill does** in one action-verb-first sentence.
2. **Lists the trigger terms** — the words, phrases, and intents that should make
   an agent select this skill — introduced by **"Use when …"**.

Rules:

- **Start with an action verb** (Apply, Protect, Generate, Configure, Discover,
  Build, Manage). Never start with "This skill…" or "A skill that…".
- **Front-load triggers.** Name the concrete tools, resources, and user phrasings
  ("rate limiting", "OAuth2", "IP allowlist", "run config", "encrypt
  credentials"). Agents match on these.
- **Disambiguate from neighbors.** If two skills are close, say when *not* to use
  this one. For heavy `prose` skills, an explicit **"Do NOT use when …"** /
  **"DO NOT TRIGGER when …"** clause is strongly encouraged.
- **One skill = one job.** If the description needs "and also…", it's probably two
  skills.

✅ Good (`jtbd`):
> `Protect an MCP server by applying a policy from the catalog. … Use when the
> user wants to secure an MCP server, add rate limiting, apply OAuth2, enforce IP
> allowlisting, or protect any MCP server with a policy — regardless of where they
> are in the setup process.`

✅ Good (`prose`, with negative triggers):
> `Call use_skill as your FIRST and ONLY action when the user asks to CREATE a NEW
> run configuration … NOT for editing existing ones. Trigger phrases include
> "create config", "new run config", … When you call use_skill, it must be the
> only tool call in that response.`

❌ Bad:
> `This skill helps with policies.` — no verb, no triggers, no disambiguation.

### 4. Required document structure

Both types share this backbone (exact section names matter — reviewers key off
them):

1. **`# <Title>`** — human-readable, title-case, matches the job.
2. **`## Overview`** (`jtbd`) / **`## When to Use This Skill`** (`prose`) —
   context and, for `jtbd`, a bold **`**What you'll build:**`** one-liner.
3. **`## Prerequisites`** — grouped, actionable bullets. Say how to obtain/verify
   each ("call `listMe` to get your org ID", "`java -version` — needs 11+").
4. **The body** — steps (`jtbd`) or a workflow (`prose`). See per-type templates.
5. **`## Troubleshooting`** — symptom → cause → solution, for real failures.
6. **`## Related Jobs`** / **`## Related Skills`** — link neighbors with the
   literal `skill <slug>` form so R5 can resolve the link.

`jtbd` adds `## Completion Checklist` and `## What You've Built`. `prose` adds a
**When to Use** section and, when it ships scripts, a **Bundled scripts** table.
The templates spell out the full ordering.

### 5. Writing style

- **Imperative, second person, present tense.** "Create the instance," not "The
  user should create an instance."
- **Concrete over generic.** Name the endpoint, the flag, the field, the file.
  Generic prose ("configure as appropriate") is the enemy.
- **Explain *why* at decision points**, not just *what*. The best skills tell the
  agent why a wrong turn is expensive (see `build-mule-integration`'s "silent
  HTTP fallback" warnings). This is what prevents drift.
- **Show, then rule.** Give an example, then the rule that generalizes it.
- **No marketing.** Completion messages and summaries are evidence, not brochures.

### 6. Progressive disclosure (keep `SKILL.md` scannable)

`SKILL.md` is loaded into the agent's context — long files cost tokens and bury
the important parts. Push detail *out*:

- **`references/*.md`** — deep reference material (catalogs, matrices, long
  examples). Link to it; tell the agent to read it *when needed*, not up front.
- **`scripts/*`** — anything mechanical or repeatable. A script that persists
  output to disk is more reliable than inline bash whose variables vanish between
  tool calls.
- **`assets/*`** — schemas, templates, binaries the skill consumes.

A `jtbd` skill is usually a single `SKILL.md`. A rich `prose` skill is a thin
`SKILL.md` that routes to `references/` and `scripts/`.

### 7. Personas — allowed, but not a substitute for structure

Some skills open with "You are a MuleSoft security specialist…". A one-line
persona is fine as a framing device, but it must be *followed by* the standard
structure. A persona is **not** a license to skip Overview/When-to-Use,
Prerequisites, Troubleshooting, or Related Skills.

## Definition of done — before you publish

- [ ] Directory is kebab-case; instruction file is `SKILL.md` (R1, R2).
- [ ] Frontmatter has `name` (= directory) and a rules-compliant `description`
      (≥ 40 chars) (R1, R4).
- [ ] `description` leads with an action verb and lists trigger terms; neighbors
      are disambiguated (negative triggers for heavy `prose` skills).
- [ ] All required shared-core sections are present and correctly named.
- [ ] Skill type resolves via `skills-metadata.yaml` and matches the structure
      (R6, R7): `jtbd` has ≥ 1 `api:` YAML step block; `prose` has none.
- [ ] `jtbd`: every step is a valid `api` + `operationId` YAML block and passes
      `python3 scripts/build/validate_jtbd.py skills/<name>/SKILL.md .`.
- [ ] `prose`: `allowed-tools` lists the tools used; bundled scripts are
      documented in a table; deep material lives in `references/`.
- [ ] Cross-references resolve (R5); related skills are linked.
- [ ] Prose is imperative, concrete, and explains *why* at decision points.
- [ ] Troubleshooting covers real, observed failures — not hypotheticals.

---

# Submission rules R1–R7

These are the deterministic checks `validate_skills.py` enforces. Rule-based —
the same input always yields the same pass/fail.

---

## R1 — Name matches directory

The frontmatter `name` MUST exactly equal the containing skill directory name.

The portal derives a page's slug from the directory name, but links and display
use the frontmatter `name`. A mismatch produces 404s in generated links.

```yaml
# skills/deploy-app/SKILL.md
---
name: deploy-app          # ✅ equals the directory name
---
```

## R2 — Name is kebab-case

`name` MUST match `^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase letters/digits, single
hyphen separators, no underscores, no uppercase, no leading/trailing hyphen.

| Value         | Result |
|---------------|--------|
| `deploy-app`  | ✅ |
| `deploy_app`  | ❌ underscore |
| `Deploy-App`  | ❌ uppercase |
| `UPPER`       | ❌ uppercase |

## R3 — Name / slug uniqueness

No two skills may resolve to the same **directory slug** or the same
**frontmatter `name`** (compared case-insensitively, so collisions are caught
identically on macOS and Linux). The violation message names **both** offending
paths and distinguishes a slug collision from a name collision.

## R4 — Required metadata

The frontmatter MUST contain a non-empty `name` and a non-empty `description`.
`description` MUST be at least **40 characters** (after trimming whitespace) —
this rejects empty or placeholder descriptions, since the description drives
agent discovery and selection.

Malformed or absent YAML frontmatter is reported as an R4 violation (never a
crash).

## R5 — Valid cross-references

Every cross-reference in the file MUST resolve:

| Reference            | Resolves against        |
|----------------------|-------------------------|
| `urn:api:<slug>`     | `apis/<slug>/`          |
| `urn:mcp:<slug>`     | `mcps/<slug>/`          |
| `skill <slug>`       | an existing `skills/**/<slug>/` directory |

References inside fenced code blocks (` ``` ` or `~~~`) are **intentionally
ignored** — they are illustrative snippets, not live links. Put real references
in frontmatter, prose, or YAML step blocks. The inter-skill link form is the
literal word `skill` followed by a kebab-case slug (e.g. `skill deploy-app`).

> JTBD `urn:api:` + `operationId` resolution stays in `validate_jtbd.py`. R5 is
> additive: it covers prose references plus `urn:mcp:` and inter-skill links,
> which are validated nowhere else.

## R6 — Resolvable skill type

A skill type (`prose` or `jtbd`) MUST resolve for every skill via the portal's
hierarchical lookup: a `skills-metadata.yaml` with a `type:` key in the skill's
**own** directory, falling back to its **parent** directory. The top-level
`skills/skills-metadata.yaml` provides the category default (`type: jtbd`);
`platform-assistant/` and `mule-development/` declare `type: prose` (nearest
wins). A skill with no resolvable type is an error.

**In practice:** you do NOT write `type: jtbd` in a skill — a standard JTBD skill
declares nothing and inherits `type: jtbd` from the top-level default. Add a
`skills-metadata.yaml` with `type: prose` **only** for prose skills — and only
when they aren't already under a prose group (`mule-development/`,
`platform-assistant/`), which supply it for every skill beneath them.

## R7 — Type / structure coherence

The declared type MUST match the file structure, keyed on the presence of
`api:` YAML step blocks (NOT on `## Step N:` headers):

- `type: jtbd` MUST contain at least one YAML block carrying an `api:` key.
- `type: prose` MUST NOT contain any `api:` YAML step block.

Prose skills may freely use `## Step N:` narrative headers without `api:`
blocks — these PASS as prose and do **not** false-fail.

---

## How it fits together

- `validate_skills.py` owns naming, uniqueness, required metadata,
  cross-reference resolution, type resolvability, and type/structure coherence
  for **all** skills.
- `validate_jtbd.py` remains the authority on JTBD step sequencing and
  `operationId` resolution.
- Both run in `make pre-commit-hook`; CI is the authoritative gate.
