---
name: api-spec-validator
description: This skill should be used when the user asks to "validate API spec", "check OpenAPI spec", "lint OAS", "review API specification", "convert RAML to OAS", or mentions validating, checking, or reviewing OpenAPI/OAS/Swagger/RAML specifications against best practices.
metadata: 
  version: 2.0.0
  author: "Mariano de Achaval"
---

# API Spec Validator

This skill validates OpenAPI Specification (OAS) files against a comprehensive set of rules designed to ensure API specifications are AI-agent-friendly and production-ready.

## API Project structure.

Every api specification should be organized as an Anypoint API Project with the following structure:

```api-project/
├── api.yaml
├── README.md
├── docs/
├── exchange.json
```

Exchange.json needs to have the following shape:
```json
{
    "main": "api.yaml",
    "name": "<name-of-the-api>",
    "organizationId": "8bfc8bbf-5508-419e-aadc-77dfe18a8172",
    "groupId": "f1e97bc6-315a-4490-82a7-23abe036327a.anypoint-platform",
    "assetId": "<same-as-the-folder>",
    "version": "<any-semver-version default 1.0.0>",    
    "apiVersion": "v1",
    "classifier": "oas",
    "dependencies": [],    
    "originalFormatVersion": "3.0"
}
```

## When to Use This Skill

Use this skill when:
- Validating or reviewing OpenAPI/OAS/Swagger specifications
- Checking API specs for completeness and best practices
- Ensuring API specs are optimized for AI agent consumption
- Auditing API documentation quality

## Validation Rules

### Rule 1: OAS Format Required
All API specifications must be written in OpenAPI Specification (OAS) format in YAML. Supported versions:
- OAS 3.0.x
- OAS 3.1.x

**Translation**: All APIs should be written in OAS 3 or bigger and in YAML format. 

### Rule 2: API Title Must End with "API"
The `info.title` field must end with the word "API" to ensure consistent naming across the portal.

**Valid:** `Secrets Manager API`, `Object Store API`, `API Manager API`

**Invalid:** `Tokenization`, `ObjectStore`, `ARM REST services`, `Exchange - XAPI Service`

### Rule 3: Semantic Versioning Required
The `info.version` field must use strict Semantic Versioning with three numeric components: `MAJOR.MINOR.PATCH`.

**Valid:** `1.0.0`, `2.1.3`, `0.7.0`

**Invalid:** `v1`, `V1`, `1.0`, `1`, `v1.0.0`, `v2`

This ensures consistent version formatting across all API specifications, enabling reliable version comparison and tooling support.

### Rule 4: Operation IDs Required
Every endpoint operation must have an `operationId` that is:
- **Descriptive and specific**: Clearly indicates what the operation does
- **Avoids generic names**: ❌ `get_data`, `update`, `post_item`, `fetch`
- **Follows verb-noun pattern**: ✅ `calculateTaxRate`, `provisionCloudServer`, `getUserPreferences`, `cancelSubscription`

**Good examples:**
- `calculateTaxRate` - specific action + specific domain
- `provisionCloudServer` - clear verb + clear resource
- `getUserPaymentHistory` - specific action + specific data

**Bad examples:**
- `get_data` - too generic
- `update` - missing context
- `create` - which resource?
- `fetch` - fetch what?

### Rule 5: Descriptions Required with Context
Every endpoint operation must have a `description` field. Apply special handling for:

#### Legacy Field Mapping
If a field name is cryptic or legacy (e.g., `v1_status_code`, `legacy_tier`, `old_category`), override its description with clear mapping:

```yaml
description: "INTERNAL MAPPING: This represents the customer's loyalty tier. Map 'A' to Gold, 'B' to Silver, 'C' to Bronze."
```

#### Contextual Warnings
Add "WARNING" notes in descriptions for important operational considerations:

```yaml
description: "WARNING: This endpoint is slow. Expect a 5-second delay. Do not retry before 10 seconds."
```

```yaml
description: "WARNING: This endpoint is rate-limited to 10 requests per minute per user."
```

#### AI Aliases for Cryptic Paths
If the path is cryptic (e.g., `POST /rpc/v2/action_4`, `GET /api/v1/proc/17`), use the `summary` field to give it a human-readable "AI Alias":

```yaml
summary: "Create Support Ticket"
description: "Creates a new support ticket in the system."
```

#### Legacy Error Response Handling
For legacy 400 Bad Request responses, add recovery instructions in the response description to help AI agents parse error bodies and retry correctly:

