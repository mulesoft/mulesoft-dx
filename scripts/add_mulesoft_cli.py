#!/usr/bin/env python3
"""Ingest a docs.mulesoft.com CLI reference page into `clis/<slug>/`.

Given a URL like ``https://docs.mulesoft.com/anypoint-cli/latest/secrets-manager``
this script:

  1. Derives the slug from the URL path (``secrets-manager``).
  2. Fetches the ``.md`` sibling via ``scrape_cli_doc.scrape`` (which unescapes
     the docs.mulesoft.com Copy-as-Markdown output).
  3. Writes it to ``clis/<slug>/docs/<slug>.md``.
  4. Scaffolds ``clis/<slug>/cli.yaml`` with the fields we can derive from the
     upstream page and clear ``TODO`` placeholders for the ones we cannot.

Idempotent by default: existing ``cli.yaml`` and ``.md`` files are left alone
unless ``--force`` is passed. This makes it safe to re-run when refreshing docs.

Usage:
    python3 scripts/add_mulesoft_cli.py \\
        --url https://docs.mulesoft.com/anypoint-cli/latest/secrets-manager
"""

import argparse
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse, urljoin

# Reuse the scraper's fetch + unescape pipeline.
sys.path.insert(0, str(Path(__file__).parent))
import scrape_cli_doc  # noqa: E402


# Anchored on the docs.mulesoft.com layout: the slug is the LAST path segment
# after `/latest/` (or a specific version). Anything else is out of scope for
# this ingester — the user can drop a `cli.yaml` by hand.
_URL_RE = re.compile(
    r'^https?://docs\.mulesoft\.com/([^/]+)/[^/]+/([A-Za-z0-9._-]+?)(?:\.md)?/?$'
)


def _slug_from_url(url: str) -> tuple[str, str]:
    """Return (product, slug). Product is the top folder (e.g. 'anypoint-cli')."""
    m = _URL_RE.match(url)
    if not m:
        raise SystemExit(
            f"URL does not match the docs.mulesoft.com CLI layout:\n  {url}\n"
            "Expected: https://docs.mulesoft.com/<product>/<version>/<page>"
        )
    return m.group(1), m.group(2)


def _human_name(slug: str) -> str:
    """secrets-manager → 'Secrets Manager'."""
    return ' '.join(part.capitalize() for part in slug.replace('_', '-').split('-'))


def _extract_short_description(markdown: str) -> str:
    """Pull the first non-title, non-frontmatter paragraph from the scraped md.
    Returns empty string if none found — the caller will use a TODO placeholder.

    Truncates to the first sentence (or ~180 chars, whichever comes first) so
    the yaml stays tidy and the description doesn't stop mid-word.
    """
    # Skip YAML frontmatter delimited by ---.
    body = re.sub(r'^---.*?---\s*', '', markdown, count=1, flags=re.DOTALL)
    # Cut everything from the first level-2 heading onward — description lives in
    # the intro block, never after `## <command>` sections.
    body = re.split(r'(?m)^##\s+', body, maxsplit=1)[0]
    for chunk in re.split(r'\n\s*\n', body):
        chunk = chunk.strip()
        if not chunk:
            continue
        # Skip headings and blockquotes (usage lines / admonitions).
        first_line = chunk.splitlines()[0]
        if first_line.startswith('#') or first_line.startswith('>'):
            continue
        # Skip raw HTML blocks scraped from docs.mulesoft.com (commands tables,
        # etc.) — the real prose description may sit after them.
        if first_line.lstrip().startswith('<'):
            continue
        # Skip the boilerplate llms.txt pointer that docs.mulesoft.com injects.
        if 'llms.txt' in chunk:
            continue
        # Collapse newlines. Strip markdown link syntax so the description is
        # plain text (yaml consumers don't render markdown).
        text = re.sub(r'\s+', ' ', chunk)
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
        # Prefer the first sentence if it fits; otherwise trim to a word boundary.
        first_sentence = re.split(r'(?<=[.!?])\s+', text, maxsplit=1)[0]
        if first_sentence and len(first_sentence) <= 220:
            return first_sentence
        if len(text) > 180:
            cut = text[:180].rsplit(' ', 1)[0]
            return cut + '…'
        return text
    return ''


_YAML_TEMPLATE = """\
name: {name}
slug: {slug}
version: "4.x"
short_description: {short_description}
parent_cli:
  name: Anypoint CLI
  slug: anypoint-cli
install:
  npm: "npm install -g anypoint-cli-v4"
docs:
  source: "scrape"
  base_url: "{base_url}"
  file: docs/{slug}.md
tags:
  - cli
  - anypoint
{extra_tags}{snippets_block}"""


