---
name: create-project-template
description: Workflow for generating MuleSoft projects from Anypoint Exchange templates, local .jar templates, or from scratch via the `mule-mcp-server`. Use when users ask to "create a project", "generate project", "build integration", "create API", "use template", or "from template". Performs template discovery and calls create_mule_project only after explicit user confirmation; delegates flow generation to the `build-mule-integration` skill.
license: Apache-2.0
compatibility: Requires the mule-mcp-server (create_mule_project), Anypoint CLI v4 (`anypoint-cli-v4` on PATH), `jq`, and Maven 3.6+ for validation
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
  cli: anypoint-cli-v4
  theme: professional
allowed-tools: Bash Read AskUserQuestion
---

# Mule Project Generation

Guide the user through multi-step Mule project generation via the `create-project-template` skill . For **any** project creation request, the request **must go through this workflow**. Do not call `create_mule_project` directly. This workflow performs proper discovery of the template (or generation path) from the user — Exchange search and selection, local template path, or scratch — and obtains user confirmation before `create_mule_project` may be invoked at the designated project-creation step in the chosen flow. After project creation, flow work is **entirely delegated** to the `build-mule-integration` skill.

**Triggers:**

- "create a project"
- "generate project"
- "build integration"
- "build app"
- "create API"
- "create Rest API"
- "create app"
- "create application"
- "use template"
- "generate an integration"
- "from template"
- any request indicating Mule project creation

**Mandatory path:** Route every project-creation request through this workflow so that discovery and confirmation happen first; only then call `create_mule_project` at the designated project-creation step in the chosen flow (Exchange, Scratch, or Local).

---

## Behavioral Guidance

Your behavior should be deliberate and confirmation-driven. Take time to understand user requirements and organizational template availability before proposing a template. The quality of your template discovery directly impacts adherence to organizational standards. Treat this as a collaborative decision-making process — never proceed to template selection or project generation without explicit user confirmation at each checkpoint.

**Agent tone — choice options:** When presenting multiple-choice options to the user (e.g. via `AskUserQuestion` / `<ask_followup_question>`), use **full, formal sentences**, not brief phrases. For example: use "Yes, create this project with the defaults." not "Yes, create with defaults"; use "Yes, but let me specify the name and the path." not "Let me specify name/path"; use "No, search Exchange for templates instead." not "Search Exchange for templates instead."

> **Important:** Execute steps without commentary; never proceed to the next step without explicit user confirmation.

---

## Core Rules

### Operational Requirements

- **Mandatory workflow:** For any project creation request, the request MUST go through this workflow so that proper discovery from the user happens first. **Ask the template source question upfront** (Exchange / Local .jar / Scratch) as soon as the user enters a project-creation prompt — unless they have already explicitly stated their choice in that message. Then obtain the template or path from the user — e.g. present Exchange search results for user selection, get local template path, or confirm scratch — before any project creation.
- **No direct `create_mule_project`:** Do not call `create_mule_project` until this workflow has completed discovery and the user has approved (Confirmation checkpoint 2). Never invoke it directly in response to a project-creation request. Call it only at the designated project-creation step in the chosen flow (Exchange, Scratch, or Local).
- MUST present the `scripts/search_templates.sh` output for user selection of template
- MUST present results from both private and public groupIds per **Search Completeness Rule**
- MUST follow **Confirmation Checkpoints** (below) for template selection, project creation, and flow generation
- MUST follow **Validation Standard** (below) after any project generation or flow change

### Validation Standard

- After any project generation, run `mvn clean compile` and only report success if it passes.

### Confirmation Checkpoints

- **Template selection:** Wait for explicit user choice before proceeding. Do not assume which template the user wants.
- **Project creation:** Do not call `create_mule_project` until the user explicitly approves (e.g. Template Integration Plan for Exchange, or equivalent confirmation for Local/Scratch). Calling `create_mule_project` without having completed the workflow and received this approval is prohibited.
- **Flow generation:** Do not hand off to the `build-mule-integration` skill until the user explicitly approves flow customization.

