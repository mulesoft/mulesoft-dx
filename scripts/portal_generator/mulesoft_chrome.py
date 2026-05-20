"""
Fetches MuleSoft header and footer from the public API endpoints.
"""

import json
import ssl
import urllib.request
import urllib.error
from typing import Dict, Optional
from urllib.parse import urlparse


_ALLOWED_CHROME_HOSTS = ('www.mulesoft.com',)
_ALLOWED_CHROME_SUFFIXES = ('.mulesoft.com',)


def _is_allowed_chrome_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme != 'https':
        return False
    host = (parsed.hostname or '').lower()
    if host in _ALLOWED_CHROME_HOSTS:
        return True
    return any(host.endswith(suffix) for suffix in _ALLOWED_CHROME_SUFFIXES)


def fetch_mulesoft_chrome() -> Dict[str, str]:
    """
    Fetch MuleSoft header, footer, and dependencies.

    Returns:
        Dict with 'dependencies', 'header', and 'footer' HTML strings.
        Returns empty strings on failure.
    """
    print("  ✓ Fetching MuleSoft header and footer...")

    result = {
        'dependencies': '',
        'header': '',
        'footer': ''
    }

    # Fetch and parse dependencies (CSS and JS)
    deps_json = _fetch_url(
        'https://www.mulesoft.com/api/dependencies',
        'dependencies'
    )
    if deps_json:
        result['dependencies'] = _parse_dependencies(deps_json)

    # Fetch and parse header (no search box, no login for static docs)
    header_json = _fetch_url(
        'https://www.mulesoft.com/api/header?searchbox=false&login=false',
        'header'
    )
    if header_json:
        result['header'] = _parse_html_response(header_json)

    # Fetch and parse footer
    footer_json = _fetch_url(
        'https://www.mulesoft.com/api/footer',
        'footer'
    )
    if footer_json:
        result['footer'] = _strip_footer_bottom(_parse_html_response(footer_json))

    return result


def _parse_dependencies(json_str: str) -> str:
    """Parse dependencies JSON and generate HTML link/script tags.

    Only emits URLs that pass _is_allowed_chrome_url; the rest are dropped
    with a warning.
    """
    try:
        data = json.loads(json_str)
        deps = data.get('data', {})

        html_parts = []

        for style_url in deps.get('styles', []):
            if _is_allowed_chrome_url(style_url):
                html_parts.append(f'<link rel="stylesheet" href="{style_url}">')
            else:
                print(f"    ⚠️  Dropped non-allowlisted style URL: {style_url}")

        for script_url in deps.get('scripts', []):
            if _is_allowed_chrome_url(script_url):
                html_parts.append(f'<script src="{script_url}" async></script>')
            else:
                print(f"    ⚠️  Dropped non-allowlisted script URL: {script_url}")

        return '\n    '.join(html_parts)
    except (json.JSONDecodeError, KeyError) as e:
        print(f"    ⚠️  Failed to parse dependencies: {e}")
        return ''


def _parse_html_response(json_str: str) -> str:
    """Parse JSON response and extract HTML content."""
    try:
        data = json.loads(json_str)
        return data.get('data', '')
    except (json.JSONDecodeError, KeyError) as e:
        print(f"    ⚠️  Failed to parse HTML response: {e}")
        return ''


def _strip_footer_bottom(html: str) -> str:
    """Remove the footer-bottom section from the chrome footer HTML."""
    import re
    return re.sub(
        r'<section class="footer-bottom">.*?</section>',
        '',
        html,
        flags=re.DOTALL
    )


def _fetch_url(url: str, name: str) -> str:
    """Fetch content from a URL with error handling."""
    try:
        # Create SSL context - try certifi first, fallback to unverified
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            # Fallback: use unverified context
            ctx = ssl._create_unverified_context()

        # Create request with User-Agent header
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )

        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            content = response.read().decode('utf-8')
            print(f"    • Fetched {name} ({len(content)} bytes)")
            return content
    except urllib.error.URLError as e:
        print(f"    ⚠️  Failed to fetch {name}: {e.reason}")
        return ''
    except Exception as e:
        print(f"    ⚠️  Error fetching {name}: {str(e)}")
        return ''
