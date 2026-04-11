# Using the x-origin JSON Schema

The `docs/schemas/x-origin.schema.json` is the **single source of truth** for x-origin validation. This document explains how to use it in different contexts.

## Schema Location

```
docs/schemas/x-origin.schema.json
```

## What the Schema Validates

The JSON Schema automatically validates:

### ✅ Structure & Types
- x-origin must be an array
- Each source must be an object
- Property types (string, array, etc.)

### ✅ Required Fields
- `api` (must be present)
- `operation` (must be present)
- `values` (must be present)

### ✅ Format Validation
- `api`: Must match pattern `^urn:api:[a-z0-9-]+$`
- `values`: Must start with `$` (JSONPath)
- `labels`: Must start with `$` (JSONPath)

### ✅ Deprecated v1 Fields
Automatically rejects these deprecated properties:
- `field` → Use `values` + `labels` instead
- `note` → Use `description` instead
- `parameters` → Don't duplicate, reference operation
- `requiresPathParams` → Don't duplicate
- `requiresSamePathAs` → Don't duplicate
- `alternateOperation` → Use multiple source objects
- `alternateRequiresPathParams` → Use multiple source objects
- `businessGroup` → Use `description`
- `relatedParameters` → Use multiple sources
- `semantic` → Use `description`

### ✅ Additional Properties
- `additionalProperties: false` prevents unknown properties

## Using in Python

### Installation

```bash
pip install jsonschema
```

### Basic Usage

```python
import json
from jsonschema import validate, ValidationError

# Load schema
with open('docs/schemas/x-origin.schema.json') as f:
    schema = json.load(f)

# Validate x-origin annotation
xorigin = [
    {
        "api": "urn:api:access-management",
        "operation": "getOrganizations",
        "values": "$.data[*].id",
        "labels": "$.data[*].name"
    }
]

try:
    validate(instance=xorigin, schema=schema)
    print("✅ Valid x-origin")
except ValidationError as e:
    print(f"❌ Invalid: {e.message}")
```

### Validating OpenAPI Specs

```python
import yaml
from jsonschema import validate, ValidationError

# Load OpenAPI spec
with open('api-manager/api.yaml') as f:
    spec = yaml.safe_load(f)

# Load schema
with open('docs/schemas/x-origin.schema.json') as f:
    schema = json.load(f)

# Validate all x-origin annotations
parameters = spec.get('components', {}).get('parameters', {})
for param_name, param_def in parameters.items():
    xorigin = param_def.get('x-origin')
    if xorigin:
        try:
            validate(instance=xorigin, schema=schema)
        except ValidationError as e:
            print(f"Invalid x-origin in {param_name}: {e.message}")
```

## Using in JavaScript/TypeScript

### Installation

```bash
npm install ajv ajv-formats
```

### Basic Usage

```javascript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Load schema
const schema = require('./docs/schemas/x-origin.schema.json');

// Create validator
const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile(schema);

// Validate x-origin
const xorigin = [
  {
    api: 'urn:api:access-management',
    operation: 'getOrganizations',
    values: '$.data[*].id',
    labels: '$.data[*].name'
  }
];

if (validate(xorigin)) {
  console.log('✅ Valid x-origin');
} else {
  console.log('❌ Invalid:', validate.errors);
}
```

## Using in CI/CD

### GitHub Actions

```yaml
name: Validate x-origin

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install pyyaml jsonschema

      - name: Validate x-origin annotations
        run: |
          python3 scripts/build/validate_xorigin.py
```

### Pre-commit Hook

Add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: validate-xorigin
        name: Validate x-origin annotations
        entry: python3 scripts/build/validate_xorigin.py
        language: system
        pass_filenames: false
        always_run: false
        files: '\.yaml$'
```

## Custom Validation Rules

The Python validator (`scripts/build/validate_xorigin.py`) adds checks that JSON Schema can't express:

### 1. Array Length Matching

```python
# JSON Schema can't validate: "two arrays must have same length"
if isinstance(values, list) and isinstance(labels, list):
    if len(values) != len(labels):
        # Violation: arrays must match
        pass
```

### 2. Operation Reference Validation

```python
# JSON Schema can't validate: "operation exists in target API"
if operation not in self.operation_ids:
    # Violation: invalid operation reference
    pass
```

### 3. Numbered Components

```python
# Check for XOrigin_*_2, XOrigin_*_3 patterns
if param_name.startswith('XOrigin_') and param_name.endswith(digit):
    # Violation: numbered duplicate
    pass
```

## Modifying the Schema

When you need to change validation rules:

1. **Edit the schema**: `docs/schemas/x-origin.schema.json`
2. **Test the schema**: Run validation tests
3. **No Python changes needed**: The validator automatically uses the updated schema

### Example: Add New Optional Field

```json
{
  "properties": {
    "api": { ... },
    "operation": { ... },
    "values": { ... },
    "labels": { ... },
    "newField": {
      "type": "string",
      "description": "New optional field"
    }
  }
}
```

The validator will automatically accept the new field in all x-origin annotations.

### Example: Make Field Required

```json
{
  "required": ["api", "operation", "values", "newField"]
}
```

The validator will automatically enforce the requirement.

## Schema Features

### Pattern Validation

```json
{
  "values": {
    "type": "string",
    "pattern": "^\\$",  // Must start with $
    "examples": ["$.data[*].id"]
  }
}
```

### Enum Values

```json
{
  "propertyName": {
    "enum": ["value1", "value2", "value3"]
  }
}
```

### Conditional Validation

```json
{
  "if": {
    "properties": {
      "values": { "type": "array" }
    }
  },
  "then": {
    "properties": {
      "labels": { "type": "array" }
    }
  }
}
```

## Testing Schema Changes

Always test schema changes before committing:

```bash
# Run validator
make validate-xorigin

# Run custom tests
python3 << 'EOF'
import json
from jsonschema import validate, ValidationError

with open('docs/schemas/x-origin.schema.json') as f:
    schema = json.load(f)

# Test valid case
valid = [{"api": "urn:api:test", "operation": "op", "values": "$.id"}]
validate(instance=valid, schema=schema)
print("✅ Valid case passes")

# Test invalid case
invalid = [{"api": "invalid", "operation": "op", "values": "$.id"}]
try:
    validate(instance=invalid, schema=schema)
    print("❌ Invalid case should fail")
except ValidationError:
    print("✅ Invalid case rejected")
EOF
```

## Benefits of Schema-Based Validation

1. **Single Source of Truth**: One schema file defines all rules
2. **Language Agnostic**: Use in Python, JavaScript, Go, etc.
3. **Self-Documenting**: Schema describes structure and constraints
4. **Tooling Support**: IDEs can use schema for autocomplete
5. **Easy Updates**: Change schema, not code
6. **Standard Format**: JSON Schema is widely supported

## IDE Integration

### VS Code

Install the YAML extension and configure:

```json
{
  "yaml.schemas": {
    "./docs/schemas/x-origin.schema.json": [
      "**/components/parameters/XOrigin_*.yaml",
      "**/api.yaml#/components/parameters/*/x-origin"
    ]
  }
}
```

This provides:
- Autocomplete for x-origin properties
- Inline validation errors
- Hover documentation

## References

- [JSON Schema Documentation](https://json-schema.org/)
- [Understanding JSON Schema](https://json-schema.org/understanding-json-schema/)
- [jsonschema Python Library](https://python-jsonschema.readthedocs.io/)
- [AJV JavaScript Library](https://ajv.js.org/)