### Flow Generation Workflow (delegated)

- For any step that involves generating or updating Mule flows (E5, S3, L5), flow generation is **entirely delegated** to the **`build-mule-integration` skill**. Follow that skill in full. This workflow does **not** perform flow generation itself; the `build-mule-integration` skill handles it after its Technical Summary is approved and its verification gate passes.
- **Flow generation:** Reference the `build-mule-integration` skill.

### Local Template Format

- Local templates are ALWAYS `.jar` files only; directory-based templates are NOT supported.

---

## Bundled Scripts

This skill ships small bash helpers under `scripts/`. Invoke them with the `Bash` tool at the absolute path you were given in the "skill is now active" message (the directory containing this `SKILL.md`). Do **not** use relative paths like `../scripts/...` — Cline's working directory shifts across turns and relative paths break.

| Script | Purpose | Output |
| --- | --- | --- |
| `scripts/search_templates.sh <search-term>` | Step E2 — search Anypoint Exchange for `type == "template"` assets via two parallel `exchange asset list` calls (one unscoped, one `--organizationId <my-org>`), dedup, rank by token overlap with `<search-term>`, then enrich the top 10 with `description`, `minMuleVersion`, and `sourceLocation` (`"private"` for org-scoped hits, `"public"` otherwise). | Single JSON array on stdout (max 10 rows), sorted private-first. Exits 1 with an error on stderr when no templates match. |

The script wraps `anypoint-cli-v4 exchange asset list` (paginated) plus `anypoint-cli-v4 exchange asset describe` (top-N enrichment). It auto-resolves a real environment from `anypoint-cli-v4 account environment list` so it works regardless of how `ANYPOINT_ENV` is set in the shell.

---

## Step 1: Generation Path Decision

**This is the FIRST step for ANY project generation request.** You MUST resolve template source (Exchange / local .jar / scratch) before proceeding.

### Always Ask Template Source Upfront

**When the user enters a project-creation prompt, ALWAYS ask the template source question first.** Do not infer or skip this step.

```xml
<ask_followup_question>
<question>I can help you create this project. Which template source would you prefer?</question>
<options>["I want to use organizational templates from Anypoint Exchange.", "I have a local template .jar file I want to use.", "I want to generate from scratch without a template."]</options>
</ask_followup_question>
```

Then proceed based on the user's answer: Exchange → Step E1 (and run `scripts/search_templates.sh` when ready); local .jar → Step L1 (get path if needed); scratch → Step S1.

**Only skip the question above** when the user has already made the choice explicit in the same message, as follows.

### When to Skip the Question (Explicit Intent Only)

Evaluate in order; stop at first match. **Only** when the user's message clearly states one of these, proceed directly without asking:

1. Local .jar in context, or "use local template", "from /path/to/template.jar", "my downloaded template" → **Local Template** (Step L1).
2. "from scratch", "without template", "generate new", "don't use template" → **Scratch** (Step S1).
3. "use Exchange template", "search Exchange", "use organizational template" (and no local path or scratch wording) → **Exchange Template** (Step E1).

**Otherwise** (e.g. "create a project", "build an integration", "create an API", or no clear source): **Always** ask the template source question first; do not infer.

### Search Completeness Rule

> **Important:** Even if private Exchange search returns templates that appear to match perfectly, you MUST still search public Exchange as well. This ensures:
> 1. Users see all available template options across both exchanges.
> 2. Users can make informed decisions with complete organizational template information.

---

## Exchange Template Flow

### Step E1: Required Project Context Investigation

Before running `scripts/search_templates.sh`, you MUST complete these investigation steps in order.

#### E1a. Analyze prompt and prepare search

Analyze the user's prompt and prepare search parameters.

**Extract:** Systems/Connectors (e.g. Salesforce, SAP, PostgreSQL), Integration Pattern (sync, API, batch, event-driven), Domain Context (healthcare, finance), Action Keywords (migrate, expose, transform, notify).

