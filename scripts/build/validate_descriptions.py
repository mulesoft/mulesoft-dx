#!/usr/bin/env python3
"""
API Description Validator - Validates info.description in OpenAPI specs

Ensures all API descriptions use imperative voice and avoid boilerplate.

Usage:
    python3 scripts/build/validate_descriptions.py
"""

import re
import sys
import yaml
from pathlib import Path
from typing import List, Dict
from collections import defaultdict


BANNED_PREFIXES = [
    re.compile(r'^Provides programmatic access', re.IGNORECASE),
    re.compile(r'^This is a RAML', re.IGNORECASE),
    re.compile(r'^The .+ API allows you to', re.IGNORECASE),
    re.compile(r'^API V\d', re.IGNORECASE),
    re.compile(r'^This API ', re.IGNORECASE),
]

APPROVED_STARTING_VERBS = {
    'Manage', 'Query', 'Search', 'Retrieve', 'Create', 'Deploy',
    'Export', 'List', 'Register', 'Track', 'Tokenize', 'Monitor',
    'Design', 'Publish', 'Configure', 'Build', 'Connect', 'Generate',
    'Promote', 'Apply', 'Execute', 'Verify', 'Set', 'Run', 'Test',
    'Upload', 'Download', 'Delete', 'Update', 'Get', 'Send', 'Check',
}

MIN_DESCRIPTION_LENGTH = 20


class DescriptionViolation:
    def __init__(self, api: str, rule: str, message: str):
        self.api = api
        self.rule = rule
        self.message = message

    def __repr__(self):
        return f"[{self.api}] {self.rule}: {self.message}"


class DescriptionValidator:
    def __init__(self, api_dir: Path):
        self.api_dir = api_dir
        self.api_name = api_dir.name
        self.api_path = api_dir / 'api.yaml'
        self.spec = None
        self.violations: List[DescriptionViolation] = []

    def load_spec(self):
        if not self.api_path.exists():
            return False
        with open(self.api_path, 'r') as f:
            self.spec = yaml.safe_load(f)
        return self.spec is not None

    def validate(self) -> List[DescriptionViolation]:
        if not self.load_spec():
            return self.violations

        description = self.spec.get('info', {}).get('description', '')
        if not description:
            self.violations.append(DescriptionViolation(
                self.api_name,
                'description-missing',
                'API info.description is missing or empty'
            ))
            return self.violations

        description = description.strip()

        # Check banned prefixes
        for pattern in BANNED_PREFIXES:
            if pattern.search(description):
                self.violations.append(DescriptionViolation(
                    self.api_name,
                    'description-boilerplate',
                    f'Description uses boilerplate phrasing. Got: "{description[:80]}..."'
                ))
                break

        # Check minimum length
        if len(description) < MIN_DESCRIPTION_LENGTH:
            self.violations.append(DescriptionViolation(
                self.api_name,
                'description-too-short',
                f'Description must be at least {MIN_DESCRIPTION_LENGTH} characters. Got {len(description)} characters.'
            ))

        # Check starts with approved verb
        first_word = description.split()[0].rstrip(',.;:') if description.split() else ''
        if first_word not in APPROVED_STARTING_VERBS:
            self.violations.append(DescriptionViolation(
                self.api_name,
                'description-not-imperative',
                f'Description must start with an imperative verb '
                f'(e.g. Manage, Query, Create, Deploy). Got: "{first_word}"'
            ))

        return self.violations


def validate_all_apis(repo_root: Path) -> Dict[str, List[DescriptionViolation]]:
    results = {}

    for api_dir in sorted(repo_root.iterdir()):
        if not api_dir.is_dir():
            continue

        if api_dir.name.startswith('.') or api_dir.name in [
            'docs', 'viewer', 'scripts', 'portal', 'node_modules',
            'validation-reports',
        ]:
            continue

        exchange_path = api_dir / 'exchange.json'
        if not exchange_path.exists():
            continue

        print(f"  Validating: {api_dir.name}")
        validator = DescriptionValidator(api_dir)
        violations = validator.validate()

        if violations:
            results[api_dir.name] = violations

    return results


def main():
    repo_root = Path(__file__).parent.parent.parent

    print("═══════════════════════════════════════════════════════════════════")
    print("  API Description Validator")
    print("═══════════════════════════════════════════════════════════════════")
    print()

    results = validate_all_apis(repo_root)

    if not results:
        print()
        print("✅ No description violations found!")
        return 0

    total_violations = sum(len(v) for v in results.values())

    print(f"\n❌ Found {total_violations} violations across {len(results)} APIs:\n")

    for api_name, violations in sorted(results.items()):
        print(f"📁 {api_name} ({len(violations)} violations)")

        by_rule = defaultdict(list)
        for v in violations:
            by_rule[v.rule].append(v)

        for rule, rule_violations in sorted(by_rule.items()):
            print(f"   • {rule}: {len(rule_violations)}")
            for v in rule_violations[:3]:
                print(f"     - {v.message}")
            if len(rule_violations) > 3:
                print(f"     ... and {len(rule_violations) - 3} more")
        print()

    return 1


if __name__ == '__main__':
    sys.exit(main())
