#!/usr/bin/env python3
"""
Deployed portal validator (validate_portal.py).

Validates that a deployed portal's agentic endpoints are reachable and
structurally correct. Designed to run against any deployed URL (test or prod).

Checks:
  C1. Core endpoints return 200: /, /AGENTS.md, /registry.json, /llms.txt
  C2. registry.json is valid JSON and contains expected fields
  C3. Every href in registry.json returns 200 (the critical agentic path check)
  C4. OAS specs are parseable as YAML
  C5. SKILL.md files are non-empty and contain frontmatter

Usage:
    python3 scripts/build/validate_portal.py --url https://test-dev-portal.mulesoft.com
    python3 scripts/build/validate_portal.py --url https://dev-portal.mulesoft.com
    python3 scripts/build/validate_portal.py --url http://localhost:8081

Options:
    --url URL        Base URL of the deployed portal (required)
    --header K:V     Extra HTTP header (repeatable, e.g. --header "X-MS-Developer: true")
    --timeout N      Per-request timeout in seconds (default: 10)
    --skip-content   Skip C4/C5 content checks (faster, HTTP-only)

Exit codes: 0 (all pass) / 1 (violations) / 2 (environment error)
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

try:
    import yaml
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False

REQUIRED_CORE = ["/", "/AGENTS.md", "/registry.json", "/llms.txt"]
REQUIRED_REGISTRY_FIELDS = {"$id", "kind", "slug", "href"}
EXPECTED_KINDS = {"oas", "agent-skill", "mcp"}


def _fetch(url: str, headers: Dict[str, str], timeout: int) -> Tuple[int, bytes]:
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except HTTPError as e:
        return e.code, b""
    except URLError as e:
        raise RuntimeError(f"Connection error fetching {url}: {e.reason}") from e


def _check_core(base: str, headers: Dict, timeout: int) -> List[str]:
    errors = []
    for path in REQUIRED_CORE:
        url = base.rstrip("/") + path
        code, _ = _fetch(url, headers, timeout)
        if code != 200:
            errors.append(f"HTTP {code}: {path}")
    return errors


def _check_registry(base: str, headers: Dict, timeout: int) -> Tuple[List[str], List[dict]]:
    url = base.rstrip("/") + "/registry.json"
    errors = []
    items = []
    code, body = _fetch(url, headers, timeout)
    if code != 200:
        return [f"registry.json returned HTTP {code}"], []
    try:
        items = json.loads(body)
    except json.JSONDecodeError as e:
        return [f"registry.json is not valid JSON: {e}"], []
    if not isinstance(items, list):
        return ["registry.json is not a JSON array"], []

    kinds_found = set()
    for i, item in enumerate(items):
        missing = REQUIRED_REGISTRY_FIELDS - set(item.keys())
        if missing:
            errors.append(f"Item {i} ({item.get('slug', '?')}) missing fields: {missing}")
        kinds_found.add(item.get("kind"))

    missing_kinds = EXPECTED_KINDS - kinds_found
    if missing_kinds:
        errors.append(f"registry.json missing expected kinds: {missing_kinds}")

    return errors, items


def _check_hrefs(base: str, headers: Dict, timeout: int, items: List[dict]) -> List[str]:
    errors = []
    for item in items:
        href = item.get("href")
        if not href:
            continue
        url = base.rstrip("/") + "/" + href.lstrip("/")
        code, _ = _fetch(url, headers, timeout)
        if code != 200:
            errors.append(f"HTTP {code}: {href}  (slug: {item.get('slug', '?')})")
    return errors


def _check_oas_content(base: str, headers: Dict, timeout: int, items: List[dict]) -> List[str]:
    if not _YAML_AVAILABLE:
        return ["SKIP: PyYAML not installed — skipping OAS content check"]
    errors = []
    for item in items:
        if item.get("kind") != "oas":
            continue
        slug = item["slug"]
        url = base.rstrip("/") + f"/apis/{slug}/api.yaml"
        code, body = _fetch(url, headers, timeout)
        if code != 200:
            errors.append(f"HTTP {code}: apis/{slug}/api.yaml")
            continue
        try:
            yaml.safe_load(body)
        except yaml.YAMLError as e:
            errors.append(f"apis/{slug}/api.yaml invalid YAML: {e}")
    return errors


def _check_skill_content(base: str, headers: Dict, timeout: int, items: List[dict]) -> List[str]:
    errors = []
    for item in items:
        if item.get("kind") != "agent-skill":
            continue
        href = item.get("href", "")
        if not href:
            continue
        url = base.rstrip("/") + "/" + href.lstrip("/")
        code, body = _fetch(url, headers, timeout)
        if code != 200:
            continue  # already caught by C3
        if len(body) < 50:
            errors.append(f"SKILL.md suspiciously small ({len(body)} bytes): {href}")
        if b"---" not in body[:500]:
            errors.append(f"SKILL.md missing frontmatter: {href}")
    return errors


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate a deployed portal's agentic endpoints.")
    parser.add_argument("--url", required=True, help="Base URL of the deployed portal")
    parser.add_argument("--header", action="append", default=[], metavar="K:V",
                        help="Extra HTTP header (repeatable)")
    parser.add_argument("--timeout", type=int, default=10, help="Per-request timeout (seconds)")
    parser.add_argument("--skip-content", action="store_true",
                        help="Skip YAML/frontmatter content checks (C4, C5)")
    args = parser.parse_args(argv)

    base = args.url.rstrip("/")
    timeout = args.timeout
    headers: Dict[str, str] = {}
    for h in args.header:
        if ":" not in h:
            print(f"ERROR: --header must be in K:V format, got: {h!r}")
            return 2
        k, v = h.split(":", 1)
        headers[k.strip()] = v.strip()

    print(f"Validating portal: {base}")
    if headers:
        print(f"Headers: {headers}")
    print("=" * 60)

    all_errors: Dict[str, List[str]] = {}

    # C1
    print("C1  Core endpoints...")
    errs = _check_core(base, headers, timeout)
    all_errors["C1"] = errs
    print(f"    {'✅ OK' if not errs else f'❌ {len(errs)} error(s)'}")

    # C2
    print("C2  registry.json structure...")
    errs, items = _check_registry(base, headers, timeout)
    all_errors["C2"] = errs
    print(f"    {'✅ OK' if not errs else f'❌ {len(errs)} error(s)'} — {len(items)} items")

    # C3
    print(f"C3  All registry hrefs reachable ({sum(1 for x in items if x.get('href'))} URLs)...")
    errs = _check_hrefs(base, headers, timeout, items)
    all_errors["C3"] = errs
    print(f"    {'✅ OK' if not errs else f'❌ {len(errs)} error(s)'}")

    if not args.skip_content:
        # C4
        oas_count = sum(1 for x in items if x.get("kind") == "oas")
        print(f"C4  OAS specs parseable as YAML ({oas_count} specs)...")
        errs = _check_oas_content(base, headers, timeout, items)
        all_errors["C4"] = errs
        print(f"    {'✅ OK' if not errs else f'❌ {len(errs)} error(s)'}")

        # C5
        skill_count = sum(1 for x in items if x.get("kind") == "agent-skill")
        print(f"C5  SKILL.md files non-empty with frontmatter ({skill_count} skills)...")
        errs = _check_skill_content(base, headers, timeout, items)
        all_errors["C5"] = errs
        print(f"    {'✅ OK' if not errs else f'❌ {len(errs)} error(s)'}")

    print()
    print("=" * 60)

    total = sum(len(v) for v in all_errors.values())
    if total:
        for check, errs in all_errors.items():
            if errs:
                print(f"\n❌ {check} failures:")
                for e in errs:
                    print(f"   • {e}")
        print()
        print(f"❌ {total} violation(s) found")
        return 1

    checks_run = len(all_errors)
    print(f"✅ All {checks_run} checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
