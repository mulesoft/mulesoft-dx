---
name: jtbd-generator
description: |
  Generate JTBD (Jobs-to-be-Done) markdown files from step descriptions.
  Use when creating API workflows, building JTBD files, documenting multi-step
  processes, or when user says "create a JTBD", "generate workflow",
  "document these API steps", or "build a job with these operations".
---

# JTBD Generator Skill

This skill generates complete JTBD (Jobs-to-be-Done) markdown files from user-provided step descriptions. It discovers the correct API operations, maps data flow between steps, and produces validated, hybrid-format JTBD files.

## How to Use

When the user wants to create a JTBD, they will provide:

1. **Prerequisites**: Conditions that must be met (e.g., "user logged in", "API asset exists in Exchange")
2. **Steps**: List of operations in natural language (e.g., "Get GAV from Exchange", "Create API in API Manager")

You will guide them through discovery, validation, and generation.

---

## Workflow

### Step 1: Parse User Input

Extract the user's intent:
- Job purpose/title
- Prerequisites
- Step descriptions (in natural language)

If anything is unclear, ask clarifying questions:
- What's the goal of this workflow?
- What should happen in each step?
- Are there specific APIs you want to use?

### Step 2: Discover Operations

For each step description:

1. **Search for matching operations:**
   ```python
   import sys
   from pathlib import Path

   # Add JTBD generator library to path
   sys.path.insert(0, '.claude/skills/jtbd-generator')
   from lib import api_discovery

   # Search for operations matching the description
   results = api_discovery.search_operations(
       "create api",  # User's description keywords
       None,  # Search all APIs, or specify URN like "urn:api:api-manager"
       repo_root=Path(".")
   )

   # Show top 3-5 matches
   for op in results[:5]:
       print(f"{op['score']:.2f} - {op['operationId']} ({op['api']})")
       print(f"  {op['method']} {op['path']}")
       print(f"  {op['summary']}")
   ```

2. **Present options to user:**
   - Show the top matches with scores
   - Include operation summary and API
   - Ask user to confirm or choose

3. **Get operation details:**
   ```python
   # Once user confirms, get full details
   details = api_discovery.get_operation_details(
       api_urn="urn:api:api-manager",
       operation_id="createOrganizationsEnvironmentsApis",
       repo_root=Path(".")
   )

   print(f"Parameters: {len(details['parameters'])}")
   print(f"Method: {details['method']} {details['path']}")
   ```

4. **Store selection:**
   - Step number
   - Step name (user-provided)
   - API URN
   - Operation ID
   - Operation details

### Step 3: Analyze Parameters & Data Flow

For each step (in order from 1 to N):

1. **Analyze parameters:**
   ```python
   from lib import parameter_analyzer

   # Build inputs considering previous steps
   inputs = parameter_analyzer.build_all_inputs(
       api_urn="urn:api:api-manager",
       operation_id="createOrganizationsEnvironmentsApis",
       repo_root=Path("."),
       previous_steps=previous_steps  # List of already-processed steps
   )

   # Review detected sources
   for param_name, input_def in inputs.items():
       if 'from' in input_def:
           source = input_def['from']
           print(f"{param_name}: from {source.get('api', source.get('step'))}")
       elif input_def.get('userProvided'):
           print(f"{param_name}: user-provided")
   ```

2. **Suggest outputs:**
   ```python
   from lib import response_analyzer

   # Suggest outputs considering next steps
   outputs = response_analyzer.analyze_response_for_operation(
       api_urn="urn:api:api-manager",
       operation_id="createOrganizationsEnvironmentsApis",
       repo_root=Path("."),
       next_steps=remaining_steps  # Steps not yet processed
   )

   # Show suggestions
   for output in outputs:
       print(f"{output['name']}: {output['path']}")
       if 'used_by' in output:
           print(f"  → Used by: {', '.join(output['used_by'])}")
   ```

3. **Confirm with user:**
   - Show detected data flow
   - Highlight any user-provided parameters
   - Ask if adjustments are needed