# Match markdown links with an anchor: [text](href#anchor) or [text](./#anchor).
# Group 1 is link text, group 2 is href (may be empty for './#anchor'), group 3 is the anchor.
_ANCHOR_LINK_RE = re.compile(r'\[([^\]]+)\]\(([^)#]*)#([^)]+)\)')

# Level-2 heading, marking a per-command section (used to attribute link occurrences).
_H2_RE = re.compile(r'^##\s+(.+)$', re.M)


def _find_shared_anchor_links(markdown: str, min_refs: int = 2):
    """Scan `markdown` for anchor-bearing links referenced by >= min_refs distinct
    top-level sections (level-2 headings). Returns a list of dicts:
        [{'anchor': 'default-options', 'label': 'default flags',
          'href_examples': ['./#default-options', ...],
          'ref_count': 34}]

    A link is a "shared snippet" iff it appears in at least `min_refs` different
    command sections. This filters out one-off references (e.g. a link mentioned
    only in the intro or in a single command).
    """
    # Build a list of (section_start_offset, section_title) so we can attribute
    # each link occurrence to its command section.
    headings = [(m.start(), m.group(1).strip()) for m in _H2_RE.finditer(markdown)]

    def _section_at(offset: int) -> str:
        # Binary search would be nicer, but N is small (< 100).
        current = '__intro__'
        for start, title in headings:
            if start > offset:
                break
            current = title
        return current

    # anchor -> {label, hrefs, sections}
    hits: dict = {}
    for m in _ANCHOR_LINK_RE.finditer(markdown):
        label, href_prefix, anchor = m.group(1), m.group(2), m.group(3)
        # Ignore anchor-only labels that are obviously the ToC (link text == command name)
        # — skip when the text has no spaces and looks like an id.
        if re.fullmatch(r'[A-Za-z0-9:_.-]+', label.strip()):
            continue
        entry = hits.setdefault(anchor, {
            'anchor': anchor,
            'label': label.strip(),
            'hrefs': set(),
            'sections': set(),
        })
        entry['hrefs'].add(f'{href_prefix}#{anchor}')
        entry['sections'].add(_section_at(m.start()))

    shared = []
    for entry in hits.values():
        ref_count = len(entry['sections'] - {'__intro__'})
        if ref_count >= min_refs:
            shared.append({
                'anchor': entry['anchor'],
                'label': entry['label'],
                'href_examples': sorted(entry['hrefs']),
                'ref_count': ref_count,
            })
    # Deterministic order for cli.yaml output.
    shared.sort(key=lambda s: s['anchor'])
    return shared


def _extract_anchor_section(markdown: str, anchor: str, label: str = '') -> str:
    """Return the markdown chunk between a matching heading and the next heading
    of the same or higher level. Empty if not found.

    Anchor-id matching is unreliable on docs.mulesoft.com (the platform generates
    ids like `#default-options` for a heading titled `Default Flags`). We try
    three heuristics in order:

      1. Heading text slugified == anchor
      2. Heading text slugified == slugified(label)   (label text of the link)
      3. Substring-slug match on either — heading contains anchor or vice-versa
    """
    def _slug(text: str) -> str:
        s = text.strip().lower()
        s = re.sub(r'`([^`]+)`', r'\1', s)
        s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
        return s

    anchor_slug = _slug(anchor)
    label_slug = _slug(label) if label else ''
    lines = markdown.splitlines()
    heading_re = re.compile(r'^(#+)\s+(.+?)\s*$')

    candidates = []  # (priority, idx, level)
    for i, line in enumerate(lines):
        m = heading_re.match(line)
        if not m:
            continue
        h_slug = _slug(m.group(2))
        if h_slug == anchor_slug:
            candidates.append((0, i, len(m.group(1))))
        elif label_slug and h_slug == label_slug:
            candidates.append((1, i, len(m.group(1))))
        elif anchor_slug and (anchor_slug in h_slug or h_slug in anchor_slug):
            candidates.append((2, i, len(m.group(1))))
        elif label_slug and (label_slug in h_slug or h_slug in label_slug):
            candidates.append((3, i, len(m.group(1))))

    if not candidates:
        return ''
    candidates.sort()
    _, start_line, start_level = candidates[0]
    start_idx = start_line + 1
    end_idx = len(lines)
    for j in range(start_idx, len(lines)):
        m = heading_re.match(lines[j])
        if m and len(m.group(1)) <= start_level:
            end_idx = j
            break
    return '\n'.join(lines[start_idx:end_idx]).strip() + '\n'