**Strategy:** Specific systems → include names in the search query. Generic need → pattern keywords (sync, API, batch). Industry/compliance → include domain. No details → ask the clarifying question below.

**Build the search query:** `[System1] + [System2] + [Pattern/Action]`. Examples: `"Salesforce database sync"`; `"REST API order"`; `"SAP Anypoint MQ integration"`. This string is what you will pass as the first argument to `scripts/search_templates.sh` in Step E2a.

**If requirements are unclear,** prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>To find the best template for your project, I need a bit more context:
- What systems or data sources are involved?
- What type of integration? (REST API, system sync, event processing, batch)</question>
<options>["REST API exposing data.", "System-to-system sync.", "Event-driven processing.", "Batch processing.", "Let me describe in detail."]</options>
</ask_followup_question>
```

---

### Step E2: Search Exchanges and Present Results

#### E2a. Search Exchange

Run the bundled search script with the `Bash` tool, passing the query you built in Step E1a. The script handles **pagination, dedup-by-latest-version, ranking, and the public/private label** internally — there is no need to make two separate calls per the Search Completeness Rule; one invocation searches everything visible to the authenticated user.

```bash
<skill-dir>/scripts/search_templates.sh "<search-query-from-E1a>"
```

The script returns at most 10 ranked results (private-first), each enriched with `description` and `minMuleVersion` via `exchange asset describe`.

The script writes a single JSON array to stdout. Each row has:

```json
{
  "name":           "Salesforce to Salesforce Contact Bidirectional Sync",
  "groupId":        "org.mule.templates",
  "assetId":        "template-sfdc2sfdc-contact-bidirectional-sync",
  "version":        "2.1.4",
  "minMuleVersion": "4.1.1",
  "description":    "Template description (may be empty)",
  "sourceLocation": "private"
}
```

Exit code 1 + a stderr message means no templates matched — handle as the "no results" branch in E2b.

#### E2b. Process Search Results

The script already does dedup-by-latest-version, token-overlap ranking, and private-first sorting; you do **not** re-rank or re-merge. Just read the JSON array, then present it.

If `description` is empty for a row, omit that bullet rather than printing `Description: ` (looks worse than no line at all). The same applies to any other field the publisher left blank.

**If no results found,** prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>No templates found matching your requirements. Would you like to:</question>
<options>["I want to search with different terms.", "I want to generate the project from scratch.", "I will provide a local template .jar file."]</options>
</ask_followup_question>
```

#### E2c. Present Results for User Selection

Present results to the user with full asset details:

```xml
<ask_followup_question>
<question>I found the following templates matching your requirements:

**1. [Template Name]** [Private]
  - Asset: `groupId:assetId`
  - Version: X.X.X (latest)
  - Min Mule Version: [minMuleVersion from response]
  - Description: [brief description]

**2. [Template Name]** [Public]
  - Asset: `groupId:assetId`
  - Version: X.X.X (latest)
  - Min Mule Version: [minMuleVersion from response]
  - Description: [brief description]
</question>
<options>["I'll use Template 1.", "I'll use Template 2.", "I want to search with different terms.", "I would like to use one of these templates, or create the integration from scratch."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (template selection): stop and wait for explicit template choice before Step E3.

**Output after user confirms:**

- `name` — Template name
- `groupId` — Group identifier
- `assetId` — Asset identifier
- `version` — Selected version
- `minMuleVersion` — Minimum Mule version (from `search_templates.sh` output)
- `sourceLocation` — `"private"` or `"public"` (from `search_templates.sh` output)

---

### Step E3: Template Integration Plan (Technical Summary)

Before generation, present a comprehensive plan for user approval:

**Template Integration Plan**

**User Requirement:** "[original request summary]"

**Selected Template:**
- Name: [template name]
- Asset: [groupId:assetId]
- Version: [X.X.X]
- Min Mule Version: [minMuleVersion from response]
- Source: [Private/Public Exchange]

**Project Configuration (optional — defaults used if not specified):**
- Project Name: [projectName or default]
- Project Path: [projectPath or current workspace]

**What Will Be Created:**
- Maven project structure with `pom.xml`
- Mule flows in `src/main/mule/`
- Property files in `src/main/resources/`
- [Any additional resources from template]

**Post-Generation:** Flow generation is **entirely delegated to the `build-mule-integration` skill**. That skill handles connector discovery, trigger selection, technical summary, and the actual flow generation.

Then prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>Please review the Template Integration Plan above. Should I proceed with project generation?</question>
<options>["Yes, proceed with project generation.", "Yes, but let me specify the project name and path.", "No, I want to select a different template.", "Cancel."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (project creation): do not call `create_mule_project` until the user approves this plan.

**Output:** User approval to proceed.

---

### Step E4: Project Generation

**Pre-flight checklist — before calling `create_mule_project`, verify ALL:**

- Step E2: user explicitly selected a template.
- Step E3: Template Integration Plan approved.

If ANY item is missing, STOP and get confirmation.

#### E4a. Execute Project Generation

Only after ALL confirmations, call `create_mule_project` per **Reference → `create_mule_project` Schema**.

**Exchange (this path):** all of the following are required:

- `projectPath` — path where project will be created
- `projectName` — name for the project
- `assetId` — from selected template
- `groupId` — from selected template
- `version` — from selected template
- `assetType` — set to `"template"`

#### E4b. Validate Generation Success

After generation, verify:

1. Project directory created at specified path.
2. `pom.xml` exists and is valid.
3. `src/main/mule/` contains flow files.
4. Validate per **Validation Standard**.

**Output:** Generated project path, validation status.

---

### Step E5: Generate/Update Mule Flows

After project creation, flow generation or updates follow the **`build-mule-integration` skill**.

#### E5a. Prepare for Flow Confirmation (do not perform flow generation here)

Gather only what is needed to present the confirmation question: project path and list of XML files in `src/main/mule/`. **All flow-generation work** (reading flow content, connector discovery, trigger selection, and the flow generation itself) is **entirely delegated to `build-mule-integration`**; do not do it in this step.

#### E5b. Confirm Flow Generation

Prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>The project has been created. Would you like me to generate or update Mule flows based on your requirements?

**Project:** [projectPath]
**Available XML files:** [list of .xml files in src/main/mule/]

What flow changes would you like?</question>
<options>["Generate flows based on my original request.", "Let me describe specific flow requirements.", "No flow changes needed — the project is ready."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (flow generation): get approval before handing off to `build-mule-integration` skill.

#### E5c. Handoff to build-mule-integration skill

When the user approves flow generation, switch to and follow the `build-mule-integration` skill. Validation and success reporting are handled entirely by that skill.

---

## Scratch Generation Flow

**Flow objective:** Generate Mule Integration Projects from scratch without predefined templates, using baseline generation capabilities.

**Triggers for this branch:** no suitable templates found in Exchange search; user explicitly requests scratch generation; user declines all presented template options; template-based generation fails; "from scratch", "without template", "generate new".

### Step S1: Confirm Project Creation

Before creating the project, prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>I'll create a new Mule project from scratch.

Optional project details (defaults will be used if not specified):
- **Project Name**: [derived from user prompt or use default]
- **Project Path**: [current workspace or specify]

Should I proceed with scratch generation?</question>
<options>["Yes, create this project with the defaults.", "Yes, but let me specify the name and the path.", "No, search Exchange for templates instead.", "Cancel."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (project creation): get approval before calling `create_mule_project`.

**Output:** User approval with `projectName` and `projectPath` (required; see Reference).

---

### Step S2: Create Project

Call `create_mule_project` per **Reference → `create_mule_project` Schema**.

**Scratch (this path):** required only:

- `projectPath` — path where project will be created
- `projectName` — name for the project

No template parameters; creates minimal scaffold project.

**Output:** Generated project path.

---

### Step S3: Generate/Update Mule Flows

Flow generation follows the **`build-mule-integration` skill**.

#### S3a. Confirm Flow Generation

Prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>The project has been created. Would you like me to generate Mule flows based on your requirements?

**Project:** [projectPath]

What flows would you like to generate?</question>
<options>["Generate flows based on my original request.", "Let me describe specific flow requirements.", "No flow changes needed — the project is ready."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (flow generation): get approval before handing off to `build-mule-integration`.

#### S3b. Handoff to build-mule-integration

When the user approves flow generation, switch to and follow the `build-mule-integration` skill. Validation and success reporting are handled entirely by that skill.

---

## Local Template Flow

**Flow objective:** Generate Mule Integration Projects using `.jar` template files stored on the user's local file system.

**Triggers for this branch:** user specifies they have a local template `.jar` file; user provides a file path ending with `.jar`; "use my local template"; "generate from [path].jar"; "use template at /path/to/template.jar".

> **Important:** Per **Core Rules** (local template format) — directory-based templates are NOT supported.

### Step L1: Analyze User Request & Extract Path

Parse the request for:

- Integration intent from the prompt
- Local template `.jar` file path
- Customization requirements

**Examples of trigger prompts:**

- "Use my local template at /path/to/template.jar to create a notification service"
- "Generate an API using the template I downloaded at ~/downloads/api-template.jar"
- "Create project from /templates/my-org-template.jar"

**If `.jar` path provided in request:**

- Extract and validate the path immediately.
- Proceed to Step L2 for validation.

**If path NOT provided or not a `.jar` file,** prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>Please provide the path to your local template `.jar` file:</question>
<options>["I will enter the .jar file path.", "No, search Exchange for templates instead.", "No, I want to generate from scratch instead."]</options>
</ask_followup_question>
```

