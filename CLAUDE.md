# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the single source of truth for all **public Anypoint Platform API specifications**. Each service has its own directory containing OpenAPI 3.0 specs validated against AI-agent-friendly best practices.

## Common Commands

### Validation

```bash
# Validate all APIs with governance rules (recommended before PRs)
make validate-all-governed

# Validate specific API
make validate-api API=api-manager

# List all discoverable APIs
make list-apis

# Generate comprehensive validation report
make report

# Clean validation reports
make clean
```

### Validation Tools

The repository uses **Anypoint CLI v4** for validation:
- Basic OAS validation: structural correctness, schema consistency
- Governed validation: AI-agent best practices from `./.agents/skills/api-spec-validator/scripts/ruleset.yaml`

### Python Validators

```bash
# Validate x-origin annotations
python3 scripts/build/validate_xorigin.py

# Validate Jobs To Be Done (JTBD) format
python3 scripts/build/validate_jtbd.py <path-to-job-file> .
```

### Portal Generator Tests

```bash
# Run all portal generator tests via Makefile
make test-portal

# Or run directly with pytest (from scripts/ directory)
cd scripts && python3 -m pytest tests/ -v

# Run individual test files
cd scripts && python3 -m pytest tests/test_units.py -v
cd scripts && python3 -m pytest tests/test_oas_parser.py -v
cd scripts && python3 -m pytest tests/test_smoke.py -v

# Install test dependencies (first time only)
pip3 install -r scripts/requirements.txt
```

The test suite covers:
- **Unit tests** (`test_units.py`): pure functions across utils, tree builder, Jinja2 filters, generator helpers, skill parser, discovery stats, and the x-origin operation lookup builder
- **OAS parser tests** (`test_oas_parser.py`): `$ref` resolution (internal, external, fragment pointers), `allOf` merging, schema property extraction with constraints, operation extraction, example loading
- **Smoke tests** (`test_smoke.py`): full end-to-end generation against minimal fixtures, output file validation, HTML structure checks with BeautifulSoup

## Architecture

### Directory Structure

All API specifications are organized under the `apis/` directory:
```
apis/
└── <service-name>/
    ├── api.yaml           # OpenAPI 3.0 specification
    ├── exchange.json      # Exchange metadata (groupId, assetId, version)
    ├── schemas/           # Optional: reusable schema definitions
    └── examples/          # Optional: request/response examples
```

Skills (JTBD files) live in a top-level `skills/` directory:
```
skills/
└── <skill-name>/
    └── SKILL.md       # Job-to-be-done written in agent-skill format
```

Skills are automatically associated with APIs by parsing `urn:api:` references in their YAML step blocks. A skill that references multiple APIs appears on each of those API's portal pages.

The Makefile auto-discovers APIs by finding `exchange.json` files in the `apis/` directory.

### Special Extensions

#### x-origin Annotations

`x-origin` documents dynamic enum sources - which API provides the values, which operation to call, and how to extract both identifiers (`values`) and display names (`labels`) from the response. Key rules:

- Always an array of source objects (even for single source)
- Must reference valid `operationId` in target API spec
- `values` is required (JSONPath expression), `labels` is optional
- Do not duplicate callee parameters inside `x-origin`
**Schema:** JSON Schema at `docs/schemas/x-origin.schema.json` is the source of truth.
**Documentation:** `docs/x-origin-schema.md` for complete guide with examples.
**Validation:** `python3 scripts/build/validate_xorigin.py` validates against schema and checks operation references.

#### Jobs To Be Done (JTBD)

Markdown format that combines:
1. **AI Agent Instructions** - step-by-step prose for Claude to follow
2. **Structured YAML** - validatable job definitions with inputs/outputs
3. **Human Documentation** - comprehensive guides with examples

Located in the top-level `skills/` directory.

Template: `docs/job-template.md`
Schema: `docs/x-jobs-to-be-done-schema.md`
Examples: `skills/*/SKILL.md`

Validation: `python3 scripts/build/validate_jtbd.py` verifies structure, API references, step dependencies.

