"""Dedicated tests for the OAS parser -- the most complex module in the portal generator."""

import json
from pathlib import Path

import pytest

from portal_generator.parsers.oas_parser import (
    resolve_ref,
    resolve_external_ref,
    resolve_schema,
    extract_schema_properties,
    extract_operations,
    count_operations,
    parse_oas,
    load_example_content,
    _convert_to_plain,
)


# ============================================================================
# resolve_ref
# ============================================================================

class TestResolveRef:
    def test_resolves_component_schema(self):
        components = {'schemas': {'Pet': {'type': 'object', 'properties': {'name': {'type': 'string'}}}}}
        result = resolve_ref('#/components/schemas/Pet', components)
        assert result['type'] == 'object'
        assert 'name' in result['properties']

    def test_resolves_component_parameter(self):
        components = {'parameters': {'orgId': {'name': 'orgId', 'in': 'path'}}}
        result = resolve_ref('#/components/parameters/orgId', components)
        assert result['name'] == 'orgId'

    def test_empty_ref(self):
        assert resolve_ref('', {}) == {}
        assert resolve_ref(None, {}) == {}

    def test_non_component_ref(self):
        assert resolve_ref('./schemas/pet.yaml', {}) == {}

    def test_short_ref(self):
        assert resolve_ref('#/components', {}) == {}

    def test_missing_component(self):
        assert resolve_ref('#/components/schemas/Missing', {'schemas': {}}) == {}

    def test_missing_component_type(self):
        assert resolve_ref('#/components/schemas/Foo', {}) == {}


# ============================================================================
# resolve_external_ref
# ============================================================================

class TestResolveExternalRef:
    def test_yaml_file(self, tmp_path):
        schema_file = tmp_path / 'pet.yaml'
        schema_file.write_text('type: object\nproperties:\n  name:\n    type: string\n')
        result = resolve_external_ref('pet.yaml', tmp_path)
        assert result['type'] == 'object'

    def test_json_file(self, tmp_path):
        schema_file = tmp_path / 'pet.json'
        schema_file.write_text(json.dumps({'type': 'object', 'properties': {'id': {'type': 'integer'}}}))
        result = resolve_external_ref('pet.json', tmp_path)
        assert result['type'] == 'object'

    def test_fragment_pointer(self, tmp_path):
        constants = tmp_path / 'constants.yaml'
        constants.write_text('deploymentTypes:\n  - cloudhub\n  - hybrid\n')
        result = resolve_external_ref('constants.yaml#/deploymentTypes', tmp_path)
        assert result == ['cloudhub', 'hybrid']

    def test_nested_fragment(self, tmp_path):
        data_file = tmp_path / 'data.yaml'
        data_file.write_text('a:\n  b:\n    c: deep_value\n')
        result = resolve_external_ref('data.yaml#/a/b/c', tmp_path)
        assert result == 'deep_value'

    def test_missing_file(self, tmp_path):
        assert resolve_external_ref('nonexistent.yaml', tmp_path) is None

    def test_internal_ref_returns_none(self, tmp_path):
        assert resolve_external_ref('#/components/schemas/Pet', tmp_path) is None

    def test_empty_ref(self, tmp_path):
        assert resolve_external_ref('', tmp_path) is None

    def test_oversized_path(self, tmp_path):
        long_path = 'a' * 501 + '.yaml'
        assert resolve_external_ref(long_path, tmp_path) is None

    def test_invalid_fragment_returns_none(self, tmp_path):
        data_file = tmp_path / 'data.yaml'
        data_file.write_text('key: value\n')
        assert resolve_external_ref('data.yaml#/missing_key', tmp_path) is None


# ============================================================================
# resolve_schema
# ============================================================================

