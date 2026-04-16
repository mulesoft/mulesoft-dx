#!/usr/bin/env python3
"""
Parameter Analyzer - Detect parameter sources and build input definitions.

Analyzes operation parameters to determine where values should come from:
- Previous step outputs
- Previous step inputs (reuse)
- Other API operations (x-origin)
- Common patterns
- User-provided values
"""

from pathlib import Path
from typing import Dict, Any, List, Optional

from .utils import load_openapi_spec, urn_to_path, resolve_ref
from .common_patterns import match_common_pattern, is_likely_user_provided


def analyze_parameters(
    spec: Dict[str, Any],
    operation_id: str,
    spec_path: Path
) -> Dict[str, Dict[str, Any]]:
    """
    Extract all parameters for an operation with metadata.

    Args:
        spec: OpenAPI spec
        operation_id: Operation ID to analyze
        spec_path: Path to the spec file (for $ref resolution)

    Returns:
        Dictionary of parameter definitions:
        {
            'organizationId': {
                'name': 'organizationId',
                'location': 'path',
                'type': 'string',
                'required': True,
                'description': '...',
                'schema': {...},
                'x_origin': {...}  # if present
            },
            'asset.assetId': {
                'name': 'asset.assetId',
                'location': 'body',
                'type': 'string',
                'nested': True,
                'required': True,
                'parent': 'asset',
                ...
            }
        }

    Example:
        params = analyze_parameters(spec, 'createOrganizationsEnvironmentsApis', api_path)
        for name, info in params.items():
            print(f"{name} ({info['location']}): {info['description']}")
    """
    params = {}

    # Find the operation
    operation = None
    path_item = None

    if 'paths' not in spec:
        return params

    for path, item in spec['paths'].items():
        if not isinstance(item, dict):
            continue

        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']:
            if method in item:
                op = item[method]
                if isinstance(op, dict) and op.get('operationId') == operation_id:
                    operation = op
                    path_item = item
                    break

        if operation:
            break

    if not operation:
        return params

    # Extract path and query parameters
    all_parameters = []

    # Path-level parameters
    if path_item and 'parameters' in path_item:
        all_parameters.extend(path_item['parameters'])

    # Operation-level parameters
    if 'parameters' in operation:
        all_parameters.extend(operation['parameters'])

    for param in all_parameters:
        if isinstance(param, dict):
            # Resolve $ref if needed
            if '$ref' in param:
                try:
                    param = resolve_ref(param['$ref'], spec, spec_path)
                except:
                    continue

            param_name = param.get('name', '')
            param_in = param.get('in', 'query')
            param_schema = param.get('schema', {})

            if '$ref' in param_schema:
                try:
                    param_schema = resolve_ref(param_schema['$ref'], spec, spec_path)
                except:
                    pass

            params[param_name] = {
                'name': param_name,
                'location': param_in,
                'type': param_schema.get('type', 'string'),
                'required': param.get('required', False),
                'description': param.get('description', ''),
                'schema': param_schema,
                'x_origin': param.get('x-origin')
            }

    # Extract request body parameters (if present)
    if 'requestBody' in operation:
        request_body = operation['requestBody']

        # Resolve $ref if needed
        if '$ref' in request_body:
            try:
                request_body = resolve_ref(request_body['$ref'], spec, spec_path)
            except:
                pass

        if 'content' in request_body:
            for content_type, content_spec in request_body['content'].items():
                if 'schema' in content_spec:
                    schema = content_spec['schema']

                    # Resolve $ref if needed
                    if '$ref' in schema:
                        try:
                            schema = resolve_ref(schema['$ref'], spec, spec_path)
                        except:
                            continue

                    # Extract properties from schema
                    body_params = _extract_schema_properties(
                        schema,
                        spec,
                        spec_path,
                        parent_path='',
                        required_fields=schema.get('required', [])
                    )

                    params.update(body_params)

    return params


