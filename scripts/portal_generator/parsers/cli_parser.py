"""Parser for CLI asset metadata (cli.yaml + linked markdown docs)."""

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from ruamel.yaml import YAML

try:
    from markdown_it import MarkdownIt
    # html: True lets embedded HTML (e.g. tables scraped from docs.mulesoft.com)
    # pass through instead of being escaped and rendered as literal text.
    _md = MarkdownIt('commonmark', {'html': True, 'linkify': True}).enable('table')
except ImportError:  # pragma: no cover
    _md = None


_REQUIRED = ('name', 'slug', 'short_description', 'install', 'docs', 'tags')

# Matches a scraped-doc usage line. docs.mulesoft.com uses three variants:
#   > secrets-mgr:secret-group:create [flags]
#   $ api-catalog autocomplete [flags]
#   `> governance:api:evaluate [flags]`      <- wrapped in backticks (api-governance)
# Everything from the marker to end-of-line qualifies, EXCEPT GitHub-style
# admonitions ("> [!WARNING] ...").
_USAGE_RE = re.compile(r'^`?(?:>|\$)\s+(?!\[!)([^\n`]+?)\s*`?\s*$', re.M)
# Skip "> [!WARNING]" and similar admonition blockquotes when looking for the first paragraph.
_ADMONITION_RE = re.compile(r'^>\s*\[!')

# Docs.mulesoft.com renders shell examples as loose lines starting with `$ `
# (no code fence). Headers we recognize:
#   `### Example[s]` / `#### Example[s]` (any level 2-4)
#   `**Example[s]**` — plain bold
#   `**Example commands:**`, `**Example output:**`, `**Example schema**`, `**Example command:**`
# Wrap the body so markdown-it emits a proper <pre><code> block and picks up
# the .cli-command-example styles.
_EXAMPLE_BLOCK_RE = re.compile(
    r'^(?P<header>#{2,4}\s+Example[^\n]*|\*\*Example[^*\n]*\*\*)\s*\n\n(?P<body>[\s\S]*?)(?=\n\s*\n|\Z)',
    re.M,
)

# Free-standing paragraphs whose ONLY content is inline code (backtick-wrapped
# shell commands). docs.mulesoft.com emits these under headers like
# "**Example commands:**" without a fenced code block, and markdown-it renders
# them as tiny <code> spans instead of proper command blocks.
_INLINE_CODE_ONLY_RE = re.compile(r'^`([^`\n]+)`\s*$', re.M)

# Blocks made of ASCII box-drawing characters — command output tables that
# scraper flattened into prose. Wrap them so they render monospace instead of
# reflowing.
_BOX_DRAWING_RE = re.compile(
    r'^(?P<body>(?:.*[╔╗╚╝╠╣╦╩╬═║╟╢╤╧╨╥│┌┐└┘├┤┬┴┼─][^\n]*(?:\n|$))+)',
    re.M,
)

# GitHub-flavored callout syntax: a blockquote starting with [!KIND] followed by
# the message (may span multiple continuation lines prefixed with `>`).
_ADMONITION_BLOCK_RE = re.compile(
    r'^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*(?:\n>.*)*)',
    re.M | re.IGNORECASE,
)

_ADMONITION_LABELS = {
    'note': 'Note',
    'tip': 'Tip',
    'important': 'Important',
    'warning': 'Warning',
    'caution': 'Caution',
}


def _wrap_shell_examples(text: str) -> str:
    """docs.mulesoft.com emits shell examples as loose paragraphs under either
    an `### Example` heading or `**Examples**` bold text:

        ### Example

        $ anypoint-cli agent-network project build

    Some pages (e.g. api-catalog) collapse multiple examples onto a single
    line: `$ cmd1 $ cmd2 $ cmd3`. Split on `$ ` so each command lands on its
    own line, then wrap the block in a fenced code block so the CLI command
    styles apply.
    """
    def _repl(m):
        header = m.group('header')
        body = m.group('body').rstrip()
        if not body.strip():
            return m.group(0)
        # Preserve any body that already looks fenced/indented.
        stripped = body.lstrip()
        if stripped.startswith('```') or stripped.startswith('    '):
            return m.group(0)
        # Normalize whitespace, then split multi-command lines like
        # `$ cmd1 $ cmd2 $ cmd3` into one `$ ...` per line.
        flat = re.sub(r'\s+', ' ', body).strip()
        if flat.startswith('$ '):
            parts = [p.strip() for p in re.split(r'\s+\$\s+', flat[2:]) if p.strip()]
            body = '\n'.join(f'$ {p}' for p in parts)
        heading = header if header.startswith('#') else '### Examples'
        return f"{heading}\n\n```bash\n{body}\n```\n"

    return _EXAMPLE_BLOCK_RE.sub(_repl, text)