### Skills Integration

The repository integrates with Claude Code via the `mulesoft-api-development` skill marketplace:
- `api-spec-validator`: Validate specs against governance rules (automated via ruleset)
- `api-schema-inferrer`: Generate schemas from examples
- `api-doc-generator`: Generate documentation and curl examples
- `validate-imperative-format`: Validate that `info.description` uses imperative voice (agent-only, not part of the automated pipeline)

Enabled in `.claude/settings.json`.

> **Note:** `validate-imperative-format` is an agent-only skill — it is not run by the CLI or CI/CD pipeline. It relies on LLM judgment to evaluate whether descriptions start with an imperative verb and avoid boilerplate phrasing. Run it on-demand by asking your AI agent to "validate imperative format".

## Development Workflow

### Adding/Updating an API Spec

1. Create or update `<service>/api.yaml` and `<service>/exchange.json`
2. Validate: `make validate-api API=<service>`
3. Fix violations until compliant
4. Commit only when validation passes
5. Create PR - validation will run in CI/CD

### Creating a JTBD Skill

1. Copy template: `mkdir -p skills/<job-name> && cp docs/job-template.md skills/<job-name>/SKILL.md`
2. Fill in all `[placeholders]`
3. Validate: `python3 scripts/build/validate_jtbd.py skills/<job-name>/SKILL.md .`
4. Fix errors until valid

### Working with x-origin Annotations

When adding x-origin:
- Reference must use `urn:api:<folder-name>` format
- `operation` must match an existing `operationId` in that API's spec
- Use v2 array format: `x-origin: [{api: ..., operation: ..., values: ..., labels: ...}]`
- `values` is required (JSONPath), `labels` is optional
- Validate: `python3 scripts/build/validate_xorigin.py`

## Portal Generator Architecture

The static portal generator (`scripts/portal_generator/`) follows strict architectural principles:

### Core Principles

1. **No Duplicate HTML** — Extract common patterns into Jinja2 macros and includes. If HTML appears in 2+ places, create a reusable component.

2. **Python-First Processing** — All data transformation, filtering, sorting, and business logic happens in Python. JavaScript only handles user interactions and dynamic UI updates.

3. **Test Everything** — Every new feature requires tests. No exceptions.

### What Goes Where

**Python handles:**
- Data transformation and normalization
- Filtering, sorting, aggregations
- Schema validation and parsing
- Complex string formatting
- Business logic

**JavaScript handles:**
- DOM manipulation and event handling
- Animations and transitions
- Form interactions and modal toggling
- Copy-to-clipboard, syntax highlighting
- Client-side filtering (after Python preprocessing)

**Templates use:**
- Jinja2 macros for reusable components with parameters
- Includes for static sections and layout
- Filters for formatting only, not complex logic

### Testing Requirements

```bash
# Run all tests before committing portal changes
make test-portal

# Tests must cover:
# - Unit tests for pure functions (utils, parsers, builders)
# - OAS parser tests ($ref resolution, allOf merging, schema extraction)
# - Smoke tests (end-to-end generation, HTML structure validation)
```

**Read more:** `docs/portal-generator-architecture.md` — Complete guide with examples, patterns, and best practices.

## Design System

The portal uses a semantic token system with CSS custom properties. **Always use tokens, never hard-coded colors or values.**

### Quick Reference

```css
/* ✅ CORRECT - Semantic tokens */
.card {
  color: var(--color-text-primary);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-large);
  padding: var(--space-md);
  box-shadow: var(--shadow-md);
}

/* ❌ WRONG - Hard-coded values */
.card {
  color: #3E3E3C;
  background: #FFFFFF;
  border: 1px solid #DDDBDA;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
```

### Core Design Principles

1. **White Background = Interactive** — Surface backgrounds (`--color-bg-surface`) signal clickable elements. Gray backgrounds (`--color-bg-primary`) are non-interactive containers.

2. **No Boxes Inside Boxes** — Avoid nested bordered/shadowed containers. Use background color changes and spacing instead.

