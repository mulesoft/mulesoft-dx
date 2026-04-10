#!/usr/bin/env python3
"""
Migrate x-origin annotations from v1 (field) to v2 (values/labels) format.

This script:
1. Finds all x-origin annotations with 'field' property
2. Attempts to determine the corresponding 'labels' path by analyzing response schemas
3. Migrates to v2 format with 'values' and optionally 'labels'
"""

import yaml
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class XOriginMigrator:
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.api_specs_cache = {}

    def load_api_spec(self, api_name: str) -> Optional[Dict]:
        """Load an API spec from its directory."""
        if api_name in self.api_specs_cache:
            return self.api_specs_cache[api_name]

        api_path = self.repo_root / api_name / "api.yaml"
        if not api_path.exists():
            print(f"  ⚠️  API spec not found: {api_path}")
            return None

        try:
            with open(api_path, 'r') as f:
                spec = yaml.safe_load(f)
                self.api_specs_cache[api_name] = spec
                return spec
        except Exception as e:
            print(f"  ⚠️  Error loading {api_path}: {e}")
            return None

    def parse_api_urn(self, urn: str) -> Optional[str]:
        """Extract API name from URN format: urn:api:api-name"""
        match = re.match(r'urn:api:(.+)', urn)
        return match.group(1) if match else None

    def find_operation_response(self, spec: Dict, operation_id: str) -> Optional[Dict]:
        """Find the 200 response schema for an operation."""
        if not spec or 'paths' not in spec:
            return None

        for path, methods in spec['paths'].items():
            for method, operation in methods.items():
                if isinstance(operation, dict) and operation.get('operationId') == operation_id:
                    responses = operation.get('responses', {})
                    success_response = responses.get('200', {})
                    content = success_response.get('content', {})

                    # Try different media types
                    for media_type in ['application/json', '*/*', 'application/*']:
                        if media_type in content:
                            return content[media_type]

        return None

    def infer_label_path(self, values_path: str, response_schema: Optional[Dict]) -> Optional[str]:
        """
        Infer the label path based on the values path and response schema.

        Common patterns:
        - $.data[*].id → $.data[*].name
        - $.id → $.name
        - $[*].id → $[*].name
        """
        if not response_schema:
            return None

        # Parse the values path to understand structure
        # Pattern: $.data[*].id → look for $.data[*].name
        # Pattern: $.id → look for $.name
        # Pattern: $[*].id → look for $[*].name

        # Simple heuristic: replace 'id' with 'name' in the path
        if '.id' in values_path:
            potential_label = values_path.replace('.id', '.name')
        elif values_path == '$.id':
            potential_label = '$.name'
        else:
            # Try displayName, title, label
            base_path = values_path.rsplit('.', 1)[0] if '.' in values_path else '$'
            for label_field in ['name', 'displayName', 'title', 'label']:
                potential_label = f"{base_path}.{label_field}"
                # For now, we'll return the first potential match
                # A more sophisticated approach would validate against the schema
                return potential_label
            return None

        return potential_label

    def migrate_xorigin(self, xorigin: Dict, api_name: str) -> Tuple[Dict, bool]:
        """
        Migrate a single x-origin entry from v1 to v2.
        Returns (migrated_xorigin, changed)
        """
        if 'field' not in xorigin:
            return xorigin, False

        # Already has values/labels - skip
        if 'values' in xorigin or 'labels' in xorigin:
            return xorigin, False

        field_value = xorigin['field']
        api_urn = xorigin.get('api', '')
        operation_id = xorigin.get('operation', '')

        # Start building v2 format
        new_xorigin = xorigin.copy()
        del new_xorigin['field']
        new_xorigin['values'] = field_value

        # Try to infer labels
        referenced_api = self.parse_api_urn(api_urn)
        if referenced_api:
            spec = self.load_api_spec(referenced_api)
            if spec:
                response = self.find_operation_response(spec, operation_id)
                label_path = self.infer_label_path(field_value, response)
                if label_path:
                    new_xorigin['labels'] = label_path

        return new_xorigin, True

    def migrate_api_spec(self, api_dir: Path) -> int:
        """Migrate all x-origin annotations in an API spec. Returns count of changes."""
        api_yaml = api_dir / "api.yaml"
        if not api_yaml.exists():
            return 0

        # Load with ruamel.yaml to preserve formatting
        try:
            from ruamel.yaml import YAML
            yaml_handler = YAML()
            yaml_handler.preserve_quotes = True
            yaml_handler.width = 4096

            with open(api_yaml, 'r') as f:
                spec = yaml_handler.load(f)
        except ImportError:
            print("  ⚠️  ruamel.yaml not found, using PyYAML (formatting may change)")
            with open(api_yaml, 'r') as f:
                spec = yaml.safe_load(f)
            yaml_handler = None

        changes = 0

        # Recursively find and migrate x-origin
        def migrate_recursive(obj):
            nonlocal changes
            if isinstance(obj, dict):
                if 'x-origin' in obj and isinstance(obj['x-origin'], list):
                    new_origins = []
                    for xorigin in obj['x-origin']:
                        if isinstance(xorigin, dict):
                            new_xorigin, changed = self.migrate_xorigin(xorigin, api_dir.name)
                            new_origins.append(new_xorigin)
                            if changed:
                                changes += 1
                        else:
                            new_origins.append(xorigin)
                    obj['x-origin'] = new_origins

                for value in obj.values():
                    migrate_recursive(value)
            elif isinstance(obj, list):
                for item in obj:
                    migrate_recursive(item)

        migrate_recursive(spec)

        if changes > 0:
            # Write back
            with open(api_yaml, 'w') as f:
                if yaml_handler:
                    yaml_handler.dump(spec, f)
                else:
                    yaml.safe_dump(spec, f, default_flow_style=False, sort_keys=False)

            print(f"  ✅ Migrated {changes} x-origin annotation(s) in {api_dir.name}")

        return changes

    def migrate_all(self):
        """Migrate all API specs in the repository."""
        print("🔄 Starting x-origin v1 to v2 migration...\n")

        total_changes = 0
        apis_changed = 0

        # Find all API directories (those with exchange.json)
        for exchange_json in self.repo_root.glob("*/exchange.json"):
            api_dir = exchange_json.parent
            changes = self.migrate_api_spec(api_dir)
            if changes > 0:
                total_changes += changes
                apis_changed += 1

        print(f"\n✨ Migration complete!")
        print(f"   - {apis_changed} API(s) changed")
        print(f"   - {total_changes} total x-origin annotation(s) migrated")


def main():
    # Determine repo root
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent

    migrator = XOriginMigrator(repo_root)
    migrator.migrate_all()


if __name__ == '__main__':
    main()
