# Portal Production-Readiness Report

**Date:** 2026-05-06
**Audited by:** 5 specialist agents (Security, Performance, Accessibility, HTML/SEO, Unit Test Coverage)

---

## Executive Summary

The portal has a solid foundation — semantic HTML, accessible landmarks, safe YAML parsing, Jinja2 autoescaping, and a smart static-generation architecture. But there are **3 critical security vulnerabilities**, significant performance gaps (unminified 520KB of JS+CSS), and accessibility violations that need fixing before production.

---

## 1. SECURITY (3 Critical, 7 Medium, 5 Low)

### Critical — Must Fix Before Production

| # | Issue | File | Fix Effort |
|---|-------|------|-----------|
| S1 | **Hardcoded credentials** in `scripts/build/secrets.txt` (not gitignored!) | `secrets.txt` | 15 min + rotate |
| S2 | **`tojson_raw` enables XSS** — `</script>` in API spec descriptions breaks out of script blocks | `template_env.py:67-69` | 30 min |
| S3 | **`_nl2br_html` bypasses autoescaping** — wraps raw input in `Markup()` | `template_env.py:21-27` | 15 min |

#### S1: Hardcoded Production Credentials

**File:** `scripts/build/secrets.txt`

The file contains live production credentials for Anypoint Platform and Akamai CDN. It is listed as untracked in git status but is **not gitignored**. Any `git add .` would commit it.

**Remediation:**
- Immediately rotate both passwords
- Add `scripts/build/secrets.txt` to `.gitignore`
- Use environment variables or a secrets manager instead of a file
- Add a pre-commit hook to detect secrets (e.g., `gitleaks`, `trufflehog`)

#### S2: `_tojson_raw` Filter Enables XSS in Script Blocks

**File:** `scripts/portal_generator/template_env.py` lines 67-69

```python
def _tojson_raw(value, indent=2):
    """Serialize to JSON with indentation for embedding in <script> tags."""
    return Markup(json.dumps(value, indent=indent))
```

**Usage in templates:**
```html
window.__API_META__ = {{ api_meta|tojson_raw }};
window.__OP_LOOKUP__ = {{ op_lookup|tojson_raw }};
```

**Exploit:** `json.dumps()` does not escape HTML-significant characters like `</script>` within string values. If an API spec contains a description with `</script><script>alert(1)</script>`, the JSON serialization will break out of the `<script>` block.

**Remediation:** Escape sequences that could break out of script blocks:
```python
def _tojson_raw(value, indent=2):
    raw = json.dumps(value, indent=indent)
    raw = raw.replace('</', '<\\/')
    raw = raw.replace('<!--', '<\\!--')
    return Markup(raw)
```

#### S3: `_nl2br_html` Filter Bypasses Autoescaping

**File:** `scripts/portal_generator/template_env.py` lines 21-27

```python
def _nl2br_html(value):
    """Convert newlines to <br> tags while preserving existing HTML tags."""
    if not value:
        return Markup('')
    # Don't escape - preserve existing HTML like <br>, <code>, etc.
    return Markup(str(value).replace('\n', '<br>'))
```

**Exploit:** Wraps arbitrary input in `Markup()` without escaping. If any API spec description or user-controlled string is passed through this filter, raw HTML (including `<script>` tags) will be rendered.

**Remediation:** Remove this filter entirely or add proper escaping:
```python
def _nl2br_html(value):
    if not value:
        return Markup('')
    escaped = Markup.escape(value)
    return Markup(str(escaped).replace('\n', '<br>'))
```

---

### Medium Risk

