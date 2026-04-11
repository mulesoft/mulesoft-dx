---
name: api-schema-inferrer
description: This skill should be used when the user asks to "infer schemas", "generate schemas from examples", "add schemas", "bootstrap schemas", or mentions inferring, generating, or adding schemas to OpenAPI/OAS specifications that have examples but missing schema definitions.
metadata: 
  version: 1.0.0
  author: "Mariano de Achaval"
---

# API Schema Inferrer

This skill automatically generates schemas from examples in OpenAPI Specification (OAS) files. It analyzes `example` and `examples` fields in requests and responses, then produces corresponding `schema` definitions.

## When to Use This Skill

Use this skill when:
- Endpoints have `examples` or `example` fields but no `schema` defined
- You want to quickly bootstrap schemas from sample data
- Converting from formats that don't require explicit schemas

## Prerequisites

```bash
pip install pyyaml
```

## Running Schema Inference

### Preview Changes (Dry Run)

```bash
python3 skills/api-schema-inferrer/scripts/infer_schemas.py path/to/spec.yaml --dry-run
```

This shows what schemas would be added without modifying the file.

### Apply Changes

```bash
python3 skills/api-schema-inferrer/scripts/infer_schemas.py path/to/spec.yaml
```

This will:
1. Create a backup file (`spec.yaml.backup`)
2. Infer schemas from all examples in requests and responses
3. Add schemas where they are missing
4. Preserve existing schemas (never overwrites)

## What It Does

The tool:
- **Detects types**: Automatically determines `string`, `number`, `integer`, `boolean`, `array`, `object`, `null`
- **Handles nested objects**: Recursively processes complex structures
- **Infers formats**: Detects `email`, `uri`, `date` formats from string patterns
- **Sets required fields**: Marks all fields as required (conservative approach)
- **Adds descriptions**: Includes placeholder descriptions that need to be updated

## Example

**Before:**
```yaml
paths:
  /users:
    post:
      requestBody:
        content:
          application/json:
            examples:
              createUser:
                value:
                  name: "John Doe"
                  email: "john@example.com"
                  age: 30
      responses:
        '200':
          description: Success
          content:
            application/json:
              example:
                id: "123"
                status: "active"
```

**After running inference:**
```yaml
paths:
  /users:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name, email, age]
              properties:
                name:
                  type: string
                  description: "Auto-generated from example. TODO: Add meaningful description for 'name'"
                email:
                  type: string
                  format: email
                  description: "Auto-generated from example. TODO: Add meaningful description for 'email'"
                age:
                  type: integer
                  description: "Auto-generated from example. TODO: Add meaningful description for 'age'"
            examples:
              createUser:
                value:
                  name: "John Doe"
                  email: "john@example.com"
                  age: 30
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                required: [id, status]
                properties:
                  id:
                    type: string
                    description: "Auto-generated from example. TODO: Add meaningful description for 'id'"
                  status:
                    type: string
                    description: "Auto-generated from example. TODO: Add meaningful description for 'status'"
              example:
                id: "123"
                status: "active"
```

## Post-Inference Steps

After running the inference tool:

1. **Review generated schemas**: Check that inferred types are correct
2. **Update descriptions**: Replace all "TODO" placeholders with meaningful descriptions
3. **Add enums**: If a field has limited options, add an `enum` array
4. **Refine required fields**: Adjust the `required` array if some fields are optional
5. **Add constraints**: Add `minLength`, `maxLength`, `minimum`, `maximum`, etc. as needed
6. **Run validation**: Use the **api-spec-validator** skill to check for remaining issues

## Using with Claude

Ask Claude to infer schemas:

```
"Infer schemas from examples in my API spec at path/to/spec.yaml"
"Generate schemas from the examples in specs/my-api.yaml"
"My spec has examples but no schemas - can you add them?"
```

## Related Skills

- **api-spec-validator** - Validate OAS specs against AI-agent-friendly rules
- **api-doc-generator** - Generate markdown documentation with curl examples from OAS specs
