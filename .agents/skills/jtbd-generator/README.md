# JTBD Generator Skill

An AI agent skill for automatically generating Jobs-to-be-Done (JTBD) markdown files from natural language descriptions. This skill discovers API operations, maps data flow between steps, and produces complete, validated workflow documentation.

## What It Does

The JTBD Generator takes simple step descriptions like:

```
Prerequisites: user logged in, API asset in exchange
Steps:
1. Search assets in Exchange
2. List Flex Gateway targets
3. Create API in API Manager pointing to asset and gateway
```

And automatically generates a complete JTBD markdown file with:
- ✅ Correct API operations discovered from 31 available APIs
- ✅ Data flow mapped between steps (outputs → inputs)
- ✅ Complete prose documentation with troubleshooting
- ✅ Validated structure (frontmatter, YAML blocks, step headers)
- ✅ Ready to use as executable workflow or AI skill

## Quick Start

### Using the Skill

Simply describe your workflow in natural language:

```
User: Document these API steps: login to access management, get current org,
      select environment, list API Manager instances.

Claude: [Discovers operations, maps data flow, generates complete JTBD]
```

**Trigger phrases:**
- "Create a JTBD with these steps..."
- "Generate a workflow for..."
- "Document these API steps..."
- "Build a job with these operations..."

### What You Get

A complete JTBD markdown file in the top-level `skills/` directory with:

- **Frontmatter**: Name, description with trigger terms
- **Overview**: Action-oriented summary with "What you'll build"
- **Prerequisites**: Categorized requirements
- **Step-by-step instructions**: With YAML blocks, prose explanations
- **Troubleshooting**: Common issues and solutions
- **Tips & Best Practices**: Expert guidance
- **Related Jobs**: Links to similar workflows

## How It Works

### 1. Operation Discovery

The skill searches across 31 APIs (118+ operations each) using fuzzy matching:

```python
# Searches operationId, summary, description
search_operations("create api", "urn:api:api-manager")
# Returns: createOrganizationsEnvironmentsApis (score: 0.83)
```

### 2. Data Flow Intelligence

Automatically detects how data flows between steps:

**Rule 1: Output → Input Matching**
```yaml
Step 1 outputs: environmentApiId
Step 2 needs: environmentApiId
→ Auto-links: { from: { step: "Step 1", output: "environmentApiId" } }
```

**Rule 2: Input Reuse**
```yaml
Step 1 uses: organizationId
Step 2 needs: organizationId
→ Reuses: { from: { step: "Step 1", input: "organizationId" } }
```

**Rule 3: x-origin Annotations**
```yaml
Parameter has x-origin: access-management#getOrganizations
→ Uses annotation as default source
```

**Rule 4: Common Patterns**
```yaml
Parameter: organizationId (no previous source)
→ Defaults to: access-management#getOrganizations
```

**Rule 5: User-Provided Fallback**
```yaml
No source detected
→ Marks as: userProvided: true
```

### 3. Validation

Every generated JTBD is validated before saving:

- ✅ At least 1 step header defined (## Step 1:, ## Step 2:, etc.)
- ✅ Step headers numbered sequentially
- ✅ Step header count matches YAML block count
- ✅ Frontmatter has name and description
- ✅ Each step has required fields (api, operationId)
- ✅ API URN points to existing folder
- ✅ OperationId exists in referenced API spec
- ✅ Step dependencies are valid

## Directory Structure

```
.claude/skills/jtbd-generator/
├── README.md                  # This file
├── SKILL.md                   # Skill definition (instructions for Claude)
├── lib/                       # Python utilities
│   ├── __init__.py
│   ├── api_discovery.py       # Search operations across APIs
│   ├── parameter_analyzer.py  # Detect parameter sources
│   ├── response_analyzer.py   # Suggest output captures
│   ├── jtbd_builder.py        # Assemble markdown structure
│   ├── common_patterns.py     # Known parameter patterns
│   └── utils.py               # Shared helpers
└── scripts/                   # Executable scripts
    └── validate_jtbd.py       # Standalone validator
```

## Python Libraries

### api_discovery.py

Search and discover API operations:

```python
from lib import api_discovery

# List all available APIs
apis = api_discovery.list_available_apis(Path('.'))
# Returns: [{'urn': 'urn:api:api-manager', 'title': 'API Manager API', 'operations': 118}]

# Search for operations
results = api_discovery.search_operations('create api', 'urn:api:api-manager', Path('.'))
# Returns: [{'operationId': 'createOrganizationsEnvironmentsApis', 'score': 0.83}]

# Get operation details
details = api_discovery.get_operation_details('urn:api:api-manager', 'createOrganizationsEnvironmentsApis', Path('.'))
# Returns: {'method': 'POST', 'path': '/organizations/{organizationId}/...', 'parameters': [...]}
```

### parameter_analyzer.py

Analyze parameters and detect sources:

```python
from lib import parameter_analyzer

# Build all inputs for a step
inputs = parameter_analyzer.build_all_inputs(
    'urn:api:api-manager',
    'createOrganizationsEnvironmentsApis',
    Path('.'),
    previous_steps=[...]  # Already processed steps
)
# Returns: {'organizationId': {'from': {...}, 'description': '...'}}

# Detect source for a specific parameter
source = parameter_analyzer.detect_parameter_source('environmentApiId', param_def, previous_steps)
# Returns: {'source_type': 'from_step', 'source_details': {...}, 'confidence': 'high'}
```

### response_analyzer.py

Suggest outputs to capture:

```python
from lib import response_analyzer

# Analyze response and suggest outputs
outputs = response_analyzer.analyze_response_for_operation(
    'urn:api:api-manager',
    'createOrganizationsEnvironmentsApis',
    Path('.'),
    next_steps=[...]  # Upcoming steps
)
# Returns: [{'name': 'environmentApiId', 'path': '$response.body#/id', 'description': '...'}]
```

### jtbd_builder.py

Build markdown structure:

```python
from lib import jtbd_builder

# Build YAML block for a step
yaml_block = jtbd_builder.build_step_yaml(
    'urn:api:api-manager',
    'createOrganizationsEnvironmentsApis',
    inputs={'organizationId': {...}},
    outputs=[{'name': 'environmentApiId', ...}]
)

# Build complete JTBD
jtbd_content = jtbd_builder.build_complete_jtbd(
    name='deploy-api-with-flex-gateway',
    description='Deploy API instance to Flex Gateway...',
    title='Deploy API with Flex Gateway',
    overview='Deploys an API instance...',
    what_youll_build='An API instance connected to your Flex Gateway',
    prerequisites=['Authentication', 'Resources'],
    steps=[...]
)
```

## Validation

### Using the Validator

```bash
# Validate a JTBD file
python3 .claude/skills/jtbd-generator/scripts/validate_jtbd.py path/to/job.md .
```

### What It Checks

```
📋 Frontmatter validation
   - Has 'name' field (max 64 chars, kebab-case)
   - Has 'description' field (max 1024 chars)

📑 Step header validation
   - At least 1 step header (## Step 1:, ## Step 2:, etc.)
   - Sequential numbering (1, 2, 3, ...)
   - Count matches YAML block count

📦 Step structure validation
   - Each step has 'api' field (URN format)
   - Each step has 'operationId' field
   - Each step has 'inputs' object

🔗 API reference validation
   - API URN points to existing folder
   - OperationId exists in the API spec

🔀 Dependency validation
   - Step references are valid
   - Input/output references are correct
```

## Examples

### Example 1: Simple List Operation

**Input:**
```
Steps: 1. List APIs in environment
```

**Generated:**
```yaml
api: urn:api:api-manager
operationId: listOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: id
  environmentId:
    from:
      api: urn:api:access-management
      operation: listEnvironments
      field: data[].id
outputs:
- name: apiInstances
  path: $response.body#/assets
```

### Example 2: Multi-Step with Data Flow

**Input:**
```
Steps:
1. Search assets in Exchange
2. List Flex Gateway targets
3. Create API in API Manager
```

**Generated Data Flow:**
```
Step 1 → outputs: groupId, assetId, version
Step 2 → outputs: targetId
Step 3 → uses: groupId, assetId, version (from Step 1)
          uses: targetId (from Step 2)
          reuses: organizationId, environmentId (from Step 2)
```

## Output Location

Generated JTBDs are saved to:

```
skills/{name}/SKILL.md
```

Example outputs:
- `skills/deploy-api-with-flex-gateway-from-exchange/SKILL.md`
- `skills/list-api-manager-instances/SKILL.md`
- `skills/manage-user-permissions/SKILL.md`

## Use Cases

### 1. Documentation

Generate workflow documentation from API specs:
- Onboarding guides for new team members
- API usage tutorials
- Integration guides

### 2. Automation

Create executable workflows:
- CI/CD pipelines
- Infrastructure automation
- API testing scenarios

### 3. AI Skills

Convert JTBDs to Claude Code skills:

```bash
# Make JTBD available as a skill (copy entire directory)
cp -r skills/deploy-api-with-flex-gateway-from-exchange \
   ~/.claude/skills/
```

Now Claude can execute the workflow when you say:
- "Deploy my API to Flex Gateway"
- "Set up an API with rate limiting"
- "Promote this API to production"

### 4. Training & Support

Use JTBDs for:
- Customer support knowledge base
- Partner integration training
- Developer certification materials

## Technical Details

### Supported APIs

The skill works with all APIs in the repository:

- **Access Management** (identity, orgs, environments)
- **API Manager** (APIs, policies, tiers, contracts)
- **Exchange Experience** (asset discovery, publishing)
- **Flex Gateway Manager** (gateway targets, configuration)
- **API Designer Experience** (design-time operations)
- **API Platform** (repository operations)
- **Runtime Manager** (CloudHub deployments)
- And 24 more...

Total: **31 APIs**, **3000+ operations**

### Parameter Detection

Automatically detects parameter sources from:

1. **x-origin annotations** in OpenAPI specs
2. **Previous step outputs** (by name matching)
3. **Previous step inputs** (for reuse)
4. **Common patterns** (organizationId, environmentId, etc.)
5. **Parameter naming** (asset.assetId → user-provided)

### Performance

- **Operation search**: ~100ms across 31 APIs
- **Parameter analysis**: ~50ms per operation
- **Complete generation**: ~2-3 seconds for 3-step workflow
- **Validation**: ~500ms per JTBD

## Troubleshooting

### Skill Not Triggering

**Symptoms:** Claude doesn't use the skill when you describe steps

**Solutions:**
- Use trigger phrases: "create a JTBD", "generate workflow"
- Be explicit: "Use jtbd-generator to document..."
- Check skill is in `.claude/skills/jtbd-generator/`

### Operation Not Found

**Symptoms:** "I couldn't find an operation matching..."

**Solutions:**
- Try broader search terms: "create" instead of "create new"
- Specify API: "...in api-manager"
- Check operation exists: `grep -r "operationId" api-manager/api.yaml`

### Data Flow Incorrect

**Symptoms:** Parameters linked to wrong source

**Solutions:**
- Review generated YAML blocks
- Manually adjust `from` references
- Update common_patterns.py for frequently used parameters

### Validation Fails

**Symptoms:** "❌ FAILED: N error(s) found"

**Solutions:**
- Read error messages carefully
- Check API URN format: `urn:api:folder-name`
- Verify operationId exists in API spec
- Fix step references to use actual step names

## Development

### Adding New Patterns

Edit `lib/common_patterns.py`:

```python
COMMON_PATTERNS = {
    'yourParameterName': {
        'api': 'urn:api:your-api',
        'operation': 'yourOperation',
        'field': 'fieldPath',
        'description': 'Your description'
    }
}
```

### Extending Functionality

The modular structure makes it easy to extend:

- **New input types**: Extend `parameter_analyzer.py`
- **Better output detection**: Enhance `response_analyzer.py`
- **Custom prose templates**: Modify `jtbd_builder.py`
- **Additional APIs**: Just add `api.yaml` to a new folder

### Testing

```bash
# Test the complete workflow
python3 << 'EOF'
import sys
from pathlib import Path

sys.path.insert(0, '.claude/skills/jtbd-generator')
from lib import api_discovery

# Test API discovery
apis = api_discovery.list_available_apis(Path('.'))
print(f"Found {len(apis)} APIs")

# Test operation search
results = api_discovery.search_operations('create api', 'urn:api:api-manager', Path('.'))
print(f"Found {len(results)} matching operations")
EOF

# Test validation
python3 .claude/skills/jtbd-generator/scripts/validate_jtbd.py \
    skills/deploy-api-with-rate-limiting/SKILL.md .
```

## Version History

- **v1.0** (2026-03-26)
  - Initial release
  - Self-contained skill structure
  - Support for 31 APIs
  - Data flow intelligence with 5 rules
  - Complete validation

## Contributing

To improve the skill:

1. **Add more patterns** to `lib/common_patterns.py`
2. **Enhance operation discovery** in `lib/api_discovery.py`
3. **Improve prose quality** in SKILL.md instructions
4. **Report issues** with specific examples

## Resources

- **Template**: `docs/job-template.md`
- **Schema Documentation**: `docs/x-jobs-to-be-done-schema.md`
- **Usage Guide**: `docs/jobs-readme.md`
- **Example JTBDs**: `skills/*/SKILL.md`

## License

Part of the api-notebook-anypoint-specs repository.

---

**Status**: Production Ready
**Version**: 1.0
**Last Updated**: 2026-03-26
