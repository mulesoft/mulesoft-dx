#!/usr/bin/env python3
"""
Static API Portal Generator

Generates a fully static API documentation portal from OpenAPI specs and skills.
Output: Pure HTML/CSS/JS files that work offline (no server needed).

Usage:
    python3 scripts/generate_portal.py --output portal
    python3 scripts/generate_portal.py --output portal --proxy-url http://localhost:8081/proxy
    # Then open portal/index.html in browser
"""

import argparse
import subprocess
import sys
from pathlib import Path

# Ensure dependencies are available
try:
    from ruamel.yaml import YAML
except ImportError:
    print("Error: ruamel.yaml not installed. Install with: pip install ruamel.yaml")
    sys.exit(1)

try:
    import frontmatter
except ImportError:
    print("Error: python-frontmatter not installed. Install with: pip install python-frontmatter")
    sys.exit(1)

from portal_generator import PortalGenerator


def main():
    parser = argparse.ArgumentParser(description='Generate static API portal')
    parser.add_argument('--output', '-o', type=str, default='portal',
                        help='Output directory (default: portal)')
    parser.add_argument('--repo', '-r', type=str, default='.',
                        help='Repository root (default: current directory)')
    parser.add_argument('--build-label', type=str, default=None,
                        help='Build label (default: auto-detect from git)')
    parser.add_argument('--base-url', type=str, default='https://dev-portal.mulesoft.com',
                        help='Base URL of the deployed portal (default: https://dev-portal.mulesoft.com)')

    args = parser.parse_args()

    repo_root = Path(args.repo).resolve()
    output_dir = Path(args.output).resolve()

    if not repo_root.exists():
        print(f"❌ Error: Repository root does not exist: {repo_root}")
        sys.exit(1)

    build_label = args.build_label
    if not build_label:
        try:
            sha = subprocess.check_output(
                ['git', 'rev-parse', 'HEAD'], cwd=repo_root, stderr=subprocess.DEVNULL
            ).decode().strip()
            build_label = f"LOCAL BUILD: {sha}"
        except (subprocess.CalledProcessError, FileNotFoundError):
            build_label = "unknown"

    base_url = args.base_url.rstrip('/')
    proxy_url = f"{base_url}/proxy"
    generator = PortalGenerator(output_dir, proxy_url=proxy_url, build_label=build_label, base_url=base_url)
    generator.generate(repo_root)


if __name__ == '__main__':
    main()
