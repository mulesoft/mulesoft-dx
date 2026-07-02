# Template-Based Project Creation

> You are reading this file because Step 1b determined the user wants a template-based project.
> Follow the appropriate flow below (Exchange or Local), then return to Step 2 of the main workflow.
>
> **Available from the main workflow:**
> - `tmp/mule-dev-env.json` — contains `mule_version` (use for `--mule-version`)
> - `scripts/search_templates.sh` — Exchange template search
>
> **Note:** Connector dependencies are NOT available yet (discovery happens in Steps 2-7).
> The template project will get dependencies added later during Step 8.

---

## Behavioral Guidance

Your behavior should be deliberate and confirmation-driven. Take time to understand user requirements and organizational template availability before proposing a template. The quality of your template discovery directly impacts adherence to organizational standards. Treat this as a collaborative decision-making process — never proceed to template selection or project generation without explicit user confirmation at each checkpoint.

**Agent tone — choice options:** When presenting multiple-choice options to the user (e.g. via `AskUserQuestion` / `<ask_followup_question>`), use **full, formal sentences**, not brief phrases. For example: use "Yes, create this project with the defaults." not "Yes, create with defaults"; use "Yes, but let me specify the name and the path." not "Let me specify name/path"; use "No, search Exchange for templates instead." not "Search Exchange for templates instead."

> **Important:** Execute steps without commentary; never proceed to the next step without explicit user confirmation.

---

## Core Rules

### Operational Requirements

- **No direct `dx:mule:project:create`:** Do not call `dx:mule:project:create` until this workflow has completed discovery and the user has approved (Confirmation checkpoint 2). Never invoke it directly in response to a project-creation request. Call it only at the designated project-creation step in the chosen flow (Exchange E4 or Local L4).
- MUST present the `scripts/search_templates.sh` output for user selection of template
- MUST present results from both private and public groupIds per **Search Completeness Rule**
- MUST follow **Confirmation Checkpoints** (below) for template selection and project creation
- MUST follow **Validation Standard** (below) after any project generation

### Validation Standard

- After any project generation, run `mvn clean compile` and only report success if it passes.

### Add to Workspace

- After successful project creation (directory exists, pom.xml validated), **always** add the project to the current VS Code workspace by running:
  ```bash
  code --add <projectPath>
  ```
- If VS Code is not open or the command fails, ignore the failure silently and proceed with the next step.

### Runtime Version Resolution

- Read `mule_version` from `tmp/mule-dev-env.json` (already resolved by Step 1 of the main workflow).
- If `tmp/mule-dev-env.json` is unavailable, resolve by running:
  ```bash
  anypoint-cli-v4 dx:mule:runtime:list --output json --environment ""
  ```
  Pick the entry with `"latest": true` → use its `version` as `--mule-version`.
- If the user explicitly specifies a Mule version, use that instead.

### Confirmation Checkpoints

- **Template selection:** Wait for explicit user choice before proceeding. Do not assume which template the user wants.
- **Project creation:** Do not call `dx:mule:project:create` until the user explicitly approves (e.g. Template Integration Plan for Exchange, or equivalent confirmation for Local).

### Search Completeness Rule

> **Important:** Even if private Exchange search returns templates that appear to match perfectly, you MUST still search public Exchange as well. This ensures:
> 1. Users see all available template options across both exchanges.
> 2. Users can make informed decisions with complete organizational template information.

### Local Template Format

- Local templates must be a packaged `.jar` or `.zip` file; directory-based (unpacked) templates are NOT supported.

---

## Bundled Scripts

This skill ships small bash helpers under `scripts/`. Invoke them with the `Bash` tool at the absolute path you were given in the "skill is now active" message (the directory containing the main `SKILL.md`). Do **not** use relative paths — Cline's working directory shifts across turns and relative paths break.

| Script | Purpose | Output |
| --- | --- | --- |
| `scripts/search_templates.sh <search-term>` | Search Anypoint Exchange for `type == "template"` assets via two parallel `exchange asset list` calls (one unscoped, one `--organizationId <my-org>`), dedup, rank by token overlap with `<search-term>`, then enrich the top 10 with `description`, `minMuleVersion`, and `sourceLocation` (`"private"` for org-scoped hits, `"public"` otherwise). | Single JSON array on stdout (max 10 rows), sorted private-first. Exits 1 with an error on stderr when no templates match. |

The script wraps `anypoint-cli-v4 exchange asset list` (paginated) plus `anypoint-cli-v4 exchange asset describe` (top-N enrichment). It auto-resolves a real environment from `anypoint-cli-v4 account environment list` so it works regardless of how `ANYPOINT_ENV` is set in the shell.

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
<options>["I want to search with different terms.", "I want to generate the project from scratch.", "I will provide a local template file (.jar or .zip)."]</options>
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