def _wrap_inline_code_examples(text: str) -> str:
    """Some docs.mulesoft.com pages (e.g. api-governance) emit example
    commands as free-standing inline-code paragraphs:

        **Example commands:**

        `anypoint-cli-v4 governance:api:evaluate ...`

        `anypoint-cli-v4 governance:api:evaluate --api ...`

    markdown-it renders those as tiny inline <code> spans. Detect paragraphs
    that are ONLY inline code and lift them into a fenced code block so the
    CLI example styles apply.

    Runs BEFORE `_wrap_shell_examples`, which then folds them into the same
    block when they follow an Example header.
    """
    chunks = re.split(r'(\n\s*\n)', text)
    out = []
    for chunk in chunks:
        stripped = chunk.strip()
        if stripped and _INLINE_CODE_ONLY_RE.fullmatch(stripped):
            m = _INLINE_CODE_ONLY_RE.fullmatch(stripped)
            out.append(f"```bash\n{m.group(1)}\n```")
        else:
            out.append(chunk)
    return ''.join(out)


def _wrap_ascii_box_output(text: str) -> str:
    """Wrap ASCII box-drawing tables (╔═╗║╟...) in a fenced code block so they
    render monospace instead of reflowing as prose. Skips anything already
    inside a fenced block.
    """
    lines = text.splitlines(keepends=True)
    out = []
    in_fence = False
    buf = []

    def _flush():
        if not buf:
            return
        joined = ''.join(buf).rstrip('\n')
        out.append(f"```\n{joined}\n```\n")
        buf.clear()

    box_chars = set('╔╗╚╝╠╣╦╩╬═║╟╢╤╧╨╥│┌┐└┘├┤┬┴┼─')
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('```'):
            _flush()
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence:
            out.append(line)
            continue
        if any(ch in box_chars for ch in stripped):
            buf.append(line)
        else:
            _flush()
            out.append(line)
    _flush()
    return ''.join(out)


def _replace_admonitions(text: str) -> str:
    """Rewrite `> [!KIND] body` blockquotes as HTML callouts that markdown-it
    passes through verbatim (parser is configured with `html: True`).
    """
    def _repl(m):
        kind = m.group(1).lower()
        body = m.group(2)
        # Strip the "> " continuation prefix from every subsequent line.
        body_lines = [re.sub(r'^>\s?', '', line) for line in body.splitlines()]
        body_text = '\n'.join(body_lines).strip()
        label = _ADMONITION_LABELS.get(kind, kind.title())
        # Blank lines around the raw HTML keep markdown-it from re-wrapping it.
        return (
            f'\n\n<div class="markdown-callout markdown-callout-{kind}">'
            f'<p class="markdown-callout-title">{label}</p>'
            f'<p class="markdown-callout-body">{body_text}</p>'
            f'</div>\n\n'
        )

    return _ADMONITION_BLOCK_RE.sub(_repl, text)


def _render(text: str) -> str:
    if _md is not None:
        pre = _replace_admonitions(text)
        # docs.mulesoft.com uses ```copy as a "copy-me" hint; Prism has no such
        # language, so normalize to bash for consistent CLI-example styling.
        pre = re.sub(r'^```copy\s*$', '```bash', pre, flags=re.M)
        pre = _wrap_inline_code_examples(pre)
        # shell_examples FIRST so any "Example output" block that mixes prose
        # with an ASCII box table gets wrapped as a single fenced block.
        # box_output then runs but its in_fence guard leaves fenced content
        # alone — it only wraps stray ASCII tables outside example blocks.
        pre = _wrap_shell_examples(pre)
        pre = _wrap_ascii_box_output(pre)
        return _md.render(pre)
    # Defensive fallback — tests never hit this because markdown-it-py is a project dep.
    return f"<pre>{text}</pre>"  # pragma: no cover


def _render_inline(text: str) -> str:
    """Render inline markdown (backticks → <code>, links, emphasis) without
    wrapping in <p> tags. Used for command descriptions shown as subtitles.
    """
    if _md is not None:
        return _md.renderInline(text)
    return text  # pragma: no cover


def _first_paragraph(body: str) -> str:
    """Return the first prose paragraph in `body`, skipping usage/admonition blockquotes."""
    para, _ = _split_first_paragraph(body)
    return para


def _split_first_paragraph(body: str):
    """Return (first-paragraph-text, remaining-body) so the description isn't
    rendered twice — once as the header subtitle, once inside the doc HTML.

    Preserves the remainder verbatim (including admonitions and any content
    before/after the extracted paragraph) so nothing else is lost.
    """
    stripped = body.lstrip('\n')
    chunks = re.split(r'(\n\s*\n)', stripped)  # keep separators so we can rebuild.
    # chunks alternates content/separator/content/separator/...
    idx = 0
    while idx < len(chunks):
        chunk = chunks[idx].strip()
        if chunk:
            first_line = chunk.splitlines()[0]
            if not (_USAGE_RE.match(first_line) or _ADMONITION_RE.match(first_line)):
                para = re.sub(r'\s+', ' ', chunk).strip()
                remainder = ''.join(chunks[:idx]) + ''.join(chunks[idx + 1:])
                return para, remainder.strip()
        idx += 2  # skip content + its trailing separator
    return '', body.strip()


