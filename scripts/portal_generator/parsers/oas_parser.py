"""
OpenAPI Specification (OAS) parser.

Parses api.yaml files and extracts operations, parameters, request bodies, and responses.
Handles $ref resolution for components and external schema files.
"""

import json
from pathlib import Path
from typing import Dict, List, Any, Optional

from ruamel.yaml import YAML

_yaml_loader = YAML()
_yaml_loader.preserve_quotes = True


def resolve_ref(ref: str, components: Dict) -> Dict:
    """Resolve a $ref to its actual value from components"""
    if not ref or not ref.startswith('#/components/'):
        return {}

    parts = ref.split('/')
    if len(parts) < 4:
        return {}

    component_type = parts[2]
    component_name = parts[3]

    return components.get(component_type, {}).get(component_name, {})


def resolve_external_ref(ref: str, base_dir: Path) -> Optional[Dict]:
    """Resolve a $ref to an external file (JSON or YAML) relative to base_dir.
    Handles fragment pointers like ./constants.yaml#/deploymentTypes"""
    if not ref or ref.startswith('#'):
        return None

    # Split file path and JSON pointer fragment
    if '#' in ref:
        file_part, fragment = ref.split('#', 1)
    else:
        file_part, fragment = ref, ''

    # Guard against absurdly long paths (some examples contain inline data as path)
    if len(file_part) > 500:
        return None

    file_path = base_dir / file_part
    if not file_path.exists():
        return None

    try:
        if file_path.suffix == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = _yaml_loader.load(f)

        # Navigate fragment pointer (e.g., /deploymentTypes)
        if fragment:
            for part in fragment.strip('/').split('/'):
                if part and isinstance(data, dict):
                    data = data.get(part)
                    if data is None:
                        return None

        return data
    except Exception:
        return None


def load_example_content(ref_or_value, base_dir: Path) -> Optional[str]:
    """Load example content from inline value or external file reference.
    Returns a JSON string suitable for display."""
    try:
        if isinstance(ref_or_value, dict):
            if '$ref' in ref_or_value:
                data = resolve_external_ref(ref_or_value['$ref'], base_dir)
                if data:
                    return json.dumps(_convert_to_plain(data), indent=2)
                return None
            if 'value' in ref_or_value:
                return json.dumps(_convert_to_plain(ref_or_value['value']), indent=2)
            # Inline example object
            return json.dumps(_convert_to_plain(ref_or_value), indent=2)
        elif isinstance(ref_or_value, str):
            if len(ref_or_value) > 500:
                return None  # Not a file path
            data = resolve_external_ref(ref_or_value, base_dir)
            if data:
                return json.dumps(_convert_to_plain(data), indent=2)
    except Exception:
        return None
    return None


