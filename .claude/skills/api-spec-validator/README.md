# API Spec Validator Skill

Agent skill for validating OpenAPI Specification (OAS) files to ensure they are AI-agent-friendly and production-ready.

## Overview

This skill provides validation for API specifications:

- **Two-Pass Validation**: First validates OAS syntax, then checks against 8 comprehensive rules designed to make APIs more usable by AI agents

## Installation

### Prerequisites

Install the Anypoint CLI tool and API project plugin:

```bash
npm install -g anypoint-cli-v4
anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin
```

### Usage with Claude

This skill is automatically available when working in this project. Simply ask Claude to:
- "Validate the API spec"
- "Check this OpenAPI specification"
- "Review my OAS file for best practices"

## Validation Rules

1. **OAS Format Required** - Must be valid OpenAPI 3.0/3.1 in YAML format. RAML specs will be converted to OAS.
2. **Operation IDs Required** - Descriptive IDs (avoid `get_data`, prefer `calculateTaxRate`)
3. **Descriptions with Context** - Include:
   - Legacy field mappings (INTERNAL MAPPING)
   - Contextual warnings (slow endpoints, rate limits)
   - AI aliases for cryptic paths
   - **Recovery instructions for 400 error responses**
4. **Examples Required** - Request and response examples for all endpoints
5. **Type Documentation** - All properties must have descriptions
6. **Output Documentation** - All response schemas fully documented
7. **No Naked Strings** - Use enums for fields with limited options
8. **Required Fields Explicit** - Always list required fields in schema

## Command-Line Usage

### Two-Pass Validation Workflow

Validation should be performed in **two passes**:

#### Pass 1: Basic OAS Format Validation

First, validate that the OAS file is syntactically correct:

```bash
anypoint-cli-v4 api-project validate --json --location=./path/to/folder/with/oas
```

This checks for valid OAS structure and syntax. **Only proceed to Pass 2 if Pass 1 succeeds.**

#### Pass 2: Full Compliance Validation

After Pass 1 succeeds, validate against all AI-agent-friendly rules:

```bash
anypoint-cli-v4 api-project validate --json --location=./path/to/folder/with/oas --local-ruleset skills/api-spec-validator/scripts/ruleset.yaml
```

This checks all 8 compliance rules for AI-agent friendliness.

### Example output

**Pass 1 (Basic Validation):**
```bash
$ anypoint-cli-v4 api-project validate --location=./api-spec

Validating API specification...
✓ Valid OpenAPI 3.0.2 format
✓ All required fields present
✓ Schema structure valid

Validation passed
```

**Pass 2 (Compliance Validation):**
```bash
$ anypoint-cli-v4 api-project validate --location=./api-spec --local-ruleset skills/api-spec-validator/scripts/ruleset.yaml

Validating API specification...

✓ oas-only: Valid OpenAPI 3.0.2
✓ operation-examples: All operations have examples

⚠ Violations found:

1. operation-id-camel-case
   - GET /users: operationId 'get_data' must be in camelCase
   - Use descriptive names like 'getUserProfile'

2. no-naked-strings
   - POST /orders (request): Property 'status' must have enum
   - Avoid naked strings with no constraints

Validation completed with 2 violations
```

## Related Skills

- **api-schema-inferrer** - Infer and generate schemas from examples in OAS specs
- **api-doc-generator** - Generate markdown documentation with curl examples from OAS specs

## Examples

### Good Example

See `references/example-good-spec.yaml` for a fully compliant API specification demonstrating all best practices, including:
- Descriptive operation IDs
- Legacy field mappings
- 400 error response recovery instructions
- Comprehensive examples

### Common Violations

See `references/example-violations.yaml` for examples of what NOT to do, with inline comments explaining each violation.

## Files

```
skills/api-spec-validator/
├── SKILL.md                         # Main skill definition for Claude
├── README.md                        # This file
├── scripts/
│   ├── ruleset.yaml                # AMF validation rules for anypoint-cli-v4
│   ├── add_operation_ids.py        # Helper script to add operation IDs
│   ├── improve_operation_ids.py   # Helper script to improve operation IDs
│   ├── add_descriptions.py         # Helper script to add descriptions
│   ├── add_examples.py             # Helper script to add examples
│   └── fix_delete_head_examples.py # Helper script for DELETE/HEAD operations
└── references/
    ├── example-good-spec.yaml      # Example of compliant spec
    └── example-violations.yaml     # Example of violations
```

## Integration with CI/CD

You can integrate the validator into your CI/CD pipeline:

```yaml
# .github/workflows/validate-specs.yml
name: Validate API Specs
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install Anypoint CLI
        run: |
          npm install -g anypoint-cli-v4
          anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin
      - name: Validate specs
        run: |
          for spec_dir in specs/*/; do
            echo "Validating $spec_dir"

            # Pass 1: Basic validation
            echo "Pass 1: Basic OAS validation..."
            anypoint-cli-v4 api-project validate --location="$spec_dir"

            # Pass 2: Compliance validation
            echo "Pass 2: Compliance validation..."
            anypoint-cli-v4 api-project validate --location="$spec_dir" --local-ruleset skills/api-spec-validator/scripts/ruleset.yaml
          done
```

## Contributing

To add new validation rules:

1. Update `SKILL.md` with the new rule description
2. Add validation logic to `ruleset.yaml` using AMF Validation Profile format
3. Add examples to the reference files
4. Test against both good and bad specs

### AMF Validation Profile Format

The `ruleset.yaml` uses the AMF Validation Profile format. Example rule:

```yaml
validations:
  my-custom-rule:
    message: Error message for {{property}}
    documentation: |
      Detailed explanation of the rule
    targetClass: apiContract.Operation
    propertyConstraints:
      core.description:
        minCount: 1
```

## License

See project root LICENSE file.