def build_command_tree(commands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build an N-ary tree by splitting command names on `:`.

    `secrets-mgr:secret-group:create` becomes:
        secrets-mgr / secret-group / create
    Each node has:
      - segment: the label at this level (e.g. `secret-group`)
      - path:    the full colon-joined path from the root to this node
      - leaf:    True when the node represents a real command
      - command: the underlying command dict (only when leaf=True)
      - children: list of child nodes (empty when leaf=True)
    Insertion order is preserved so the tree reflects the doc order.
    """
    root: Dict[str, Any] = {'segment': '', 'path': '', 'leaf': False, 'children': []}

    def _find_or_add(parent: Dict[str, Any], segment: str, path: str) -> Dict[str, Any]:
        for child in parent['children']:
            if child['segment'] == segment:
                return child
        node = {'segment': segment, 'path': path, 'leaf': False, 'children': []}
        parent['children'].append(node)
        return node

    for cmd in commands:
        parts = cmd['name'].split(':')
        current = root
        for i, seg in enumerate(parts):
            path = ':'.join(parts[: i + 1])
            current = _find_or_add(current, seg, path)
        # Mark the terminal node as a leaf carrying the command payload.
        current['leaf'] = True
        current['command'] = cmd

    return root['children']


def _strip_snippet_link(text: str, matches: List[str]) -> str:
    """Replace markdown links whose href contains any of `matches` with the
    link's plain text. Keeps the surrounding prose intact so users still see
    "default flags" — just without the broken hash link.
    """
    if not matches or not text:
        return text
    link_re = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')

    def _repl(m):
        href = m.group(2)
        if any(needle in href for needle in matches):
            return m.group(1)
        return m.group(0)

    return link_re.sub(_repl, text)


def _detect_snippet_refs(text: str, snippets: List[Dict[str, Any]]) -> List[str]:
    """Return the ids of snippets whose `matches` appear in `text`, deduped and
    in the order they're declared in cli.yaml (deterministic render order)."""
    if not snippets or not text:
        return []
    refs: List[str] = []
    for s in snippets:
        needles = s.get('matches') or []
        if any(n and n in text for n in needles):
            refs.append(s['id'])
    return refs


def _split_commands_from_doc(text: str, snippets: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """Split a scraped CLI reference markdown into per-command sections.

    The scraped `docs.mulesoft.com` format uses `## <command-name>` as the section
    heading, followed by a usage blockquote `> <command-name> [flags]` and prose.
    """
    commands: List[Dict[str, Any]] = []
    snippet_matches = [m for s in (snippets or []) for m in (s.get('matches') or [])]

    # Split on level-2 headings only. Use a lookahead so we keep the heading in each part.
    parts = re.split(r'(?m)^##\s+', text)
    # parts[0] is the pre-heading intro (title + description); skip it.
    for part in parts[1:]:
        # First line is the command name (heading text), rest is the body.
        lines = part.splitlines()
        if not lines:
            continue
        name = lines[0].strip()
        body = '\n'.join(lines[1:]).strip()
        if not name:
            continue

        # docs.mulesoft.com sometimes uses level-2 headings for prose
        # subsections inside a command's "Example output" or trailing
        # reference material (e.g. `## Functional Validations`,
        # `## General and Authentication Flags`, `## Get Exchange Asset
        # Identifiers`). Real command headings are always lowercase and
        # use `:`, `-`, `_`, or space as separators — never Title Case.
        # Prose sections get folded back into the previous command's doc.
        looks_like_command = bool(re.fullmatch(r'[a-z0-9][a-zA-Z0-9 :_.-]*', name))
        if not looks_like_command:
            if commands:
                commands[-1]['doc_html'] += _render(f'## {name}\n\n{body}')
            continue

        # Detect which snippets this command references BEFORE we strip the
        # links — the detection needs the anchor hrefs to survive.
        snippet_refs = _detect_snippet_refs(body, snippets or [])
        # Now strip broken hash links so the rendered prose reads clean.
        if snippet_matches:
            body = _strip_snippet_link(body, snippet_matches)

        usage_match = _USAGE_RE.search(body)
        # group(1) is the usage body without the marker or wrapping backticks.
        usage = usage_match.group(1).strip() if usage_match else ''

        # Body for the first-paragraph scan is everything after the usage line
        # (so we don't return the usage as the description).
        body_after_usage = body
        if usage_match:
            body_after_usage = body[usage_match.end():].lstrip('\n')

        description, remainder = _split_first_paragraph(body_after_usage)

        commands.append({
            'name': name,
            'usage': usage,
            'description': description,
            'description_html': _render_inline(description),
            'doc_html': _render(remainder),
            'snippet_refs': snippet_refs,
        })

    return commands


def _load_manual_commands(cli_dir: Path, entries: List[Dict[str, Any]], yaml_path: Path) -> List[Dict[str, Any]]:
    """Legacy path: `commands: [{name, doc_path}]` — one file per command."""
    out: List[Dict[str, Any]] = []
    for cmd in entries:
        doc_rel = cmd.get('doc_path')
        if not doc_rel:
            raise ValueError(
                f"cli.yaml at {yaml_path}: command '{cmd.get('name')}' missing doc_path"
            )
        doc_abs = cli_dir / doc_rel
        if not doc_abs.exists():
            raise FileNotFoundError(
                f"cli.yaml at {yaml_path}: doc_path resolves to {doc_abs}, which does not exist"
            )
        raw = doc_abs.read_text(encoding='utf-8')
        description = cmd.get('description', '')
        out.append({
            'name': cmd['name'],
            'description': description,
            'description_html': _render_inline(description),
            'usage': cmd.get('usage', ''),
            'doc_path': doc_rel,
            'doc_html': _render(raw),
        })
    return out


def parse_cli_yaml(cli_dir: Path) -> Dict[str, Any]:
    """Parse a `cli.yaml` file under `cli_dir` and resolve linked doc paths.

    Two authoring modes are supported:
      1. Auto-split: `docs.file` points to a single scraped markdown reference.
         The parser splits it on `## <command>` headings.
      2. Manual:    `commands: [{name, doc_path}]` — one file per command.
    """
    yaml_path = cli_dir / 'cli.yaml'
    if not yaml_path.exists():
        raise FileNotFoundError(f"cli.yaml not found at {yaml_path}")

    yaml = YAML(typ='safe')
    with yaml_path.open('r', encoding='utf-8') as fh:
        data = yaml.load(fh) or {}

    missing = [k for k in _REQUIRED if k not in data]
    if missing:
        raise ValueError(
            f"cli.yaml at {yaml_path} is missing required fields: {', '.join(missing)}"
        )

    docs = dict(data.get('docs') or {})
    manual_entries = data.get('commands')
    doc_file_rel = docs.get('file')

    # Load snippet definitions + bodies. Each entry is
    #   {id, title, matches, file}
    # We render the body up-front so the template can just embed the HTML.
    snippets: List[Dict[str, Any]] = []
    for s in data.get('snippets') or []:
        file_rel = s.get('file')
        if not file_rel:
            continue
        snippet_abs = cli_dir / file_rel
        if not snippet_abs.exists():
            raise FileNotFoundError(
                f"cli.yaml at {yaml_path}: snippet '{s.get('id')}' file {snippet_abs} does not exist"
            )
        body_md = snippet_abs.read_text(encoding='utf-8')
        snippets.append({
            'id': s.get('id') or '',
            'title': s.get('title') or s.get('id') or '',
            'matches': list(s.get('matches') or []),
            'html': _render(body_md),
        })

    commands: List[Dict[str, Any]]
    if doc_file_rel:
        doc_abs = cli_dir / doc_file_rel
        if not doc_abs.exists():
            raise FileNotFoundError(
                f"cli.yaml at {yaml_path}: docs.file resolves to {doc_abs}, which does not exist"
            )
        raw = doc_abs.read_text(encoding='utf-8')
        commands = _split_commands_from_doc(raw, snippets=snippets)
        if not commands:
            raise ValueError(
                f"cli.yaml at {yaml_path}: docs.file '{doc_file_rel}' produced 0 commands "
                f"— expected level-2 headings like `## <command-name>`."
            )
    else:
        # Manual mode — may be empty ([]), which is a valid seed state.
        commands = _load_manual_commands(cli_dir, manual_entries or [], yaml_path)

    parent = data.get('parent_cli') or None
    if parent is not None:
        parent = {
            'name': parent.get('name', ''),
            'slug': parent.get('slug', ''),
        }

    # Index snippets by id for template lookup.
    snippet_index = {s['id']: s for s in snippets}

    return {
        'slug': data['slug'],
        'name': data['name'],
        'short_description': data['short_description'],
        'version': data.get('version', ''),
        'parent_cli': parent,
        'install': dict(data.get('install') or {}),
        'docs': docs,
        'commands': commands,
        'command_tree': build_command_tree(commands),
        'tags': list(data.get('tags') or []),
        'snippets': snippet_index,
    }