```yaml
responses:
  '400':
    description: "Bad Request. RECOVERY INSTRUCTIONS: If the response contains 'ERR_04', the date format was wrong. Re-try using YYYY-MM-DD format. If 'ERR_12', the amount exceeded maximum limit - reduce amount to under $10,000."
    content:
      application/json:
        schema:
          type: object
          properties:
            errorCode:
              type: string
              enum: [ERR_04, ERR_12, ERR_15]
              description: "Error code indicating the type of validation failure"
            message:
              type: string
              description: "Human-readable error message"
        examples:
          dateFormatError:
            summary: Date format error
            value:
              errorCode: "ERR_04"
              message: "Invalid date format"
```

**Pattern for recovery instructions:**
- Start with "RECOVERY INSTRUCTIONS:" in the 400 response description
- Map each error code to specific corrective action
- Be explicit about what to change (format, value range, required fields, etc.)
- Prevent unnecessary retries by being specific about the fix needed

### Rule 6: Examples Required
Every endpoint operation must have at least one example demonstrating:
- Request parameters (if applicable)
- Request body (if applicable)
- Successful response (200/201)

Use the `examples` field in request bodies and responses:

```yaml
requestBody:
  content:
    application/json:
      examples:
        createUser:
          summary: Create new user
          value:
            name: "John Doe"
            email: "john@example.com"
```

### Rule 7: Type Documentation Required
All schema properties must include a `description` field explaining:
- What the field represents
- Valid values or ranges
- Business logic or constraints

```yaml
properties:
  status:
    type: string
    description: "Current order status. Transitions from 'pending' → 'processing' → 'shipped' → 'delivered'."
```

### Rule 8: Output Types Documentation Required
All response schemas must be fully documented with:
- Description for each property
- Data types clearly specified
- Nullable fields explicitly marked

### Rule 9: No Naked Strings
If a field has a limited set of options, it must have an `enum` defined. Never use plain `string` type for constrained values.

**Bad:**
```yaml
status:
  type: string
  description: "Order status (pending, shipped, or delivered)"
```

**Good:**
```yaml
status:
  type: string
  enum: [pending, shipped, delivered]
  description: "Current order status"
```

### Rule 10: Required Fields Explicit
Always explicitly list required fields in the schema's `required` array to prevent AI agents from "guessing" optional parameters.

```yaml
properties:
  name:
    type: string
  email:
    type: string
  age:
    type: integer
required:
  - name
  - email
```

### Rule 11: API-Level Identity (info.description)
The `info.description` field is the first signal an AI agent uses for API-level discovery. When choosing among many APIs, this description determines whether the agent selects the right one.

Every API must have a non-empty `info.description` that explains the API's domain, capabilities, and intended use cases.

**Bad:**
```yaml
info:
  title: Core Services API Reference
  version: 1.0.0
```

**Good:**
```yaml
info:
  title: Secrets Manager API
  version: 1.0.0
  description: >
    Manages secrets, shared secrets, and TLS contexts for Anypoint Platform.
    Provides operations to create, retrieve, update, and delete secrets
    including symmetric keys, certificates, and keystores used by Mule
    applications and API gateways.
```

## Fix Instructions