**Output:** `templatePath` (must end with `.jar`), integration intent.

---

### Step L2: Validate Template `.jar` File

Validate the provided `.jar` path:

1. **Check file exists** at the specified path.
2. **Verify `.jar` extension** — file must end with `.jar`.
3. **Verify valid Mule template JAR** — valid archive containing Mule project structure.

**If validation fails,** prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>The path [path] is not a valid Mule template `.jar` file. [specific error]. Would you like to:</question>
<options>["I will provide a different .jar file path.", "No, search Exchange for templates instead.", "No, I want to generate from scratch instead."]</options>
</ask_followup_question>
```

**Output:** Validated `templatePath` (`.jar` file), template name extracted from filename.

---

### Step L3: Confirm Project Creation

Prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>I'll create a project from your local template.

**Local Template:** [templatePath]
**Template Name:** [extracted or filename]

Optional project details (defaults will be used if not specified):
- **Project Name**: [derived or use default]
- **Project Path**: [current workspace or specify]

Should I proceed?</question>
<options>["Yes, create this project with the defaults.", "Yes, but let me specify the name and the path.", "No, I want to use a different template.", "Cancel."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (project creation): do not call `create_mule_project` until the user confirms.

**Output:** User approval, `templatePath`, `projectName` and `projectPath` (required; see Reference).

---

### Step L4: Create Project from Local Template

**Pre-flight checklist — before calling `create_mule_project`, verify:**

- Step L2: template path validated.
- Step L3: user confirmed project configuration.

If ANY item is missing, STOP and get confirmation.

Call `create_mule_project` per **Reference → `create_mule_project` Schema**.

**Local (this path):** all of the following are required:

- `projectPath` — path where project will be created
- `projectName` — name for the project
- `assetFilePath` — path to the local `.jar` template file

**Output:** Generated project path.

---

### Step L5: Generate/Update Mule Flows

Flow generation or updates follow the **`build-mule-integration` skill**

#### L5a. Prepare for Flow Confirmation (do not perform flow generation here)

Gather only what is needed to present the confirmation question: project path, template path, and list of XML files in `src/main/mule/`. **All flow-generation work** (reading flow content, connector discovery, trigger selection, and the flow generation itself) is **entirely delegated to `build-mule-integration`**; do not do it in this step.

#### L5b. Confirm Flow Generation

Prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>The project has been created from your local template. Would you like me to generate or update Mule flows based on your requirements?

**Project:** [projectPath]
**Template Used:** [local template .jar path]
**Available XML files:** [list of .xml files in src/main/mule/]

What flow changes would you like?</question>
<options>["Generate or update flows based on my original request.", "Let me describe specific flow requirements.", "No flow changes needed — the project is ready."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (flow generation): get approval before handing off to `build-mule-integration`.

#### L5c. Handoff to build-mule-integration

When the user approves flow generation, switch to and follow the `build-mule-integration` skill. Validation and success reporting are handled entirely by that skill.

---

## Reference

### Generation Flow Decision Matrix

| User Request | Initial Flow | Steps | Fallback Option |
| ------------ | ------------ | ----- | --------------- |
| "Use local template at /path/template.jar" | **Local Template** | L1 → L2 → L3 → L4 → L5 | Exchange or Scratch |
| "Create from scratch" | **Scratch** | S1 → S2 → S3 | Exchange Template |
| "Generate integration" (no template preference) | **Exchange Template** | E1 → E2 → E3 → E4 → E5 | Scratch if no matches |
| "Use Exchange template" | **Exchange Template** | E1 → E2 → E3 → E4 → E5 | Scratch if no matches |
| Template search returns no results | Fallback to **Scratch** | S1 → S2 → S3 | — |
| Local `.jar` validation fails | Offer **Exchange** or **Scratch** | Step 1 re-entry | — |

*Scratch and Local end at handoff to `build-mule-integration` (S3b, L5c); Exchange ends at E5c. Validation and success reporting for flows are handled by `build-mule-integration`.*

### Flow Switching Rules

Users can switch between flows at specific checkpoints. Honor these requests:

| Current Flow | User Says | Action |
| ------------ | --------- | ------ |
| Exchange Template (Step E2) | "Use local template instead" | → Jump to Step L1 |
| Exchange Template (Step E2) | "Proceed without template" | → Jump to Step S1 |
| Local Template (Step L3) | "Search Exchange instead" | → Jump to Step E1 |
| Local Template (Step L2 — validation fails) | "Generate from scratch" | → Jump to Step S1 |
| Scratch (Step S1) | "Actually, search for templates" | → Jump to Step E1 |

> **Important:** When switching flows, carry forward any already-gathered information (project name, requirements, etc.) to avoid re-asking the user.

### Tool & Script Reference

| Tool / Script | Purpose | Requires User Approval |
| ------------- | ------- | ---------------------- |
| `scripts/search_templates.sh <query>` | Step E2a — search Anypoint Exchange for templates (private and public) and return an enriched, ranked JSON array on stdout (max 10 rows). | No (read-only Bash call) |
| `create_mule_project` (mule-mcp-server) | Create project from template or scratch. **Do not call directly** — only call from within this workflow at Step E4, S2, or L4 after the corresponding confirmation checkpoint has been satisfied. | **YES** (workflow + user approval required) |

> **Note:** Flow generation (E5, S3, L5) is handled entirely by the `build-mule-integration` skill — this workflow does not invoke any flow-generation tool directly.

### `scripts/search_templates.sh` Reference

**Invocation:**

```bash
<skill-dir>/scripts/search_templates.sh "<search-query>"
```

| Argument | Required | Description |
| -------- | -------- | ----------- |
| `<search-query>` | Yes | Search terms built in Step E1a (e.g. `"salesforce database sync"`). |

The script runs two `exchange asset list` calls in parallel — one unscoped (public) and one with `--organizationId <my-org>` (private) — and tags each row by which call returned it. The user's org id is auto-resolved from `account environment list`. Returns the top 10 ranked results (private-first), enriched via `exchange asset describe`.

**Stdout:** JSON array sorted private-first (max 10 rows). Each row carries `name`, `groupId`, `assetId`, `version`, `minMuleVersion`, `description`, `sourceLocation`. Exit code `1` + stderr message means no templates matched.

### `create_mule_project` Schema

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `projectPath` | **Yes** | Path where project will be created |
| `projectName` | **Yes** | Name for the project |
| `assetId` | For Exchange | Asset ID from selected template |
| `groupId` | For Exchange | Group ID from selected template |
| `version` | For Exchange | Version from selected template |
| `assetType` | For Exchange | Set to `"template"` for Exchange templates |
| `assetFilePath` | For Local | Path to local `.jar` template file |

**Usage by flow:**

- From Exchange: `projectPath`, `projectName`, `assetId`, `groupId`, `version`, `assetType: "template"` (all required)
- From Local `.jar`: `projectPath`, `projectName`, `assetFilePath` (all required)
- From Scratch: `projectPath`, `projectName` (both required, no template parameters)

### Success Report Format

Use this format when reporting project generation success. Set variant as **Exchange** (include "Template Used"), **Scratch** (no template line), or **Local Template** (include "Source Template").

```markdown
**Project Generation Complete** [variant: add " (Scratch)" or " (Local Template)" for those flows; omit for Exchange]

