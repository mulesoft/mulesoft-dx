# Anypoint API Specifications

This repository is the **single source of truth** for all public Anypoint Platform API specifications. It contains OpenAPI (OAS) specifications for all production-accessible APIs.

## Purpose

- Centralized registry of all public Anypoint Platform APIs
- Ensures API specifications are validated and compliant with AI-agent-friendly standards
- Enables API discovery and consumption through standardized, well-documented specs
- Provides version control and change tracking for API specifications

## Repository Structure

Each API service has its own directory containing:
```
<service-name>/
├── api.yaml           # Main OpenAPI specification file
├── exchange.json      # Exchange metadata (groupId, assetId, version, etc.)
├── schemas/           # Reusable schema definitions (optional)
├── examples/          # Request/response examples (optional)
└── skills/            # JTBD workflow skills (optional)
```

The repository also includes shared tooling:
```
scripts/
├── portal_generator/  # Static API documentation portal generator
├── tests/             # Portal generator test suite (pytest)
├── generate_portal.py # Entry point for portal generation
├── requirements.txt   # Python dependencies
└── pyproject.toml     # Pytest configuration
```

## Getting Started

### Prerequisites

- Node.js and npm installed (for Anypoint CLI)
- Anypoint CLI v4 with API Project plugin
- Python 3 (for portal generator and validation scripts)
- Claude Code CLI (for validation skills)

### Installing Required Tools

**1. Install Anypoint CLI v4:**
```bash
npm install -g anypoint-cli-v4
anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin
```

**2. Install Python dependencies:**
```bash
pip3 install -r scripts/requirements.txt
```

**3. Install API Spec Validation Skills:**
```bash
# In Claude Code CLI
/plugin marketplace add machaval/api-spec-skills
```

This installs the `api-spec-validator` skill which validates specs against AI-agent-friendly best practices using Anypoint CLI under the hood.

**4. Git hooks (automatic):**

Git hooks are automatically configured the first time you run any `make` command. Pre-commit runs fast validators (~2-5s) and pre-push runs tests + governed validation. See `make help` for skip options.

### Makefile Commands

The Makefile provides convenient shortcuts for common tasks:

```bash
make help                  # Show all available targets
make validate-all-governed # Validate all APIs with governance rules
make validate-api API=name # Validate a specific API
make list-apis             # List all discovered APIs
make generate-portal       # Generate static API documentation portal
make test-portal           # Run portal generator test suite
make report                # Generate comprehensive validation report
```

## Contributing Your API Specification

### Development Workflow

1. **Develop Locally**
   - Maintain your API specification in your service repository during development
   - Update and iterate on your spec as your API evolves

2. **Validate Your Spec**

   Before submitting, validate your specification using the validation tool:

   **Option A: Using Claude Code (Recommended)**
   ```bash
   # In Claude Code, ask:
   Can you validate my API spec at <path-to-your-spec>?
   ```

   **Option B: Using Anypoint CLI Directly**
   ```bash
   # Get the ruleset path from the installed skill
   RULESET_PATH=~/.claude/plugins/marketplaces/api-spec-skill/skills/api-spec-validator/scripts/ruleset.yaml

   # Validate your spec
   anypoint-cli-v4 api-project validate \
     --location=./path/to/your-service \
     --local-ruleset=$RULESET_PATH
   ```

   The validator checks:
   - ✓ Valid OAS format (3.0.x or 3.1.x)
   - ✓ `info.title` ends with "API"
   - ✓ `info.version` uses semver (x.x.x)
   - ✓ `info.description` is present
   - ✓ No duplicated operation IDs
   - ✓ All endpoints have descriptive `operationId`
   - ✓ All operations have clear descriptions
   - ✓ Request/response examples are provided
   - ✓ Schema properties are well-documented
   - ✓ Enums are used for constrained string values
   - ✓ Required fields are explicitly listed
   - ✓ Parameters have descriptions

3. **Prepare for Submission**

   Create your service directory with required files:
   ```
   your-service/
   ├── api.yaml           # Your validated OpenAPI spec
   └── exchange.json      # Exchange metadata
   ```

   **exchange.json template:**
   ```json
   {
       "main": "api.yaml",
       "name": "Your Service API",
       "classifier": "oas",
       "tags": [],
       "groupId": "your-group-id.anypoint-platform",
       "assetId": "your-service-api",
       "version": "1.0.0",
       "apiVersion": "v1",
       "backwardsCompatible": false,
       "originalFormatVersion": "3.0",
       "organizationId": "your-org-id"
   }
   ```

4. **Submit Pull Request**

   - Create a feature branch: `git checkout -b add-your-service-api`
   - Add your service directory: `git add your-service/`
   - Commit changes: `git commit -m "Add Your Service API specification"`
   - Push and create PR: `git push origin add-your-service-api`

### Validation Requirements

All PRs must pass validation before merging:

- ✅ Spec must be in valid OAS format
- ✅ Zero validation errors (warnings are acceptable with justification)
- ✅ `exchange.json` must include all required metadata
- ✅ CI/CD validation pipeline must pass

### CI/CD Integration

**For Service Teams:**

Add this to your service's CI/CD pipeline to validate specs before committing:

```yaml
# Example GitHub Actions workflow
name: Validate API Spec

on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Anypoint CLI
        run: |
          npm install -g anypoint-cli-v4
          anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin

      - name: Download validation ruleset
        run: |
          curl -o ruleset.yaml https://raw.githubusercontent.com/machaval/api-spec-skills/main/skills/api-spec-validator/scripts/ruleset.yaml

      - name: Validate API spec
        run: |
          anypoint-cli-v4 api-project validate \
            --json \
            --location=./path/to/your-service \
            --local-ruleset=./ruleset.yaml
```

**Automated PR Submission:**

For fully automated updates, configure your service CI/CD to:
1. Validate the spec on each release using Anypoint CLI
2. Create a PR to this repository with the updated spec
3. Tag the PR with version information and validation results

Example GitHub Action snippet:
```yaml
- name: Validate and Submit to API Specs Repo
  run: |
    # Validate spec first
    curl -o ruleset.yaml https://raw.githubusercontent.com/machaval/api-spec-skills/main/skills/api-spec-validator/scripts/ruleset.yaml
    anypoint-cli-v4 api-project validate \
      --json \
      --location=./your-service \
      --local-ruleset=./ruleset.yaml

    # If validation passes, submit PR
    git clone https://github.com/your-org/api-notebook-anypoint-specs.git
    cd api-notebook-anypoint-specs
    cp -r ../your-service ./
    git checkout -b update-your-service-${{ github.ref_name }}
    git add your-service/
    git commit -m "Update Your Service API to ${{ github.ref_name }}"
    git push origin update-your-service-${{ github.ref_name }}

    # Create PR using GitHub CLI
    gh pr create \
      --title "Update Your Service API to ${{ github.ref_name }}" \
      --body "Automated spec update - Validation passed ✅"
```

## Updating Existing Specifications

When updating an existing API specification:

1. Update your local spec in your service repository
2. Run validation to ensure compliance
3. Update the `version` field in `exchange.json`
4. Submit a PR with clear description of changes
5. Include migration notes if there are breaking changes

## MCP Servers

MCP servers are contributed under `mcps/<server-name>/` with three files:

- `exchange.json` — Exchange metadata (name, version, ...).
- `server.yaml` — OpenAPI-style `servers:` list describing the MCP endpoints.
- `mcp.yaml` — MCP metadata (transport, capabilities, tools, prompts, resources).

To generate the `mcp.yaml` metadata by introspecting a running MCP server, use the Anypoint CLI:

```bash
anypoint-cli-v4 agent-network mcp introspect \
  --url=https://anypoint.mulesoft.com/exchange \
  --auth-type=bearer \
  --auth-value=<YOUR_BEARER_TOKEN> \
  --output=<PATH_TO_REPO>/mcps/<server-name>/mcp.yaml \
  --format=yaml
```

Replace `<YOUR_BEARER_TOKEN>` with a valid Anypoint Platform token and `<PATH_TO_REPO>` with the absolute path to your local checkout of this repository.

## Agent-Only Validation Skills

Some quality checks are too nuanced for regex-based rules and are implemented as agent skills instead. These are **not** part of the automated CLI/CI pipeline — they require an AI agent to run.

| Skill | What it checks | How to run |
|-------|---------------|------------|
| `validate-imperative-format` | `info.description` starts with an imperative verb and avoids boilerplate phrasing | Ask your AI agent: *"validate imperative format"* |

These skills live in `.agents/skills/` alongside the automated ones but are clearly marked as agent-only in their documentation.

## Example Usage with Claude Code

Once your spec is in this repository, users can interact with it using Claude Code:

```
# Validate any spec
Can you validate the API spec in api_manager/?

# Check compliance
Can you check if the exchange API spec is compliant with AI-agent best practices?

# Fix issues
Can you fix the validation issues in my-service/api.yaml?
```

## API Documentation Portal

The repository includes a static site generator that produces an interactive API documentation portal from the OpenAPI specs and JTBD skills.

```bash
# Generate the portal
make generate-portal

# Open the result
open portal/index.html
```

The portal features API browsing, operation details with "Try It Out" panels, skill workflow execution, and authentication management.

### Running Tests

The portal generator has a test suite covering unit tests, OAS parser edge cases, and end-to-end smoke tests:

```bash
# Run all tests
make test-portal

# Run a specific test file
cd scripts && python3 -m pytest tests/test_oas_parser.py -v
```

## Known Limitations

### Skipped APIs in Governed Validation

Some API specs are too large for the OPA-based governance validator used by `anypoint-cli-v4` and are skipped during `make validate-all-governed`. These are listed in the `SKIP_GOVERNED` variable in the Makefile.

| API | Reason | Workaround |
|-----|--------|------------|
| `arm-monitoring-query` | ~112k-line spec causes OOM crash in the OPA validator | Skipped; can still be validated with basic `make validate-api API=arm-monitoring-query` (no governance rules) |

To force-include all APIs (e.g. if the validator is updated with higher memory limits):
```bash
make validate-all-governed SKIP_GOVERNED=""
```

## Questions?

For questions about:
- **API spec standards**: See the [api-spec-validator skill documentation](https://git.soma.salesforce.com/mulesoft/claude-code-marketplace/tree/master/plugins/mulesoft-api-development/skills)
- **Contribution process**: Open an issue in this repository
- **CI/CD integration**: Contact the platform team
