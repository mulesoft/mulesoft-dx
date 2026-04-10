# Jobs To Be Done (JTBD) - Documentation

Jobs To Be Done (JTBD) are documented in a hybrid format that serves multiple purposes:

1. **Skills for AI Agents** - Instructional content agents can follow
2. **Validatable Jobs** - Structured YAML blocks for validation
3. **Human Documentation** - Comprehensive guides with examples

## Quick Start

### Creating a New Job

```bash
# Create directory and copy template
mkdir -p skills/your-job-name
cp docs/job-template.md skills/your-job-name/SKILL.md

# Edit and fill in [placeholders]
# Validate when done
python3 scripts/build/validate_jtbd.py skills/your-job-name/SKILL.md .
```

### Using as an AI Skill

```bash
# Copy to your skills directory
mkdir -p ~/.cursor/skills/job-name
cp skills/your-job-name/SKILL.md ~/.cursor/skills/job-name/SKILL.md
```

## Resources

### Documentation
- **job-template.md** (this folder) - Template for creating new jobs
- **x-jobs-to-be-done-schema.md** (this folder) - Complete schema documentation
- **HYBRID-FORMAT-COMPARISON.md** - Format comparison (in individual job folders)

### Tools
- **scripts/build/validate_jtbd.py** - Job validator (validates structure, API references, and operations)

### Example Jobs

Located in the top-level `skills/` directory:
- **deploy-api-with-rate-limiting.md** - Complete example (5 steps)
- **list-organization-apis.md** - API discovery (3 steps)
- **promote-api-between-environments.md** - Environment promotion (2 steps)
- **setup-multi-upstream-routing.md** - Traffic routing (4 steps)
- **apply-policy-stack.md** - Security policies (4 steps)
- **manage-consumer-contracts.md** - Consumer management (4 steps)

## Hybrid Format Features

The hybrid format combines:

### 1. AI Agent Instructions (Skill)
```markdown
## Step 1: Create API Instance

Start by creating a new API instance from your Exchange asset...

**What you'll need:**
- Organization ID from access-management
- Target environment ID

**Action:** Call the API Manager to create a new API instance.
```

### 2. Structured Job Definition (Validatable)
```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id  # JSONPath expression
outputs:
  - name: environmentApiId
    path: $.id  # JSONPath expression
```

### 3. Human-Friendly Documentation
```markdown
**What happens next:** You receive an `environmentApiId` to use in subsequent steps.

**Common issues:**
- **400 Bad Request**: Asset doesn't exist in Exchange
```

## Using the Validator

Validates structure, frontmatter, step dependencies, and API references:

```bash
cd /Users/flescano/repos/api-notebook-anypoint-specs
python3 scripts/build/validate_jtbd.py \
  skills/deploy-api-with-rate-limiting/SKILL.md \
  .
```

