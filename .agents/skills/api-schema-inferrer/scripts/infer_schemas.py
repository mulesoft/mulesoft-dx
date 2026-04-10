#!/usr/bin/env python3
"""
Schema Inference Tool for OpenAPI Specifications

Automatically infers JSON schemas from examples in request/response bodies
and adds them to the OAS file when schemas are missing.
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, List, Union
from copy import deepcopy

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(1)


def infer_type(value: Any) -> str:
    """Infer JSON Schema type from a value"""
    if value is None:
        return "null"
    elif isinstance(value, bool):
        return "boolean"
    elif isinstance(value, int):
        return "integer"
    elif isinstance(value, float):
        return "number"
    elif isinstance(value, str):
        return "string"
    elif isinstance(value, list):
        return "array"
    elif isinstance(value, dict):
        return "object"
    return "string"


def infer_schema_from_value(value: Any, key_name: str = None) -> Dict[str, Any]:
    """
    Recursively infer a JSON Schema from a value.

    Args:
        value: The value to infer schema from
        key_name: Optional key name for better descriptions

    Returns:
        A JSON Schema object
    """
    schema = {}
    value_type = infer_type(value)
    schema["type"] = value_type

    # Add description placeholder
    if key_name:
        schema["description"] = f"Auto-generated from example. TODO: Add meaningful description for '{key_name}'"
    else:
        schema["description"] = "Auto-generated from example. TODO: Add meaningful description"

    if value_type == "object" and isinstance(value, dict):
        schema["properties"] = {}
        required_fields = []

        for key, val in value.items():
            schema["properties"][key] = infer_schema_from_value(val, key)
            # Mark all fields as required by default (conservative approach)
            required_fields.append(key)

        if required_fields:
            schema["required"] = required_fields

    elif value_type == "array" and isinstance(value, list):
        if value:
            # Infer from first item
            first_item = value[0]
            schema["items"] = infer_schema_from_value(first_item)
        else:
            # Empty array - use generic object
            schema["items"] = {"type": "object"}

    elif value_type == "string":
        # Try to detect common patterns
        if isinstance(value, str):
            if "@" in value and "." in value:
                schema["format"] = "email"
            elif value.startswith("http://") or value.startswith("https://"):
                schema["format"] = "uri"
            elif len(value) == 10 and value.count("-") == 2:
                # Might be a date like 2024-01-01
                schema["format"] = "date"

    return schema


def process_media_type_content(content: Dict[str, Any], location: str) -> bool:
    """
    Process a content dictionary (from requestBody or response) to infer schema from examples.

    Returns:
        True if schema was added, False otherwise
    """
    schema_added = False

    for media_type, media_info in content.items():
        # Skip if schema already exists
        if "schema" in media_info:
            continue

        # Look for examples or example
        example_value = None

        if "examples" in media_info:
            # Get first example
            examples = media_info["examples"]
            if isinstance(examples, dict):
                first_example_key = next(iter(examples.keys()), None)
                if first_example_key:
                    example_obj = examples[first_example_key]
                    if "value" in example_obj:
                        example_value = example_obj["value"]

        elif "example" in media_info:
            example_value = media_info["example"]

        # Infer schema from example
        if example_value is not None:
            inferred_schema = infer_schema_from_value(example_value)
            media_info["schema"] = inferred_schema
            schema_added = True
            print(f"  ✓ Added schema to {location} ({media_type})")

    return schema_added


def process_operation(path: str, method: str, operation: Dict[str, Any]) -> int:
    """
    Process a single operation to infer schemas from examples.

    Returns:
        Number of schemas added
    """
    schemas_added = 0
    endpoint = f"{method.upper()} {path}"

    # Process request body
    if "requestBody" in operation:
        request_body = operation["requestBody"]
        if "content" in request_body:
            if process_media_type_content(
                request_body["content"],
                f"{endpoint} (request)"
            ):
                schemas_added += 1

    # Process responses
    if "responses" in operation:
        for status_code, response in operation["responses"].items():
            if "content" in response:
                if process_media_type_content(
                    response["content"],
                    f"{endpoint} (response {status_code})"
                ):
                    schemas_added += 1

    return schemas_added


def infer_schemas(spec: Dict[str, Any]) -> int:
    """
    Process entire OAS spec and infer schemas from examples.

    Returns:
        Number of schemas added
    """
    total_schemas_added = 0

    # Process paths
    paths = spec.get("paths", {})

    for path, methods in paths.items():
        for method in ["get", "post", "put", "patch", "delete", "options", "head"]:
            if method in methods:
                operation = methods[method]
                schemas_added = process_operation(path, method, operation)
                total_schemas_added += schemas_added

    return total_schemas_added


def load_spec(file_path: Path) -> Dict[str, Any]:
    """Load OAS file (YAML or JSON)"""
    with open(file_path, 'r') as f:
        content = f.read()

        # Try YAML first
        try:
            return yaml.safe_load(content)
        except yaml.YAMLError:
            # Try JSON
            try:
                return json.loads(content)
            except json.JSONDecodeError as e:
                print(f"Error: Failed to parse {file_path} as YAML or JSON: {e}")
                sys.exit(1)


def save_spec(spec: Dict[str, Any], file_path: Path, original_format: str = "yaml"):
    """Save OAS file preserving original format"""
    with open(file_path, 'w') as f:
        if original_format == "json":
            json.dump(spec, f, indent=2)
        else:
            yaml.dump(spec, f, default_flow_style=False, sort_keys=False, allow_unicode=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: python infer_schemas.py <path-to-spec.yaml> [--dry-run]")
        print("\nInfers JSON schemas from examples in the OAS file and adds them where missing.")
        print("\nOptions:")
        print("  --dry-run    Show what would be changed without modifying the file")
        sys.exit(1)

    spec_path = Path(sys.argv[1])
    dry_run = "--dry-run" in sys.argv

    if not spec_path.exists():
        print(f"Error: File not found: {spec_path}")
        sys.exit(1)

    print(f"\n{'DRY RUN - ' if dry_run else ''}Inferring schemas from examples...")
    print(f"File: {spec_path}\n")

    # Detect format
    original_format = "json" if spec_path.suffix.lower() == ".json" else "yaml"

    # Load spec
    spec = load_spec(spec_path)

    # Make a copy for comparison if dry run
    if dry_run:
        spec_copy = deepcopy(spec)
        schemas_added = infer_schemas(spec_copy)
    else:
        schemas_added = infer_schemas(spec)

    print(f"\n{'Would add' if dry_run else 'Added'} {schemas_added} schema(s)")

    if schemas_added == 0:
        print("\n✓ No schemas to infer. All examples already have schemas defined.")
        sys.exit(0)

    if not dry_run:
        # Backup original file
        backup_path = spec_path.with_suffix(spec_path.suffix + ".backup")
        print(f"\nCreating backup: {backup_path}")
        with open(spec_path, 'r') as src, open(backup_path, 'w') as dst:
            dst.write(src.read())

        # Save updated spec
        save_spec(spec, spec_path, original_format)
        print(f"\n✓ Updated {spec_path}")
        print("\n⚠️  Note: Generated schemas have placeholder descriptions.")
        print("   Please review and update the 'TODO' descriptions with meaningful text.")
    else:
        print("\n✓ Dry run complete. Use without --dry-run to apply changes.")


if __name__ == "__main__":
    main()