3. **Hover = Selected Style** — For selectable elements, hover state must match the selected state for predictable interactions.

4. **Buttons Use --radius-large Minimum** — All buttons require at least `--radius-large` (12px) border radius for a modern, friendly aesthetic.

### Token Categories

- **Text:** `--color-text-primary`, `--color-text-secondary`, `--color-text-link`
- **Backgrounds:** `--color-bg-primary`, `--color-bg-surface`, `--color-bg-overlay`
- **Borders:** `--color-border-primary`, `--color-border-focus`
- **Spacing:** `--space-xs` through `--space-2xl` (2px → 48px)
- **Typography:** `--font-size-1` through `--font-size-11`, `--font-weight-*`
- **Radius:** `--radius-small`, `--radius-medium`, `--radius-large`, `--radius-xl`
- **Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`
- **HTTP Methods:** `--method-get-bg/text`, `--method-post-bg/text`, etc.

**Read more:** `docs/design-system.md` — Complete token reference, component patterns, and usage examples.

## Key Files

- `Makefile`: Validation orchestration, report generation
- `scripts/build/validate_xorigin.py`: Validates x-origin annotations across all specs
- `scripts/build/validate_jtbd.py`: Validates Jobs To Be Done format
- `scripts/portal_generator/`: Static API portal generator package
- `scripts/portal_generator/assets/styles.css`: Design system CSS variables (lines 39-270)
- `scripts/tests/`: Portal generator test suite (pytest)
- `scripts/pyproject.toml`: Pytest configuration for the portal generator
- `.agents/skills/`: Agent skills (api-spec-validator, validate-imperative-format, jtbd-generator, etc.)
- `docs/VALIDATION.md`: Detailed validation guide with CI/CD examples
- `docs/design-system.md`: Complete design system documentation
- `docs/portal-generator-architecture.md`: Architecture guidelines and best practices
- `docs/schemas/x-origin.schema.json`: JSON Schema for x-origin extension (source of truth)
- `docs/x-origin-schema.md`: Complete x-origin documentation with examples
- `docs/jobs-readme.md`: JTBD documentation and usage guide
- `docs/job-template.md`: Template for creating new JTBD files

## Governance Rules

The ruleset (`./.agents/skills/api-spec-validator/scripts/ruleset.yaml`) enforces:
- `info.title` must end with "API"
- `info.version` must use semver (x.x.x)
- `info.description` must be present
- All operations have unique `operationId` in camelCase
- All operations have descriptions
- Request/response examples present
- Schema properties documented
- Enums for constrained string values (no "naked strings")
- Explicit `required` fields
- Parameters have descriptions

Zero violations required before merge.

Additionally, the `validate-imperative-format` agent skill (not part of the automated pipeline) checks that `info.description` starts with an imperative verb and avoids boilerplate phrasing. Run it on-demand via an AI agent.

## Exchange Metadata

`exchange.json` contains:
- `main`: API spec filename (usually `api.yaml`)
- `name`: Human-readable API name
- `groupId`: Organization group ID with `.anypoint-platform` suffix
- `assetId`: Unique asset identifier (kebab-case)
- `version`: Semantic version
- `apiVersion`: API version (e.g., `v1`)
- `organizationId`: MuleSoft organization GUID

## Tools Required

- **Node.js and npm**: For Anypoint CLI
- **Anypoint CLI v4**: `npm install -g anypoint-cli-v4`
- **API Project Plugin**: `anypoint-cli-v4 plugins:install anypoint-cli-api-project-plugin`
- **Python 3**: For validation scripts and portal generator
- **PyYAML**: For Python validators
- **Portal generator deps**: `pip3 install -r scripts/requirements.txt` (Jinja2, ruamel.yaml, markdown-it-py, pytest, beautifulsoup4)

## Important Notes

- Validation reports go to `./validation-reports/` (gitignored)
- API discovery is automatic - just add `exchange.json` to a directory
- JTBD files serve triple purpose: AI skills, documentation, executable specs
- All specs must use OpenAPI 3.0.x or 3.1.x format
