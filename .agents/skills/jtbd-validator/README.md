# JTBD Validator Skill

A simple AI agent skill that wraps the JTBD validator script to check Jobs-to-be-Done markdown files for correctness.

## What It Does

Validates JTBD files to ensure:
- Valid frontmatter and structure
- Sequential step headers matching YAML blocks
- Valid API URNs pointing to existing specs
- Correct operationIds in API specs
- Valid step dependencies (no forward references)

## Quick Start

```
User: Validate skills/deploy-api-with-rate-limiting/SKILL.md

Claude: [Runs validator and reports: ✅ PASSED or ❌ FAILED with errors]
```

## Usage

### Single File
```bash
python3 .agents/skills/jtbd-validator/scripts/validate_jtbd.py path/to/job.md .
```

### Multiple Files
```bash
for job in skills/*/SKILL.md; do
  python3 .agents/skills/jtbd-validator/scripts/validate_jtbd.py "$job" .
done
```

## Structure

```
.agents/skills/jtbd-validator/
├── README.md           # This file
├── SKILL.md            # Skill instructions for Claude
└── scripts/
    └── validate_jtbd.py    # Validation script (self-contained)
```

## What It Validates

1. **Frontmatter**: name, description fields
2. **Step Headers**: Sequential numbering, matches YAML count
3. **YAML Blocks**: Required fields (api, operationId, inputs)
4. **API References**: URN format, folder exists, spec valid
5. **Operations**: OperationId exists in referenced API
6. **Dependencies**: Step references valid, no forward refs

## Output

**Success:**
```
✅ PASSED: Job is valid
```

**Failure:**
```
❌ FAILED: 2 error(s) found:
  ❌ Step 3: Operation 'createApis' not found
  ❌ Step 3: References unknown output 'apiId'
```

## Exit Codes

- `0`: Valid
- `1`: Invalid

## Integration

Works with jtbd-generator skill - validates generated files automatically.

---

**Status**: Production Ready
**Version**: 1.0
**Last Updated**: 2026-03-26
