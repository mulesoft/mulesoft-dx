#!/usr/bin/env python3
"""
X-Origin Validator - Validates x-origin annotations in OpenAPI specs

Validates against the JSON Schema in docs/schemas/x-origin.schema.json

The JSON Schema is the single source of truth for x-origin structure validation.
This script adds checks that can't be expressed in JSON Schema:
1. Operation references point to valid operationIds in the same API
2. No numbered duplicate parameter components (XOrigin_*_2, XOrigin_*_3, etc.)
3. values and labels arrays have matching lengths (when both are arrays)

Usage:
    python3 scripts/build/validate_xorigin.py
"""

import json
import yaml
import sys
from pathlib import Path
from typing import List, Dict, Any, Set
from collections import defaultdict

try:
    from jsonschema import validate, ValidationError, Draft7Validator
except ImportError:
    print("ERROR: jsonschema package is required. Install with: pip install jsonschema")
    sys.exit(1)


class XOriginViolation:
    def __init__(self, api: str, rule: str, location: str, message: str):
        self.api = api
        self.rule = rule
        self.location = location
        self.message = message

    def __repr__(self):
        return f"[{self.api}] {self.rule} @ {self.location}: {self.message}"


class XOriginValidator:
    def __init__(self, api_dir: Path, schema_path: Path, all_apis: Dict[str, Dict[str, Any]] = None):
        self.api_dir = api_dir
        self.api_name = api_dir.name
        self.api_path = api_dir / 'api.yaml'
        self.schema_path = schema_path
        self.spec = None
        self.schema = None
        self.violations: List[XOriginViolation] = []
        self.operation_ids: Set[str] = set()
        self.all_apis = all_apis or {}  # Map of api_name -> {spec, operation_ids}

    def load_schema(self):
        """Load the x-origin JSON Schema"""
        if not self.schema_path.exists():
            print(f"WARNING: x-origin schema not found at {self.schema_path}")
            return False

        with open(self.schema_path, 'r') as f:
            self.schema = json.load(f)
        return True

    def load_spec(self):
        """Load the OpenAPI specification"""
        if not self.api_path.exists():
            return False

        with open(self.api_path, 'r') as f:
            self.spec = yaml.safe_load(f)
        return True

    def extract_operation_ids(self):
        """Extract all operationIds from the spec"""
        paths = self.spec.get('paths', {})
        for path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue
            for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']:
                if method in path_item:
                    operation = path_item[method]
                    op_id = operation.get('operationId')
                    if op_id:
                        self.operation_ids.add(op_id)

    def validate(self) -> List[XOriginViolation]:
        """Run all validation checks"""
        if not self.load_spec():
            return []

        if not self.load_schema():
            # Schema not found, skip schema validation
            pass

        self.extract_operation_ids()
        self.check_numbered_components()
        self.check_xorigin_structure()
        self.check_operation_references()

        return self.violations

    def check_numbered_components(self):
        """Check for numbered duplicate parameter components"""
        components = self.spec.get('components', {})
        parameters = components.get('parameters', {})

        for param_name in parameters:
            if param_name.startswith('XOrigin_') and param_name[-2:].startswith('_') and param_name[-1].isdigit():
                self.violations.append(XOriginViolation(
                    self.api_name,
                    'numbered-xorigin-component',
                    f'components.parameters.{param_name}',
                    f'Parameter component has numbered suffix: {param_name}'
                ))

    def check_xorigin_structure(self):
        """
        Validate x-origin structure against JSON Schema and custom rules.

        The JSON Schema handles most validation:
        - Required fields (api, operation, values)
        - Property types and formats
        - Deprecated v1 fields
        - additionalProperties: false

        This method adds checks that JSON Schema can't express:
        - values/labels array length matching
        """
        components = self.spec.get('components', {})
        parameters = components.get('parameters', {})

        for param_name, param_def in parameters.items():
            xorigin = param_def.get('x-origin')
            if not xorigin:
                continue

            location = f'components.parameters.{param_name}'

            # Basic type check before schema validation
            if not isinstance(xorigin, list):
                self.violations.append(XOriginViolation(
                    self.api_name,
                    'xorigin-must-be-array',
                    location,
                    'x-origin must be an array of source objects'
                ))
                continue

            # Validate against JSON Schema if available
            if self.schema:
                try:
                    validate(instance=xorigin, schema=self.schema)
                except ValidationError as e:
                    # Extract the most relevant error message
                    error_path = ' → '.join(str(p) for p in e.path) if e.path else ''
                    error_loc = f'{location}.x-origin'
                    if error_path:
                        error_loc += f'[{error_path}]'

                    self.violations.append(XOriginViolation(
                        self.api_name,
                        'xorigin-schema-violation',
                        error_loc,
                        f'{e.message}'
                    ))
                    # Skip further checks for this parameter if schema validation fails
                    continue

            # Custom validation: Check values/labels array length matching
            # (JSON Schema can't easily express "two arrays must have same length")
            for idx, source in enumerate(xorigin):
                source_loc = f'{location}.x-origin[{idx}]'

                if 'values' in source and 'labels' in source:
                    values = source['values']
                    labels = source['labels']

                    # Both must be arrays or both must be strings
                    if isinstance(values, list) and isinstance(labels, list):
                        if len(values) != len(labels):
                            self.violations.append(XOriginViolation(
                                self.api_name,
                                'xorigin-mismatched-array-length',
                                source_loc,
                                f'values and labels arrays must have same length: values has {len(values)}, labels has {len(labels)}'
                            ))
                    elif isinstance(values, list) != isinstance(labels, list):
                        self.violations.append(XOriginViolation(
                            self.api_name,
                            'xorigin-mismatched-types',
                            source_loc,
                            f'values and labels must both be strings or both be arrays (got {type(values).__name__} and {type(labels).__name__})'
                        ))

    def check_operation_references(self):
        """Check that all x-origin operation references are valid"""
        components = self.spec.get('components', {})
        parameters = components.get('parameters', {})

        for param_name, param_def in parameters.items():
            xorigin = param_def.get('x-origin')
            if not xorigin or not isinstance(xorigin, list):
                continue

            location = f'components.parameters.{param_name}'

            for idx, source in enumerate(xorigin):
                if 'operation' not in source or 'api' not in source:
                    continue

                operation = source['operation']
                api_ref = source['api']
                source_loc = f'{location}.x-origin[{idx}]'

                # Parse the API reference (could be "urn:api:api-name" or just "api-name")
                if api_ref.startswith('urn:api:'):
                    target_api_name = api_ref.replace('urn:api:', '')
                else:
                    target_api_name = api_ref

                # Check if referencing the same API
                if target_api_name == self.api_name:
                    if operation not in self.operation_ids:
                        self.violations.append(XOriginViolation(
                            self.api_name,
                            'xorigin-invalid-operation-reference',
                            source_loc,
                            f'References non-existent operationId "{operation}" in same API'
                        ))
                else:
                    # Cross-API reference - check if target API exists
                    if target_api_name not in self.all_apis:
                        self.violations.append(XOriginViolation(
                            self.api_name,
                            'xorigin-invalid-api-reference',
                            source_loc,
                            f'References non-existent API "{target_api_name}" (from "{api_ref}")'
                        ))
                    else:
                        # API exists, check if operation exists in target API
                        target_operation_ids = self.all_apis[target_api_name]['operation_ids']
                        if operation not in target_operation_ids:
                            self.violations.append(XOriginViolation(
                                self.api_name,
                                'xorigin-invalid-operation-reference',
                                source_loc,
                                f'References non-existent operationId "{operation}" in API "{target_api_name}"'
                            ))