### Step 4: Generate JTBD Structure

1. **Create kebab-case name:**
   ```python
   from lib.utils import kebab_case

   name = kebab_case("Deploy API with Flex Gateway")
   # Result: "deploy-api-with-flex-gateway"
   ```

2. **Build YAML blocks for each step:**
   ```python
   from lib import jtbd_builder

   yaml_block = jtbd_builder.build_step_yaml(
       api_urn="urn:api:api-manager",
       operation_id="createOrganizationsEnvironmentsApis",
       inputs=inputs,
       outputs=outputs
   )
   ```

3. **Generate prose sections:**

   Use your intelligence to write:
   - **Overview**: Action-oriented description (start with verb: "Deploys...", "Creates...", "Configures...")
   - **What you'll build**: Clear outcome statement
   - **Step descriptions**: Explain what each step does and why
   - **What you'll need**: Prerequisites for each step
   - **What happens next**: Outcomes and connections to next steps

   Quality guidelines:
   - Be conversational and helpful
   - Explain the "why", not just the "what"
   - Connect steps logically
   - Anticipate common questions

4. **Build complete markdown:**
   ```python
   from lib import jtbd_builder

   # Prepare step definitions
   steps = []
   for i, step_info in enumerate(step_definitions, 1):
       step_md = jtbd_builder.build_step_markdown(
           step_number=i,
           step_name=step_info['name'],
           step_description="[Your prose explanation]",
           operation_summary=step_info['operation_summary'],
           yaml_block=step_info['yaml_block'],
           what_you_need=step_info.get('what_you_need'),
           what_happens_next="[Your explanation of outcomes]"
       )
       steps.append({'markdown': step_md})

   # Assemble complete JTBD
   jtbd_content = jtbd_builder.build_complete_jtbd(
       name="deploy-api-with-flex-gateway",
       description="Deploy API instance to Flex Gateway. Use when deploying APIs to Flex Gateway, setting up API instances, or connecting Exchange assets to gateways.",
       title="Deploy API with Flex Gateway",
       overview="Deploys an API instance to a Flex Gateway by retrieving asset details from Exchange, discovering available gateway targets, and creating the API instance in API Manager with the proper configuration.",
       what_youll_build="An API instance connected to your Flex Gateway target",
       prerequisites=[
           "**Authentication** - Valid Bearer token for Anypoint Platform with API Manager and Exchange permissions",
           "**Resources** - API asset published in Exchange and Flex Gateway deployed"
       ],
       steps=steps,
       completion_items=[
           "Asset retrieved from Exchange",
           "Gateway target identified",
           "API instance created in API Manager"
       ],
       what_youve_built="✅ **API Deployment** - Connected Exchange asset to API Manager, configured Flex Gateway as target, API ready for policy configuration",
       next_steps=[
           "**Apply Policies** - Add security policies (OAuth2, IP allowlist) and configure rate limiting",
           "**Test API** - Verify endpoint is accessible and test through gateway"
       ]
   )
   ```

### Step 5: Validate

Run the validator to ensure correctness:

```bash
python3 .claude/skills/jtbd-generator/scripts/validate_jtbd.py /tmp/generated-job.md .
```

If validation fails:
- Explain the error in plain English
- Auto-fix when possible:
  - Add missing outputs (common IDs)
  - Correct step references
  - Generate basic descriptions
- Regenerate and validate again

If validation succeeds:
- Show success message
- Proceed to save

### Step 6: Save & Confirm

1. **Determine save location:**
   - Default: `skills/{name}/SKILL.md`
   - Ask user if unsure

2. **Save the file:**
   ```python
   from pathlib import Path

   output_dir = Path("skills/deploy-api-with-flex-gateway")
   output_dir.mkdir(parents=True, exist_ok=True)
   output_path = output_dir / "SKILL.md"
   output_path.write_text(jtbd_content)
   ```

3. **Confirm with user:**
   - Show file path
   - Mention validation status
   - Suggest next actions