def _resolve_snippet_url(base_url: str, href_example: str, anchor: str) -> str:
    """Build the absolute URL of the parent doc page that hosts `anchor`.

    Cases:
      href = "./#anchor"      → same folder as base_url (i.e. the CLI landing page)
      href = "../foo#anchor"  → resolved relative to base_url
      href = "https://…#anchor" → returned verbatim
      href = "#anchor" (empty prefix) → base_url itself (uncommon)
    """
    if href_example.startswith(('http://', 'https://')):
        return href_example.split('#', 1)[0]
    # urljoin needs a trailing slash on the base to treat it as a directory.
    base_dir = base_url if base_url.endswith('/') else base_url.rsplit('/', 1)[0] + '/'
    href_prefix = href_example.split('#', 1)[0]
    if not href_prefix:
        return base_url.rstrip('/')
    return urljoin(base_dir, href_prefix).rstrip('/')


def _detect_and_extract_snippets(markdown: str, base_url: str, cli_dir: Path,
                                  force: bool = False, min_refs: int = 2) -> list:
    """Detect shared anchor-linked snippets in the scraped CLI doc, fetch each
    referenced parent page, extract the anchor section, and write it to
    `snippets/<anchor>.md`. Returns a list of snippet metadata dicts ready to
    embed into cli.yaml.
    """
    shared = _find_shared_anchor_links(markdown, min_refs=min_refs)
    if not shared:
        return []

    snippets_dir = cli_dir / 'snippets'
    entries: list = []
    for s in shared:
        anchor = s['anchor']
        href_example = s['href_examples'][0]
        parent_url = _resolve_snippet_url(base_url, href_example, anchor)
        snippet_path = snippets_dir / f'{anchor}.md'

        needs_fetch = force or not snippet_path.exists()
        if needs_fetch:
            try:
                parent_md = scrape_cli_doc.scrape(parent_url)
            except Exception as e:
                print(f"  ⚠  Failed to fetch snippet '{anchor}' from {parent_url}: {e}",
                      file=sys.stderr)
                continue
            section = _extract_anchor_section(parent_md, anchor, s['label'])
            if not section.strip():
                print(f"  ⚠  Snippet '{anchor}' not found in {parent_url} — skipped",
                      file=sys.stderr)
                continue
            snippets_dir.mkdir(parents=True, exist_ok=True)
            snippet_path.write_text(section, encoding='utf-8')

        # Try to lift the human-friendly title from the parent doc's heading;
        # falls back to the anchor label (which is often lowercase).
        title = s['label'].strip()
        if needs_fetch:
            title = _extract_section_title(parent_md, anchor, s['label']) or title

        # Build the yaml entry. The `matches` list holds substrings that the
        # parser looks for in each command's markdown to know when to inject
        # the snippet. Anchor alone is the simplest reliable match.
        entries.append({
            'id': anchor,
            'title': title,
            'matches': [f'#{anchor}'],
            'file': f'snippets/{anchor}.md',
        })
    return entries


def _extract_section_title(markdown: str, anchor: str, label: str = '') -> str:
    """Locate the heading matched by `_extract_anchor_section` and return its
    raw text so we can use it as the snippet title (`Default Flags` beats
    `default flags`)."""
    def _slug(text: str) -> str:
        s = text.strip().lower()
        s = re.sub(r'`([^`]+)`', r'\1', s)
        s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
        return s

    anchor_slug = _slug(anchor)
    label_slug = _slug(label) if label else ''
    heading_re = re.compile(r'^(#+)\s+(.+?)\s*$')
    best = None
    best_priority = 99
    for line in markdown.splitlines():
        m = heading_re.match(line)
        if not m:
            continue
        text = m.group(2).strip()
        h_slug = _slug(text)
        if h_slug == anchor_slug:
            return text
        if label_slug and h_slug == label_slug and best_priority > 1:
            best, best_priority = text, 1
        elif anchor_slug and (anchor_slug in h_slug or h_slug in anchor_slug) and best_priority > 2:
            best, best_priority = text, 2
        elif label_slug and (label_slug in h_slug or h_slug in label_slug) and best_priority > 3:
            best, best_priority = text, 3
    return best or ''


