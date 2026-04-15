# Jobs-to-be-Done (JTBD) Job Documentation

## Overview

Jobs-to-be-Done (JTBD) jobs provide a standardized way to document multi-step API jobs. They guide users through chaining multiple operations together to accomplish real-world business tasks.

**Two formats are supported:**

1. **Hybrid Markdown Format** (✅ RECOMMENDED) - Standalone markdown files that work as AI skills, validatable jobs, and human documentation
2. **OpenAPI Extension Format** (Legacy) - YAML embedded in OpenAPI specs under `x-jobs-to-be-done` extension

---

## Hybrid Markdown Format (Recommended)

### Why Hybrid Format?

The hybrid format serves **three purposes** in one file:

1. **AI Skills** - Instructional prose that AI agents can follow
2. **Validatable Jobs** - Structured YAML blocks for programmatic validation
3. **Human Documentation** - Comprehensive guides with examples and troubleshooting

### File Structure

```markdown
---
name: job-name
description: |
  What it does. Use when [trigger terms for AI discovery].
---

# Job Title

## Overview

[Action verb] a [thing]... [Context].

**What you'll build:** [Clear outcome statement]

## Prerequisites

Before starting, ensure you have:

1. **Category 1**
   - Requirement details
   - How to obtain or verify

2. **Category 2**
   - More requirements

## Step 1: Step Name

[Prose explanation of what this step does and why]

**What you'll need:**
- Item 1
- Item 2

**Action:** [Clear instruction of what to do]

```yaml
api: urn:api:api-folder-name
operationId: operationName
inputs:
  parameterName:
    from:
      api: urn:api:other-api
      operation: operationName
      field: $.fieldName  # JSONPath expression (e.g., $.id, $.data[*].id)
    description: What this parameter is
outputs:
  - name: variableName
    path: $.fieldName  # JSONPath expression to extract from response
    description: What this output is used for
```

**What happens next:** [Explain the outcome and how it connects to next steps]

**Common issues:** (if applicable)
- **Issue**: Cause and solution

## Completion Checklist

- [ ] Verification item 1
- [ ] Verification item 2

## What You've Built

[Summary of achievements]

## Next Steps

1. **Action 1**
   - Details

2. **Action 2**
   - Details

## Tips and Best Practices

### Category
- **Tip**: Explanation

## Troubleshooting

### Issue Name

**Symptoms:** Description

**Possible causes:**
- Cause 1
- Cause 2

**Solutions:**
- Solution 1
- Solution 2

## Related Jobs

- **job-name**: Description
```

### Required Fields

**Frontmatter:**
- `name` (string, max 64 chars, kebab-case) - Job identifier
- `description` (string, max 1024 chars) - What it does and when to use it (include trigger terms for AI)

**At least 1 step with:**
- `api` (string) - API URN in format `urn:api:folder-name`
- `operationId` (string) - OpenAPI operationId (must exist in referenced API)
- `inputs` (object) - Parameter definitions
- `outputs` (array, optional) - Values to capture

### Input Formats

#### 1. From Another API
```yaml
parameterName:
  from:
    api: urn:api:access-management
    operation: getOrganizations
    field: $.id  # JSONPath expression
    name: currentOrganization  # Optional semantic name
  description: Your organization's Business Group GUID
  alternatives:  # Optional
    - field: $.subOrganizationIds
      description: Alternative field option
```

#### 2. From Previous Step
```yaml
# Reference step output
parameterName:
  from:
    step: Create API Instance
    output: environmentApiId
  description: API instance from step 1

# Reference step input (reuse)
parameterName:
  from:
    step: Create API Instance
    input: organizationId
  description: Same organizationId as step 1
```

#### 3. Literal Value
```yaml
parameterName:
  value: "Bronze"
  description: Name for the Bronze tier
```

#### 4. User-Provided
```yaml
parameterName:
  userProvided: true
  description: Your API implementation URL
  example: "https://api.example.com"
  pattern: "^https?://.+"  # Optional validation regex
  required: true  # Optional, default true
```

### Output Format

