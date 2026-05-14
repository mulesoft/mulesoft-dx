"""Parser for Terraform provider documentation files.

Parses markdown files with YAML frontmatter (page_title, subcategory, description)
and converts the body to HTML for portal rendering.
"""

import re
from pathlib import Path
from typing import Dict, Optional

import yaml
from markdown_it import MarkdownIt


_FRONTMATTER_RE = re.compile(r'^---\s*\n(.*?)\n---\s*\n', re.DOTALL)

_md = MarkdownIt('commonmark', {'html': True}).enable('table')


def parse_terraform_doc(filepath: Path) -> Optional[Dict]:
    """Parse a single Terraform resource/data-source markdown file.

    Returns a dict with keys:
    - page_title: full page title from frontmatter
    - name: resource/data-source name (extracted from page_title)
    - subcategory: grouping category
    - description: short description
    - doc_type: 'resources' or 'data-sources' (from parent dir name)
    - body_html: rendered markdown body
    - slug: filename without extension
    """
    content = filepath.read_text(encoding='utf-8')

    m = _FRONTMATTER_RE.match(content)
    if not m:
        return None

    try:
        frontmatter = yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        return None

    if not isinstance(frontmatter, dict):
        return None

    page_title = frontmatter.get('page_title', '')
    subcategory = frontmatter.get('subcategory', 'Uncategorized')
    description = frontmatter.get('description', '')

    # Extract resource name from page_title: "anypoint_api_instance Resource - ..."
    name = page_title.split(' - ')[0].strip() if ' - ' in page_title else page_title
    # Strip trailing " Resource" / " Data Source" suffix (already implied by section)
    for suffix in (' Data Source', ' Data-Source', ' Resource'):
        if name.endswith(suffix):
            name = name[: -len(suffix)].rstrip()
            break

    body = content[m.end():]
    body_html = _md.render(body)

    doc_type = filepath.parent.name  # 'resources' or 'data-sources'
    slug = filepath.stem

    return {
        'page_title': page_title,
        'name': name,
        'subcategory': subcategory,
        'description': description,
        'doc_type': doc_type,
        'body_html': body_html,
        'slug': slug,
    }
