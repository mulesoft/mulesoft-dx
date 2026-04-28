#!/usr/bin/env python3
"""
Add examples to all endpoints missing them.

Generates appropriate examples based on response codes and operation types.
"""

import sys
import yaml
from pathlib import Path
from typing import Dict, Any


def generate_example_for_response(status_code: str, operation_id: str, method: str) -> Dict[str, Any]:
    """Generate appropriate example based on status code and operation."""

    # 204 No Content - no body
    if status_code == '204':
        return None

    # 202 Accepted
    if status_code == '202':
        return {
            "message": "Request accepted for processing"
        }

    # 201 Created
    if status_code == '201':
        return {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "message": "Resource created successfully"
        }

    # 200 OK - vary by operation type
    if status_code == '200' or status_code.startswith('2'):
        if method.lower() == 'delete':
            return {"message": "Resource deleted successfully"}

        if method.lower() in ['put', 'patch']:
            return {"message": "Resource updated successfully"}

        if method.lower() == 'head':
            return None  # HEAD has no body

        if method.lower() == 'get':
            # List operations
            if operation_id.lower().startswith('list'):
                return {
                    "total": 0,
                    "data": []
                }
            # Get operations
            else:
                return {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "name": "Example Resource"
                }

        if method.lower() == 'post':
            return {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "message": "Resource created successfully"
            }

    # 400 Bad Request
    if status_code == '400':
        return {
            "error": "Bad Request",
            "message": "Invalid request parameters"
        }

    # 404 Not Found
    if status_code == '404':
        return {
            "error": "Not Found",
            "message": "Resource not found"
        }

    # 409 Conflict
    if status_code == '409':
        return {
            "error": "Conflict",
            "message": "Resource already exists or conflicts with existing state"
        }

    # Default
    return {"message": "Success"}


def add_examples_to_operation(operation: Dict[str, Any], operation_id: str, method: str) -> int:
    """Add examples to an operation. Returns count of examples added."""
    count = 0

    # Check if operation already has examples in responses
    responses = operation.get('responses', {})

    for status_code, response in responses.items():
        if not isinstance(response, dict):
            continue

        # Skip if response has no content (like 204)
        content = response.get('content', {})

        if not content:
            # For status codes that typically have no content
            if status_code in ['204', '304']:
                continue
            # Add content section for other codes
            example_data = generate_example_for_response(status_code, operation_id, method)
            if example_data is not None:
                response['content'] = {
                    'application/json': {
                        'example': example_data
                    }
                }
                count += 1
            continue

        # Check each media type
        for media_type, schema_info in content.items():
            # Skip if already has examples
            if 'example' in schema_info or 'examples' in schema_info:
                continue

            # Generate and add example
            example_data = generate_example_for_response(status_code, operation_id, method)

            if example_data is not None:
                schema_info['example'] = example_data
                count += 1

    # Add examples to request body if missing
    request_body = operation.get('requestBody', {})
    if request_body:
        content = request_body.get('content', {})
        for media_type, schema_info in content.items():
            # Skip if already has examples
            if 'example' in schema_info or 'examples' in schema_info:
                continue

            # Skip binary/file uploads
            schema = schema_info.get('schema', {})
            if schema.get('type') == 'object':
                properties = schema.get('properties', {})
                # Check if it's a file upload (has binary format)
                has_binary = any(
                    prop.get('format') == 'binary'
                    for prop in properties.values()
                    if isinstance(prop, dict)
                )

                if has_binary:
                    continue

            # Generate request example based on method
            if method.lower() == 'post':
                example_data = {
                    "name": "Example Resource",
                    "description": "Example description"
                }
            elif method.lower() in ['put', 'patch']:
                example_data = {
                    "name": "Updated Resource",
                    "description": "Updated description"
                }
            else:
                example_data = {}

            if example_data:
                schema_info['example'] = example_data
                count += 1

    return count


def add_examples(spec: Dict[str, Any]) -> int:
    """Add examples to all endpoints. Returns count added."""
    total_count = 0
    paths = spec.get('paths', {})

    for path, methods in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']:
            if method in methods:
                operation = methods[method]
                if isinstance(operation, dict):
                    operation_id = operation.get('operationId', method)

                    count = add_examples_to_operation(operation, operation_id, method)

                    if count > 0:
                        total_count += count
                        print(f"  {method.upper():6s} {path:80s} (+{count} examples)")

    return total_count


def main():
    if len(sys.argv) < 2:
        print("Usage: python add_examples.py <spec-file.yaml>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    print(f"Loading spec from: {input_path}")

    # Load YAML
    with open(input_path, 'r') as f:
        spec = yaml.safe_load(f)

    print("\n" + "="*80)
    print("ADDING EXAMPLES TO ENDPOINTS")
    print("="*80 + "\n")

    # Add examples
    examples_added = add_examples(spec)

    print(f"\n✓ Added {examples_added} examples")

    # Save updated spec
    print(f"\nSaving updated spec to: {input_path}")
    with open(input_path, 'w') as f:
        yaml.dump(spec, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print("\n" + "="*80)
    print("✅ COMPLETED")
    print("="*80)
    print(f"\nRun validator to check:")
    print(f"  anypoint-cli-v4 api-project validate --json --location={input_path.parent}")


if __name__ == "__main__":
    main()