```yaml
outputs:
  - name: variableName
    path: $.id
    labels: $.name          # Optional: JSONPath for human-readable display names
    description: What this value represents and how it's used
```

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Identifier used to reference this output from later steps |
| `path` | Yes | JSONPath expression to extract the value from the API response |
| `labels` | No | JSONPath expression to extract a human-readable display name. When the path returns multiple values, each label is paired by index with the corresponding value and shown as `[i] label (value)` in the portal UI. Must resolve to the same number of items as `path`. |
| `description` | Yes | Human-readable explanation of what the output represents |

**JSONPath examples:**
- `$.id` - Root field
- `$.data.apiId` - Nested field
- `$.items[0].id` - First array item
- `$.data[*].id` - Array of all IDs in data array
- `$[0].groupId` - First item in root array
- `$.access_token` - Token field

**Example with labels** (environment selection):

```yaml
outputs:
  - name: environmentId
    path: $.data[*].id
    labels: $.data[*].name
    description: Selected environment ID — shown in portal as "[0] Production (f3b2a1c0-...)"
```

### Style Guidelines

**Overview:**
- Start with action verb (Creates, Configures, Applies, Manages)
- NO "This job" prefix
- Include "What you'll build" statement

**Prerequisites:**
- Group into logical categories
- Make conversational and actionable
- Specify how to obtain/verify each requirement

**Steps:**
- Include "What you'll need" before YAML block
- Include "What happens next" after YAML block
- Add "Common issues" for known problems

**Removed fields:**
- ❌ No `category` field
- ❌ No `tags` field
- ❌ No `relatedJTBDs` field (use "Related Jobs" markdown section instead)
- ❌ No time estimates or difficulty ratings

### Conditional Steps (Optional)

Skills can have **multiple entry points** for users who already have some prerequisites in place. This is expressed entirely in prose — no YAML changes needed.

#### Starting Point Section

Add an optional `## Starting Point` section between Prerequisites and Step 1 to guide users (and AI agents) to the right entry point:

```markdown
## Starting Point

This skill has multiple entry points depending on what you already have:

- **Start at Step 1** if you only have a URL and need to create an Exchange asset first
  - You'll need: `implementationUrl`
  - Steps: 1, 2, 3, 4, 5

- **Start at Step 2** if you already have an Exchange asset but no API Manager instance
  - You'll need: `organizationId`, `environmentId`, `groupId`, `assetId`, `assetVersion`
  - Steps: 2, 3, 4, 5

- **Start at Step 3** if you already have an API Manager instance and want to apply a policy
  - You'll need: `organizationId`, `environmentId`, `environmentApiId`
  - Steps: 2, 3, 5
```

**Format rules:**
- Each entry uses the pattern: `- **Start at Step N** if <condition>`
- Sub-items list required variables: `- You'll need: \`var1\`, \`var2\``
- Sub-items list the exact step sequence: `- Steps: 1, 2, 3` (the steps to execute for this path, in order)
- Referenced step numbers must exist in the skill
- The step sequence may not be strictly sequential — some paths skip steps or include earlier steps needed for context (e.g., listing environments)

#### Skip Annotations

Add a blockquote annotation at the top of a step's prose to indicate when it can be skipped:

```markdown
## Step 1: Create Exchange Asset

> **Skip if:** You already have an Exchange asset with a known `groupId`, `assetId`, and `assetVersion`.

Creates a new API asset in Exchange from your API specification...
```

**Format rules:**
- Use the exact pattern: `> **Skip if:** <condition text>`
- Place it as the first content after the step header
- The condition text should clearly state what the user needs to already have
- The parser extracts this into a separate `skip_condition` field and renders it as a banner
- In playground mode, steps with skip annotations get a "Skip this step" button
- When a step is skipped, the portal prompts users to manually provide any required variables

**Example:** See `skills/protect-api-with-policies/SKILL.md` for a complete working example of conditional steps.

### Validation

Use the validator to check:

```bash
python3 scripts/build/validate_jtbd.py job.md /path/to/api-specs-root
```

