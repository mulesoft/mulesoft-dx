---
name: validate-imperative-format
description: Validate that API info.description fields use imperative voice starting with an action verb. Use when the user asks to "check descriptions", "validate imperative voice", "lint API descriptions", or "review description format".
metadata:
  version: 1.0.0
  author: "Mariano de Achaval"
---

# Validate Imperative Format

This skill validates that every API specification's `info.description` starts with an imperative action verb. It relies on agent reasoning rather than regex to evaluate whether the opening word is a genuine imperative verb appropriate for describing an API's capabilities.

## When to Use This Skill

Use this skill when:
- Reviewing API descriptions for consistent voice and tone
- Auditing description quality across all specs before a release
- Fixing descriptions that use boilerplate or passive phrasing

## What Makes a Good API Description

A good `info.description` starts with an **imperative verb** — a direct command form that tells the reader what the API does. The sentence should read as if completing the phrase *"Use this API to..."* without actually writing that phrase.

### Examples of good imperative openers

- `Manage APIs, policies, contracts, and SLA tiers.`
- `Query audit log events and actions for organizations.`
- `Search and describe metric types for the Observability platform.`
- `Deploy, configure, and monitor Flex Gateway instances.`
- `Tokenize and detokenize sensitive data using configured services.`

Common imperative verbs in this context include: Manage, Query, Search, Retrieve, List, Monitor, Track, Deploy, Configure, Create, Export, Publish, Register, Design, Validate, Secure, Transform, among others.

### Forbidden patterns

Descriptions must **not** start with any of these boilerplate or passive patterns:

- `Provides programmatic access to...` — boilerplate filler
- `This is a RAML...` — format metadata, not a description
- `The X API allows you to...` — indirect, not imperative
- `This API ...` — vague, indirect opener
- `API V1...` — version metadata, not a description
- `A set of endpoints for...` — passive, not imperative
- `Enables users to...` — indirect, not imperative

## Validation Process

When asked to validate imperative format, follow these steps:

### Step 1: Discover all API specs

Find all `api.yaml` files in the repository root directories (skip `.agents`, `scripts`, `docs`, `portal`).

### Step 2: Extract info.description

For each `api.yaml`, read the `info.description` field value.

### Step 3: Validate each description

For each description, evaluate:

1. **Starts with an imperative verb**: The first word should be a verb in imperative (command) form. Use your judgment — if the word functions as a direct command that could follow "Use this API to...", it qualifies.
2. **No forbidden patterns**: The description must not match any of the boilerplate patterns listed above.
3. **Minimum quality**: The description should be at least 20 characters and convey the API's domain and capabilities, not just repeat the title.

### Step 4: Report results

Produce a summary table:

```
| API | Status | First Word | Issue |
|-----|--------|------------|-------|
| api-manager | PASS | Manage | - |
| metrics | PASS | Search | - |
| bad-api | FAIL | Provides | Forbidden boilerplate pattern |
| other-api | FAIL | A | Not an imperative verb |
```

### Step 5: Suggest fixes

For each failing description, suggest a rewritten version that:
- Starts with an imperative verb
- Concisely describes the API's domain and capabilities
- Avoids repeating the API title verbatim

## Examples

**PASS**:
```yaml
info:
  description: Manage APIs, policies, contracts, and SLA tiers within Anypoint Platform.
```

**FAIL** — boilerplate opener:
```yaml
info:
  description: Provides programmatic access to manage resources within the platform.
```
Fix: `Manage platform resources. Supports CRUD operations for...`

**FAIL** — indirect phrasing:
```yaml
info:
  description: The Metrics API allows you to search and describe metric types.
```
Fix: `Search and describe metric types for the Observability platform.`

**FAIL** — passive, no imperative verb:
```yaml
info:
  description: A set of endpoints for managing things.
```
Fix: `Manage things across environments and organizations.`