4. **Suggest related workflows:**
   - Based on the APIs used
   - Based on similar existing JTBDs
   - Based on common next steps

---

## Example Interaction

```
User: Create a JTBD with these prerequisites: user logged in, API asset in Exchange.
Steps: 1) Get GAV from Exchange, 2) Get flex gateway targets, 3) Create API in api-manager.

You: I'll create a workflow for deploying an API with a Flex Gateway target.

Let me find the right operations for each step...

[Calls search_operations for each step]

I found these operations:

Step 1: Get GAV from Exchange
  → getAssetsByGroupidByAssetid (urn:api:exchange-experience)
     GET /assets/{groupId}/{assetId}
     Score: 0.85

Step 2: Get flex gateway targets
  → getOrganizationsByOrganizationidEnvironmentsByEnvironmentidGateways (urn:api:flex-gateway-manager)
     GET /organizations/{organizationId}/environments/{environmentId}/gateways
     Score: 0.78

Step 3: Create API in api-manager
  → createOrganizationsEnvironmentsApis (urn:api:api-manager)
     POST /organizations/{organizationId}/environments/{environmentId}/apis
     Score: 0.92

Does this match your intent?

User: Yes

You: Building the workflow...

[Analyzes parameters and data flow]

Data flow detected:
✓ Step 1 outputs: groupId, assetId, version
✓ Step 2 outputs: gatewayId
✓ Step 3 uses: groupId, assetId, version (from Step 1), gatewayId (from Step 2)

[Generates complete JTBD with prose]

Generated JTBD:
- Name: deploy-api-with-flex-gateway
- Steps: 3
- Prerequisites: User authentication, Exchange asset, Flex Gateway

[Validates]

Validation: ✅ PASSED

Save to skills/deploy-api-with-flex-gateway/SKILL.md?

User: Yes

You: ✅ Saved successfully!

File: skills/deploy-api-with-flex-gateway/SKILL.md

Next steps:
- Review the generated workflow
- Test with: python3 .claude/skills/jtbd-generator/scripts/validate_jtbd.py skills/deploy-api-with-flex-gateway/SKILL.md .
- Related workflows: deploy-api-with-rate-limiting, setup-multi-upstream-routing
```

---

## Data Flow Intelligence

Apply these rules when detecting parameter sources:

**Rule 1: Output → Input Matching (High Confidence)**
```
If Step N outputs 'environmentApiId' AND Step N+1 needs 'environmentApiId':
  → Auto-link with { from: { step: "Step N", output: "environmentApiId" } }
```

**Rule 2: Input Reuse (High Confidence)**
```
If Step N uses 'organizationId' AND Step N+1 needs 'organizationId':
  → Reuse with { from: { step: "Step N", input: "organizationId" } }
  (Not from original source - reuse the previous step's input)
```

**Rule 3: x-origin Suggestions (High Confidence)**
```
If parameter has x-origin annotation:
  → Use that as the default source
  → Add alternatives if provided
```

**Rule 4: Common Patterns (Medium Confidence)**
```
If parameter is 'organizationId' and no previous source:
  → Default to access-management#getOrganizations

If parameter is 'environmentId' and no previous source:
  → Default to access-management#listEnvironments
```

**Rule 5: User-Provided Fallback (Low Confidence)**
```
If no source detected:
  → Mark as userProvided: true
  → Add example if parameter has example in schema
  → Mention in conversation that this needs user input
```

---

## Error Handling

### Operation Not Found
```
"I couldn't find an operation matching '{description}' in {api_urn}.

Let me search more broadly..."

[Search all APIs, show top matches]

"Here are some operations that might work:
1. {operationId} ({api}) - {summary}
2. {operationId} ({api}) - {summary}

Which one fits best, or would you like to search differently?"
```

### Validation Fails
```
"The generated JTBD has validation errors:

❌ Step 2 references unknown output 'apiId' from Step 1

I'll fix this by:
- Checking Step 1's actual outputs
- Updating Step 2's input to use the correct output name

Regenerating..."
```