| # | Issue | File | Fix Effort |
|---|-------|------|-----------|
| S4 | `_render_markdown` allows `javascript:` URIs in links | `template_env.py:51` | 30 min |
| S5 | Skill markdown rendered as raw HTML (markdown-it doesn't strip `<script>`) | `skill_parser.py:241-258` | 30 min |
| S6 | `highlightText` / `highlightCurlCommands` use innerHTML without escaping | `portal.js:1901, 7885` | 1 hr |
| S7 | Path traversal in external `$ref` resolution (no directory containment check) | `oas_parser.py:33-70` | 30 min |
| S8 | SSL verification bypass when `certifi` not installed | `mulesoft_chrome.py:95-96` | 15 min |
| S9 | SSRF via Try-It-Out proxy (no URL allowlist) | `portal.js:525-534` | Proxy-side |
| S10 | `removeTag` onclick susceptible to single-quote attribute injection | `portal.js:1368` | 15 min |

#### S4: `_render_markdown` Allows `javascript:` URIs

**File:** `scripts/portal_generator/template_env.py` line 51

```python
html = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', html)
```

An API spec description containing `[Click me](javascript:alert(document.cookie))` will produce a clickable XSS link. The `javascript:` protocol only requires alphanumeric characters and `:` which survive HTML escaping.

**Remediation:**
```python
def _safe_link(m):
    text, url = m.group(1), m.group(2)
    if url.lower().startswith(('http://', 'https://', '/', '#')):
        return f'<a href="{url}">{text}</a>'
    return f'{text} ({url})'

html = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', _safe_link, html)
```

#### S5: Skill Markdown Rendered as Raw HTML

**File:** `scripts/portal_generator/parsers/skill_parser.py` lines 241-258
**Templates:** `templates/skills/skill_detail.html` (lines 15, 26, 114, 121, 128, 135, 142)

```python
'overview_html': _md.render(overview) if overview else '',
```

Rendered in templates with `{{ skill.overview_html|safe }}`.

`markdown_it` renders raw HTML by default. If a `SKILL.md` file contains `<img src=x onerror="alert(1)">`, it will be rendered verbatim.

**Remediation:** Disable raw HTML in markdown-it:
```python
_md = MarkdownIt().enable('table').disable('html_inline').disable('html_block')
```

#### S6: `highlightText` and `highlightCurlCommands` Use innerHTML Without Escaping

**File:** `scripts/portal_generator/assets/portal.js` lines 1901-1914, 7885-7905

```javascript
function highlightText(text, query) {
    return before + '<span class="search-highlight">' + match + '</span>' + highlightText(after, query);
}
```

The `text` parameter comes from `textContent` (safe source), but is inserted via `innerHTML` without escaping. If page content contains HTML-like strings from API specs, they could execute.

**Remediation:** Escape text before wrapping:
```javascript
function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    var index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return escapeHtml(text);
    var before = escapeHtml(text.substring(0, index));
    var match = escapeHtml(text.substring(index, index + query.length));
    var after = text.substring(index + query.length);
    return before + '<span class="search-highlight">' + match + '</span>' + highlightText(after, query);
}
```

#### S7: Path Traversal in External `$ref` Resolution

**File:** `scripts/portal_generator/parsers/oas_parser.py` lines 33-70

```python
def resolve_external_ref(ref: str, base_dir: Path) -> Optional[Dict]:
    file_path = base_dir / file_part
```

A malicious `$ref` like `../../.env` could read arbitrary files on the build machine.

**Remediation:**
```python
file_path = (base_dir / file_part).resolve()
if not str(file_path).startswith(str(base_dir.resolve())):
    return None  # Path traversal attempt
```

#### S8: SSL Certificate Verification Bypass

**File:** `scripts/portal_generator/mulesoft_chrome.py` lines 95-96

```python
except ImportError:
    ctx = ssl._create_unverified_context()
```

If `certifi` is not installed, HTTPS requests are made without certificate verification, enabling MITM attacks.

**Remediation:** Make `certifi` a required dependency or fail hard:
```python
except ImportError:
    ctx = ssl.create_default_context()  # Uses system CAs
```

#### S9: SSRF via Proxy

**File:** `scripts/portal_generator/assets/portal.js` lines 525-534

The "Try It Out" feature sends arbitrary URLs to a proxy server. An authenticated user can instruct the proxy to make requests to internal services or cloud metadata endpoints.

**Remediation:** The proxy server should implement URL allowlisting (only `*.mulesoft.com`, `*.anypoint.mulesoft.com`) and block private/reserved IP ranges.

#### S10: `removeTag` onclick Single-Quote Injection

**File:** `scripts/portal_generator/assets/portal.js` line 1368

```javascript
html += '<button class="tag-chip-remove" onclick="removeTag(\'' + escapeHtml(tag) + '\')" ...>';
```

`escapeHtml` does not encode single quotes. A tag containing `')` could break out of the handler.

**Remediation:** Use double-quoted attribute with proper escaping, or use `addEventListener`.

---

### Hardening (Low Risk)

| # | Issue | Recommendation |
|---|-------|---------------|
| S11 | No Content Security Policy | Add `<meta http-equiv="Content-Security-Policy">` |
| S12 | No Subresource Integrity on CDN scripts (Ace, Prism) | Add `integrity` attributes |
| S13 | Session token in `sessionStorage` accessible to XSS | Inherent; mitigate via CSP |
| S14 | Unpinned Python dependencies in `requirements.txt` | Pin exact versions, add `pip-audit` to CI |
| S15 | Vendored `jsonpath-plus.min.js` with no version info | Document version and source |

---

## 2. PERFORMANCE (4 Critical, 4 Optimization)

### Critical

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| P1 | **5 render-blocking Ace Editor scripts** in `<head>` (no defer/async) | +300-500ms FCP | Add `defer` or move to `</body>` |
| P2 | **`portal.js` is 324KB unminified** with 19 DEBUG console.logs | ~200KB savings with minification+gzip | Add terser to build |
| P3 | **`styles.css` is 196KB unminified** | ~130KB savings with minification+gzip | Add cssnano to build |
| P4 | **No cache-busting** — fixed filenames | Stale cache after deploys | Add content hash to filenames |

#### P1: Render-Blocking Ace Editor Scripts

**File:** `scripts/portal_generator/templates/base.html` lines 46-51

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/ace.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-json.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-yaml.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-xml.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/theme-textmate.min.js"></script>
```

These block parsing and rendering. Ace Editor is only needed when users interact with "Try It Out" panels.

**Fix:** Add `defer` attribute to all five scripts, or load them dynamically when the try-it panel is first opened.

#### P2: Unminified JavaScript with Debug Logs

**File:** `scripts/portal_generator/assets/portal.js` — 324KB, 8,434 lines

Contains:
- 19 `[DEBUG]` console.log statements
- 125 total console.log/warn/error calls
- 174 global function declarations

**Fix:**
1. Remove all `[DEBUG]` console.log statements
2. Add minification step (terser) to the build pipeline
3. Estimated savings: ~60-70% size reduction, ~30-40KB with gzip

#### P3: Unminified CSS

**File:** `scripts/portal_generator/assets/styles.css` — 196KB, 8,643 lines

Contains dark mode variants, MCP-specific styles, and all page-type styles bundled together.

**Fix:** Add cssnano/clean-css to the build pipeline. Estimated transfer with gzip: ~25-30KB.

#### P4: No Cache-Busting

Assets are referenced as `assets/styles.css` and `assets/portal.js` — fixed filenames. After any deployment, users serve stale cached assets until browser cache expires.

**Fix:** Add content hash to asset filenames: `styles.a1b2c3.css`, `portal.d4e5f6.js`

---

### Optimization Opportunities

| # | Issue | Impact |
|---|-------|--------|
| P5 | No `<link rel="preconnect">` for third-party origins | +100-200ms on cold load |
| P6 | OneTrust script in `<head>` tries to append to `<body>` before it exists | Silent failure |
| P7 | Prism.js CSS is render-blocking on detail pages | +50ms FCP |
| P8 | No pre-generated `.gz`/`.br` compressed files | Hosting-dependent compression |

---

### What's Done Well

- `font-display: swap` on all `@font-face` declarations (no invisible text)
- `portal.js` loaded with `defer` attribute
- IntersectionObserver for scroll tracking (not scroll events)
- Dark mode applied before first render via inline script (no flash)
- Chrome scripts loaded with `async` attribute
- Native `<details>` elements for collapsible sections (hardware-accelerated)
- Static generation model = zero server latency at request time

---

## 3. ACCESSIBILITY (7 Level A, 9 Level AA)

### Level A Violations (Must Fix)

| # | Issue | WCAG SC | File |
|---|-------|---------|------|
| A1 | **No focus trap in modals** — Tab escapes to background content | 2.1.2, 2.4.3 | `portal.js:226-229` |
| A2 | **Toggle switch not keyboard-operable** — `<div role="switch">` has no tabindex/keydown | 2.1.1 | `auth_panel.html:17` |
| A3 | **`aria-selected="false"` on active tab** on initial page load | 4.1.2 | `sidebar.html:57` |
| A4 | **Auth tabs missing ARIA roles** — no tablist/tab/tabpanel | 4.1.2 | `auth_panel.html:99-106` |
| A5 | **Install modal has no `aria-labelledby`** — unlabelled dialog | 4.1.2 | `skill_detail.html:160` |
| A6 | **Response tabs missing ARIA tab pattern** | 4.1.2 | `try_it_out.html:138-139` |
| A7 | **Execution panel tabs missing role attributes** | 4.1.2 | `skill_detail.html:47-48` |

#### A1: No Focus Trap in Modals

**File:** `scripts/portal_generator/assets/portal.js` lines 226-229, 2182-2185

Modals move initial focus to the first focusable element but don't implement a focus trap. Users pressing Tab can leave the modal and interact with background content while the overlay obscures it.

**Who it affects:** Keyboard-only users, screen reader users.

**Fix:** Add a keydown listener on the modal that intercepts Tab/Shift+Tab and cycles focus within the modal's focusable elements:
```javascript
function trapFocus(modal) {
    const focusable = modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    modal.addEventListener('keydown', function(e) {
        if (e.key !== 'Tab') return;
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}
```

#### A2: Toggle Switch Not Keyboard Operable

**File:** `templates/partials/auth_panel.html` line 17

```html
<div class="toggle-switch" onclick="toggleSkillMode('{{ skill_slug }}')" role="switch" aria-checked="false" ...>
```

This `<div>` with `role="switch"` has no `tabindex="0"` and no keydown handler.

**Fix:** Add `tabindex="0"` and a keydown handler, or use a native `<button>`:
```html
<button class="toggle-switch" onclick="toggleSkillMode('{{ skill_slug }}')" role="switch" aria-checked="false" ...>
```

#### A3: Incorrect Initial `aria-selected`

**Files:** `templates/partials/sidebar.html` line 57, `templates/partials/skill_sidebar.html` line 23

The active tab has `class="sidebar-tab active"` but `aria-selected="false"`. JavaScript corrects this dynamically, but the initial HTML state is wrong.

**Fix:** Change to `aria-selected="true"` for the initially active tab.

#### A4: Auth Tabs Missing ARIA Roles

**File:** `templates/partials/auth_panel.html` lines 99-106

The Bearer Token / OAuth2 tab switcher has no `role="tablist"`, `role="tab"`, `aria-selected`, or `role="tabpanel"`.

**Fix:** Add proper ARIA tab pattern:
```html
<div class="auth-tabs" role="tablist">
    <button class="auth-tab active" role="tab" aria-selected="true" aria-controls="panel-bearer">Bearer Token</button>
    <button class="auth-tab" role="tab" aria-selected="false" aria-controls="panel-oauth">OAuth2</button>
</div>
<div id="panel-bearer" role="tabpanel" aria-labelledby="...">...</div>
```

#### A5: Install Modal Missing `aria-labelledby`

**File:** `templates/skills/skill_detail.html` line 160

```html
<div class="install-modal" id="install-modal-{{ slug }}" style="display:none" role="dialog" aria-modal="true">
```

**Fix:** Add `aria-labelledby` pointing to the modal's heading element.

#### A6 & A7: Response/Execution Tabs Missing ARIA

**Files:** `templates/operations/try_it_out.html` lines 138-139, `templates/skills/skill_detail.html` lines 47-48

Tab buttons use onclick but have no `role="tab"`, `role="tablist"`, or `aria-selected`.

**Fix:** Apply the same ARIA tablist pattern as A4.

---

### Level AA Issues (Should Fix)

| # | Issue | WCAG SC | Details |
|---|-------|---------|---------|
| A8 | Dark mode hero title contrast 4.0:1 (needs 4.5:1) | 1.4.3 | `styles.css:338` — `--hero-title: #7d8590` on `#0d1117` |
| A9 | `.stat-compact-label` contrast 4.4:1 (needs 4.5:1) | 1.4.3 | `styles.css:1049` — `#525252` on `#DDEEFF` |
| A10 | `.tag-chip-remove` button is 16x16px (needs 24x24px) | 2.5.8 | `styles.css:1172` |
| A11 | `.btn-clear-sidebar-search` very small target (2px/4px padding) | 2.5.8 | `styles.css:2555` |
| A12 | `.tag-search-input-container` fixed 850px width breaks reflow | 1.4.10 | `styles.css:1110` |
| A13 | Focus state on catalog cards lacks visual parity with hover | 2.4.7 | `styles.css:1694-1698` |
| A14 | Form inputs use placeholder as label (no visible `<label>`) | 3.3.2 | `auth_panel.html:110-111` |
| A15 | Escape key only closes x-origin modal (not auth modal) | Best practice | `portal.js:1622-1629` |
| A16 | Tag search input lacks ARIA combobox pattern | Best practice | `homepage.html:44-53` |

---

### What's Done Well

- Skip-to-content link properly implemented
- `<html lang="en">` present
- Global `:focus-visible` outline with adequate contrast
- Decorative images use `alt=""` and `aria-hidden="true"` consistently
- Modal focus save/restore pattern implemented
- `<main>`, `<nav>`, `<aside>` landmarks used correctly
- `aria-live="polite"` on response containers
- Native `<details>`/`<summary>` for collapsible sections
- `aria-label` on form inputs where visible labels are absent
- `role="dialog"` and `aria-modal="true"` on modals

---

## 4. HTML / SEO (4 Critical, 6 Improvements)

### Critical SEO Gaps

| # | Issue | Impact |
|---|-------|--------|
| E1 | **No `<meta name="description">`** on any page | Biggest single SERP ranking factor |
| E2 | **No canonical URLs** | Duplicate content dilution from query params |
| E3 | **No sitemap.xml generation** | Slow crawl discovery for new pages |
| E4 | **Heading hierarchy issue** — `<h2>` results count not a section heading | Confuses heading outline tools |

#### E1: Missing Meta Descriptions

**File:** `templates/base.html`

No page has a `<meta name="description">`. Search engines auto-generate snippets from page content, which is poor quality for API docs.

**Fix:** Add a block in `base.html` and populate per-page:
```html
<meta name="description" content="{% block meta_description %}Discover and interact with MuleSoft Anypoint Platform APIs{% endblock %}">
```
- Detail pages: `{{ api.description|truncate(155) }}`
- Skill pages: `{{ skill.description|truncate(155) }}`
- MCP pages: `{{ mcp.description|truncate(155) }}`

#### E2: No Canonical URLs

Without `<link rel="canonical">`, search engines may index duplicate URLs with query parameters.

**Fix:** Add `<link rel="canonical" href="{% block canonical %}{{ base_url }}{% endblock %}">` to `<head>`.

#### E3: No Sitemap

No `_generate_sitemap` method exists in the generator.

**Fix:** Add a method that emits a standard XML sitemap listing all HTML pages with `<lastmod>` dates.

#### E4: Heading Hierarchy

Card titles use `<h3>` under a `<h2 class="results-count">` ("All (N Results)"). The `<h2>` is a status indicator, not a section heading.

**Fix:** Make the results count a `<p>` or `<span>`, or promote "API Catalog" to an `<h2>`.

---

### Improvements

| # | Issue | Fix |
|---|-------|-----|
| E5 | No Open Graph tags | Add `og:title`, `og:description`, `og:image`, `og:url` |
| E6 | No Twitter Card meta | Add `twitter:card`, `twitter:title`, `twitter:description` |
| E7 | No JSON-LD structured data | Add `schema.org/WebAPI` for APIs, `TechArticle` for skills |
| E8 | No BreadcrumbList structured data | Add JSON-LD for existing breadcrumbs |
| E9 | No favicon | Add `<link rel="icon">` |
| E10 | `<div>` directly inside `<ul>` (invalid HTML) | `sidebar.html:71,87` — wrap in `<li>` or restructure |

#### E5: Open Graph Tags

**Fix:** Add to `base.html`:
```html
<meta property="og:title" content="{% block og_title %}Anypoint Platform APIs{% endblock %}">
<meta property="og:description" content="{% block og_description %}Discover and interact with MuleSoft Anypoint Platform APIs{% endblock %}">
<meta property="og:type" content="website">
<meta property="og:url" content="{% block og_url %}{{ base_url }}{% endblock %}">
<meta property="og:image" content="{% block og_image %}{{ base_url }}/assets/og-preview.png{% endblock %}">
<meta property="og:site_name" content="MuleSoft Developer Portal">
```

#### E6: Twitter Card Meta

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{% block twitter_title %}Anypoint Platform APIs{% endblock %}">
<meta name="twitter:description" content="{% block twitter_desc %}{% endblock %}">
```

#### E7: JSON-LD Structured Data

Example for API detail pages:
```html
<script type="application/ld+json">
{
    "@context": "https://schema.org",
    "@type": "WebAPI",
    "name": "{{ api.name }}",
    "description": "{{ api.description }}",
    "url": "{{ base_url }}/apis/{{ api.slug }}.html",
    "provider": { "@type": "Organization", "name": "MuleSoft" },
    "documentation": "{{ base_url }}/apis/{{ api.slug }}/api.yaml"
}
</script>
```

---

### What's Done Well

- `<!DOCTYPE html>`, `<html lang="en">`, charset, viewport all correct
- `<meta name="robots" content="index, follow">` present
- Machine-readable `registry.json`, `AGENTS.md`, `llms.txt`
- `<link rel="alternate">` and `<link rel="help">` for programmatic discovery
- Semantic elements throughout (article, section, nav, aside)
- `font-display: swap` for web fonts

---

## 5. UNIT TEST COVERAGE

### Current State

| Suite | Files | Cases | Coverage |
|-------|-------|-------|----------|
| Python unit tests | `test_units.py` | ~50 | utils, tree_builder, filters, generator helpers, skill_parser, discovery |
| Python OAS parser | `test_oas_parser.py` | ~25 | $ref resolution, allOf merging, schema extraction, operations |
| Python MCP parser | `test_mcp_parser.py` | ~20 | parse_mcp, display fields, tools, prompts, resources |
| Python smoke tests | `test_smoke.py` | ~15 | End-to-end generation, HTML structure, file existence |
| Python validators | `test_validate_descriptions.py` | ~10 | imperative voice, boilerplate, length |
| JavaScript | `portal.test.js` | ~162 assertions (27 describe blocks) | Server selection, UI helpers, skills, MCP, auth, URL state |

### Critical Gaps — Functions With No Tests

#### Python (High Risk)

| Function | File:Lines | Risk | Why |
|----------|-----------|------|-----|
| `_titleize_operation` | `template_env.py:72-104` | **HIGH** | Complex camelCase splitting with acronym handling. Every sidebar label depends on it. |
| `_slugify` | `template_env.py:107-126` | **HIGH** | URL/anchor ID generation. If buggy, navigation breaks silently. |
| `_resolve_skill_inputs` | `template_env.py:129-197` | **HIGH** | 70 lines of branching logic for skill form rendering. Zero tests. |
| `_example_from_schema` | `mcp_parser.py:84-151` | **HIGH** | 67 lines of recursive logic for MCP try-it-out prefill. |
| `_inject_after_frontmatter` | `generator.py:484-489` | **HIGH** | Modifies SKILL.md content shipped to users. |
| `discover_apis` | `discovery.py:104-204` | MEDIUM | Main orchestrator, only tested indirectly via smoke. |
| `_extract_mcp_refs` | `discovery.py:52` | MEDIUM | Parallels `_extract_api_refs` (which IS tested). |
| `_build_mcp_meta` | `generator.py:321-357` | MEDIUM | JSON injected into MCP page `<script>` tags. |
| `_schema_type` | `mcp_parser.py:208-238` | MEDIUM | Union handling complex, only one specific test. |

#### JavaScript (High Risk)

| Function | File:Line | Risk | Why |
|----------|----------|------|-----|
| `openXOriginModal` | `portal.js:68` | **HIGH** | Parses Base64-encoded JSON, builds complex HTML |
| `resolveWorkflowInputs` | `portal.js:7121` | **HIGH** | Variable substitution engine for skill workflows |
| `captureVariablesFromResponse` | `portal.js:5710` | **HIGH** | Extracts outputs from API responses using JSONPath |
| `substituteVariables` | `portal.js:5990` | **HIGH** | Template variable resolution (`${var}` -> value) |
| `__mcpBuildPayload` | `portal.js:2562` | **HIGH** | Builds JSON-RPC request payloads for MCP try-it |
| `__mcpCollectArgs` | `portal.js:2522` | **HIGH** | Collects form values and coerces types for MCP calls |
| `searchOperations` | `portal.js:1536` | MEDIUM | Sidebar search/filter logic |
| `filterByTags` | `portal.js:1387` | MEDIUM | Homepage tag filtering |

### Edge Cases Missing

**Python:**
1. `_render_markdown` — no test for nested markdown, numbered lists, escaped characters
2. `parse_oas` — no test for `oneOf`/`anyOf` schemas, deeply nested `$ref` chains
3. `_get_example_body` — no test for `number`/`null` types, `$ref` in properties
4. `discover_apis` — no test for malformed `exchange.json`, missing `api.yaml`, empty paths
5. `calculate_stats` with `mcp_servers` parameter — only `apis` tested

**JavaScript:**
6. `openXOriginModal` — no test for Base64-encoded format or malformed data
7. `resolveWorkflowInputs` — no test for circular references, missing variables
8. Auth flow — no test for `authenticateWithBearer`, `authenticateWithClientCredentials`

### Quick Wins (Minimal Effort, High Confidence)

| Test | Effort | Impact |
|------|--------|--------|
| `_titleize_operation('getAPIInstance')` -> `'Get API Instance'` | 5 min | Every sidebar label |
| `_slugify('Get Current Organization')` -> `'get-current-organization'` | 5 min | All anchor IDs |
| `_inject_after_frontmatter('---\nname: x\n---\nbody', 'preamble')` | 5 min | SKILL.md integrity |
| `_resolve_skill_inputs({'x': {'from': {'variable': 'y'}}}, [])` | 10 min | Skill form rendering |
| `_extract_mcp_refs(...)` | 5 min | Mirrors existing `_extract_api_refs` tests |
| `_example_from_schema({'type': 'string', 'format': 'email'})` | 10 min | Try-it-out prefill |
| `_truncate_text('hello world', 5)` -> `'hello...'` | 3 min | Trivial contract verification |

---

## Recommended Action Plan

### Phase 1 — Security (Before Any Public Exposure)

1. Rotate credentials + gitignore `secrets.txt`
2. Fix `tojson_raw` `</script>` breakout
3. Remove/fix `_nl2br_html`
4. Sanitize `javascript:` URIs in markdown
5. Disable raw HTML in markdown-it for skills

### Phase 2 — Performance (Before Launch)

6. Add `defer` to Ace Editor scripts (or move to `</body>`)
7. Minify CSS + JS (terser, cssnano)
8. Add cache-busting hashes to asset URLs
9. Add `<link rel="preconnect">` for CDN origins

### Phase 3 — Accessibility (WCAG Compliance)

10. Implement focus trap in modals
11. Make toggle switch keyboard-operable
12. Fix `aria-selected` initial state
13. Add ARIA tab pattern to auth/response tabs
14. Fix contrast ratios and touch targets

### Phase 4 — SEO & Quality

15. Add meta descriptions + canonical URLs
16. Add Open Graph / Twitter Card meta
17. Generate sitemap.xml
18. Fix invalid HTML nesting (`<div>` in `<ul>`)

### Phase 5 — Test Coverage

19. Add unit tests for `_titleize_operation`, `_slugify`, `_resolve_skill_inputs`
20. Add tests for `_example_from_schema`
21. Add JS tests for MCP payload builder and workflow engine
