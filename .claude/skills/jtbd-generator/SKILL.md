---
name: jtbd-generator
description: "Generate, validate, and update JTBD (Jobs-to-be-Done) markdown files from step descriptions. Discovers matching API operations, maps cross-step data flow, and produces validated hybrid-format files. Use when creating API workflows, building JTBD files, documenting multi-step processes, or when user says 'create a JTBD', 'generate workflow', 'document these API steps', or 'build a job with these operations'."
---

# JTBD Generator

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

   name = kebab_case("Deploy API with Omni Gateway")
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
       description="Deploy API instance to Omni Gateway. Use when deploying APIs to Omni Gateway, setting up API instances, or connecting Exchange assets to gateways.",
       title="Deploy API with Omni Gateway",
       overview="Deploys an API instance to a Omni Gateway by retrieving asset details from Exchange, discovering available gateway targets, and creating the API instance in API Manager with the proper configuration.",
       what_youll_build="An API instance connected to your Omni Gateway target",
       prerequisites=[
           "**Authentication** - Valid Bearer token for Anypoint Platform with API Manager and Exchange permissions",
           "**Resources** - API asset published in Exchange and Omni Gateway deployed"
       ],
       steps=steps,
       completion_items=[
           "Asset retrieved from Exchange",
           "Gateway target identified",
           "API instance created in API Manager"
       ],
       what_youve_built="✅ **API Deployment** - Connected Exchange asset to API Manager, configured Omni Gateway as target, API ready for policy configuration",
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

## Data Flow Rules

Apply when detecting parameter sources in Step 3:

1. **Output → Input match**: If Step N outputs a field Step N+1 needs → auto-link via `{ from: { step: "Step N", output: "<field>" } }`
2. **Input reuse**: If Step N uses a field Step N+1 also needs → reuse via `{ from: { step: "Step N", input: "<field>" } }`
3. **x-origin**: If parameter has `x-origin` annotation → use as default source
4. **Common patterns**: `organizationId` → `access-management#getOrganizations`; `environmentId` → `access-management#listEnvironments`
5. **Fallback**: Mark as `userProvided: true` with example from schema

---

## References

- [README](README.md) — detailed overview, usage examples, and interaction walkthrough
- **Python utilities** in `lib/` (see module docstrings for full API):
  - `api_discovery` — search operations, get details, list APIs
  - `parameter_analyzer` — extract parameters, detect sources, build inputs
  - `response_analyzer` — suggest outputs, generate JSONPath
  - `jtbd_builder` — build frontmatter, step YAML, complete JTBD markdown
  - `utils` — load specs, resolve refs, URN/path conversion
  - `common_patterns` — match known parameter patterns
- **Validation**: `python3 .claude/skills/jtbd-generator/scripts/validate_jtbd.py <path> .`