**Validates:**
- ✅ At least 1 step header is defined (## Step 1:, ## Step 2:, etc.)
- ✅ Step headers are numbered sequentially
- ✅ Number of step headers matches number of YAML blocks
- ✅ Frontmatter has `name` and `description`
- ✅ Each step has required fields (api, operationId)
- ✅ API URN points to existing folder
- ✅ OperationId exists in referenced API spec
- ✅ Step dependencies are valid
- ✅ Input/output references are correct
- ⚠️ Starting Point step references are in range (warning)
- ⚠️ Skip annotations on steps with downstream dependencies (warning)

### Creating a New Job

**Step 1:** Copy the template
```bash
cp docs/job-template.md your-job-name.md
```

**Step 2:** Fill in all `[placeholders]` with your content

**Step 3:** Validate
```bash
python3 scripts/build/validate_jtbd.py your-job-name.md /path/to/api-specs
```

**Example:** See `skills/deploy-api-with-rate-limiting/SKILL.md` for a complete working example.

### Using as AI Skills

**For Claude Code/Cursor:**

```bash
# Personal (available in all projects)
mkdir -p ~/.cursor/skills/job-name
cp job.md ~/.cursor/skills/job-name/SKILL.md

# Project-specific (shared in repo)
mkdir -p .cursor/skills/job-name
cp job.md .cursor/skills/job-name/SKILL.md
```

The AI agent discovers skills based on the `description` field trigger terms.

---

## OpenAPI Extension Format (Legacy)

> **Note:** This format is maintained for backward compatibility. New jobs should use the Hybrid Markdown Format.

### Structure

JTBD definitions are embedded in OpenAPI specs under the `x-jobs-to-be-done` extension:

```yaml
openapi: 3.0.0
info:
  title: API Manager API
  version: v1

x-jobs-to-be-done:
  deploy-api-with-rate-limiting:
    name: Deploy API with Rate Limiting
    description: |
      Complete job to create a production-ready API instance.

    category: API Lifecycle Management

    tags:
      - deployment
      - rate-limiting

    prerequisites:
      - description: Authenticated with valid Bearer token
        check: Have access to Anypoint Platform

    steps:
      - name: Create API Instance
        api: urn:api:api-manager
        operationId: createOrganizationsEnvironmentsApis
        description: |
          Creates a new API instance from an Exchange asset.
        inputs:
          organizationId:
            from:
              api: urn:api:access-management
              operation: getOrganizations
              field: $.id
            description: Your organization's Business Group GUID
        outputs:
          - name: environmentApiId
            path: $.id
            description: The API instance ID

    notes: |
      After completing these steps, your API will be deployed.

    relatedJTBDs:
      - promote-api-between-environments
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Human-readable title |
| `description` | string | ✅ | What the job accomplishes |
| `steps` | array | ✅ | Sequential operations |
| `category` | string | ❌ | Grouping category |
| `tags` | array | ❌ | Keywords for filtering |
| `prerequisites` | array | ❌ | Requirements before starting |
| `notes` | string | ❌ | Additional notes and tips |
| `relatedJTBDs` | array | ❌ | IDs of related jobs |

### Limitations

**Why migrate to hybrid format:**

1. ❌ **Makes OpenAPI specs large** - Jobs bloat the API definition files
2. ❌ **Not reusable** - Jobs tied to specific API specs
3. ❌ **Not versioned separately** - Can't evolve jobs independently
4. ❌ **Not discoverable** - Hard to browse outside the viewer
5. ❌ **No AI skill support** - Can't be used by AI agents
6. ❌ **No validation** - Can't verify API references or operations exist

### Migration Path

To migrate from OpenAPI extension to hybrid markdown:

1. **Extract JTBD from OpenAPI:**
   ```bash
   # Remove x-jobs-to-be-done section from api.yaml
   ```

2. **Create markdown file:**
   ```bash
   mkdir -p skills/job-name
   touch skills/job-name/SKILL.md
   ```

3. **Convert structure:**
   - Add frontmatter (remove `category`, `tags`, `relatedJTBDs`)
   - Enhance with prose sections (Overview, What you'll need, etc.)
   - Add troubleshooting and tips
   - Convert prerequisites to grouped markdown bullets

4. **Validate:**
   ```bash
   python3 scripts/build/validate_jtbd.py job-name.md .
   ```

See `docs/job-template.md` for the complete template structure.

---

## Input Definition Schema (Both Formats)

### From Another API (x-origin style)

```yaml
parameterName:
  from:
    api: urn:api:access-management      # API URN
    operation: getOrganizations         # Operation ID
    field: $.id                         # JSONPath expression
    name: currentOrganization           # Optional semantic name
  description: Your organization's Business Group GUID
  required: true
  alternatives:
    - field: $.subOrganizationIds
      description: Alternative source
```

**URN Format:** `urn:api:{folder-name}` where folder-name matches the API directory

### From Previous Step

```yaml
# Output reference
parameterName:
  from:
    step: Create API Instance          # Step name
    output: environmentApiId           # Output variable
  description: API instance from step 1

# Input reuse
parameterName:
  from:
    step: Create API Instance
    input: organizationId
  description: Same organizationId as step 1
```

### Literal Value

```yaml
parameterName:
  value: "Bronze"
  description: Name for the Bronze tier
```

### User-Provided

```yaml
parameterName:
  userProvided: true
  description: Your API implementation URL
  example: "https://api.example.com"
  pattern: "^https?://.+"
  required: true
```

---

## Best Practices

### Writing Descriptions

**Hybrid format (frontmatter):**
- Include what it does AND when to use it
- Add trigger terms for AI discovery
- Example: "Deploys production-ready API with rate limiting. Use when setting up API tiers, configuring SLA policies, or deploying secured APIs."

**OpenAPI format:**
- Focus on what the job accomplishes
- Example: "Complete job to create a production-ready API instance with multi-tier rate limiting."

### Documenting Steps

- Use clear, action-oriented step names
- Explain what each step does and why it's needed
- Include context about when steps would be used
- Document common issues and solutions (hybrid format)

### Documenting Inputs

- Use structured format for clarity
- Use URN format for API references
- Reference operations by operationId
- Use JSONPath for nested fields
- Mark optional parameters with `required: false`
- Provide examples for user-provided values
- Add validation patterns when appropriate

### Documenting Outputs

- Use descriptive variable names
- Explain how output will be used later
- Use correct JSONPath syntax (always start with `$`)
- Include descriptions that add context

### JSONPath Format

**All field expressions must use JSONPath format:**

- **Always start with `$`** - The root element
- **Use dot notation** for nested fields: `$.data.apiId`
- **Use bracket notation** for arrays:
  - Single item: `$.data[0].id` or `$[0].groupId`
  - All items: `$.data[*].id`
- **Common patterns:**
  - Root field: `$.id`, `$.access_token`
  - Nested field: `$.data.apiId`, `$.user.email`
  - Array access: `$.items[0].name`, `$.data[*].id`
  - Alternative fields: `$.subOrganizationIds`

---

## Tools

### Validator

```bash
python3 scripts/build/validate_jtbd.py job.md /path/to/api-specs
```
Checks: frontmatter, step headers, step structure, dependencies, API URN existence, and operation validation

### Extracting Steps Programmatically

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
```

---

## Resources

- **Template:** `docs/job-template.md` - Start here to create new jobs
- **Complete Example:** `skills/deploy-api-with-rate-limiting/SKILL.md`
- **Usage Guide:** `docs/jobs-readme.md`
- **Validator:** `scripts/build/validate_jtbd.py`

---

## Format Comparison

| Feature | Hybrid Markdown | OpenAPI Extension |
|---------|----------------|-------------------|
| **Location** | Standalone .md files | Embedded in api.yaml |
| **AI Skills** | ✅ Yes | ❌ No |
| **Validation** | ✅ Full (APIs + operations) | ❌ Limited |
| **Reusability** | ✅ High | ❌ Low |
| **Discoverability** | ✅ High | 🟡 Medium |
| **Versioning** | ✅ Independent | ❌ Coupled to API |
| **File Size** | ✅ Small, distributed | ❌ Large monolithic |
| **Human Friendly** | ✅ Rich prose + examples | 🟡 Basic |
| **Machine Readable** | ✅ Structured YAML blocks | ✅ Yes |
| **Troubleshooting** | ✅ Included | ❌ No |
| **Tips/Best Practices** | ✅ Included | ❌ No |

**Recommendation:** Use Hybrid Markdown format for all new jobs. Migrate existing OpenAPI extension jobs when possible.

---

## Support

For questions or issues:
- See validator output for specific errors
- Use `docs/job-template.md` to create new jobs
- Check `skills/deploy-api-with-rate-limiting/SKILL.md` for a complete example
- Review `docs/jobs-readme.md` for usage guidance
- Open an issue in the repository