The validator checks:
- ✅ At least 1 step header is defined (## Step 1:, ## Step 2:, etc.)
- ✅ Step headers are numbered sequentially
- ✅ Number of step headers matches number of YAML blocks
- ✅ At least 1 YAML step block is defined
- ✅ Step has a valid YAML code block with required fields (api, operationId)
- ✅ API URN (e.g., `urn:api:api-manager`) points to existing folder
- ✅ OperationId exists in the referenced API spec
- ✅ Step dependencies are valid
- ✅ Input/output references are correct

## Validation Output Example

```
================================================================================
Validating: deploy-api-with-rate-limiting.md
API Specs Root: .
================================================================================

📋 Checking frontmatter...
  ✅ Frontmatter valid

📑 Checking step headers...
  Found 5 step header(s)
  ✅ At least 1 step header is defined
  ✅ Steps are numbered sequentially (1-5)

📦 Extracting job steps (YAML blocks)...
  Found 5 job step(s)
  ✅ At least 1 YAML step is defined
  ✅ Step header count matches YAML block count (5)

🔍 Validating step structure...
  ✅ Step 1: createOrganizationsEnvironmentsApis - structure valid
  ✅ Step 2: createOrganizationsEnvironmentsApisTiers - structure valid
  ✅ Step 3: createOrganizationsEnvironmentsApisTiers - structure valid
  ✅ Step 4: createOrganizationsEnvironmentsApisTiers - structure valid
  ✅ Step 5: createOrganizationsEnvironmentsApisPolicies - structure valid

🔗 Validating API references and operations...
  ✅ Step 1: createOrganizationsEnvironmentsApis exists in urn:api:api-manager
  ✅ Step 2: createOrganizationsEnvironmentsApisTiers exists in urn:api:api-manager
  ✅ Step 3: createOrganizationsEnvironmentsApisTiers exists in urn:api:api-manager
  ✅ Step 4: createOrganizationsEnvironmentsApisTiers exists in urn:api:api-manager
  ✅ Step 5: createOrganizationsEnvironmentsApisPolicies exists in urn:api:api-manager

🔀 Validating step dependencies...
  ✅ All step dependencies valid

================================================================================
✅ PASSED: Job is valid
```

## Format Requirements

For a job to be valid, it must have:

### Frontmatter
```yaml
---
name: job-name  # kebab-case, max 64 chars
description: |
  What it does. Use when [trigger terms].  # max 1024 chars
---
```

### At Least One Step

Each step must include these fields in the YAML block:

```yaml
api: urn:api:api-folder-name  # Must exist
operationId: operationName     # Must exist in API spec
inputs: {...}
outputs: [...]
```

### Input Types

Inputs can be defined as:

1. **From another API:**
```yaml
parameterName:
  from:
    api: urn:api:access-management
    operation: getOrganizations
    field: $.id  # JSONPath expression
```

2. **From previous step:**
```yaml
parameterName:
  from:
    step: Create API Instance
    output: environmentApiId
```

3. **Literal value:**
```yaml
parameterName:
  value: "Bronze"
```

4. **User-provided:**
```yaml
parameterName:
  userProvided: true
  example: "my-value"
```

## Creating a New Job

Use the template to create new jobs:

```bash
# Create directory and copy template
mkdir -p skills/your-job-name
cp docs/job-template.md \
   skills/your-job-name/SKILL.md

# Edit the file and replace all [placeholders]
# Validate when done
python3 scripts/build/validate_jtbd.py \
  skills/your-job-name/SKILL.md .
```

See `TEMPLATE.md` for a complete annotated template with all sections and placeholders.

## Converting to Hybrid Format

To convert an existing job:

1. Enhance frontmatter description with trigger terms
2. Add prose sections (see `TEMPLATE.md` for structure):
   - Overview (with "What you'll build")
   - Enhanced prerequisites
   - "What you'll need" per step
   - "What happens next" per step
   - Troubleshooting
   - Tips and best practices

**Reference:** Use `docs/job-template.md` as your guide and `deploy-api-with-rate-limiting.md` as a complete example.

## Using as Skills

To use a job as a skill in Claude Code or Cursor:

1. **For personal use:**
   ```bash
   mkdir -p ~/.cursor/skills/deploy-api-with-rate-limiting
   cp deploy-api-with-rate-limiting-hybrid.md \
      ~/.cursor/skills/deploy-api-with-rate-limiting/SKILL.md
   ```

2. **For project use:**
   ```bash
   mkdir -p .cursor/skills/deploy-api-with-rate-limiting
   cp deploy-api-with-rate-limiting-hybrid.md \
      .cursor/skills/deploy-api-with-rate-limiting/SKILL.md
   ```

The AI agent will discover and apply the skill when users mention:
- "deploy API"
- "rate limiting"
- "SLA tiers"
- "OAuth2 policy"
- "API security"

## Programmatic Use

### Extract Steps from Job

```python
import re
import yaml

def extract_steps(markdown_file):
    content = open(markdown_file).read()
    pattern = r'```yaml\n(.*?)\n```'
    matches = re.findall(pattern, content, re.DOTALL)

    steps = []
    for match in matches:
        data = yaml.safe_load(match)
        if isinstance(data, dict) and 'api' in data and 'operationId' in data:
            steps.append(data)

    return steps

# Usage
steps = extract_steps('deploy-api-with-rate-limiting.md')
print(f"Found {len(steps)} steps")
for i, step in enumerate(steps, 1):
    print(f"  Step {i}: {step['operationId']}")
```

### Validate All Jobs

```bash
#!/bin/bash
for job in skills/*/SKILL.md; do
  python3 scripts/build/validate_jtbd.py "$job" .
done
```

## Next Steps

1. **Convert remaining jobs** to hybrid format
2. **Build execution engine** to actually run jobs
3. **Integrate with viewer** to display hybrid format nicely
4. **Add schema files** for IDE autocomplete and validation
5. **Create job templates** for common patterns

## Resources

- **MuleSoft Documentation:** https://docs.mulesoft.com/
- **OpenAPI Specification:** https://spec.openapis.org/oas/v3.0.0
- **YAML Specification:** https://yaml.org/spec/1.2/spec.html

## Questions?

For issues or suggestions:
- Check the validator output for specific errors
- See `docs/x-jobs-to-be-done-schema.md` for format details
- Review `deploy-api-with-rate-limiting.md` as reference example

---

**Status:** Active development
**Format Version:** 1.0 (Hybrid)
**Last Updated:** 2026-03-19
