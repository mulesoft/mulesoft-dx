# Visual model — how Mule maps to the diagram

How `generate_flow_viz.py` turns Mule XML into the rendered flow. The rendering
mirrors the dx-ui-storyboard mule-flow-visualizer: a vertical stack of component
cards joined by arrow connectors, with branch scopes drawn as labeled columns.
Read this when the user asks what a shape means or wants the mapping changed.

## What becomes a selectable flow

Each top-level `<flow>`, `<sub-flow>`, and global `<error-handler>` (one with
child handlers, not a bare `ref=`) under `<mule>` becomes one entry in the file
explorer. A file with only global config (`config.xml` with `<global-property>`,
connector configs, …) contributes nothing and is omitted.

## The step/branch tree (built in Python)

Each flow is parsed into an ordered list of **steps**. A step is one of:

- **action / trigger** — a single processor (`http:listener` → trigger;
  `ee:transform`, `set-variable`, `http:request`, `flow-ref`, `logger`,
  `apikit:router`, … → action). Rendered as a card: colored icon square +
  title (`doc:name`) + a short description + the component kind in the corner.
  Clicking it opens the side panel with its parsed `details` (method/path,
  variable/value, config-ref, …) and the full `doc:description` as Notes.
- **branch** — a scope that contains other steps. Rendered as a header card
  plus one or more **branch columns**, each with a colored pill label and an
  indented, left-bordered stack of its own steps. Branches nest recursively.

### Which elements become branches

| Scope | Branch columns produced |
| --- | --- |
| `choice` | one column per `when` (blue pill, shows `expression`) and `otherwise` (orange pill) |
| `scatter-gather`, `round-robin`, `first-successful` | one column per `route` |
| `foreach`, `parallel-foreach`, `async`, `until-successful` | a single column labeled with the scope name |
| `try` | a `Try` column plus one column per `on-error-continue` / `on-error-propagate` |
| `error-handler` (as a flow) | one column per `on-error-*` child |

A scope element with no step children collapses to a plain action card.

## Colors

Component icon squares (`COLORS` in the generator):

| Category | Elements | Color |
| --- | --- | --- |
| trigger | `*:listener`, `scheduler` | green |
| connector | `*:request` | blue |
| transform | `ee:transform`, `set-payload` | orange |
| variable | `set-variable`, `remove-variable` | amber |
| logger | `logger` | brown |
| ref | `flow-ref` | slate |
| router | `apikit:router` | purple |
| choice | `choice` header | purple |
| scope | `foreach`/`async`/`try`/scatter headers | teal |
| error | error handlers | red |

Branch pill colors (`BRANCH_COLORS`): `when` blue, `otherwise` orange, `route`
teal, generic scope purple, error red.

## Namespaces

Tags are shown as `prefix:local` (e.g. `http:listener`, `ee:transform`); the
core namespace shows no prefix. Known prefixes are in `NS_PREFIX`; unknown Mule
namespaces derive a prefix from the last URI segment.

## Tuning

- Card width, colors, icons, and layout live in `assets/template.html` (CSS +
  the inline `ICON_PATHS` / React components).
- Category/color/branch mapping and the `details` shown per component live in
  `scripts/generate_flow_viz.py` (`category_of`, `COLORS`, `BRANCH_COLORS`,
  `details_of`).