def _convert_to_plain(obj):
    """Convert ruamel.yaml special types to plain Python types for JSON serialization."""
    import datetime
    if isinstance(obj, dict):
        return {str(k): _convert_to_plain(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_to_plain(item) for item in obj]
    elif isinstance(obj, bool):
        return bool(obj)
    elif isinstance(obj, int):
        return int(obj)
    elif isinstance(obj, float):
        return float(obj)
    elif isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    elif hasattr(obj, 'isoformat'):
        # Handle ruamel TimeStamp and similar
        return str(obj)
    return obj


def resolve_schema(schema: Dict, base_dir: Path, depth: int = 0) -> Dict:
    """Resolve a schema, following $ref if it points to an external file.
    Returns the schema with top-level properties expanded.
    Limits depth to avoid infinite recursion."""
    if not isinstance(schema, dict) or depth > 2:
        return schema or {}

    # Handle $ref to external file
    if '$ref' in schema:
        ref = schema['$ref']
        if ref.startswith('#'):
            return schema  # Internal ref, can't resolve without full spec
        resolved = resolve_external_ref(ref, base_dir)
        if resolved and isinstance(resolved, dict):
            return resolve_schema(resolved, base_dir, depth + 1)
        return schema

    # Handle allOf: merge properties from all schemas
    if 'allOf' in schema:
        merged = {}
        merged_props = {}
        merged_required = []
        for sub in schema['allOf']:
            resolved_sub = resolve_schema(sub, base_dir, depth + 1)
            if isinstance(resolved_sub, dict):
                merged_props.update(resolved_sub.get('properties', {}))
                merged_required.extend(resolved_sub.get('required', []))
                # Keep type and description from subs
                for key in ['type', 'description']:
                    if key in resolved_sub and key not in merged:
                        merged[key] = resolved_sub[key]
        if merged_props:
            merged['properties'] = merged_props
        if merged_required:
            merged['required'] = list(set(merged_required))
        if 'type' not in merged:
            merged['type'] = 'object'
        return merged

    return schema


def extract_schema_properties(schema: Dict, base_dir: Path) -> List[Dict]:
    """Extract a flat list of property definitions from a schema for rendering.
    Returns list of {name, type, required, description, constraints, children}."""
    resolved = resolve_schema(schema, base_dir)
    if not isinstance(resolved, dict):
        return []

    properties = resolved.get('properties', {})
    required_fields = set(resolved.get('required', []))

    result = []
    for name, prop in properties.items():
        if not isinstance(prop, dict):
            continue

        # Resolve nested $ref for the property itself
        if '$ref' in prop:
            ext = resolve_external_ref(prop['$ref'], base_dir)
            if ext and isinstance(ext, dict):
                prop = ext

        prop_type = prop.get('type', '')
        if prop.get('format'):
            prop_type = f"{prop_type} ({prop['format']})"
        if prop.get('nullable'):
            prop_type += ', nullable'

        # Items type for arrays
        items = prop.get('items', {})
        if isinstance(items, dict) and prop_type.startswith('array'):
            items_type = items.get('type', 'object')
            prop_type = f"array[{items_type}]"

        constraints = []
        if prop.get('enum'):
            constraints.append(f"enum: {', '.join(str(v) for v in prop['enum'])}")
        if prop.get('default') is not None:
            constraints.append(f"default: {prop['default']}")
        if prop.get('minLength') is not None:
            constraints.append(f"minLength: {prop['minLength']}")
        if prop.get('maxLength') is not None:
            constraints.append(f"maxLength: {prop['maxLength']}")
        if prop.get('minimum') is not None:
            constraints.append(f"min: {prop['minimum']}")
        if prop.get('maximum') is not None:
            constraints.append(f"max: {prop['maximum']}")
        if prop.get('pattern'):
            constraints.append(f"pattern: {prop['pattern']}")

        # Extract nested properties for object types
        children = []
        if prop.get('type') == 'object' and 'properties' in prop:
            children = extract_schema_properties(prop, base_dir)

        result.append({
            'name': str(name),
            'type': prop_type,
            'required': str(name) in required_fields,
            'description': prop.get('description', ''),
            'constraints': constraints,
            'children': children,
            'schema': prop,  # Include raw schema for template macro
        })

    return result


def parse_oas(file_path: Path) -> Dict[str, Any]:
    """Parse OpenAPI specification efficiently"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            spec = _yaml_loader.load(f)

        if not spec or 'info' not in spec:
            print(f"  ⚠️  Warning: Invalid OAS file {file_path}")
            return None

        info = spec.get('info', {})
        paths = spec.get('paths', {})
        components = spec.get('components', {})
        base_dir = file_path.parent

        return {
            'title': info.get('title', 'Untitled API'),
            'version': info.get('version', '1.0.0'),
            'description': info.get('description', '').strip(),
            'servers': spec.get('servers', []),
            'security': spec.get('security', []),
            'security_schemes': components.get('securitySchemes', {}),
            'tags': spec.get('tags', []),
            'operations': extract_operations(paths, components, base_dir),
            'operation_count': count_operations(paths),
        }

    except Exception as e:
        print(f"  ❌ Error parsing {file_path}: {e}")
        return None


def extract_operations(paths: Dict, components: Dict = None, base_dir: Path = None) -> List[Dict]:
    """Extract all operations from paths with detailed info"""
    operations = []
    http_methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    if not paths:
        return operations

    if components is None:
        components = {}

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue

        # Path-level parameters (apply to all operations)
        path_parameters = []
        if 'parameters' in path_item:
            for param in path_item.get('parameters', []):
                if isinstance(param, dict):
                    if '$ref' in param:
                        resolved = resolve_ref(param['$ref'], components)
                        if resolved:
                            path_parameters.append(resolved)
                    else:
                        path_parameters.append(param)

        for method in http_methods:
            if method in path_item:
                op = path_item[method]
                if not isinstance(op, dict):
                    continue

                # Extract parameters (combine path-level and operation-level)
                parameters = []

                for param in path_parameters:
                    parameters.append(_extract_param(param))

                if 'parameters' in op:
                    for param in op.get('parameters', []):
                        if isinstance(param, dict):
                            if '$ref' in param:
                                resolved = resolve_ref(param['$ref'], components)
                                if resolved:
                                    param = resolved
                            parameters.append(_extract_param(param))

                # Extract request body with resolved schemas and examples
                request_body = None
                if 'requestBody' in op:
                    rb = op['requestBody']
                    if isinstance(rb, dict):
                        request_body = _extract_request_body(rb, base_dir)

                # Extract responses with resolved schemas and examples
                responses = {}
                if 'responses' in op:
                    for status, response in op.get('responses', {}).items():
                        if isinstance(response, dict):
                            responses[str(status)] = _extract_response(response, base_dir)

                operations.append({
                    'method': method.upper(),
                    'path': path,
                    'operationId': op.get('operationId', f"{method}_{path.replace('/', '_')}"),
                    'summary': op.get('summary', ''),
                    'description': op.get('description', ''),
                    'deprecated': op.get('deprecated', False),
                    'tags': [str(t) for t in op.get('tags', [])],
                    'parameters': parameters,
                    'requestBody': request_body,
                    'responses': responses,
                    'security': op.get('security', None),
                })

    return operations


def _extract_param(param: Dict) -> Dict:
    """Extract a parameter dict with schema details."""
    schema = param.get('schema', {})
    if not isinstance(schema, dict):
        schema = {}

    return {
        'name': param.get('name', ''),
        'in': param.get('in', ''),
        'required': param.get('required', False),
        'description': param.get('description', ''),
        'schema': schema,
        'x-origin': param.get('x-origin', None)
    }


def _extract_request_body(rb: Dict, base_dir: Path = None) -> Dict:
    """Extract request body with resolved schema properties and examples."""
    result = {
        'required': rb.get('required', False),
        'description': rb.get('description', ''),
        'content_types': [],
        'schemas': {},
        'raw_schemas': {},
        'examples': {},
    }

    content = rb.get('content', {})
    for content_type, media_type in content.items():
        if not isinstance(media_type, dict):
            continue
        ct = str(content_type)
        result['content_types'].append(ct)

        # Resolve schema (raw + flattened)
        if 'schema' in media_type and base_dir:
            resolved = resolve_schema(media_type['schema'], base_dir)
            if resolved:
                result['raw_schemas'][ct] = _convert_to_plain(resolved)
            props = extract_schema_properties(media_type['schema'], base_dir)
            if props:
                result['schemas'][ct] = props

        # Load examples
        if base_dir:
            if 'example' in media_type:
                ex = load_example_content(media_type['example'], base_dir)
                if ex:
                    result['examples'][ct] = {'Default': ex}
            elif 'examples' in media_type:
                named = {}
                for ex_name, ex_val in media_type.get('examples', {}).items():
                    ex = load_example_content(ex_val, base_dir)
                    if ex:
                        named[str(ex_name)] = ex
                if named:
                    result['examples'][ct] = named

    return result


def _extract_response(response: Dict, base_dir: Path = None) -> Dict:
    """Extract a response with resolved schema properties and examples."""
    result = {
        'description': response.get('description', ''),
        'content_types': [],
        'schemas': {},
        'examples': {},
    }

    content = response.get('content', {})
    for content_type, media_type in content.items():
        if not isinstance(media_type, dict):
            continue
        ct = str(content_type)
        result['content_types'].append(ct)

        # Resolve schema
        if 'schema' in media_type and base_dir:
            props = extract_schema_properties(media_type['schema'], base_dir)
            if props:
                result['schemas'][ct] = props

        # Load examples
        if base_dir:
            if 'example' in media_type:
                ex = load_example_content(media_type['example'], base_dir)
                if ex:
                    result['examples'][ct] = {'Default': ex}
            elif 'examples' in media_type:
                named = {}
                for ex_name, ex_val in media_type.get('examples', {}).items():
                    ex = load_example_content(ex_val, base_dir)
                    if ex:
                        named[str(ex_name)] = ex
                if named:
                    result['examples'][ct] = named

    return result


def count_operations(paths: Dict) -> int:
    """Count total operations"""
    if not paths:
        return 0

    count = 0
    http_methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        count += sum(1 for method in http_methods if method in path_item)

    return count
