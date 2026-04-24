"""MCP server spec parser.

Reads the per-directory MCP spec files and produces a normalized record the
portal can render. Each MCP server directory (``mcps/<slug>/``) is expected to
contain:

* ``exchange.json``  — Exchange metadata (name, version, visibility, ...).
* ``server.yaml``    — OpenAPI-style ``servers:`` list that describes the
                       network endpoints hosting the MCP server.
* ``mcp.yaml``       — MCP metadata conforming to ``mcp_metadata.json``:
                       transport, capabilities, tools, resources, prompts, ...
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml


def _load_yaml(path: Path) -> Optional[Dict]:
    try:
        with path.open('r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        return data if isinstance(data, dict) else {}
    except (yaml.YAMLError, OSError):
        return None


def _normalize_servers(raw: Any) -> List[Dict]:
    """Return the server list in the same shape OAS parsing uses."""
    if not isinstance(raw, list):
        return []
    servers = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        variables = {}
        for vname, vdef in (entry.get('variables') or {}).items():
            if isinstance(vdef, dict):
                variables[str(vname)] = {
                    'default': vdef.get('default', ''),
                    'description': vdef.get('description', ''),
                }
        servers.append({
            'url': str(entry.get('url', '')),
            'description': str(entry.get('description', '')),
            'variables': variables,
        })
    return servers


def _ensure_list(value: Any) -> List[Dict]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _type_stub(ptype: Optional[str]) -> Any:
    if ptype == 'string':
        return ''
    if ptype in ('integer', 'number'):
        return 0
    if ptype == 'boolean':
        return False
    if ptype == 'array':
        return []
    if ptype == 'object':
        return {}
    return ''


def _example_from_schema(schema: Any, depth: int = 0) -> Any:
    """Best-effort example generator for a JSON Schema node.

    Prefers explicit ``example``/``examples``/``default``/``enum`` when present,
    otherwise synthesizes a stub from ``type`` (and ``format`` for strings).
    Recurses into ``object.properties`` and ``array.items`` to build nested
    examples. Depth-guarded against self-referential schemas.
    """
    if not isinstance(schema, dict) or depth > 6:
        return None

    if 'example' in schema:
        return schema['example']
    if isinstance(schema.get('examples'), list) and schema['examples']:
        return schema['examples'][0]
    if 'default' in schema and schema['default'] is not None:
        return schema['default']
    if isinstance(schema.get('enum'), list) and schema['enum']:
        return schema['enum'][0]

    ptype = schema.get('type')
    if ptype == 'object':
        props = schema.get('properties') or {}
        result: Dict[str, Any] = {}
        for name, subschema in props.items():
            sample = _example_from_schema(subschema, depth + 1)
            if sample is None:
                sample = _type_stub(subschema.get('type') if isinstance(subschema, dict) else None)
            result[str(name)] = sample
        return result
    if ptype == 'array':
        items = schema.get('items') or {}
        sample = _example_from_schema(items, depth + 1)
        return [sample] if sample is not None else []
    if ptype == 'string':
        fmt = schema.get('format')
        return {
            'date-time': '2026-04-24T00:00:00Z',
            'date': '2026-04-24',
            'email': 'user@example.com',
            'uuid': '00000000-0000-0000-0000-000000000000',
            'uri': 'https://example.com',
            'uri-reference': 'https://example.com',
            'hostname': 'example.com',
        }.get(fmt, '')
    if ptype in ('integer', 'number'):
        return 0
    if ptype == 'boolean':
        return False
    return None


def _attach_complex_examples(schema: Any) -> None:
    """Mutate the schema so complex properties carry a ``_example_json`` field.

    The detail-page macro reads ``_example_json`` to pre-populate the textarea
    for object/array parameters so users see a skeleton instead of an empty box.
    """
    if not isinstance(schema, dict):
        return
    props = schema.get('properties')
    if not isinstance(props, dict):
        return
    for name, subschema in props.items():
        if not isinstance(subschema, dict):
            continue
        ptype = subschema.get('type')
        if ptype in ('object', 'array') and '_example_json' not in subschema:
            sample = _example_from_schema(subschema)
            if sample is not None:
                try:
                    subschema['_example_json'] = json.dumps(sample, indent=2)
                except (TypeError, ValueError):
                    pass


def _schema_type(schema: Dict) -> str:
    """Produce a short human-readable type string for a JSON Schema node."""
    if not isinstance(schema, dict):
        return ''
    t = schema.get('type', '')
    fmt = schema.get('format')
    if fmt:
        t = f"{t} ({fmt})" if t else fmt
    if t == 'array' and isinstance(schema.get('items'), dict):
        items_type = schema['items'].get('type', 'object')
        return f"array[{items_type}]"
    if schema.get('nullable'):
        t = (t + ', nullable') if t else 'nullable'
    return t or 'object'


def _schema_to_properties(schema: Dict) -> List[Dict]:
    """Flatten a JSON Schema into the property-list shape render_schema_table expects.

    Each entry is a dict with name, type, required, description, constraints,
    children (recursive), and the raw schema (used by the template for extra
    badges like enum / min / max).
    """
    if not isinstance(schema, dict):
        return []
    properties = schema.get('properties')
    if not isinstance(properties, dict):
        return []

    required_fields = set(schema.get('required') or [])
    result: List[Dict] = []

    for name, prop in properties.items():
        if not isinstance(prop, dict):
            continue

        constraints: List[str] = []
        if prop.get('enum'):
            constraints.append("enum: " + ', '.join(str(v) for v in prop['enum']))
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

        children: List[Dict] = []
        if prop.get('type') == 'object' and isinstance(prop.get('properties'), dict):
            children = _schema_to_properties(prop)

        result.append({
            'name': str(name),
            'type': _schema_type(prop),
            'required': str(name) in required_fields,
            'description': prop.get('description', ''),
            'constraints': constraints,
            'children': children,
            'schema': prop,
        })

    return result


def _tool_display_name(tool: Dict) -> str:
    """MCP display-name precedence for tools: title > annotations.title > name."""
    if tool.get('title'):
        return str(tool['title'])
    annotations = tool.get('annotations') or {}
    if isinstance(annotations, dict) and annotations.get('title'):
        return str(annotations['title'])
    return str(tool.get('name', ''))


def _default_display_name(item: Dict) -> str:
    """Display-name precedence for resources/prompts/templates: title > name."""
    if item.get('title'):
        return str(item['title'])
    return str(item.get('name', ''))


def parse_mcp(mcp_dir: Path) -> Optional[Dict]:
    """Parse an MCP server directory into a normalized record.

    Returns ``None`` if the directory doesn't contain the minimum required
    files (``mcp.yaml`` + either ``server.yaml`` or an Exchange ``main``).
    """
    mcp_yaml_path = mcp_dir / 'mcp.yaml'
    if not mcp_yaml_path.exists():
        return None

    mcp_data = _load_yaml(mcp_yaml_path)
    if mcp_data is None:
        return None

    server_yaml_path = mcp_dir / 'server.yaml'
    server_data = _load_yaml(server_yaml_path) if server_yaml_path.exists() else {}

    exchange_path = mcp_dir / 'exchange.json'
    exchange: Dict = {}
    if exchange_path.exists():
        try:
            exchange = json.loads(exchange_path.read_text(encoding='utf-8')) or {}
        except (json.JSONDecodeError, OSError):
            exchange = {}

    slug = mcp_dir.name
    name = (
        exchange.get('name')
        or mcp_data.get('title')
        or slug.replace('-', ' ').title() + ' MCP'
    )
    version = str(exchange.get('version') or mcp_data.get('protocolVersion') or '')
    description_full = str(mcp_data.get('description') or exchange.get('description') or '')
    description_short = (
        description_full[:200] + '...'
        if len(description_full) > 200 else description_full
    )

    transport_raw = mcp_data.get('transport') or {}
    transport = {
        'kind': str(transport_raw.get('kind', '')),
        'path': str(transport_raw.get('path', '') or ''),
        'sse_path': str(transport_raw.get('ssePath', '') or ''),
        'messages_path': str(transport_raw.get('messagesPath', '') or ''),
        'instructions': str(transport_raw.get('instructions', '') or ''),
    }

    tools = []
    for tool in _ensure_list(mcp_data.get('tools')):
        tool_copy = dict(tool)
        tool_copy['_display_name'] = _tool_display_name(tool_copy)
        input_schema = tool_copy.get('inputSchema') or {}
        _attach_complex_examples(input_schema)
        tool_copy['_input_properties'] = _schema_to_properties(input_schema)
        tool_copy['_output_properties'] = _schema_to_properties(tool_copy.get('outputSchema') or {})
        tools.append(tool_copy)

    prompts = []
    for prompt in _ensure_list(mcp_data.get('prompts')):
        prompt_copy = dict(prompt)
        prompt_copy['_display_name'] = _default_display_name(prompt_copy)
        prompts.append(prompt_copy)

    resources = []
    for resource in _ensure_list(mcp_data.get('resources')):
        resource_copy = dict(resource)
        resource_copy['_display_name'] = _default_display_name(resource_copy)
        resources.append(resource_copy)

    resource_templates = []
    for template in _ensure_list(mcp_data.get('resourceTemplates')):
        template_copy = dict(template)
        template_copy['_display_name'] = _default_display_name(template_copy)
        resource_templates.append(template_copy)

    capabilities = mcp_data.get('capabilities') or {}
    security_schemes = mcp_data.get('securitySchemes') or {}
    provider = mcp_data.get('provider') or {}

    is_private = exchange.get('visibility') == 'private'

    return {
        'id': slug,
        'slug': slug,
        'name': str(name),
        'version': version,
        'description': description_short,
        'full_description': description_full,
        'servers': _normalize_servers(server_data.get('servers')),
        'transport': transport,
        'capabilities': capabilities if isinstance(capabilities, dict) else {},
        'provider': provider if isinstance(provider, dict) else {},
        'tools': tools,
        'prompts': prompts,
        'resources': resources,
        'resource_templates': resource_templates,
        'tool_count': len(tools),
        'prompt_count': len(prompts),
        'resource_count': len(resources),
        'resource_template_count': len(resource_templates),
        'security_schemes': security_schemes if isinstance(security_schemes, dict) else {},
        'exchange': exchange,
        'private': is_private,
    }
