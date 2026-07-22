# CLI documentation template — Dev Portal

Any CLI published in the Dev Portal must meet the requirements below.

## Required metadata (`cli.yaml`)

```yaml
name: <Human-readable CLI name>
slug: <lower-kebab-case identifier — used in the URL>
short_description: <one-line description, < 120 chars>
install:
  <package-manager>: "<install command>"    # at least one of npm, brew, download, etc.
docs:
  source: <scrape | markdown-repo | help-output | native>
  base_url: <canonical documentation home URL>
commands:
  - name: <command name>
    doc_path: docs/<command>.md
tags:
  - cli
  - <ecosystem tag, e.g. anypoint, salesforce>
```

## Required content

- **Name**: human-readable, matches the binary's display name.
- **Slug**: URL-safe identifier.
- **Short description**: one line, < 120 chars.
- **Install**: at least one install command. Prefer package-manager commands over one-off downloads.
- **At least one command** under `commands:` with:
  - description (1-2 sentences)
  - usage line (single-line shell)
  - one example (with expected output when possible)
  - link to the canonical full documentation
- **Full docs URL**: `docs.base_url` MUST point at the canonical, public docs home for the CLI.

## Directory layout

```
clis/<slug>/
├── cli.yaml
└── docs/
    ├── <command-1>.md
    └── <command-2>.md
```

Each `docs/*.md` file MUST be committed to the repo — the generator never fetches at build time.

## Documentation ingestion sources — allowed values for `docs.source`

| Value           | Meaning                                                                       |
|-----------------|-------------------------------------------------------------------------------|
| `scrape`        | Markdown produced by scraping the rendered docs site at authoring time.       |
| `markdown-repo` | Markdown lifted from the CLI's docs source repo (AsciiDoc converted upstream).|
| `help-output`   | Markdown produced from `<cli> <command> --help` output.                       |
| `native`        | Markdown authored directly in this repo, not sourced from elsewhere.          |
