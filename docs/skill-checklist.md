# Skill Submission Checklist

Every `skills/**/SKILL.md` file is checked at submission time by
`scripts/build/validate_skills.py` (wired into `make pre-commit-hook` and CI via
`make validate-skills`). The validator is deterministic and rule-based — the
same input always yields the same pass/fail.

This checklist documents the seven rules (R1–R7). Run them locally before
opening a PR:

```bash
make validate-skills
# or directly:
python3 scripts/build/validate_skills.py --repo-root .
```

Exit codes: `0` pass · `1` violations · `2` environment error.

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