### Ambiguous Step Description
```
"Step 2: 'Get gateway targets' is ambiguous.

I found operations in two APIs:
1. Flex Gateway Manager - List flex gateways
2. Runtime Manager - List CloudHub workers

Which one should I use?"
```

---

## Tips for Quality Output

1. **Write conversational prose:**
   - "Start by retrieving..." not "This step retrieves..."
   - "You'll need the organization ID..." not "organizationId is required"

2. **Explain the why:**
   - Not just "Create an API instance"
   - But "Create an API instance to register your Exchange asset with API Manager, enabling policy application and gateway routing"

3. **Connect steps logically:**
   - End each step with "What happens next" that leads into the next step
   - Show how outputs become inputs

4. **Anticipate issues:**
   - Add "Common issues" for known problems
   - Mention typical error responses

5. **Be specific:**
   - "Organization Business Group GUID" not just "organization ID"
   - "Target environment ID (e.g., Production, Sandbox)" not just "environment ID"

---

## Available Python Utilities

You have access to these utilities in `.claude/skills/jtbd-generator/lib/`:

### api_discovery.py
- `list_available_apis(repo_root)` - List all APIs with metadata
- `search_operations(query, api_urn, repo_root)` - Fuzzy search for operations
- `get_operation_details(api_urn, operation_id, repo_root)` - Get full operation details
- `get_operations_by_api(api_urn, repo_root)` - List all operations in an API

### parameter_analyzer.py
- `analyze_parameters(spec, operation_id, spec_path)` - Extract all parameters with metadata
- `detect_parameter_source(param_name, param_def, previous_steps)` - Detect where parameter should come from
- `build_input_definition(param_name, param_def, source)` - Build JTBD input definition
- `build_all_inputs(api_urn, operation_id, repo_root, previous_steps)` - Build complete inputs section

### response_analyzer.py
- `suggest_outputs(spec, operation_id, spec_path, next_steps)` - Suggest which fields to capture
- `generate_jsonpath(field_path)` - Generate JSONPath expressions
- `analyze_response_for_operation(api_urn, operation_id, repo_root, next_steps)` - Main entry point

### jtbd_builder.py
- `build_frontmatter(name, description)` - Generate YAML frontmatter
- `build_step_yaml(api_urn, operation_id, inputs, outputs)` - Generate YAML block for step
- `build_step_markdown(step_number, step_name, ...)` - Generate complete step section
- `build_complete_jtbd(name, description, title, ...)` - Assemble complete JTBD

### utils.py
- `load_openapi_spec(api_path)` - Load and parse OpenAPI spec
- `urn_to_path(urn, repo_root)` - Convert URN to filesystem path
- `path_to_urn(api_path)` - Convert filesystem path to URN
- `kebab_case(text)` - Convert text to kebab-case
- `resolve_ref(ref, spec, spec_path)` - Resolve $ref references
- `find_api_dirs(repo_root)` - Find all API directories

### common_patterns.py
- `match_common_pattern(param_name)` - Check for known patterns
- `is_likely_user_provided(param_name)` - Check if likely user-provided
- `get_example_for_param(param_name, param_schema)` - Get example values

---

## Success Criteria

A successful JTBD generation:

1. ✅ Passes validation (`validate_jtbd.py`)
2. ✅ All operations exist in referenced API specs
3. ✅ Data flow correctly maps outputs to inputs
4. ✅ Prose sections are clear and helpful (not template-like)
5. ✅ User completed generation in <5 minutes of interaction
6. ✅ User understands what the workflow does and how to use it

---

## Notes

- Always run the workflow in order: Parse → Discover → Analyze → Generate → Validate → Save
- Use the Python utilities for spec parsing and structure building
- Use your intelligence for prose generation and user interaction
- Be conversational and helpful
- When in doubt, ask the user for clarification
- Default to skills/{name}/SKILL.md for output location