**Post-Generation:** After project creation, the main workflow will continue with connector discovery and flow generation.

Then prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>Please review the Template Integration Plan above. Should I proceed with project generation?</question>
<options>["Yes, proceed with project generation.", "Yes, but let me specify the project name and path.", "No, I want to select a different template.", "Cancel."]</options>
</ask_followup_question>
```

> **Important:** Per **Confirmation Checkpoints** (project creation): do not call `dx:mule:project:create` until the user approves this plan.

**Output:** User approval to proceed.

---

### Step E4: Project Generation

**Pre-flight checklist — before calling `dx:mule:project:create`, verify ALL:**

- Step E2: user explicitly selected a template.
- Step E3: Template Integration Plan approved.

If ANY item is missing, STOP and get confirmation.

#### E4a. Execute Project Generation

Only after ALL confirmations, call `dx:mule:project:create`.

**Exchange (this path):** run from the target parent directory:

```bash
MULE_VERSION=$(jq -r '.mule_version' tmp/mule-dev-env.json)

anypoint-cli-v4 dx:mule:project:create <projectName> \
  --template-asset "<groupId>:<assetId>:<version>" \
  --mule-version "$MULE_VERSION" \
  --output json \
  --environment ""
```

#### E4b. Validate Generation Success

After generation, verify:

1. Project directory created at specified path.
2. `pom.xml` exists and is valid.
3. `src/main/mule/` contains flow files.
4. Validate per **Validation Standard**.
5. Run `code --add <projectPath>` per **Add to Workspace**.

**Output:** Generated project path, validation status.

---

### Step E5: Continue or Stop

**Always ask** after the project has been created and validated, regardless of how the original request was phrased:

```xml
<ask_followup_question>
<question>The project has been created from the template. Would you like me to continue with connector discovery and flow generation (build-mule-integration Step 2 onwards), or stop here?</question>
<options>["Yes, continue with connector discovery and flow generation.", "No, stop here — I'll continue from this point myself."]</options>
</ask_followup_question>
```

**Based on the answer:**

1. **Continue** → Return to Step 2 of the main workflow to proceed with connector discovery and flow generation.
2. **Stop** → Declare completion via `<attempt_completion>`. Do **not** proceed to Step 2; do **not** add additional connectors or flows beyond what the template already provides.

> **Important:** Do not infer the user's intent from prompt phrasing. Always ask explicitly. The user gets the final say on whether template setup is the end goal or just the starting point.

---

## Local Template Flow

**Flow objective:** Generate Mule Integration Projects using `.jar` or `.zip` template files stored on the user's local file system.

**Triggers for this branch:** user specifies they have a local template file (`.jar` or `.zip`); user provides a file path ending with `.jar` or `.zip`; "use my local template"; "generate from [path].jar" or "generate from [path].zip"; "use template at /path/to/template.jar".

> **Important:** Per **Core Rules** (local template format) — only packaged `.jar` or `.zip` files are accepted; directory-based templates are NOT supported.

### Step L1: Analyze User Request & Extract Path

Parse the request for:

- Integration intent from the prompt
- Local template file path (`.jar` or `.zip`)
- Customization requirements

**Examples of trigger prompts:**

- "Use my local template at /path/to/template.jar to create a notification service"
- "Generate an API using the template I downloaded at ~/downloads/api-template.zip"
- "Create project from /templates/my-org-template.jar"

**If a path ending in `.jar` or `.zip` is provided in the request:**

- Extract and validate the path immediately.
- Proceed to Step L2 for validation.

**If path NOT provided or not a `.jar`/`.zip` file,** prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>Please provide the path to your local template file (`.jar` or `.zip`):</question>
<options>["I will enter the local template file path.", "No, search Exchange for templates instead.", "No, I want to generate from scratch instead."]</options>
</ask_followup_question>
```

**Output:** `templatePath` (must end with `.jar` or `.zip`), integration intent.

---

### Step L2: Validate Local Template File

Validate the provided template path:

1. **Check file exists** at the specified path.
2. **Verify extension** — file must end with `.jar` or `.zip`.
3. **Verify valid Mule template archive** — valid `.jar` or `.zip` containing Mule project structure.

**If validation fails,** prompt via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>The path [path] is not a valid Mule template (.jar or .zip). [specific error]. Would you like to:</question>
<options>["I will provide a different local template file path.", "No, search Exchange for templates instead.", "No, I want to generate from scratch instead."]</options>
</ask_followup_question>
```

**Output:** Validated `templatePath` (`.jar` or `.zip` file), template name extracted from filename.

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

> **Important:** Per **Confirmation Checkpoints** (project creation): do not call `dx:mule:project:create` until the user confirms.

**Output:** User approval, `templatePath`, `projectName` and `projectPath`.

---

### Step L4: Create Project from Local Template

**Pre-flight checklist — before calling `dx:mule:project:create`, verify:**

- Step L2: template path validated.
- Step L3: user confirmed project configuration.

If ANY item is missing, STOP and get confirmation.

**Local (this path):** run from the target parent directory:

```bash
MULE_VERSION=$(jq -r '.mule_version' tmp/mule-dev-env.json)

