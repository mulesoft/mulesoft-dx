"""MCP server spec parser.

Reads the per-directory MCP spec files and produces a normalized record the
portal can render. Each MCP server directory (``mcps/<slug>/``) is expected to
contain:

* ``server.json``   — MCP server descriptor following
                      https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
                      (name, title, description, version, remotes, ...).
                      Authoritative for display fields and endpoint URLs.
* ``exchange.json`` — Exchange publishing metadata. Supplies the ``tags`` list
                      surfaced on the homepage tag search.
* ``mcp.yaml``      — Tool / prompt / resource definitions (capabilities,
                      tools, prompts, resources, resourceTemplates, ...).
                      Structural parts not covered by the registry schema.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import yaml


def _load_yaml(path: Path) -> Optional[Dict]:
    try:
        with path.open('r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        return data if isinstance(data, dict) else {}
    except (yaml.YAMLError, OSError):
        return None


_TRANSPORT_ALIASES = {
    'streamable-http': 'streamableHttp',
    'streamable_http': 'streamableHttp',
    'streamableHttp': 'streamableHttp',
    'sse': 'sse',
    'stdio': 'stdio',
}


def _normalize_remote(entry: Dict) -> Dict:
    """Convert a server.json ``remotes[]`` entry into the portal's server shape.

    The ``url`` stays as-is (fully-qualified endpoint). We keep an empty
    ``variables`` dict so downstream code that assumes OAS templating still
    works — in the new schema each region/env gets its own remote entry.
    """
    kind = _TRANSPORT_ALIASES.get(str(entry.get('type', '')), str(entry.get('type', '')))
    return {
        'url': str(entry.get('url', '')),
        'description': str(entry.get('description', '')),
        'variables': {},
        '_transport_kind': kind,
    }


def _normalize_remotes(raw: Any) -> List[Dict]:
    """Normalize the server.json ``remotes`` array into our server list."""
    if not isinstance(raw, list):
        return []
    return [_normalize_remote(entry) for entry in raw if isinstance(entry, dict)]


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

    # anyOf / oneOf: try each branch, skipping 'null' branches first.
    for key in ('anyOf', 'oneOf'):
        branches = schema.get(key)
        if isinstance(branches, list) and branches:
            non_null = [b for b in branches if not (isinstance(b, dict) and b.get('type') == 'null')]
            for branch in non_null or branches:
                sample = _example_from_schema(branch, depth + 1)
                if sample is not None:
                    return sample
            return None

    ptype = schema.get('type')
    # Draft-style `type: [string, 'null']` — pick the first non-null entry.
    if isinstance(ptype, list):
        for candidate in ptype:
            if candidate and candidate != 'null':
                return _example_from_schema({**schema, 'type': candidate}, depth + 1)
        return None
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


def _primary_type(schema: Any) -> str:
    """Pick the concrete type to render an input control for.

    For ``anyOf``/``oneOf`` or ``type: [T, 'null']`` unions, returns the first
    non-null branch type. Schemas with no ``type`` constraint fall back to
    ``'any'`` — the JSON Schema convention for "no type restriction".
    """
    if not isinstance(schema, dict):
        return 'any'
    for key in ('anyOf', 'oneOf'):
        branches = schema.get(key)
        if isinstance(branches, list):
            for b in branches:
                if isinstance(b, dict) and b.get('type') and b.get('type') != 'null':
                    return str(b['type'])
    t = schema.get('type')
    if isinstance(t, list):
        for candidate in t:
            if candidate and candidate != 'null':
                return str(candidate)
        return 'any'
    return str(t) if t else 'any'


def _attach_input_hints(schema: Any) -> None:
    """Mutate the schema so each property carries render hints used by the UI.

    Adds:
      - ``_display_type``: union-aware type label (e.g. 'string | null').
      - ``_primary_type``: concrete type for the input control.
      - ``_example_json``: pretty-printed JSON example for object/array inputs.
    """
    if not isinstance(schema, dict):
        return
    props = schema.get('properties')
    if not isinstance(props, dict):
        return
    for name, subschema in props.items():
        if not isinstance(subschema, dict):
            continue
        subschema.setdefault('_display_type', _schema_type(subschema))
        subschema.setdefault('_primary_type', _primary_type(subschema))
        primary = subschema['_primary_type']
        if primary in ('object', 'array') and '_example_json' not in subschema:
            sample = _example_from_schema(subschema)
            if sample is not None:
                try:
                    subschema['_example_json'] = json.dumps(sample, indent=2)
                except (TypeError, ValueError):
                    pass
        # Recurse into nested object properties so deep unions still render.
        if primary == 'object':
            _attach_input_hints(subschema)


def _schema_type(schema: Dict) -> str:
    """Produce a short human-readable type string for a JSON Schema node.

    Collapses ``anyOf`` / ``oneOf`` unions and JSON-Schema-draft-style
    ``type: [string, 'null']`` lists into ``"T1 | T2"`` form.
    """
    if not isinstance(schema, dict):
        return ''

    # Union via anyOf / oneOf
    for key in ('anyOf', 'oneOf'):
        branches = schema.get(key)
        if isinstance(branches, list) and branches:
            parts = [p for p in (_schema_type(b) for b in branches) if p]
            if parts:
                return ' | '.join(parts)

    # Union via type: [string, 'null']
    t = schema.get('type', '')
    if isinstance(t, list):
        return ' | '.join(str(x) for x in t if x) or 'any'

    fmt = schema.get('format')
    if fmt:
        t = f"{t} ({fmt})" if t else fmt
    if t == 'array' and isinstance(schema.get('items'), dict):
        items_type = _schema_type(schema['items'])
        return f"array[{items_type or 'any'}]"
    if schema.get('nullable'):
        t = (t + ' | null') if t else 'null'
    return t or 'any'


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


def _uri_authority(uri: str) -> str:
    """Return the authority (first path segment) of a ``scheme://authority/...`` URI.

    ``ui://api-instance/policies.html`` → ``'api-instance'``.
    Empty/malformed URIs yield ``''``.
    """
    if not isinstance(uri, str) or '://' not in uri:
        return ''
    remainder = uri.split('://', 1)[1]
    if not remainder:
        return ''
    # Authority is everything up to the next '/'.
    authority = remainder.split('/', 1)[0]
    return authority.strip()


def _extract_tool_ui_resource(tool: Dict) -> str:
    """Pull the ui/resourceUri hint out of a tool's ``_meta`` block.

    Accepts both the flat ``ui/resourceUri`` key and the nested
    ``ui: { resourceUri: ... }`` shape for tolerance.
    """
    meta = tool.get('_meta')
    if not isinstance(meta, dict):
        return ''
    flat = meta.get('ui/resourceUri')
    if isinstance(flat, str) and flat.strip():
        return flat.strip()
    ui = meta.get('ui')
    if isinstance(ui, dict):
        nested = ui.get('resourceUri')
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    return ''


def _default_display_name(item: Dict) -> str:
    """Display-name precedence for resources/prompts/templates: title > name."""
    if item.get('title'):
        return str(item['title'])
    return str(item.get('name', ''))


def _collect_xorigin_refs(tools: List[Dict]) -> Tuple[Set[str], Set[str]]:
    """Scan tool inputSchema properties for x-origin and collect referenced slugs."""
    api_refs: Set[str] = set()
    mcp_refs: Set[str] = set()
    for tool in tools:
        schema = tool.get('inputSchema') or {}
        for _name, prop_def in (schema.get('properties') or {}).items():
            if not isinstance(prop_def, dict):
                continue
            xorigin = prop_def.get('x-origin')
            if not isinstance(xorigin, list):
                continue
            for source in xorigin:
                if not isinstance(source, dict):
                    continue
                api_urn = source.get('api', '')
                if api_urn.startswith('urn:api:'):
                    api_refs.add(api_urn[len('urn:api:'):])
                elif api_urn.startswith('urn:mcp:'):
                    mcp_refs.add(api_urn[len('urn:mcp:'):])
    return api_refs, mcp_refs


def parse_mcp(mcp_dir: Path) -> Optional[Dict]:
    """Parse an MCP server directory into a normalized record.

    Requires ``server.json`` (MCP registry descriptor) and ``mcp.yaml``
    (tool/prompt/resource definitions). ``exchange.json`` is optional and
    contributes the ``tags`` list used by the homepage tag search.
    """
    mcp_yaml_path = mcp_dir / 'mcp.yaml'
    if not mcp_yaml_path.exists():
        return None
    mcp_data = _load_yaml(mcp_yaml_path)
    if mcp_data is None:
        return None

    server_json_path = mcp_dir / 'server.json'
    if not server_json_path.exists():
        return None
    try:
        server_data = json.loads(server_json_path.read_text(encoding='utf-8')) or {}
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(server_data, dict):
        return None

    exchange_path = mcp_dir / 'exchange.json'
    exchange: Dict = {}
    if exchange_path.exists():
        try:
            exchange = json.loads(exchange_path.read_text(encoding='utf-8')) or {}
        except (json.JSONDecodeError, OSError):
            exchange = {}

    slug = mcp_dir.name

    # Display fields come straight from server.json (registry schema).
    name = (
        server_data.get('title')
        or server_data.get('name')
        or slug.replace('-', ' ').title() + ' MCP'
    )
    version = str(server_data.get('version') or '')
    description_full = str(server_data.get('description') or '')
    description_short = (
        description_full[:200] + '...'
        if len(description_full) > 200 else description_full
    )
    website_url = str(server_data.get('websiteUrl') or '')

    # Tags now come from exchange.json. Accept either the OpenAPI-style
    # [{name, description}] list or a flat [string, string] list.
    raw_tags = exchange.get('tags') if isinstance(exchange, dict) else []
    tags: List[Dict] = []
    tag_names: List[str] = []
    if isinstance(raw_tags, list):
        for entry in raw_tags:
            if isinstance(entry, dict) and entry.get('name'):
                tags.append({
                    'name': str(entry['name']),
                    'description': str(entry.get('description', '')),
                })
                tag_names.append(str(entry['name']))
            elif isinstance(entry, str) and entry.strip():
                tags.append({'name': entry.strip(), 'description': ''})
                tag_names.append(entry.strip())

    # Servers + transport derive from server.json remotes[]. Each remote's
    # ``url`` is the full endpoint — the try-it console posts to it directly.
    servers = _normalize_remotes(server_data.get('remotes'))
    primary_remote = next(
        (s for s in servers if s.get('_transport_kind') == 'streamableHttp'),
        servers[0] if servers else None,
    )
    transport = {
        'kind': str(primary_remote.get('_transport_kind', '')) if primary_remote else '',
        # Kept for backwards compatibility with the overview template; the
        # full URL already includes any path so these are unused by the
        # try-it console but still useful in view-only displays.
        'path': '',
        'sse_path': '',
        'messages_path': '',
        'instructions': '',
    }

    # Resources first so we can link tools' _meta.ui/resourceUri hints to
    # the right section anchor on the detail page.
    resources = []
    resource_index_by_uri: Dict[str, int] = {}
    for idx, resource in enumerate(_ensure_list(mcp_data.get('resources'))):
        resource_copy = dict(resource)
        resource_copy['_display_name'] = _default_display_name(resource_copy)
        resource_copy['_group'] = _uri_authority(str(resource_copy.get('uri', ''))) or 'Other'
        resource_copy['_index'] = idx
        resources.append(resource_copy)
        uri = str(resource_copy.get('uri', '')).strip()
        if uri:
            resource_index_by_uri[uri] = idx

    # Bucket resources by URI authority group, preserving insertion order
    # within each bucket. Empty-authority resources fall into "Other".
    resource_groups: List[Dict] = []
    groups_seen: Dict[str, int] = {}
    for resource in resources:
        group_name = resource.get('_group') or 'Other'
        if group_name not in groups_seen:
            groups_seen[group_name] = len(resource_groups)
            resource_groups.append({'name': group_name, 'resources': []})
        resource_groups[groups_seen[group_name]]['resources'].append(resource)

    tools = []
    for tool in _ensure_list(mcp_data.get('tools')):
        tool_copy = dict(tool)
        tool_copy['_display_name'] = _tool_display_name(tool_copy)
        input_schema = tool_copy.get('inputSchema') or {}
        _attach_input_hints(input_schema)
        tool_copy['_input_properties'] = _schema_to_properties(input_schema)
        tool_copy['_output_properties'] = _schema_to_properties(tool_copy.get('outputSchema') or {})
        ui_resource_uri = _extract_tool_ui_resource(tool_copy)
        if ui_resource_uri:
            tool_copy['_ui_resource_uri'] = ui_resource_uri
            idx = resource_index_by_uri.get(ui_resource_uri)
            if idx is not None:
                target = resources[idx]
                tool_copy['_ui_resource_anchor'] = f'resource-{idx}'
                tool_copy['_ui_resource_title'] = target.get('_display_name') or target.get('name') or ''
                tool_copy['_ui_resource_description'] = str(target.get('description') or '')
                tool_copy['_ui_resource_mime_type'] = str(target.get('mimeType') or '')
        tools.append(tool_copy)

    prompts = []
    for prompt in _ensure_list(mcp_data.get('prompts')):
        prompt_copy = dict(prompt)
        prompt_copy['_display_name'] = _default_display_name(prompt_copy)
        prompts.append(prompt_copy)

    resource_templates = []
    for template in _ensure_list(mcp_data.get('resourceTemplates')):
        template_copy = dict(template)
        template_copy['_display_name'] = _default_display_name(template_copy)
        resource_templates.append(template_copy)

    capabilities = mcp_data.get('capabilities') or {}
    security_schemes = mcp_data.get('securitySchemes') or {}
    provider = mcp_data.get('provider') or {}

    xorigin_api_refs, xorigin_mcp_refs = _collect_xorigin_refs(
        [t for t in _ensure_list(mcp_data.get('tools'))]
    )

    return {
        'id': slug,
        'slug': slug,
        'name': str(name),
        'version': version,
        'description': description_short,
        'full_description': description_full,
        'website_url': website_url,
        'servers': servers,
        'transport': transport,
        'capabilities': capabilities if isinstance(capabilities, dict) else {},
        'provider': provider if isinstance(provider, dict) else {},
        'tools': tools,
        'prompts': prompts,
        'resources': resources,
        'resource_groups': resource_groups,
        'resource_templates': resource_templates,
        'tool_count': len(tools),
        'prompt_count': len(prompts),
        'resource_count': len(resources),
        'resource_template_count': len(resource_templates),
        'security_schemes': security_schemes if isinstance(security_schemes, dict) else {},
        'tags': tags,
        'tag_names': tag_names,
        'exchange': exchange,
        'xorigin_api_refs': xorigin_api_refs,
        'xorigin_mcp_refs': xorigin_mcp_refs,
    }
