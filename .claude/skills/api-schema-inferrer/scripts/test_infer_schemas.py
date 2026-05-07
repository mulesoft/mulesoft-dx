"""Tests for the schema inferrer's relocation and components-walking logic.

Run with: python3 -m pytest .claude/skills/api-schema-inferrer/scripts/test_infer_schemas.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from infer_schemas import (  # noqa: E402
    infer_schemas,
    relocate_example_in_media_type,
    relocate_examples,
    relocate_examples_in_content,
)


# ----------------------------------------------------------------------------
# relocate_example_in_media_type
# ----------------------------------------------------------------------------

class TestRelocateMediaType:
    def test_moves_example_to_sibling(self):
        mt = {'schema': {'type': 'object', 'example': {'a': 1}}}
        assert relocate_example_in_media_type(mt) is True
        assert mt['example'] == {'a': 1}
        assert 'example' not in mt['schema']

    def test_drops_empty_schema(self):
        """Schema-only-example (no type/properties) should be removed entirely
        so the inferrer can produce a real schema in its place."""
        mt = {'schema': {'example': {'a': 1}}}
        assert relocate_example_in_media_type(mt) is True
        assert mt == {'example': {'a': 1}}

    def test_keeps_schema_when_other_keys_present(self):
        mt = {'schema': {'type': 'object', 'properties': {}, 'example': {'a': 1}}}
        relocate_example_in_media_type(mt)
        assert mt['example'] == {'a': 1}
        assert mt['schema'] == {'type': 'object', 'properties': {}}

    def test_drops_nested_when_sibling_already_present(self):
        """If a sibling example exists, the nested one is silently discarded
        rather than overwriting (sibling is the authoritative location).
        If the schema becomes empty after the drop, it's removed entirely."""
        mt = {'schema': {'example': 'nested'}, 'example': 'sibling'}
        relocate_example_in_media_type(mt)
        assert mt == {'example': 'sibling'}

    def test_drops_nested_when_sibling_present_keeps_real_schema(self):
        """Same as above but the schema has real content — it must survive."""
        mt = {
            'schema': {'type': 'object', 'example': 'nested'},
            'example': 'sibling',
        }
        relocate_example_in_media_type(mt)
        assert mt == {'schema': {'type': 'object'}, 'example': 'sibling'}

    def test_no_op_when_no_nested_example(self):
        mt = {'schema': {'type': 'string'}, 'example': 'x'}
        assert relocate_example_in_media_type(mt) is False

    def test_no_op_when_no_schema(self):
        assert relocate_example_in_media_type({'example': 'x'}) is False

    def test_handles_non_dict_input(self):
        assert relocate_example_in_media_type(None) is False
        assert relocate_example_in_media_type('string') is False


# ----------------------------------------------------------------------------
# relocate_examples (full spec walk)
# ----------------------------------------------------------------------------

class TestRelocateFullSpec:
    def test_walks_paths_request_and_response(self):
        spec = {
            'paths': {
                '/foo': {
                    'post': {
                        'requestBody': {
                            'content': {
                                'application/json': {
                                    'schema': {'example': {'a': 1}},
                                }
                            }
                        },
                        'responses': {
                            '200': {
                                'content': {
                                    'application/json': {
                                        'schema': {'example': {'b': 2}},
                                    }
                                }
                            }
                        },
                    }
                }
            }
        }
        moved = relocate_examples(spec)
        assert moved == 2
        rb_mt = spec['paths']['/foo']['post']['requestBody']['content']['application/json']
        resp_mt = spec['paths']['/foo']['post']['responses']['200']['content']['application/json']
        assert rb_mt['example'] == {'a': 1}
        assert resp_mt['example'] == {'b': 2}

    def test_walks_components_request_bodies(self):
        """Regression: AMF-emitted specs hoist shared bodies into
        components.requestBodies. The skill must walk those too."""
        spec = {
            'components': {
                'requestBodies': {
                    'Generated5': {
                        'content': {
                            'application/json': {
                                'schema': {'example': {'org': 'ms'}},
                            }
                        }
                    }
                }
            }
        }
        moved = relocate_examples(spec)
        assert moved == 1
        mt = spec['components']['requestBodies']['Generated5']['content']['application/json']
        assert mt['example'] == {'org': 'ms'}
        assert 'schema' not in mt

    def test_walks_components_responses(self):
        spec = {
            'components': {
                'responses': {
                    'NotFound': {
                        'content': {
                            'application/json': {
                                'schema': {'example': {'message': 'not found'}},
                            }
                        }
                    }
                }
            }
        }
        moved = relocate_examples(spec)
        assert moved == 1
        mt = spec['components']['responses']['NotFound']['content']['application/json']
        assert mt['example'] == {'message': 'not found'}

    def test_zero_when_nothing_to_move(self):
        spec = {'paths': {'/foo': {'get': {'responses': {'200': {'description': 'OK'}}}}}}
        assert relocate_examples(spec) == 0

    def test_handles_missing_sections(self):
        assert relocate_examples({}) == 0
        assert relocate_examples({'paths': None}) == 0
        assert relocate_examples({'components': None}) == 0


# ----------------------------------------------------------------------------
# infer_schemas now walks components too
# ----------------------------------------------------------------------------

class TestInferSchemasComponents:
    def test_infers_for_components_request_bodies(self):
        spec = {
            'components': {
                'requestBodies': {
                    'Generated5': {
                        'content': {
                            'application/json': {
                                'example': {'name': 'Acme', 'count': 3},
                            }
                        }
                    }
                }
            }
        }
        added = infer_schemas(spec)
        assert added == 1
        mt = spec['components']['requestBodies']['Generated5']['content']['application/json']
        schema = mt['schema']
        assert schema['type'] == 'object'
        assert set(schema['properties'].keys()) == {'name', 'count'}
        assert schema['properties']['count']['type'] == 'integer'

    def test_infers_for_components_responses(self):
        spec = {
            'components': {
                'responses': {
                    'NotFound': {
                        'content': {
                            'application/json': {
                                'example': {'message': 'not found'},
                            }
                        }
                    }
                }
            }
        }
        added = infer_schemas(spec)
        assert added == 1
        mt = spec['components']['responses']['NotFound']['content']['application/json']
        assert mt['schema']['type'] == 'object'

    def test_skips_components_with_existing_schemas(self):
        spec = {
            'components': {
                'requestBodies': {
                    'Already': {
                        'content': {
                            'application/json': {
                                'schema': {'type': 'object', 'properties': {}},
                                'example': {'x': 1},
                            }
                        }
                    }
                }
            }
        }
        assert infer_schemas(spec) == 0