When validation finds violations, use the following instructions to fix each rule. Fixes fall into two categories: **mechanical** (can be scripted) and **semantic** (require understanding the API's domain).

### Fixing `api-title-ends-with-api` (mechanical + semantic)
1. Open the API spec and find the `info.title` field
2. If it already ends with 'API', no change needed
3. Otherwise, rename to a clear, descriptive title ending with 'API':
   - `Tokenization` → `Tokenization API`
   - `ObjectStore` → `Object Store API`
   - `ARM REST services` → `ARM REST Services API`
   - `Exchange - XAPI Service` → `Exchange Experience API`
   - `Edge Security Policies` → `Anypoint Security Policies API`
   - `Core Services API Reference` → `Access Management API`
4. Avoid trailing suffixes like 'Service', 'Reference', 'xAPI', or version numbers before 'API'
5. Use title case for the name

### Fixing `api-version-semver` (mechanical)
1. Open the API spec and find the `info.version` field
2. Convert the current value to `MAJOR.MINOR.PATCH` format:
   - `v1` or `V1` or `"1"` → `1.0.0`
   - `v2` → `2.0.0`
   - `1.0` or `"1.0"` → `1.0.0`
   - `0.1` → `0.1.0`
   - `1.23` → `1.23.0`
   - `v1.0` → `1.0.0`
   - `v1.0.0` → `1.0.0` (strip the `v` prefix)
   - `v2.1.3` → `2.1.3` (strip the `v` prefix)
3. Remove any `v` or `V` prefix — semver does not use letter prefixes
4. Ensure exactly three dot-separated numeric components

### Fixing `api-info-description` (semantic)
1. Read the API spec to identify: the `info.title`, all paths, and the main operations
2. Determine the API's domain (e.g., security, deployment, monitoring, API management)
3. Write a 2-3 sentence description that answers: *What does this API manage? What are its key capabilities? Who or what consumes it?*
4. Add the `description` field under `info` using YAML block scalar (`>`) for readability
5. Avoid generic descriptions like "This API provides endpoints" — be specific about the domain

### Fixing `operation-id-camel-case` (mechanical + semantic)
1. If `operationId` is missing: generate one from the HTTP method + path (e.g., `GET /users/{id}` → `getUserById`)
2. If `operationId` exists but is snake_case or generic: rename to descriptive camelCase
3. Use the pattern: `verbNoun` or `verbNounQualifier` (e.g., `listEnvironments`, `createDeployment`, `getApplicationStatus`)
4. The helper script `scripts/add_operation_ids.py` can generate initial IDs; `scripts/improve_operation_ids.py` can improve existing ones

### Fixing `operation-description` (semantic)
1. Read the operation's path, method, parameters, and request/response schemas
2. Write a description that explains what the operation does, not just restating the path
3. Include relevant business context: preconditions, side effects, related operations
4. The helper script `scripts/add_descriptions.py` can add placeholder descriptions that should then be reviewed

### Fixing `operation-examples` (mechanical + semantic)
1. For each operation missing examples, look at the response schema to understand the shape
2. Create a realistic example that covers the main fields
3. Add it under the response's `content.application/json.examples` (or the appropriate media type)
4. The helper script `scripts/add_examples.py` can generate examples from schemas
5. The helper script `scripts/fix_delete_head_examples.py` handles DELETE/HEAD operations that may not need response body examples

### Fixing `input-types-described` (semantic)
1. For each parameter missing a description, examine its name, type, and where it's used
2. Write a description that explains what the parameter controls and valid values
3. For path parameters: explain what resource it identifies
4. For query parameters: explain filtering/pagination behavior and defaults

### Fixing `output-response-description` (semantic)
1. For each response missing a description, examine the status code and response schema
2. Write a description that explains what the response represents and when it's returned
3. For error responses (4xx/5xx): include what triggers the error and how to resolve it

### Fixing `request-body-description` (semantic)
1. For each request body missing a description, examine the schema and the operation's purpose
2. Write a description that explains what data the caller must provide and any constraints

### Fixing `output-types-described` (semantic)
Same approach as `output-response-description` — ensure every response has a description explaining the returned data.

### General Fix Workflow
When fixing violations across multiple APIs:
1. Run Pass 2 validation on the target API
2. Parse the JSON output to identify violations grouped by rule
3. Fix violations one rule type at a time (batch similar fixes)
4. Re-run Pass 2 to verify fixes — iterate until clean
5. Move to the next API

## Validation Process

### Prerequisites

Install the Anypoint CLI tool and API project plugin:

```bash
npm install -g anypoint-cli-v4
anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin
```

### Automated Validation

Validation should be performed in **two passes** to ensure both syntax correctness and AI-agent compliance:

#### Pass 1: Basic OAS Format Validation

First, validate that the OAS file is syntactically correct:

```bash
anypoint-cli-v4 api-project validate --json --location=./path/to/folder/with/oas
```

This validates:
- OpenAPI specification structure and syntax
- Valid YAML/JSON format
- Required OAS fields present
- Basic schema correctness

**Important**: Only proceed to Pass 2 if Pass 1 succeeds. Fix any syntax errors first.

#### Pass 2: Full Compliance Validation

After Pass 1 succeeds, validate against all AI-agent-friendly rules:

```bash
anypoint-cli-v4 api-project validate --json --location=./path/to/folder/with/oas --local-ruleset skills/api-spec-validator/scripts/ruleset.yaml
```

This validates:
1. API title ends with 'API' (Rule 2)
2. Semantic versioning in info.version (Rule 3)
3. Descriptive operation IDs (Rule 4)
4. Comprehensive descriptions with context (Rule 5)
5. Examples in requests and responses (Rule 6)
6. Type documentation for all properties (Rule 7)
7. Output types fully documented (Rule 8)
8. No naked strings - enums required (Rule 9)
9. Required fields explicitly listed (Rule 10)
10. API-level identity - info.description present (Rule 11)

The tool will:
- Parse the OAS file
- Check all validation rules
- Generate a detailed report with violations
- Exit with status code 0 (pass) or 1 (fail)

### Complete Validation Workflow

The recommended workflow for validating an API specification:

1. **Check format**: Ensure spec is OAS (not RAML) - convert if needed
2. **Pass 1 - Basic validation**: Run `anypoint-cli-v4 api-project validate  --json --location=./path`
3. **Fix syntax errors**: Address any errors from Pass 1 before continuing
4. **Pass 2 - Compliance validation**: Run with `--local-ruleset skills/api-spec-validator/scripts/ruleset.yaml`
5. **Review violations**: Check the detailed report for rule violations
6. **Fix violations**: Update spec to address each violation
7. **Re-run Pass 2**: Verify all violations are resolved

### Manual Review Checklist

When reviewing specs manually:
1. Check if spec is in RAML format - if so, translate to OAS first
2. Check each endpoint has `operationId`, `description`, and examples
3. Verify operation IDs are descriptive (not generic)
4. Look for legacy field names requiring mapping explanations
5. Identify slow/rate-limited endpoints needing warnings
6. Check for cryptic paths needing AI aliases in `summary`
7. Check 400 responses for error codes - add recovery instructions
8. Ensure all string fields with limited options use `enum`
9. Verify all schemas have explicit `required` arrays
10. Confirm all properties have meaningful descriptions

### Running Validation with Claude

Claude will automatically run both validation passes when you ask:

```
"Validate my API spec at path/to/api-spec.yaml"
"Check this OpenAPI specification for AI-agent compliance"
"Review my OAS file at specs/my-api.yaml"
```

Claude will:
1. Run Pass 1 (basic OAS validation)
2. If Pass 1 succeeds, run Pass 2 (compliance validation)
3. Provide a summary of violations and recommendations

## Best Practices

### Creating AI-Friendly Specs

When authoring or reviewing specs, optimize for AI agent consumption:
- **Use OAS format**: Convert RAML specs to OAS for compatibility
- **Be explicit**: Don't assume the AI knows implicit conventions
- **Add context**: Explain business rules, state transitions, constraints
- **Warn proactively**: Surface gotchas (rate limits, slow endpoints, deprecated fields)
- **Map legacy fields**: Translate internal codes to human-readable meanings
- **Document error recovery**: Add recovery instructions for 400 responses with error codes
- **Use examples liberally**: Show don't tell - examples are worth a thousand words

### Common Issues to Fix

1. **Missing API description**: Add `info.description` explaining domain and capabilities
2. **RAML format**: Convert RAML specs to OAS before validation
3. **Generic operation IDs**: Replace `getData` with `getUserProfile`
4. **Missing enums**: Add enums for status codes, types, categories
5. **Undocumented fields**: Add descriptions explaining purpose and usage
6. **Missing required arrays**: Explicitly list which fields are mandatory
7. **Cryptic paths**: Add summary aliases for `/rpc/` or `/action/` style paths
8. **Undocumented 400 errors**: Add recovery instructions for error codes

## Output Format

When validating with `anypoint-cli-v4`, the tool provides a structured report:

```
Validating API specification...

✓ oas-only: Valid OpenAPI 3.0.2 format
✓ operation-examples: All operations have examples

⚠ Violations found:

1. operation-id-camel-case
   - GET /users: operationId 'get_data' must be in camelCase
   - Use descriptive names like 'getUserProfile' or 'calculateTaxRate'

2. no-naked-strings
   - POST /orders (request): Property 'status' must have enum
   - Avoid naked strings with no constraints

3. schema-required-block
   - POST /users: Schema must explicitly list required fields

Validation completed with 3 violations
```

When summarizing results for users, organize by rule type and provide actionable fixes.

## Related Skills

- **api-schema-inferrer** - Infer and generate schemas from examples in OAS specs
- **api-doc-generator** - Generate markdown documentation with curl examples from OAS specs

## References

For detailed examples and guides:
- `references/example-good-spec.yaml` - Example of a fully compliant spec with all best practices
- `references/example-violations.yaml` - Common mistakes and how to fix them