class TestResolveSchema:
    def test_plain_schema_passthrough(self, tmp_path):
        schema = {'type': 'object', 'properties': {'id': {'type': 'string'}}}
        result = resolve_schema(schema, tmp_path)
        assert result == schema

    def test_allof_merging(self, tmp_path):
        schema = {
            'allOf': [
                {
                    'type': 'object',
                    'properties': {'id': {'type': 'string'}},
                    'required': ['id'],
                },
                {
                    'properties': {'name': {'type': 'string'}},
                    'required': ['name'],
                },
            ]
        }
        result = resolve_schema(schema, tmp_path)
        assert 'id' in result['properties']
        assert 'name' in result['properties']
        assert set(result['required']) == {'id', 'name'}
        assert result['type'] == 'object'

    def test_allof_without_type_defaults_to_object(self, tmp_path):
        schema = {
            'allOf': [
                {'properties': {'a': {'type': 'string'}}},
            ]
        }
        result = resolve_schema(schema, tmp_path)
        assert result['type'] == 'object'

    def test_external_ref(self, tmp_path):
        schema_file = tmp_path / 'pet.yaml'
        schema_file.write_text('type: object\nproperties:\n  name:\n    type: string\n')
        schema = {'$ref': 'pet.yaml'}
        result = resolve_schema(schema, tmp_path)
        assert result['type'] == 'object'
        assert 'name' in result['properties']

    def test_internal_ref_passthrough(self, tmp_path):
        schema = {'$ref': '#/components/schemas/Pet'}
        result = resolve_schema(schema, tmp_path)
        assert result == schema

    def test_depth_limit(self, tmp_path):
        schema = {'type': 'string'}
        result = resolve_schema(schema, tmp_path, depth=3)
        assert result == schema

    def test_non_dict_input(self, tmp_path):
        assert resolve_schema(None, tmp_path) == {}
        # Non-dict truthy values are returned as-is (passthrough)
        assert resolve_schema('string', tmp_path) == 'string'

    def test_missing_external_ref(self, tmp_path):
        schema = {'$ref': 'nonexistent.yaml'}
        result = resolve_schema(schema, tmp_path)
        assert result == schema


# ============================================================================
# extract_schema_properties
# ============================================================================

class TestExtractSchemaProperties:
    def test_basic_properties(self, tmp_path):
        schema = {
            'type': 'object',
            'required': ['id'],
            'properties': {
                'id': {'type': 'string', 'description': 'Unique identifier'},
                'name': {'type': 'string'},
            },
        }
        props = extract_schema_properties(schema, tmp_path)
        assert len(props) == 2
        id_prop = next(p for p in props if p['name'] == 'id')
        assert id_prop['required'] is True
        assert id_prop['description'] == 'Unique identifier'
        name_prop = next(p for p in props if p['name'] == 'name')
        assert name_prop['required'] is False

    def test_format_annotation(self, tmp_path):
        schema = {
            'type': 'object',
            'properties': {
                'created': {'type': 'string', 'format': 'date-time'},
            },
        }
        props = extract_schema_properties(schema, tmp_path)
        assert props[0]['type'] == 'string (date-time)'

    def test_nullable(self, tmp_path):
        schema = {
            'type': 'object',
            'properties': {
                'tag': {'type': 'string', 'nullable': True},
            },
        }
        props = extract_schema_properties(schema, tmp_path)
        assert 'nullable' in props[0]['type']

    def test_array_items_type(self, tmp_path):
        schema = {
            'type': 'object',
            'properties': {
                'tags': {'type': 'array', 'items': {'type': 'string'}},
            },
        }
        props = extract_schema_properties(schema, tmp_path)
        assert props[0]['type'] == 'array[string]'

    def test_constraints(self, tmp_path):
        schema = {
            'type': 'object',
            'properties': {
                'status': {
                    'type': 'string',
                    'enum': ['active', 'inactive'],
                    'default': 'active',
                    'minLength': 1,
                    'maxLength': 50,
                    'pattern': '^[a-z]+$',
                },
                'count': {
                    'type': 'integer',
                    'minimum': 0,
                    'maximum': 100,
                },
            },
        }
        props = extract_schema_properties(schema, tmp_path)

        status = next(p for p in props if p['name'] == 'status')
        constraints = status['constraints']
        assert any('enum' in c for c in constraints)
        assert any('default: active' in c for c in constraints)
        assert any('minLength: 1' in c for c in constraints)
        assert any('maxLength: 50' in c for c in constraints)
        assert any('pattern' in c for c in constraints)

        count = next(p for p in props if p['name'] == 'count')
        assert any('min: 0' in c for c in count['constraints'])
        assert any('max: 100' in c for c in count['constraints'])

    def test_external_ref_in_property(self, tmp_path):
        ref_file = tmp_path / 'status.yaml'
        ref_file.write_text('type: string\nenum:\n  - active\n  - inactive\n')
        schema = {
            'type': 'object',
            'properties': {
                'status': {'$ref': 'status.yaml'},
            },
        }
        props = extract_schema_properties(schema, tmp_path)
        assert len(props) == 1
        assert props[0]['type'] == 'string'
        assert any('enum' in c for c in props[0]['constraints'])

    def test_empty_properties(self, tmp_path):
        schema = {'type': 'object'}
        assert extract_schema_properties(schema, tmp_path) == []

    def test_non_dict_schema(self, tmp_path):
        assert extract_schema_properties(None, tmp_path) == []


