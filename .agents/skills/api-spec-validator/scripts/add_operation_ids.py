#!/usr/bin/env python3
"""
Auto-generate operation IDs for API specs

This script adds descriptive operationIds to all endpoints in an OpenAPI spec.
"""

import sys
import yaml
import re
from pathlib import Path
from typing import Dict, Any


def path_to_operation_name(path: str, method: str) -> str:
    """
    Generate a descriptive operation ID from path and method.

    Examples:
        GET /organizations/{orgId}/apis -> listOrganizationApis
        POST /organizations/{orgId}/apis -> createOrganizationApi
        DELETE /apis/{apiId}/contracts/{contractId} -> deleteApiContract
    """
    # Remove parameters and split by /
    segments = []
    for segment in path.split('/'):
        if segment and not segment.startswith('{'):
            # Convert kebab-case to camelCase
            parts = segment.split('-')
            if len(parts) > 1:
                camel = parts[0] + ''.join(p.capitalize() for p in parts[1:])
                segments.append(camel)
            else:
                segments.append(segment)

    # Build the operation name
    if not segments:
        return f"{method}Resource"

    # Method prefix mapping
    method_prefix = {
        'get': 'get' if len(segments) > 1 and not path.endswith('s') else 'list',
        'post': 'create',
        'put': 'update',
        'patch': 'update',
        'delete': 'delete',
        'head': 'check'
    }

    # Check if path ends with a parameter (detail view)
    has_id_param = re.search(r'\{[^}]*id[^}]*\}$', path.lower())

    prefix = method_prefix.get(method.lower(), method.lower())

    # For GET requests, determine if list or get
    if method.lower() == 'get':
        if has_id_param:
            prefix = 'get'
        else:
            prefix = 'list'

    # Build camelCase operation name
    operation_parts = [prefix] + [s.capitalize() for s in segments]
    operation_name = ''.join(operation_parts)

    # Handle special cases
    operation_name = operation_name.replace('Apis', 'Apis')
    operation_name = operation_name.replace('Api', 'Api')

    return operation_name


def add_operation_ids(spec: Dict[str, Any]) -> int:
    """Add operation IDs to all endpoints missing them. Returns count added."""
    count = 0
    paths = spec.get('paths', {})

    for path, methods in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']:
            if method in methods:
                operation = methods[method]
                if isinstance(operation, dict) and 'operationId' not in operation:
                    operation_id = path_to_operation_name(path, method)
                    operation['operationId'] = operation_id
                    count += 1
                    print(f"  Added: {method.upper():6s} {path:80s} -> {operation_id}")

    return count


def add_basic_examples(spec: Dict[str, Any]) -> int:
    """Add basic examples to responses where missing. Returns count added."""
    count = 0
    paths = spec.get('paths', {})

    for path, methods in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']:
            if method in methods:
                operation = methods[method]
                if not isinstance(operation, dict):
                    continue

                responses = operation.get('responses', {})
                for status_code, response in responses.items():
                    if not isinstance(response, dict):
                        continue

                    content = response.get('content', {})
                    for media_type, schema_info in content.items():
                        if 'examples' not in schema_info and 'example' not in schema_info:
                            # Add a basic example placeholder
                            schema_info['example'] = {
                                "message": "Example response data"
                            }
                            count += 1

    return count


def fix_inline_schemas(spec: Dict[str, Any]) -> int:
    """Add required arrays to inline schemas that are missing them."""
    count = 0
    paths = spec.get('paths', {})

    for path, methods in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete']:
            if method in methods:
                operation = methods[method]
                if not isinstance(operation, dict):
                    continue

                # Fix request body schemas
                request_body = operation.get('requestBody', {})
                if request_body:
                    content = request_body.get('content', {})
                    for media_type, schema_info in content.items():
                        schema = schema_info.get('schema', {})
                        if isinstance(schema, dict) and 'properties' in schema and 'required' not in schema:
                            schema['required'] = []
                            count += 1

                # Fix response schemas
                responses = operation.get('responses', {})
                for status_code, response in responses.items():
                    if not isinstance(response, dict):
                        continue
                    content = response.get('content', {})
                    for media_type, schema_info in content.items():
                        schema = schema_info.get('schema', {})
                        if isinstance(schema, dict) and 'properties' in schema and 'required' not in schema:
                            schema['required'] = []
                            count += 1

    return count


def main():
    if len(sys.argv) < 2:
        print("Usage: python add_operation_ids.py <spec-file.yaml> [output-file.yaml]")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else input_path

    print(f"Loading spec from: {input_path}")

    # Load YAML
    with open(input_path, 'r') as f:
        spec = yaml.safe_load(f)

    print("\n" + "="*80)
    print("ADDING OPERATION IDs")
    print("="*80 + "\n")

    # Add operation IDs
    ops_added = add_operation_ids(spec)

    print(f"\n✓ Added {ops_added} operation IDs")

    # Add examples
    print("\nAdding basic examples to responses...")
    examples_added = add_basic_examples(spec)
    print(f"✓ Added {examples_added} example placeholders")

    # Fix inline schemas
    print("\nFixing inline schemas...")
    schemas_fixed = fix_inline_schemas(spec)
    print(f"✓ Fixed {schemas_fixed} schemas with missing required arrays")

    # Save updated spec
    print(f"\nSaving updated spec to: {output_path}")
    with open(output_path, 'w') as f:
        yaml.dump(spec, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print("\n" + "="*80)
    print("✅ COMPLETED")
    print("="*80)
    print(f"\nSummary:")
    print(f"  - Operation IDs added: {ops_added}")
    print(f"  - Examples added: {examples_added}")
    print(f"  - Schemas fixed: {schemas_fixed}")
    print(f"\nRun validator to check remaining issues:")
    print(f"  anypoint-cli-v4 api-project validate --json --location={output_path.parent}")


if __name__ == "__main__":
    main()
