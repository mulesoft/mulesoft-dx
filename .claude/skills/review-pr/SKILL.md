---
name: review-pr
description: Use this skill when asked to "review a PR", "review pull request", "analyse PR", or "check PR" in the mulesoft-dx repo. Guides the full review process: checkout, categorize changed files, run deterministic validators, perform AI analysis, and produce a structured verdict.
metadata:
  version: 1.0.0
  author: "Leandro Gil"
---

# PR Review — mulesoft-dx

This skill defines the review process for PRs in the mulesoft/mulesoft-dx repo.
It is repo-specific: validators, file categories, and quality criteria all reference this repo's structure.

## Inputs

The caller must provide:
- `pr_number` — the PR number to review
- `output_channel` — where to post the verdict (e.g. a Slack channel name, or "stdout")

## Process

### Step 1 — Setup

```bash
gh pr checkout <pr_number>
gh pr diff <pr_number>
gh pr view <pr_number> --json title,body,author,labels
```

### Step 2 — Categorize changed files

Group the diff into these categories. A PR may touch multiple:

| Category | Pattern |
|---|---|
| API specs | `apis/*/api.yaml`, `apis/*/` |
| JTBD files | `skills/*/SKILL.md` where type is `jtbd` |
| Prose skills | `skills/*/SKILL.md` where type is `prose` |
| MCP servers | `mcps/*/server.json`, `mcps/*/` |
| Claude skills | `.claude/skills/*/SKILL.md` |
| Build/scripts | `scripts/`, `Makefile`, `.githooks/` |
| Docs | `docs/`, `*.md` (non-skill) |
| CI/config | `.github/`, `*.json`, `*.yaml` at root |

### Step 3 — Run deterministic validators

Run only the validators relevant to the changed categories. Skip categories not touched by the PR.

#### API specs changed
```bash
make validate-descriptions
make validate-xorigin
make validate-all-governed SKIP_GOVERNED="arm-monitoring-query"
```

Also check manually for each changed `api.yaml`:
- `operationId` uses camelCase verb-noun pattern (`listApiInstances`, `createApplication`)
- Every operation has a non-empty `description`
- Request bodies and response schemas have `description` and `examples`
- No naked strings where enums should be (status, type, state fields)
- No credentials, tokens, or internal URLs hardcoded

#### JTBD files changed
```bash
make validate-jtbd
```

Also check:
- Step sequence is logical and complete
- API URNs (`urn:api:<folder>`) point to existing folders
- `operationId` values resolve in the referenced API spec
- No forward references in step dependencies

#### Prose skills or Claude skills changed
```bash
make validate-skills
```

Also check:
- `description` is trigger-rich — would a user type these words to invoke it?
- Under 500 lines in `SKILL.md`
- No first-person tone ("I'll", "I will") or second-person instructions ("you should")
- Cross-references (other skills, APIs, MCPs) resolve

#### MCP servers changed
```bash
make validate-mcp-server
```

#### Build/scripts changed
```bash
make test-portal
```

### Step 4 — AI analysis

Regardless of file type, review the diff for:

- **Correctness** — does the change do what the PR title/description says?
- **Consistency** — does it follow patterns established in adjacent files in the same folder?
- **Scope** — are there unrelated changes bundled in? Flag them.
- **Breaking changes** — removed fields, renamed `operationId`s, changed required params, removed enum values
- **Security** — credentials, tokens, internal URLs, or PII hardcoded anywhere

### Step 5 — Restore repo

```bash
git checkout master
```

### Step 6 — Produce verdict

Output a structured verdict with this format:

```
*PR #<number>: <title>*
Author: <github_username>

Verdict: APPROVE ✅  |  REQUEST CHANGES ❌

Summary: <one sentence explaining the verdict>

Issues:
- [BLOCKER] <description> — file:line if applicable
- [SUGGESTION] <description>

Validators run:
- validate-descriptions: PASS / FAIL / SKIPPED
- validate-xorigin: PASS / FAIL / SKIPPED
- validate-all-governed: PASS / FAIL / SKIPPED
- validate-jtbd: PASS / FAIL / SKIPPED
- validate-skills: PASS / FAIL / SKIPPED
- validate-mcp-server: PASS / FAIL / SKIPPED
- test-portal: PASS / FAIL / SKIPPED
```

**Verdict rules:**
- `APPROVE` if: all relevant validators pass AND no BLOCKERs found
- `REQUEST CHANGES` if: any validator fails OR any BLOCKER found
- SUGGESTIONs alone do not block approval

Post the verdict to `output_channel`.