def _render_snippets_block(snippets: list) -> str:
    if not snippets:
        return ''
    lines = ['snippets:']
    for s in snippets:
        lines.append(f'  - id: {s["id"]}')
        lines.append(f'    title: "{s["title"]}"')
        lines.append('    matches:')
        for m in s['matches']:
            lines.append(f'      - "{m}"')
        lines.append(f'    file: {s["file"]}')
    return '\n'.join(lines) + '\n'


def _yaml_scaffold(slug: str, base_url: str, short_description: str,
                    extra_tags: list[str], snippets: list | None = None) -> str:
    """Build the cli.yaml body. YAML-escapes `short_description` minimally."""
    escaped = short_description.replace('"', '\\"') if short_description else ''
    quoted_desc = f'"{escaped}"' if escaped else '"TODO: fill in a one-line description"'
    tag_lines = '\n'.join(f'  - {t}' for t in extra_tags)
    if tag_lines and not tag_lines.endswith('\n'):
        tag_lines = tag_lines + '\n'
    snippets_block = _render_snippets_block(snippets or [])
    return _YAML_TEMPLATE.format(
        name=_human_name(slug),
        slug=slug,
        short_description=quoted_desc,
        base_url=base_url,
        extra_tags=tag_lines,
        snippets_block=snippets_block,
    )


def add_cli(url: str, repo_root: Path, force: bool = False, extra_tags: list[str] | None = None) -> dict:
    """Do the full ingest. Returns a dict describing what happened."""
    _, slug = _slug_from_url(url)
    cli_dir = repo_root / 'clis' / slug
    md_path = cli_dir / 'docs' / f'{slug}.md'
    yaml_path = cli_dir / 'cli.yaml'

    md_action = 'skipped'
    if not md_path.exists() or force:
        markdown = scrape_cli_doc.scrape(url)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(markdown, encoding='utf-8')
        md_action = 'created' if not md_path.exists() else 'overwritten'
        # Second existence check after write flips the label; recompute properly.
        md_action = 'overwritten' if force else 'created'
    else:
        markdown = md_path.read_text(encoding='utf-8')

    # Detect + extract shared snippets *before* writing cli.yaml so the scaffold
    # can reference them. Snippet files are written per-CLI under snippets/.
    base_url = url.split('.md')[0].rstrip('/')
    snippets = _detect_and_extract_snippets(markdown, base_url, cli_dir, force=force)

    yaml_action = 'skipped'
    if not yaml_path.exists() or force:
        short_description = _extract_short_description(markdown)
        content = _yaml_scaffold(
            slug=slug,
            base_url=base_url,
            short_description=short_description,
            extra_tags=extra_tags or [],
            snippets=snippets,
        )
        yaml_path.write_text(content, encoding='utf-8')
        yaml_action = 'overwritten' if force else 'created'

    return {
        'slug': slug,
        'cli_dir': cli_dir,
        'md_path': md_path,
        'yaml_path': yaml_path,
        'md_action': md_action,
        'yaml_action': yaml_action,
        'snippets': snippets,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', required=True, help='docs.mulesoft.com CLI page URL')
    parser.add_argument(
        '--force',
        action='store_true',
        help='Overwrite existing cli.yaml and .md (default: skip existing files)',
    )
    parser.add_argument(
        '--tag',
        action='append',
        default=[],
        help='Extra tag to add to cli.yaml (repeatable, e.g. --tag secrets)',
    )
    parser.add_argument(
        '--repo-root',
        default=str(Path(__file__).resolve().parent.parent),
        help='Repo root (default: parent of this script)',
    )
    args = parser.parse_args()

    result = add_cli(
        url=args.url,
        repo_root=Path(args.repo_root),
        force=args.force,
        extra_tags=args.tag,
    )

    print(f"CLI: {result['slug']}")
    print(f"  Directory: {result['cli_dir'].relative_to(Path(args.repo_root))}")
    print(f"  {result['md_path'].relative_to(Path(args.repo_root))}  [{result['md_action']}]")
    print(f"  {result['yaml_path'].relative_to(Path(args.repo_root))}  [{result['yaml_action']}]")
    for s in result.get('snippets') or []:
        rel = (result['cli_dir'] / s['file']).relative_to(Path(args.repo_root))
        print(f"  {rel}  [snippet: {s['id']}]")
    if result['yaml_action'] == 'created':
        print()
        print("  ⚠  Review cli.yaml — fill any TODO placeholders (short_description, tags).")
    print()
    print("Next: `make generate-portal` to render this CLI in the portal.")


if __name__ == '__main__':
    main()
