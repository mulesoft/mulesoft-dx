"""Parser for API narrative guide documentation files.

Parses plain markdown files (no frontmatter) under
``apis/<slug>/docs/<version>/`` and converts them to HTML for portal rendering.
"""

from pathlib import Path
from typing import Dict, List

from markdown_it import MarkdownIt

_md = MarkdownIt('commonmark', {'html': False}).enable('table')


def parse_api_doc(filepath: Path) -> Dict:
    """Parse a single API narrative guide markdown file.

    Returns a dict with keys:
    - title: display title derived from the filename
    - slug: filename without extension, kebab-cased
    - body_html: rendered markdown body
    """
    title = filepath.stem
    if title == title.lower():
        title = title.capitalize()
    slug = filepath.stem.lower().replace(' ', '-')
    content = filepath.read_text(encoding='utf-8')

    return {
        'title': title,
        'slug': slug,
        'body_html': _md.render(content),
        'body_markdown': content,
    }


def discover_api_docs(api_dir: Path, version: str) -> List[Dict]:
    """Discover narrative guide markdown files for a single API.

    Layout: ``apis/<slug>/docs/<version>/*.md``. Returns an empty list when the
    API has no matching ``docs/<version>/`` directory. The ``home`` guide, if
    present, always sorts first; the rest sort alphabetically by title.
    """
    docs_dir = api_dir / 'docs' / version
    if not docs_dir.is_dir():
        return []

    guides = [parse_api_doc(f) for f in sorted(docs_dir.glob('*.md'))]
    guides.sort(key=lambda g: (g['slug'] != 'home', g['title'].lower()))
    return guides