# ============================================================================
# extract_operations
# ============================================================================

class TestExtractOperations:
    def test_basic_get(self):
        paths = {
            '/items': {
                'get': {
                    'operationId': 'listItems',
                    'summary': 'List items',
                    'description': 'Returns all items.',
                    'tags': ['Items'],
                    'responses': {
                        '200': {'description': 'OK'},
                    },
                }
            }
        }
        ops = extract_operations(paths)
        assert len(ops) == 1
        assert ops[0]['method'] == 'GET'
        assert ops[0]['operationId'] == 'listItems'
        assert ops[0]['path'] == '/items'

    def test_multiple_methods(self):
        paths = {
            '/items': {
                'get': {'operationId': 'list', 'responses': {}},
                'post': {'operationId': 'create', 'responses': {}},
                'delete': {'operationId': 'deleteAll', 'responses': {}},
            }
        }
        ops = extract_operations(paths)
        methods = {op['method'] for op in ops}
        assert methods == {'GET', 'POST', 'DELETE'}

    def test_path_level_parameters_merged(self):
        paths = {
            '/orgs/{orgId}/items': {
                'parameters': [
                    {'name': 'orgId', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},
                ],
                'get': {
                    'operationId': 'listItems',
                    'parameters': [
                        {'name': 'limit', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
                    ],
                    'responses': {},
                },
            }
        }
        ops = extract_operations(paths)
        param_names = [p['name'] for p in ops[0]['parameters']]
        assert 'orgId' in param_names
        assert 'limit' in param_names

    def test_ref_parameter_resolved(self):
        paths = {
            '/items': {
                'get': {
                    'operationId': 'list',
                    'parameters': [{'$ref': '#/components/parameters/orgId'}],
                    'responses': {},
                },
            }
        }
        components = {
            'parameters': {
                'orgId': {'name': 'orgId', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},
            }
        }
        ops = extract_operations(paths, components)
        assert ops[0]['parameters'][0]['name'] == 'orgId'

    def test_x_origin_preserved(self):
        paths = {
            '/items': {
                'get': {
                    'operationId': 'list',
                    'parameters': [{
                        'name': 'envId',
                        'in': 'path',
                        'schema': {'type': 'string'},
                        'x-origin': [{'api': 'urn:api:other', 'operation': 'getEnv', 'values': '$.id'}],
                    }],
                    'responses': {},
                },
            }
        }
        ops = extract_operations(paths)
        assert ops[0]['parameters'][0]['x-origin'] is not None
        assert ops[0]['parameters'][0]['x-origin'][0]['api'] == 'urn:api:other'

    def test_request_body_extracted(self, tmp_path):
        paths = {
            '/items': {
                'post': {
                    'operationId': 'create',
                    'requestBody': {
                        'required': True,
                        'content': {
                            'application/json': {
                                'schema': {
                                    'type': 'object',
                                    'properties': {'name': {'type': 'string'}},
                                },
                            }
                        },
                    },
                    'responses': {},
                },
            }
        }
        ops = extract_operations(paths, {}, tmp_path)
        rb = ops[0]['requestBody']
        assert rb is not None
        assert rb['required'] is True
        assert 'application/json' in rb['content_types']

    def test_missing_operationid_fallback(self):
        paths = {
            '/items': {
                'get': {'responses': {}},
            }
        }
        ops = extract_operations(paths)
        assert ops[0]['operationId'] == 'get__items'

    def test_empty_paths(self):
        assert extract_operations({}) == []
        assert extract_operations(None) == []

    def test_non_dict_path_item_ignored(self):
        paths = {'/items': 'not a dict'}
        assert extract_operations(paths) == []

    def test_deprecated_flag(self):
        paths = {
            '/old': {
                'get': {'operationId': 'old', 'deprecated': True, 'responses': {}},
            }
        }
        ops = extract_operations(paths)
        assert ops[0]['deprecated'] is True


# ============================================================================
# count_operations
# ============================================================================

class TestCountOperations:
    def test_counts_http_methods(self):
        paths = {
            '/a': {'get': {}, 'post': {}},
            '/b': {'delete': {}},
        }
        assert count_operations(paths) == 3

    def test_ignores_non_http_keys(self):
        paths = {
            '/a': {'get': {}, 'parameters': [], 'summary': 'nope'},
        }
        assert count_operations(paths) == 1

    def test_empty_paths(self):
        assert count_operations({}) == 0
        assert count_operations(None) == 0

    def test_non_dict_path_item(self):
        assert count_operations({'/a': 'not a dict'}) == 0


# ============================================================================
# parse_oas (integration with temp file)
# ============================================================================

class TestParseOas:
    def test_valid_spec(self, tmp_path):
        from tests.conftest import MINIMAL_OAS_YAML
        spec_file = tmp_path / 'api.yaml'
        spec_file.write_text(MINIMAL_OAS_YAML)

        result = parse_oas(spec_file)
        assert result is not None
        assert result['title'] == 'Test API'
        assert result['version'] == '1.0.0'
        assert result['operation_count'] == 2
        assert len(result['operations']) == 2

        op_ids = {op['operationId'] for op in result['operations']}
        assert op_ids == {'listResources', 'createResource'}

    def test_invalid_spec_missing_info(self, tmp_path):
        spec_file = tmp_path / 'bad.yaml'
        spec_file.write_text('openapi: 3.0.3\npaths: {}\n')
        assert parse_oas(spec_file) is None

    def test_nonexistent_file(self, tmp_path):
        assert parse_oas(tmp_path / 'missing.yaml') is None

    def test_servers_preserved(self, tmp_path):
        from tests.conftest import MINIMAL_OAS_YAML
        spec_file = tmp_path / 'api.yaml'
        spec_file.write_text(MINIMAL_OAS_YAML)

        result = parse_oas(spec_file)
        assert len(result['servers']) == 1
        assert 'example.com' in str(result['servers'][0])

    def test_security_schemes_preserved(self, tmp_path):
        from tests.conftest import MINIMAL_OAS_YAML
        spec_file = tmp_path / 'api.yaml'
        spec_file.write_text(MINIMAL_OAS_YAML)

        result = parse_oas(spec_file)
        assert 'bearerAuth' in result['security_schemes']


# ============================================================================
# load_example_content
# ============================================================================

class TestLoadExampleContent:
    def test_inline_value(self, tmp_path):
        result = load_example_content({'value': {'name': 'test'}}, tmp_path)
        parsed = json.loads(result)
        assert parsed == {'name': 'test'}

    def test_inline_dict_without_value_key(self, tmp_path):
        result = load_example_content({'name': 'test', 'id': 1}, tmp_path)
        parsed = json.loads(result)
        assert parsed['name'] == 'test'

    def test_ref_to_external_file(self, tmp_path):
        example_file = tmp_path / 'example.json'
        example_file.write_text(json.dumps({'name': 'from-file'}))
        result = load_example_content({'$ref': 'example.json'}, tmp_path)
        parsed = json.loads(result)
        assert parsed['name'] == 'from-file'

    def test_string_path(self, tmp_path):
        example_file = tmp_path / 'example.json'
        example_file.write_text(json.dumps({'status': 'ok'}))
        result = load_example_content('example.json', tmp_path)
        parsed = json.loads(result)
        assert parsed['status'] == 'ok'

    def test_oversized_string_skipped(self, tmp_path):
        assert load_example_content('a' * 501, tmp_path) is None

    def test_missing_ref(self, tmp_path):
        assert load_example_content({'$ref': 'missing.json'}, tmp_path) is None


# ============================================================================
# _convert_to_plain
# ============================================================================

class TestConvertToPlain:
    def test_datetime(self):
        import datetime
        dt = datetime.datetime(2025, 1, 15, 12, 0, 0)
        assert _convert_to_plain(dt) == '2025-01-15T12:00:00'

    def test_date(self):
        import datetime
        d = datetime.date(2025, 6, 1)
        assert _convert_to_plain(d) == '2025-06-01'

    def test_nested_structure(self):
        data = {'items': [{'id': 1, 'active': True, 'rate': 3.14}]}
        result = _convert_to_plain(data)
        assert result == {'items': [{'id': 1, 'active': True, 'rate': 3.14}]}
