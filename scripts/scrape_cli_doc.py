#!/usr/bin/env python3
"""One-off scraper: fetch a docs.mulesoft.com page and dump it as markdown.

Usage:
    python3 scripts/scrape_cli_doc.py \\
        --url https://docs.mulesoft.com/anypoint-cli/latest/secrets-manager \\
        --out clis/anypoint-cli/docs/secrets-manager.md

Rationale: keeps the network dependency at authoring time, not build time.
The generated markdown is checked into the repo alongside cli.yaml.
"""

import argparse
import sys
import urllib.request
from pathlib import Path


_UA = {'User-Agent': 'mulesoft-dx-poc-scraper/0.1'}


def _fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='replace')


_UNESCAPE_TOKENS = [
    # docs.mulesoft.com's `Copy as Markdown` output escapes ASCII punctuation
    # that markdown-it would interpret as structure (blockquotes, brackets,
    # backticks, ...). We surface those as literal characters so the CLI
    # parser can pick them up (e.g. `\> cmd [flags]` → `> cmd [flags]`).
    ('\\>', '>'), ('\\<', '<'),
    ('\\[', '['), ('\\]', ']'),
    ('\\(', '('), ('\\)', ')'),
    ('\\`', '`'),
    ('\\*', '*'), ('\\_', '_'),
    ('\\|', '|'), ('\\#', '#'),
]


def _unescape_md(text: str) -> str:
    for src, dst in _UNESCAPE_TOKENS:
        text = text.replace(src, dst)
    return text


def scrape(url: str) -> str:
    """Return page content as markdown.

    Preferred path: docs.mulesoft.com now exposes a ``.md`` sibling for every
    page (linked from the "Copy as Markdown" button). Try that first; if it
    404s, fall back to fetching the HTML and stripping tags.
    """
    # If the URL already ends in .md just fetch it verbatim.
    md_url = url if url.endswith('.md') else url.rstrip('/') + '.md'
    try:
        text = _fetch(md_url)
        # Sanity-check that we actually got markdown (not an HTML 404 page).
        if not text.lstrip().startswith('<') and len(text) > 100:
            return _unescape_md(text).rstrip() + '\n'
    except Exception:
        pass

    # Fall back to HTML → text via bs4 (loses structure, but keeps the words).
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("Install: pip install beautifulsoup4", file=sys.stderr)
        sys.exit(1)

    html = _fetch(url)
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.find('article') or soup.find(id='main-content') or soup.body
    lines = []
    for el in body.find_all(['h1', 'h2', 'h3', 'h4', 'pre', 'p']):
        if el.name.startswith('h'):
            lvl = int(el.name[1])
            lines.append(f"{'#' * lvl} {el.get_text(strip=True)}")
        elif el.name == 'pre':
            lines.append('```')
            lines.append(el.get_text().rstrip())
            lines.append('```')
        elif el.name == 'p':
            txt = el.get_text(' ', strip=True)
            if txt:
                lines.append(txt)
        lines.append('')
    return '\n'.join(lines).strip() + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--out', required=False, help='Output markdown path')
    args = parser.parse_args()

    markdown = scrape(args.url)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(markdown, encoding='utf-8')
        print(f"Wrote {len(markdown)} chars to {args.out}")
    else:
        print(markdown)


if __name__ == '__main__':
    main()
