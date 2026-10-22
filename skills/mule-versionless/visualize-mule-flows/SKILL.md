---
name: visualize-mule-flows
description: >
  Generate a self-contained HTML visualization of a Mule application's flows
  using React + CSS — a left-hand file explorer of src/main/mule plus a canvas
  of stacked component cards (with nested branch columns for choice/foreach/try)
  for each flow, sub-flow, and error handler. TRIGGER
  when: the user asks to "visualize my Mule flows", "draw/diagram the Mule app",
  "show a flow graph", "generate a flow map", "see the flows in a browser", or
  "render src/main/mule as a diagram"; the project has a src/main/mule directory
  of Mule XML. Trigger phrases include "visualize mule flows", "flow diagram",
  "flow graph", "visualize the integration". DO NOT TRIGGER when: the user wants
  to create or edit flows (skill build-mule-integration), document flows with
  doc:description (skill generate-doc-description), or build/run a versionless
  app (skill build-run-versionless-app).
license: Apache-2.0
compatibility: Requires Python 3.8+ and a modern browser. The generated HTML is fully self-contained (React, ReactDOM, and htm are inlined) — no internet, server, or build step needed, so it also renders inside sandboxed iframes such as Claude Desktop artifacts.
allowed-tools: Bash Read AskUserQuestion
metadata:
  author: mulesoft-dx
  version: "1.0.0"
---

# Visualize Mule Flows

Turn a Mule app's `src/main/mule/*.xml` into one self-contained HTML page: a
file explorer on the left and a flow canvas on the right that renders each flow
as stacked component cards with arrow connectors and nested branch columns —
the same rendering style as the dx-ui-storyboard mule-flow-visualizer. Click any
component to inspect its configuration in a side panel.

## When to Use This Skill

**Use this skill when the user asks to:**

- "Visualize the flows in my Mule app"
- "Draw a diagram of this integration / show me the flow graph"
- "Render src/main/mule as something I can click through in a browser"
- "I want to see how `api-main` routes and what the assessment flow does"

**Trigger keywords:** visualize · diagram · draw · render · flow graph · flow map
· flow canvas · src/main/mule.

**Do NOT use this skill when:** the user wants to *create or modify* flows (use
**skill build-mule-integration**), add `doc:description` annotations (use
**skill generate-doc-description**), or build/run a versionless app (use
**skill build-run-versionless-app**). This skill is read-only: it never edits
the user's Mule project.

## Prerequisites

```bash
python3 --version          # needs 3.8+
ls src/main/mule/*.xml      # the app must have Mule flow XML to visualize
```

Only the Python standard library is used — no `pip install` step. React,
ReactDOM, and the `htm` template helper are vendored under `assets/vendor/` and
inlined into every generated page, so the output is fully self-contained: it
needs no internet, no server, and no build step, and renders from `file://` or
inside a sandboxed iframe (e.g. a Claude Desktop artifact).

## Bundled scripts

This skill ships scripts under `scripts/`. Invoke them by the **absolute path**
given in the "skill is now active" message — do not construct relative
`../scripts/...` paths (the working directory shifts between turns).

| Script | Purpose | Output |
| --- | --- | --- |
| `scripts/generate_flow_viz.py <app-dir> [-o out.html]` | Parse every `src/main/mule/*.xml` into a step/branch tree (one entry per flow, sub-flow, and error handler) and inject it as JSON into the HTML template | writes the HTML file; prints the flows found and the output path |

The script reads its HTML template from `assets/template.html` (resolved
relative to the script), so run it in place — do not copy the script out of the
skill directory on its own.

## Reference files

- **`references/visual-model.md`** — how Mule constructs map to the diagram
  (scope boxes, branch layout, node colors, cross-flow navigation). Read it when
  the user asks what a shape means or wants the mapping tweaked.

## Workflow

### Rules that always apply

1. **Read-only.** Never edit the user's Mule XML. This skill only *reads*
   `src/main/mule` and *writes* a standalone HTML file to an output path.
2. **Point at the project root when you can.** Passing the app root lets the
   script find `src/main/mule` itself and name the page after the app; passing a
   loose directory of XML also works but loses the app name.
3. **Report only what the script reported.** The run prints the exact flows
   parsed per file — relay those, do not invent flow names.

### Step 1: Locate the Mule project

Confirm the target. Ask the user for the app path if it is ambiguous, otherwise
use the current project root. Verify it has flows:

```bash
ls <app-dir>/src/main/mule/*.xml
```

If there is no `src/main/mule`, the directory may itself be a folder of flow
XML — the script accepts either.

### Step 2: Generate the visualization

Run the generator with an absolute script path and an output path **outside** the
Mule project (so it is never mistaken for app source):

```bash
python3 -I <skill-dir>/scripts/generate_flow_viz.py <app-dir> -o <app-dir>/mule-flow-visualization.html
```

Read the printed summary — it lists every file and the flows parsed from it. If a
file was skipped for an XML parse error, the script prints a `! skipping` line;
surface that to the user.

### Step 3: Open and report

Tell the user where the file is and how to open it:

```bash
open <app-dir>/mule-flow-visualization.html      # macOS
```

Report tightly: how many flows across how many files, and the output path. If the
user wants a visual confirmation, offer to screenshot it (the page is
self-contained, so a headless browser can load it straight from `file://` — no
server needed) rather than claiming it renders unseen.

### Showing it in Claude Desktop

The output is a single self-contained HTML file with no CDN dependency, so it
renders inside a Claude Desktop (or claude.ai) **artifact**. If the user asks to
see it in Claude Desktop, tell them to start a conversation there, attach the
generated `mule-flow-visualization.html` (or paste its contents), and ask Claude
to "render this as an HTML artifact." Note that the Claude Code session itself
runs in a container that cannot reach the user's local filesystem, so the file
must be moved into the Claude Desktop conversation by the user. Opening it in a
normal browser (`open <path>`) remains the simplest path.

## Best Practices

- **Write the HTML outside `src/`.** ✅ `-o <app-dir>/mule-flow-visualization.html`
  (project root) or a scratch dir. ❌ Never write it into `src/main/mule` — it is
  not a deployable resource.
- **Let the app be named by its root.** ✅ pass `.../apps/AAA/enhanced/classic`;
  the page title becomes `classic`. ❌ passing `.../src/main/mule` directly titles
  the page `mule`.
- **Keep it read-only.** If the user then wants to change a flow, hand off to
  **skill build-mule-integration** — do not edit XML from here.

## Troubleshooting

**Blank canvas / "Select a flow":** no flow is selected yet — click a flow in the
left explorer. If the explorer itself is empty, the file had no `<flow>`,
`<sub-flow>`, or non-referential `<error-handler>` (e.g. a `config.xml` of global
elements only) — that is expected; such files are omitted.

**Nothing renders / blank page:** the page is self-contained (React, ReactDOM,
and htm are inlined from `assets/vendor/`), so this is not a CDN/network problem.
Check that `assets/vendor/*.js` were present at generate time — if that directory
is missing, the generator raises a clear `FileNotFoundError` naming the file.
Re-download the three UMD builds (`react`, `react-dom`, `htm`) into
`assets/vendor/` and regenerate.

**`No Mule flows found`:** the path has neither `src/main/mule` nor `*.xml`
files. Pass the project root or the exact flow directory.

## Related Skills

- **skill build-mule-integration**: create or modify Mule flows and components —
  use it when the user wants to *change* the app, not just see it.
- **skill generate-doc-description**: add `doc:description` annotations; richer
  descriptions make the node tooltips in this visualization more useful.
- **skill build-run-versionless-app**: build and run a versionless Mule app end
  to end.
