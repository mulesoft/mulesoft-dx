#!/usr/bin/env python3
"""
Response Analyzer - Suggest output captures from API responses.

Analyzes operation responses to suggest which fields should be
captured as outputs for use in subsequent steps.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional

from .utils import load_openapi_spec, urn_to_path, resolve_ref


def suggest_outputs(
    spec: Dict[str, Any],
    operation_id: str,
    spec_path: Path,
    next_steps: List[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Suggest which response fields should be captured as outputs.

    Priority for suggestions:
    1. Fields ending in 'Id' (environmentApiId, assetId, etc.)
    2. Fields that match parameters in next_steps
    3. Top-level object fields

    Args:
        spec: OpenAPI spec
        operation_id: Operation ID to analyze
        spec_path: Path to spec file (for $ref resolution)
        next_steps: Optional list of next step definitions (to detect needed fields)

    Returns:
        List of suggested outputs:
        [
            {
                'name': 'environmentApiId',
                'path': '$response.body#/id',
                'description': 'API instance ID for use in subsequent steps',
                'used_by': ['Step 2', 'Step 3']  # if next_steps provided
            },
            ...
        ]

    Example:
        outputs = suggest_outputs(spec, 'createOrganizationsEnvironmentsApis', api_path)
        for output in outputs:
            print(f"{output['name']}: {output['path']}")
    """
    if next_steps is None:
        next_steps = []

    outputs = []

    # Find the operation
    operation = None

    if 'paths' not in spec:
        return outputs

    for path, path_item in spec['paths'].items():
        if not isinstance(path_item, dict):
            continue

        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']:
            if method in path_item:
                op = path_item[method]
                if isinstance(op, dict) and op.get('operationId') == operation_id:
                    operation = op
                    break

        if operation:
            break

    if not operation or 'responses' not in operation:
        return outputs

    # Analyze success responses (200, 201, etc.)
    responses = operation['responses']

    for status_code, response in responses.items():
        # Only look at success responses
        if not status_code.startswith('2'):
            continue

        # Resolve $ref if needed
        if isinstance(response, dict) and '$ref' in response:
            try:
                response = resolve_ref(response['$ref'], spec, spec_path)
            except:
                continue

        if 'content' not in response:
            continue

        # Look for JSON responses
        for content_type, content_spec in response['content'].items():
            if 'json' not in content_type.lower():
                continue

            if 'schema' not in content_spec:
                continue

            schema = content_spec['schema']

            # Resolve $ref if needed
            if '$ref' in schema:
                try:
                    schema = resolve_ref(schema['$ref'], spec, spec_path)
                except:
                    continue

            # Extract fields from schema
            fields = _extract_response_fields(schema, spec, spec_path)

            # Score and suggest fields
            for field_name, field_info in fields.items():
                score = _score_field_importance(
                    field_name,
                    field_info,
                    next_steps
                )

                # Only suggest high-scoring fields
                if score > 0.3:
                    output = {
                        'name': _suggest_output_name(field_name, field_info),
                        'path': generate_jsonpath(field_name),
                        'description': _generate_output_description(
                            field_name,
                            field_info,
                            next_steps
                        )
                    }

                    # Add used_by if we know which steps need this
                    used_by = _find_steps_using_field(field_name, next_steps)
                    if used_by:
                        output['used_by'] = used_by

                    outputs.append(output)

    # Sort by importance (fields ending in 'Id' first, then alphabetically)
    outputs.sort(key=lambda x: (
        not x['name'].endswith('Id'),
        x['name']
    ))

    return outputs


def _extract_response_fields(
    schema: Dict[str, Any],
    spec: Dict[str, Any],
    spec_path: Path,
    parent_path: str = ''
) -> Dict[str, Dict[str, Any]]:
    """
    Recursively extract fields from response schema.

    Args:
        schema: JSON schema object
        spec: Full OpenAPI spec (for $ref resolution)
        spec_path: Path to spec file
        parent_path: Parent field path (for nested objects)

    Returns:
        Dictionary of field definitions
    """
    fields = {}

    schema_type = schema.get('type')

    # Handle object types
    if schema_type == 'object' and 'properties' in schema:
        for prop_name, prop_schema in schema['properties'].items():
            # Resolve $ref if needed
            if isinstance(prop_schema, dict) and '$ref' in prop_schema:
                try:
                    prop_schema = resolve_ref(prop_schema['$ref'], spec, spec_path)
                except:
                    continue

            # Build full path
            full_name = f"{parent_path}/{prop_name}" if parent_path else prop_name

            fields[full_name] = {
                'name': prop_name,
                'full_path': full_name,
                'type': prop_schema.get('type', 'string'),
                'description': prop_schema.get('description', ''),
                'schema': prop_schema
            }

            # Recurse into nested objects (but not too deep)
            if prop_schema.get('type') == 'object' and len(parent_path.split('/')) < 2:
                nested_fields = _extract_response_fields(
                    prop_schema,
                    spec,
                    spec_path,
                    parent_path=full_name
                )
                fields.update(nested_fields)

    # Handle array types
    elif schema_type == 'array' and 'items' in schema:
        items_schema = schema['items']

        # Resolve $ref if needed
        if isinstance(items_schema, dict) and '$ref' in items_schema:
            try:
                items_schema = resolve_ref(items_schema['$ref'], spec, spec_path)
            except:
                return fields

        # Extract fields from array items
        if items_schema.get('type') == 'object' and 'properties' in items_schema:
            for prop_name, prop_schema in items_schema['properties'].items():
                if isinstance(prop_schema, dict) and '$ref' in prop_schema:
                    try:
                        prop_schema = resolve_ref(prop_schema['$ref'], spec, spec_path)
                    except:
                        continue

                # Array item path (e.g., data[*]/id)
                full_name = f"{parent_path}[*]/{prop_name}" if parent_path else f"[*]/{prop_name}"

                fields[full_name] = {
                    'name': prop_name,
                    'full_path': full_name,
                    'type': prop_schema.get('type', 'string'),
                    'description': prop_schema.get('description', ''),
                    'schema': prop_schema,
                    'is_array_item': True
                }

    return fields