def load_all_apis(repo_root: Path) -> Dict[str, Dict[str, Any]]:
    """Load all API specs and their operation IDs"""
    all_apis = {}
    apis_dir = repo_root / 'apis'

    if not apis_dir.exists():
        return all_apis

    for api_dir in sorted(apis_dir.iterdir()):
        if not api_dir.is_dir() or api_dir.name.startswith('.'):
            continue

        api_path = api_dir / 'api.yaml'
        if not api_path.exists():
            continue

        try:
            with open(api_path, 'r') as f:
                spec = yaml.safe_load(f)

            # Extract operation IDs
            operation_ids = set()
            paths = spec.get('paths', {})
            for path, path_item in paths.items():
                if not isinstance(path_item, dict):
                    continue
                for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']:
                    if method in path_item:
                        operation = path_item[method]
                        op_id = operation.get('operationId')
                        if op_id:
                            operation_ids.add(op_id)

            all_apis[api_dir.name] = {
                'spec': spec,
                'operation_ids': operation_ids
            }
        except Exception as e:
            print(f"  Warning: Could not load {api_dir.name}: {e}")

    return all_apis


def validate_all_apis(repo_root: Path, schema_path: Path) -> Dict[str, List[XOriginViolation]]:
    """Validate all APIs in the repository"""
    results = {}

    # APIs are now in the apis/ folder
    apis_dir = repo_root / 'apis'
    if not apis_dir.exists():
        print(f"  Warning: apis/ directory not found at {apis_dir}")
        return results

    # First pass: Load all APIs and their operation IDs
    print("  Loading all APIs...")
    all_apis = load_all_apis(repo_root)
    print(f"  Loaded {len(all_apis)} APIs\n")

    # Second pass: Validate each API with access to all others
    for api_dir in sorted(apis_dir.iterdir()):
        if not api_dir.is_dir():
            continue

        # Skip non-API directories
        if api_dir.name.startswith('.'):
            continue

        api_path = api_dir / 'api.yaml'
        if not api_path.exists():
            continue

        print(f"  Validating: {api_dir.name}")
        validator = XOriginValidator(api_dir, schema_path, all_apis)
        violations = validator.validate()

        if violations:
            results[api_dir.name] = violations

    return results


def main():
    # Repository root is 2 levels up from this script (scripts/build/)
    repo_root = Path(__file__).parent.parent.parent
    schema_path = repo_root / 'docs' / 'schemas' / 'x-origin.schema.json'

    print("═══════════════════════════════════════════════════════════════════")
    print("  X-Origin Validator")
    print("═══════════════════════════════════════════════════════════════════")
    print(f"  Schema: {schema_path.relative_to(repo_root)}")
    print()

    results = validate_all_apis(repo_root, schema_path)

    if not results:
        print("✅ No x-origin violations found!")
        return 0

    total_violations = sum(len(v) for v in results.values())

    print(f"❌ Found {total_violations} violations across {len(results)} APIs:\n")

    for api_name, violations in sorted(results.items()):
        print(f"📁 {api_name} ({len(violations)} violations)")

        # Group by rule
        by_rule = defaultdict(list)
        for v in violations:
            by_rule[v.rule].append(v)

        for rule, rule_violations in sorted(by_rule.items()):
            print(f"   • {rule}: {len(rule_violations)}")
            for v in rule_violations[:3]:  # Show first 3
                print(f"     - {v.location}: {v.message}")
            if len(rule_violations) > 3:
                print(f"     ... and {len(rule_violations) - 3} more")
        print()

    return 1


if __name__ == '__main__':
    sys.exit(main())
