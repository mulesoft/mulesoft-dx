# `x-origin` extension (OpenAPI)

`x-origin` documents **dynamic enum sources**: which API provides the enum options, which operation to call, and how to extract both the **value** (identifier) and **label** (display name) from the response.

Think of it as a dynamic dropdown where:
- **values** extracts the actual value (e.g., UUID, ID) to submit
- **labels** extracts the human-readable label to display (e.g., name, title)

## JSON Schema

The authoritative definition is in `docs/schemas/x-origin.schema.json`.

## Rules

1. **`x-origin` is an array** of source objects, allowing multiple alternative sources.

2. **Do not duplicate callee parameters** inside `x-origin`. Parameters required to invoke the source operation are defined in that operation's OpenAPI spec. Tools resolve `api` + `operation` to fetch the complete operation definition.

3. **`operation` must match an `operationId`** in the target API spec for machine-readable resolution.

4. **values is required**, labels is optional. If no labels is provided, the value is displayed as-is.

5. **values and labels can be strings or arrays**. When arrays, they must have the same length and corresponding indices must align (values[0] pairs with labels[0], etc.).

## Source object

| Property       | Required | Type | Description |
|----------------|----------|------|-------------|
| `api`          | Yes      | string | API URN, e.g. `urn:api:access-management` (pattern: `^urn:api:[a-z0-9-]+$`) |
| `operation`    | Yes      | string | Source `operationId` to invoke |
| `values`       | Yes      | string \| string[] | JSONPath expression(s) to extract value(s) from response |
| `labels`       | No       | string \| string[] | JSONPath expression(s) to extract label(s) from response |
| `description`  | No       | string | Human-readable context about this source |
| `name`         | No       | string | Short label for this source in UIs |

## Examples

### Simple value-only extraction

When you only need the value (no separate label):

```yaml
parameters:
  - name: organizationId
    in: path
    required: true
    schema:
      type: string
      format: uuid
    x-origin:
      - api: urn:api:access-management
        operation: getOrganizations
        values: $.data[*].id
        description: Organization GUID from user's accessible orgs
```

### Value + Label for dynamic enum

Most common case - extract both ID and display name:

```yaml
parameters:
  - name: organizationId
    in: path
    required: true
    schema:
      type: string
      format: uuid
    x-origin:
      - api: urn:api:access-management
        operation: getOrganizations
        values: $.data[*].id
        labels: $.data[*].name
        description: Business Group selection
```

Result in UI:
```
[Dropdown]
▼ Select Business Group
  └─ Engineering Team (f3b2a1c0-...)
  └─ Marketing Org (a9c8e2f1-...)
  └─ Sales Division (7d4f1b3e-...)
```

### Multiple alternative sources

When a parameter can come from different operations:

```yaml
parameters:
  - name: environmentId
    in: path
    required: true
    schema:
      type: string
      format: uuid
    x-origin:
      # Primary source
      - api: urn:api:access-management
        operation: listEnvironments
        values: $.data[*].id
        labels: $.data[*].name
        name: All Environments
        description: All environments in the organization

      # Alternative source
      - api: urn:api:cloudhub
        operation: getEnvironmentDetails
        values: $.id
        labels: $.name
        name: Current Environment
        description: Currently active environment
```

### Nested extraction

When value and label are at different levels:

```yaml
x-origin:
  - api: urn:api:exchange-experience
    operation: getAssetsSearch
    values: $.assets[*].id
    labels: $.assets[*].name
    description: API assets from Exchange
```

### Multiple extraction paths (array format)

When the same operation returns values from different locations:

```yaml
x-origin:
  - api: urn:api:access-management
    operation: getOrganizations
    values:
      - $.id                    # The org itself
      - $.subOrganizationIds[*] # Child orgs
    labels:
      - $.name
      - $.subOrganizations[*].name
    description: Organization and child organizations
```

### Array fields with matching indices

When extracting from parallel arrays:

```yaml
x-origin:
  - api: urn:api:access-management
    operation: getOrganizations
    values: $.subOrganizationIds[*]
    labels: $.subOrganizations[*].name
    description: Child Business Groups
```

**Important:** values and labels must produce arrays of the same length, with matching indices:
- `subOrganizationIds[0]` → value
- `subOrganizations[0].name` → label
- `subOrganizationIds[1]` → value
- `subOrganizations[1].name` → label

## Comparison with x-ms-dynamic-values

Microsoft's approach:
```yaml
x-ms-dynamic-values:
  operationId: GetItems
  value-path: id
  value-title: name
```

Our approach (more explicit about API + JSONPath):
```yaml
x-origin:
  - api: urn:api:my-service
    operation: GetItems
    values: $.data[*].id
    labels: $.data[*].name
```

**Key differences:**
- We use `api` URN for cross-API references
- We use full JSONPath expressions (not just property names)
- We support multiple alternative sources in an array
- We maintain operation context with descriptions
- We support both string and array formats for values/labels

## Reserved keys

The following keys are **not** valid in `x-origin` entries (rejected by the JSON Schema):

- `field` — use `values` + `labels`
- `parameters`, `requiresPathParams`, `requiresSamePathAs` — redundant with operation definition
- `note` — use `description`
- `alternateOperation` / `alternateRequiresPathParams` — use multiple source objects
- `businessGroup` / `relatedParameters` — use multiple sources with descriptions
- `semantic` — prefer clarifying in `description`