anypoint-cli-v4 dx:mule:project:create <projectName> \
  --template-file "<templatePath>" \
  --mule-version "$MULE_VERSION" \
  --output json \
  --environment ""
```

After generation, verify:

1. Project directory created at specified path.
2. `pom.xml` exists and is valid.
3. Validate per **Validation Standard**.
4. Run `code --add <projectPath>` per **Add to Workspace**.

**Output:** Generated project path.

---

### Step L5: Continue or Stop

**Always ask** after the project has been created and validated, regardless of how the original request was phrased:

```xml
<ask_followup_question>
<question>The project has been created from the template. Would you like me to continue with connector discovery and flow generation (build-mule-integration Step 2 onwards), or stop here?</question>
<options>["Yes, continue with connector discovery and flow generation.", "No, stop here — I'll continue from this point myself."]</options>
</ask_followup_question>
```

**Based on the answer:**

1. **Continue** → Return to Step 2 of the main workflow to proceed with connector discovery and flow generation.
2. **Stop** → Declare completion via `<attempt_completion>`. Do **not** proceed to Step 2; do **not** add additional connectors or flows beyond what the template already provides.

> **Important:** Do not infer the user's intent from prompt phrasing. Always ask explicitly. The user gets the final say on whether template setup is the end goal or just the starting point.

---

## Reference

### Generation Flow Decision Matrix

| User Request | Flow | Steps |
| ------------ | ---- | ----- |
| "Use Exchange template", "search Exchange" | **Exchange Template** | E1 → E2 → E3 → E4 |
| "Use local template at /path/template.jar" or "/path/template.zip" | **Local Template** | L1 → L2 → L3 → L4 |
| Template search returns no results | Offer **Scratch** (return to main workflow Step 2, scratch at Step 8) | — |
| Local `.jar`/`.zip` validation fails | Offer **Exchange** or **Scratch** | Re-entry |

### Flow Switching Rules

Users can switch between flows at specific checkpoints. Honor these requests:

| Current Flow | User Says | Action |
| ------------ | --------- | ------ |
| Exchange Template (Step E2) | "Use local template instead" | → Jump to Step L1 |
| Exchange Template (Step E2) | "Proceed without template" | → Return to main workflow (scratch at Step 8) |
| Local Template (Step L3) | "Search Exchange instead" | → Jump to Step E1 |
| Local Template (Step L2 — validation fails) | "Generate from scratch" | → Return to main workflow (scratch at Step 8) |

> **Important:** When switching flows, carry forward any already-gathered information (project name, requirements, etc.) to avoid re-asking the user.

### `dx:mule:project:create` Schema

```
anypoint-cli-v4 dx:mule:project:create <projectName> [flags]
```

| Flag | Required | Description |
| ---- | -------- | ----------- |
| `<projectName>` (arg) | **Yes** | Name for the project (positional argument) |
| `--mule-version` | **Yes** | Mule runtime version (from `tmp/mule-dev-env.json`) |
| `--template-asset` | For Exchange | Exchange template in `groupId:assetId:version` format |
| `--template-file` | For Local | Path to local `.jar` or `.zip` template file |
| `--group-id` | No | Maven group ID (default: `com.mycompany`) |
| `--output` | No | Output format: `text` or `json` (default: `text`) |
| `--environment ""` | **Yes** | Required to bypass environment selection |

**Usage by flow:**

- From Exchange: `dx:mule:project:create <name> --template-asset "<groupId>:<assetId>:<version>" --mule-version <ver> --output json --environment ""`
- From Local file: `dx:mule:project:create <name> --template-file "<path-to-jar-or-zip>" --mule-version <ver> --output json --environment ""`

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

### Success Report Format

Use this format when reporting project generation success:

```markdown
**Project Generation Complete**

**Location:** [project path]
**Template Used:** [template name] v[version] (Exchange) | **Source Template:** [local .jar or .zip path] (Local)

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
| Local `.jar` or `.zip` file not found | Ask user to verify path and provide correct file location |
| Local file is not a `.jar` or `.zip` | Inform user per **Core Rules** (local template format); ask for correct path |
| Local archive is corrupt or unreadable | Inform user the archive failed validation; offer to provide a different file, search Exchange, or scratch |
| Multiple versions of same template | Always present ONLY the latest version |