**Location:** [project path]
[**Template Used:** [template name] v[version] — Exchange only | **Source Template:** [local .jar path] — Local only | omit for Scratch]

**Created Files:**
- pom.xml (Maven configuration)
- src/main/mule/[flow files]
- src/main/resources/[property files]
```

### Error Handling Guide

| Issue | Action |
| ----- | ------ |
| No templates found in Exchange | Offer scratch generation or different search terms |
| Template download fails | Retry once, then offer alternative templates |
| Project compilation fails | Check dependencies, validate XML, report specific error |
| Local `.jar` file not found | Ask user to verify path and provide correct `.jar` file location |
| Local file is not a `.jar` | Inform user per **Core Rules** (local template format); ask for correct path |
| Multiple versions of same template | Always present ONLY the latest version |

---

## Example Walkthrough

**Request:** "Create an integration that syncs customer data between Salesforce and PostgreSQL"

**Step 1:** Detect path → no local `.jar` provided, no scratch request → Exchange Template Flow.

**Step E1:** Analyze request

- Extract: "Salesforce", "PostgreSQL", "sync", "customer data"
- Build search query: `"Salesforce database sync template"`

**Step E2:** Run `scripts/search_templates.sh "Salesforce database sync template" 10`:

- Script returns a JSON array, private-first. Example shape: `salesforce-db-sync-template` v2.1.0 (private; older versions already collapsed by the script), `sf-postgres-connector-template` v1.0.0 (public).
- Present both with full details (Name, Asset, Version, Min Mule Version, Description).
- User selects the private template.

**Step E3:** Present Template Integration Plan

- Show selected template details.
- User approves.

**Step E4:** Generate project using `create_mule_project`

- Call with `assetId`, `groupId`, `version`, `assetType: "template"`.
- Validate project compiles.

**Step E5:** Flow generation is **entirely delegated to the `build-mule-integration` skill**. Ask user for flow customization approval (E5b); when approved, switch to and follow the `build-mule-integration` skill. It runs in full (project investigation, trigger and connector discovery, technical summary, flow generation, validation, and success reporting). No further project-generation steps after handoff.

---

## Quality Standards

A successful Mule project generation requires:

- **Template Discovery**: all available templates from both private and public exchanges discovered and deduplicated.
- **User Confirmation**: see **Confirmation Checkpoints** and **Validation Standard** (Core Rules).
- **Valid Output**: generated project compiles successfully with Maven.
- **Best Practices**: follows MuleSoft naming conventions, proper error handling, externalized configuration.
- **Completeness**: all user requirements addressed through template customization and (when the user approves) flow generation via `build-mule-integration` (delegated).

> **Important:** See **Confirmation Checkpoints** and **Validation Standard** (Core Rules).