def _extract_schema_properties(
    schema: Dict[str, Any],
    spec: Dict[str, Any],
    spec_path: Path,
    parent_path: str = '',
    required_fields: List[str] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Recursively extract properties from schema.

    Args:
        schema: JSON schema object
        spec: Full OpenAPI spec (for $ref resolution)
        spec_path: Path to spec file
        parent_path: Parent field path (for nested objects)
        required_fields: List of required field names

    Returns:
        Dictionary of parameter definitions
    """
    if required_fields is None:
        required_fields = []

    params = {}

    if 'properties' not in schema:
        return params

    for prop_name, prop_schema in schema['properties'].items():
        # Resolve $ref if needed
        if isinstance(prop_schema, dict) and '$ref' in prop_schema:
            try:
                prop_schema = resolve_ref(prop_schema['$ref'], spec, spec_path)
            except:
                continue

        # Build full path
        full_name = f"{parent_path}.{prop_name}" if parent_path else prop_name

        param_type = prop_schema.get('type', 'string')

        params[full_name] = {
            'name': full_name,
            'location': 'body',
            'type': param_type,
            'required': prop_name in required_fields,
            'description': prop_schema.get('description', ''),
            'schema': prop_schema,
            'x_origin': prop_schema.get('x-origin')
        }

        if parent_path:
            params[full_name]['nested'] = True
            params[full_name]['parent'] = parent_path

        # Recurse into nested objects
        if param_type == 'object' and 'properties' in prop_schema:
            nested_params = _extract_schema_properties(
                prop_schema,
                spec,
                spec_path,
                parent_path=full_name,
                required_fields=prop_schema.get('required', [])
            )
            params.update(nested_params)

    return params


def detect_parameter_source(
    param_name: str,
    param_def: Dict[str, Any],
    previous_steps: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Detect where parameter value should come from.

    Priority:
    1. Previous step output (if matches)
    2. Previous step input (reuse if same parameter)
    3. x-origin annotation (from another API)
    4. Common patterns (organizationId, environmentId)
    5. User-provided (default fallback)

    Args:
        param_name: Parameter name (e.g., 'organizationId', 'asset.assetId')
        param_def: Parameter definition from analyze_parameters()
        previous_steps: List of previous step definitions (with inputs/outputs)

    Returns:
        Source detection result:
        {
            'source_type': 'from_variable' | 'from_api' | 'user_provided' | 'literal',
            'source_details': {...},
            'confidence': 'high' | 'medium' | 'low'
        }

    Example:
        source = detect_parameter_source('environmentApiId', param_def, previous_steps)
        if source['source_type'] == 'from_variable':
            print(f"Use variable {source['source_details']['variable']}")
    """
    if previous_steps is None:
        previous_steps = []

    # Extract base parameter name (without nesting)
    base_param_name = param_name.split('.')[-1]

    # Priority 1: Check if previous step outputs this value
    for step_idx, step in enumerate(previous_steps):
        if 'outputs' not in step:
            continue

        for output in step['outputs']:
            output_name = output.get('name', '')

            # Exact match or fuzzy match
            if output_name == param_name or output_name == base_param_name:
                return {
                    'source_type': 'from_variable',
                    'source_details': {
                        'variable': output_name
                    },
                    'confidence': 'high'
                }

    # Priority 2: Check if previous step used this parameter (reuse)
    for step_idx, step in enumerate(previous_steps):
        if 'inputs' not in step:
            continue

        if param_name in step['inputs'] or base_param_name in step['inputs']:
            input_key = param_name if param_name in step['inputs'] else base_param_name
            return {
                'source_type': 'from_variable',
                'source_details': {
                    'variable': input_key
                },
                'confidence': 'high'
            }

    # Priority 3: Check x-origin annotation
    if 'x_origin' in param_def and param_def['x_origin']:
        x_origin = param_def['x_origin']

        if isinstance(x_origin, dict) and 'api' in x_origin and 'operation' in x_origin:
            return {
                'source_type': 'from_api',
                'source_details': {
                    'api': x_origin['api'],
                    'operation': x_origin['operation'],
                    'field': x_origin.get('field', 'id'),
                    'name': x_origin.get('name'),
                    'alternatives': x_origin.get('alternatives', [])
                },
                'confidence': 'high'
            }

    # Priority 4: Check common patterns
    pattern = match_common_pattern(base_param_name)
    if pattern:
        if 'api' in pattern and 'operation' in pattern:
            return {
                'source_type': 'from_api',
                'source_details': pattern,
                'confidence': 'medium'
            }
        elif pattern.get('userProvided'):
            return {
                'source_type': 'user_provided',
                'source_details': {
                    'example': pattern.get('example'),
                    'description': pattern.get('description')
                },
                'confidence': 'medium'
            }

    # Priority 5: Check if likely user-provided based on name
    if is_likely_user_provided(param_name):
        return {
            'source_type': 'user_provided',
            'source_details': {
                'example': param_def.get('schema', {}).get('example'),
                'description': param_def.get('description', '')
            },
            'confidence': 'low'
        }

    # Default fallback: user-provided
    return {
        'source_type': 'user_provided',
        'source_details': {
            'example': param_def.get('schema', {}).get('example'),
            'description': param_def.get('description', '')
        },
        'confidence': 'low'
    }


def build_input_definition(
    param_name: str,
    param_def: Dict[str, Any],
    source: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Build JTBD input definition in correct format.

    Args:
        param_name: Parameter name
        param_def: Parameter definition from analyze_parameters()
        source: Source detection result from detect_parameter_source()

    Returns:
        JTBD-compliant input definition (YAML-serializable dict)

    Example:
        input_def = build_input_definition('organizationId', param_def, source)
        # Returns:
        # {
        #   'from': {
        #     'api': 'urn:api:access-management',
        #     'operation': 'getOrganizations',
        #     'values': '$.id',
        #     'labels': '$.name'
        #   },
        #   'description': 'Organization Business Group GUID'
        # }
    """
    source_type = source['source_type']
    source_details = source['source_details']

    # Base definition
    definition = {}

    if source_type == 'from_variable':
        # From a previous step's variable
        definition['from'] = {
            'variable': source_details['variable']
        }

        definition['description'] = (
            param_def.get('description') or
            f"Variable {source_details['variable']} from a previous step"
        )

    elif source_type == 'from_api':
        # From another API
        definition['from'] = {
            'api': source_details['api'],
            'operation': source_details['operation'],
            'field': source_details.get('field', 'id')
        }

        if 'name' in source_details and source_details['name']:
            definition['from']['name'] = source_details['name']

        definition['description'] = (
            source_details.get('description') or
            param_def.get('description') or
            f"Retrieved from {source_details['operation']}"
        )

        # Add alternatives if provided
        if 'alternatives' in source_details and source_details['alternatives']:
            definition['alternatives'] = source_details['alternatives']

    elif source_type == 'literal':
        # Literal value
        definition['value'] = source_details.get('value')
        definition['description'] = (
            param_def.get('description') or
            'Literal value'
        )

    else:  # user_provided
        # User-provided
        definition['userProvided'] = True
        definition['description'] = (
            param_def.get('description') or
            source_details.get('description') or
            f'User-provided {param_name}'
        )

        # Add example if available
        example = source_details.get('example') or param_def.get('schema', {}).get('example')
        if example:
            definition['example'] = str(example)

        # Add pattern if available
        pattern = param_def.get('schema', {}).get('pattern')
        if pattern:
            definition['pattern'] = pattern

    # Add required flag if parameter is required
    if param_def.get('required', False):
        definition['required'] = True

    return definition


def build_all_inputs(
    api_urn: str,
    operation_id: str,
    repo_root: Path,
    previous_steps: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Build complete inputs section for a JTBD step.

    Args:
        api_urn: API URN
        operation_id: Operation ID
        repo_root: Repository root
        previous_steps: Previous step definitions

    Returns:
        Complete inputs dictionary for JTBD

    Example:
        inputs = build_all_inputs(
            'urn:api:api-manager',
            'createOrganizationsEnvironmentsApis',
            Path('.'),
            previous_steps
        )
    """
    if previous_steps is None:
        previous_steps = []

    # Load spec and analyze parameters
    api_path = urn_to_path(api_urn, repo_root)
    spec = load_openapi_spec(api_path)
    params = analyze_parameters(spec, operation_id, api_path)

    # Build input definition for each parameter
    inputs = {}

    for param_name, param_def in params.items():
        source = detect_parameter_source(param_name, param_def, previous_steps)
        input_def = build_input_definition(param_name, param_def, source)
        inputs[param_name] = input_def

    return inputs
