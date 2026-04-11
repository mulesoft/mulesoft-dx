"""
Fetches MuleSoft header and footer from the public API endpoints.
"""

import json
import ssl
import urllib.request
import urllib.error
from typing import Dict, Optional


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
        result['footer'] = _parse_html_response(footer_json)

    return result


def _parse_dependencies(json_str: str) -> str:
    """Parse dependencies JSON and generate HTML link/script tags."""
    try:
        data = json.loads(json_str)
        deps = data.get('data', {})

        html_parts = []

        # Add CSS links
        for style_url in deps.get('styles', []):
            html_parts.append(f'<link rel="stylesheet" href="{style_url}">')

        # Add JS scripts (async to avoid blocking page parsing)
        for script_url in deps.get('scripts', []):
            html_parts.append(f'<script src="{script_url}" async></script>')

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