def _score_field_importance(
    field_name: str,
    field_info: Dict[str, Any],
    next_steps: List[Dict[str, Any]]
) -> float:
    """
    Score field importance for output suggestion.

    Args:
        field_name: Field name/path
        field_info: Field metadata
        next_steps: Next step definitions

    Returns:
        Importance score (0.0 - 1.0)
    """
    score = 0.0
    base_name = field_name.split('/')[-1]

    # Priority 1: Fields ending in 'Id' (very important)
    if base_name.endswith('Id'):
        score += 0.6

    # Priority 2: Fields needed by next steps (very important)
    for step in next_steps:
        if 'inputs' in step:
            for input_name in step['inputs'].keys():
                input_base = input_name.split('.')[-1]
                if input_base == base_name or input_base == field_name:
                    score += 0.5
                    break

    # Priority 3: Common important fields
    important_names = ['id', 'name', 'status', 'url', 'uri', 'version']
    if base_name.lower() in important_names:
        score += 0.3

    # Priority 4: Top-level fields (slightly important)
    if '/' not in field_name:
        score += 0.2

    # Penalty: Array items (less important unless needed)
    if field_info.get('is_array_item'):
        score -= 0.1

    return max(0.0, min(1.0, score))


def _suggest_output_name(field_name: str, field_info: Dict[str, Any]) -> str:
    """
    Suggest a good output variable name.

    Args:
        field_name: Field name/path
        field_info: Field metadata

    Returns:
        Suggested output name

    Example:
        _suggest_output_name('data/apiId', {...}) -> 'apiId'
        _suggest_output_name('id', {...}) -> 'id'
    """
    # Use the last part of the path
    base_name = field_name.split('/')[-1].replace('[*]', '')

    return base_name


def _generate_output_description(
    field_name: str,
    field_info: Dict[str, Any],
    next_steps: List[Dict[str, Any]]
) -> str:
    """
    Generate description for output.

    Args:
        field_name: Field name/path
        field_info: Field metadata
        next_steps: Next step definitions

    Returns:
        Human-readable description
    """
    # Start with schema description if available
    base_desc = field_info.get('description', '')

    # Check if used by next steps
    used_by_steps = _find_steps_using_field(field_name, next_steps)

    if used_by_steps:
        if base_desc:
            return f"{base_desc} (used in {', '.join(used_by_steps)})"
        else:
            base_name = field_name.split('/')[-1]
            return f"{base_name} for use in {', '.join(used_by_steps)}"

    # Default description
    if base_desc:
        return base_desc

    base_name = field_name.split('/')[-1]
    if base_name.endswith('Id'):
        return f"{base_name} for use in subsequent steps"
    else:
        return f"Captured {base_name}"


def _find_steps_using_field(
    field_name: str,
    next_steps: List[Dict[str, Any]]
) -> List[str]:
    """
    Find which next steps use this field.

    Args:
        field_name: Field name/path
        next_steps: Next step definitions

    Returns:
        List of step names that use this field
    """
    using_steps = []
    base_name = field_name.split('/')[-1]

    for step in next_steps:
        step_name = step.get('name', 'Unknown')

        if 'inputs' in step:
            for input_name in step['inputs'].keys():
                input_base = input_name.split('.')[-1]
                if input_base == base_name or input_base == field_name:
                    using_steps.append(step_name)
                    break

    return using_steps


def generate_jsonpath(field_path: str) -> str:
    """
    Generate JSONPath expression for field.

    Args:
        field_path: Field path (e.g., 'id', 'data/apiId', 'items[*]/id')

    Returns:
        JSONPath expression

    Examples:
        generate_jsonpath('id') -> '$response.body#/id'
        generate_jsonpath('data/apiId') -> '$response.body#/data/apiId'
        generate_jsonpath('[*]/id') -> '$response.body#/[*]/id'
        generate_jsonpath('data[*]/id') -> '$response.body#/data[*]/id'
    """
    # Clean up path separators
    path = field_path.replace('[*]/', '[*]/')

    # Build JSONPath
    return f"$response.body#/{path}"


def analyze_response_for_operation(
    api_urn: str,
    operation_id: str,
    repo_root: Path,
    next_steps: List[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Analyze response and suggest outputs for an operation.

    Args:
        api_urn: API URN
        operation_id: Operation ID
        repo_root: Repository root
        next_steps: Optional next step definitions

    Returns:
        List of suggested outputs

    Example:
        outputs = analyze_response_for_operation(
            'urn:api:api-manager',
            'createOrganizationsEnvironmentsApis',
            Path('.'),
            next_steps
        )
    """
    if next_steps is None:
        next_steps = []

    # Load spec
    api_path = urn_to_path(api_urn, repo_root)
    spec = load_openapi_spec(api_path)

    # Suggest outputs
    return suggest_outputs(spec, operation_id, api_path, next_steps)
