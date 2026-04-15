"""Unit tests for portal generator pure functions."""

import json
from pathlib import Path

import pytest
from markupsafe import Markup

from portal_generator.utils import get_category, CATEGORY_MAPPING
from portal_generator.builders.tree_builder import build_operation_tree, count_tree_operations
from portal_generator.template_env import _nl2br, _nl2br_html, _render_markdown, _tojson_raw
from portal_generator.generator import _build_api_meta, _get_example_body, PortalGenerator
from portal_generator.parsers.skill_parser import (
    _extract_yaml_blocks,
    _extract_step_details,
    _extract_section,
    _extract_related_jobs,
    _extract_skip_annotation,
    _extract_entry_points,
    _convert_to_plain,
    parse_skill,
)
from portal_generator.discovery import calculate_stats, _extract_api_refs, discover_skills


# ============================================================================
# utils.get_category
# ============================================================================

class TestGetCategory:
    def test_known_slug(self):
        assert get_category('api-manager') == 'API Management'
        assert get_category('cloudhub') == 'Runtime'
        assert get_category('secrets-manager') == 'Security'

    def test_unknown_slug_defaults_to_platform(self):
        assert get_category('some-unknown-api') == 'Platform'
        assert get_category('') == 'Platform'

    def test_all_mapped_slugs_resolve(self):
        for slug, expected in CATEGORY_MAPPING.items():
            assert get_category(slug) == expected


# ============================================================================
# tree_builder
# ============================================================================

class TestBuildOperationTree:
    def test_single_operation(self):
        ops = [{'path': '/api/v1/resources', 'method': 'GET', 'operationId': 'list'}]
        tree = build_operation_tree(ops)

        assert 'api' in tree
        v1_node = tree['api']['children']['v1']
        resources_node = v1_node['children']['resources']
        assert len(resources_node['operations']) == 1
        assert resources_node['full_path'] == '/api/v1/resources'

    def test_multiple_methods_same_path(self):
        ops = [
            {'path': '/items', 'method': 'GET', 'operationId': 'listItems'},
            {'path': '/items', 'method': 'POST', 'operationId': 'createItem'},
        ]
        tree = build_operation_tree(ops)
        assert len(tree['items']['operations']) == 2

    def test_nested_paths(self):
        ops = [
            {'path': '/a/b', 'method': 'GET', 'operationId': 'getB'},
            {'path': '/a/b/c', 'method': 'GET', 'operationId': 'getC'},
        ]
        tree = build_operation_tree(ops)
        b_node = tree['a']['children']['b']
        assert len(b_node['operations']) == 1
        c_node = b_node['children']['c']
        assert len(c_node['operations']) == 1

    def test_empty_operations(self):
        assert build_operation_tree([]) == {}

    def test_path_with_parameter(self):
        ops = [{'path': '/users/{userId}', 'method': 'GET', 'operationId': 'getUser'}]
        tree = build_operation_tree(ops)
        user_node = tree['users']['children']['{userId}']
        assert len(user_node['operations']) == 1
        assert user_node['full_path'] == '/users/{userId}'


class TestCountTreeOperations:
    def test_leaf_node(self):
        node = {'operations': [1, 2], 'children': {}}
        assert count_tree_operations(node) == 2

    def test_nested_nodes(self):
        node = {
            'operations': [1],
            'children': {
                'child': {
                    'operations': [2, 3],
                    'children': {
                        'grandchild': {'operations': [4], 'children': {}}
                    },
                }
            },
        }
        assert count_tree_operations(node) == 4

    def test_empty_node(self):
        assert count_tree_operations({'operations': [], 'children': {}}) == 0

    def test_integration_with_build(self):
        ops = [
            {'path': '/a/b', 'method': 'GET', 'operationId': 'op1'},
            {'path': '/a/b', 'method': 'POST', 'operationId': 'op2'},
            {'path': '/a/c', 'method': 'GET', 'operationId': 'op3'},
        ]
        tree = build_operation_tree(ops)
        assert count_tree_operations(tree['a']) == 3


# ============================================================================
# template_env filters
# ============================================================================

class TestNl2br:
    def test_converts_newlines(self):
        result = _nl2br('line1\nline2')
        assert isinstance(result, Markup)
        assert '\n' not in str(result)
        assert 'line1' in str(result)
        assert 'line2' in str(result)
        assert 'br' in str(result)

    def test_escapes_html(self):
        result = _nl2br('<script>alert(1)</script>')
        assert '<script>' not in str(result)
        assert '&lt;script&gt;' in str(result)

    def test_empty_string(self):
        result = _nl2br('')
        assert str(result) == ''


class TestNl2brHtml:
    def test_preserves_html_tags(self):
        result = _nl2br_html('hello<br>world\nnext')
        assert '<br>' in str(result)
        assert str(result) == 'hello<br>world<br>next'

    def test_empty_value(self):
        assert str(_nl2br_html('')) == ''
        assert str(_nl2br_html(None)) == ''


class TestRenderMarkdown:
    def test_inline_code(self):
        result = _render_markdown('Use `foo()` here')
        assert '<code>foo()</code>' in str(result)

    def test_bold(self):
        result = _render_markdown('This is **bold** text')
        assert '<strong>bold</strong>' in str(result)

    def test_italic(self):
        result = _render_markdown('This is *italic* text')
        assert '<em>italic</em>' in str(result)

    def test_link(self):
        result = _render_markdown('[click](https://example.com)')
        assert '<a href="https://example.com">click</a>' in str(result)

    def test_xss_prevention(self):
        result = _render_markdown('<script>alert(1)</script>')
        assert '<script>' not in str(result)
        assert '&lt;script&gt;' in str(result)

    def test_empty_value(self):
        assert str(_render_markdown('')) == ''
        assert str(_render_markdown(None)) == ''

    def test_bullet_list(self):
        result = _render_markdown('- item1\n- item2')
        assert '<ul>' in str(result)
        assert '<li>' in str(result)

    def test_bold_with_inline_code(self):
        result = str(_render_markdown('Use **`POST`** to create'))
        assert '<strong>' in result
        assert '<code>' in result

    def test_link_and_bold_combined(self):
        result = str(_render_markdown('See **[docs](https://example.com)** here'))
        assert '<strong>' in result
        assert '<a href="https://example.com">docs</a>' in result

    def test_code_inside_list_items(self):
        result = str(_render_markdown('- use `foo()`\n- use `bar()`'))
        assert '<ul>' in result
        assert '<code>foo()</code>' in result
        assert '<code>bar()</code>' in result

    def test_multiple_bold_segments(self):
        result = str(_render_markdown('**first** and **second**'))
        assert result.count('<strong>') == 2

    def test_underscore_bold_and_italic(self):
        result = str(_render_markdown('__bold__ and _italic_'))
        assert '<strong>bold</strong>' in result
        assert '<em>italic</em>' in result


class TestTojsonRaw:
    def test_dict(self):
        result = _tojson_raw({'key': 'value'})
        parsed = json.loads(str(result))
        assert parsed == {'key': 'value'}

    def test_returns_markup(self):
        assert isinstance(_tojson_raw({'a': 1}), Markup)

    def test_custom_indent(self):
        result = _tojson_raw({'a': 1}, indent=4)
        assert '    "a"' in str(result)


# ============================================================================
# generator helpers
# ============================================================================

class TestBuildApiMeta:
    def test_basic_server(self, sample_api_data):
        meta = _build_api_meta(sample_api_data)
        assert len(meta['servers']) == 1
        assert meta['servers'][0]['url'] == 'https://anypoint.mulesoft.com/api/v1'
        assert meta['servers'][0]['description'] == 'Production'

    def test_server_with_variables(self):
        api = {
            'servers': [{
                'url': 'https://{region}.api.com',
                'description': 'Regional',
                'variables': {
                    'region': {'default': 'us-east', 'description': 'AWS region'}
                },
            }],
            'security_schemes': {},
            'security': [],
        }
        meta = _build_api_meta(api)
        assert meta['servers'][0]['variables']['region']['default'] == 'us-east'

    def test_security_schemes(self, sample_api_data):
        meta = _build_api_meta(sample_api_data)
        assert 'bearerAuth' in meta['securitySchemes']
        assert meta['securitySchemes']['bearerAuth']['type'] == 'http'

    def test_oauth2_flows(self):
        api = {
            'servers': [],
            'security_schemes': {
                'oauth2': {
                    'type': 'oauth2',
                    'scheme': '',
                    'description': 'OAuth2',
                    'flows': {
                        'clientCredentials': {'tokenUrl': 'https://auth.example.com/token'}
                    },
                }
            },
            'security': [{'oauth2': []}],
        }
        meta = _build_api_meta(api)
        assert meta['securitySchemes']['oauth2']['flows']['clientCredentials']['tokenUrl'] == 'https://auth.example.com/token'

    def test_security_array(self, sample_api_data):
        meta = _build_api_meta(sample_api_data)
        assert meta['security'] == [{'bearerAuth': []}]

    def test_empty_api(self):
        meta = _build_api_meta({})
        assert meta == {'servers': [], 'securitySchemes': {}, 'security': []}


class TestGetExampleBody:
    def test_no_request_body(self):
        assert _get_example_body({'requestBody': None}) == ''
        assert _get_example_body({}) == ''

    def test_from_examples(self):
        op = {
            'requestBody': {
                'examples': {
                    'application/json': {'example1': '{"name": "test"}'}
                },
                'raw_schemas': {},
            }
        }
        assert _get_example_body(op) == '{"name": "test"}'

    def test_from_schema_stub(self):
        op = {
            'requestBody': {
                'examples': {},
                'raw_schemas': {
                    'application/json': {
                        'type': 'object',
                        'properties': {
                            'name': {'type': 'string'},
                            'count': {'type': 'integer'},
                            'active': {'type': 'boolean'},
                            'tags': {'type': 'array'},
                            'meta': {'type': 'object'},
                        },
                    }
                },
            }
        }
        result = json.loads(_get_example_body(op))
        assert result == {'name': '', 'count': 0, 'active': False, 'tags': [], 'meta': {}}

    def test_schema_with_defaults(self):
        op = {
            'requestBody': {
                'examples': {},
                'raw_schemas': {
                    'application/json': {
                        'type': 'object',
                        'properties': {
                            'limit': {'type': 'integer', 'default': 25},
                        },
                    }
                },
            }
        }
        result = json.loads(_get_example_body(op))
        assert result['limit'] == 25

    def test_empty_properties(self):
        op = {
            'requestBody': {
                'examples': {},
                'raw_schemas': {
                    'application/json': {'type': 'object', 'properties': {}}
                },
            }
        }
        assert _get_example_body(op) == ''


class TestBuildOperationLookup:
    def _make_generator_with_apis(self, apis, tmp_path):
        gen = PortalGenerator(tmp_path / 'output')
        gen.apis = apis
        return gen

    def test_single_api(self, sample_api_data, tmp_path):
        gen = self._make_generator_with_apis([sample_api_data], tmp_path)
        lookup = gen._build_operation_lookup()

        assert 'test-api' in lookup
        ops = lookup['test-api']['ops']
        assert 'listResources' in ops
        assert 'createResource' in ops
        assert ops['listResources']['method'] == 'GET'
        assert ops['listResources']['path'] == '/api/v1/resources'

    def test_server_metadata(self, sample_api_data, tmp_path):
        gen = self._make_generator_with_apis([sample_api_data], tmp_path)
        lookup = gen._build_operation_lookup()

        servers = lookup['test-api']['servers']
        assert len(servers) == 1
        assert servers[0]['url'] == 'https://anypoint.mulesoft.com/api/v1'

    def test_server_variables_included(self, tmp_path):
        api = {
            'slug': 'regional-api',
            'operations': [],
            'servers': [{
                'url': 'https://{env}.api.com',
                'variables': {'env': {'default': 'prod'}},
            }],
        }
        gen = self._make_generator_with_apis([api], tmp_path)
        lookup = gen._build_operation_lookup()
        assert lookup['regional-api']['servers'][0]['variables'] == {
            'env': {'default': 'prod', 'description': ''}
        }

    def test_server_variable_with_description(self, tmp_path):
        api = {
            'slug': 'described-api',
            'operations': [],
            'servers': [{
                'url': 'https://{env}.api.com',
                'variables': {'env': {'default': 'prod', 'description': 'Deployment environment'}},
            }],
        }
        gen = self._make_generator_with_apis([api], tmp_path)
        lookup = gen._build_operation_lookup()
        assert lookup['described-api']['servers'][0]['variables'] == {
            'env': {'default': 'prod', 'description': 'Deployment environment'}
        }

    def test_multiple_server_variables(self, tmp_path):
        api = {
            'slug': 'multi-var-api',
            'operations': [],
            'servers': [{
                'url': 'https://{region}.api.com/{version}',
                'variables': {
                    'region': {'default': 'us-east'},
                    'version': {'default': 'v1', 'description': 'API version'},
                },
            }],
        }
        gen = self._make_generator_with_apis([api], tmp_path)
        lookup = gen._build_operation_lookup()
        variables = lookup['multi-var-api']['servers'][0]['variables']
        assert variables == {
            'region': {'default': 'us-east', 'description': ''},
            'version': {'default': 'v1', 'description': 'API version'},
        }

    def test_server_without_variables_omits_key(self, tmp_path):
        api = {
            'slug': 'no-vars-api',
            'operations': [],
            'servers': [{'url': 'https://api.example.com'}],
        }
        gen = self._make_generator_with_apis([api], tmp_path)
        lookup = gen._build_operation_lookup()
        assert 'variables' not in lookup['no-vars-api']['servers'][0]

    def test_non_dict_variable_is_skipped(self, tmp_path):
        api = {
            'slug': 'bad-var-api',
            'operations': [],
            'servers': [{
                'url': 'https://{env}.api.com',
                'variables': {
                    'env': {'default': 'prod'},
                    'broken': 'not-a-dict',
                },
            }],
        }
        gen = self._make_generator_with_apis([api], tmp_path)
        lookup = gen._build_operation_lookup()
        variables = lookup['bad-var-api']['servers'][0]['variables']
        assert 'env' in variables
        assert 'broken' not in variables

    def test_multi_api_scenario(self, tmp_path):
        api_a = {
            'slug': 'api-a',
            'operations': [
                {'operationId': 'opA', 'method': 'GET', 'path': '/a', 'parameters': [], 'description': '', 'summary': ''},
            ],
            'servers': [{'url': 'https://a.example.com'}],
        }
        api_b = {
            'slug': 'api-b',
            'operations': [
                {'operationId': 'opB', 'method': 'POST', 'path': '/b', 'parameters': [], 'description': '', 'summary': ''},
            ],
            'servers': [{'url': 'https://b.example.com'}],
        }
        gen = self._make_generator_with_apis([api_a, api_b], tmp_path)
        lookup = gen._build_operation_lookup()

        assert 'api-a' in lookup
        assert 'api-b' in lookup
        assert 'opA' in lookup['api-a']['ops']
        assert 'opB' in lookup['api-b']['ops']
        assert 'opA' not in lookup['api-b']['ops']


# ============================================================================
# skill_parser helpers
# ============================================================================

class TestExtractYamlBlocks:
    def test_single_block(self):
        content = '```yaml\napi: urn:api:test\noperation: listItems\n```'
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 1
        assert blocks[0]['api'] == 'urn:api:test'
        assert blocks[0]['operation'] == 'listItems'

    def test_yml_fence(self):
        content = '```yml\napi: urn:api:test\noperation: doStuff\n```'
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 1

    def test_skips_non_api_blocks(self):
        content = '```yaml\nkey: value\n```'
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 0

    def test_multiple_blocks(self):
        content = (
            '```yaml\napi: urn:api:a\noperation: op1\n```\n'
            'Some text\n'
            '```yaml\napi: urn:api:b\noperation: op2\n```'
        )
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 2

    def test_empty_content(self):
        assert _extract_yaml_blocks('') == []

    def test_invalid_yaml_is_skipped(self):
        content = '```yaml\n: : : invalid\n```'
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 0


class TestExtractStepDetails:
    def test_two_steps(self):
        content = (
            '## Overview\nSome overview\n\n'
            '## Step 1: First step\nDo the first thing.\n\n'
            '```yaml\napi: urn:api:test\noperation: op1\n```\n\n'
            'What happens next: something.\n\n'
            '## Step 2: Second step\nDo the second thing.\n'
        )
        steps = _extract_step_details(content)
        assert len(steps) == 2
        assert steps[0]['title'] == 'Step 1: First step'
        assert steps[0]['yaml'] is not None
        assert steps[0]['yaml']['api'] == 'urn:api:test'
        assert 'Do the first thing' in steps[0]['prose_before_html']
        assert 'What happens next' in steps[0]['prose_after_html']
        assert steps[1]['title'] == 'Step 2: Second step'
        assert steps[1]['yaml'] is None
        assert 'Do the second thing' in steps[1]['prose_before_html']

    def test_no_steps(self):
        assert _extract_step_details('Just some text') == []

    def test_step_with_no_prose(self):
        content = '## Step 1: Only yaml\n```yaml\napi: urn:api:test\noperation: op1\n```\n'
        steps = _extract_step_details(content)
        assert steps[0]['prose_before_html'] == ''
        assert steps[0]['prose_after_html'] == ''

    def test_step_prose_with_rich_content(self):
        content = (
            '## Step 1: Rich step\n'
            'Intro paragraph.\n\n'
            '**What you\'ll need:**\n- item1\n- item2\n\n'
            '```yaml\napi: urn:api:test\noperation: op1\n```\n\n'
            '**Common issues:**\n- issue1\n- issue2\n'
        )
        steps = _extract_step_details(content)
        # "What you'll need" is stripped (duplicates Inputs table)
        assert 'Intro paragraph' in steps[0]['prose_before_html']
        assert 'item1' not in steps[0]['prose_before_html']
        assert 'Common issues' in steps[0]['prose_after_html']

    def test_step_prose_strips_action_line(self):
        content = (
            '## Step 1: Do thing\n'
            'Context paragraph.\n\n'
            '**Action:** Call the API to do the thing.\n\n'
            '```yaml\napi: urn:api:test\noperation: op1\n```\n'
        )
        steps = _extract_step_details(content)
        assert 'Context paragraph' in steps[0]['prose_before_html']
        assert 'Action' not in steps[0]['prose_before_html']

    def test_prose_after_stops_at_next_heading(self):
        content = (
            '## Step 1: Last step\n'
            '```yaml\napi: urn:api:test\noperation: op1\n```\n\n'
            'What happens next: done.\n\n'
            '## Completion Checklist\n\n'
            '- [ ] Verify everything works\n'
        )
        steps = _extract_step_details(content)
        assert 'What happens next' in steps[0]['prose_after_html']
        assert 'Completion Checklist' not in steps[0]['prose_after_html']
        assert 'Verify' not in steps[0]['prose_after_html']


class TestExtractSection:
    def test_extracts_overview(self):
        content = '## Overview\nThis is the overview.\n\n## Prerequisites\nNeed auth.'
        assert _extract_section(content, 'Overview') == 'This is the overview.'

    def test_extracts_last_section(self):
        content = '## Overview\nIntro.\n\n## Notes\nSome final notes.'
        assert _extract_section(content, 'Notes') == 'Some final notes.'

    def test_missing_section(self):
        assert _extract_section('## Other\nStuff', 'Overview') == ''


# ============================================================================
# skill_parser._extract_skip_annotation
# ============================================================================

class TestExtractSkipAnnotation:
    def test_extracts_skip_condition(self):
        text = '> **Skip if:** You already have an Exchange asset.\n\nSome prose.'
        condition, cleaned = _extract_skip_annotation(text)
        assert condition == 'You already have an Exchange asset.'
        assert 'Some prose' in cleaned
        assert 'Skip if' not in cleaned

    def test_no_annotation(self):
        text = 'Just regular prose here.'
        condition, cleaned = _extract_skip_annotation(text)
        assert condition is None
        assert cleaned == text

    def test_annotation_with_backtick_vars(self):
        text = '> **Skip if:** You have `groupId`, `assetId`, and `assetVersion`.\n\nNext.'
        condition, cleaned = _extract_skip_annotation(text)
        assert '`groupId`' in condition
        assert 'Next' in cleaned

    def test_annotation_is_entire_content(self):
        text = '> **Skip if:** This step is optional.'
        condition, cleaned = _extract_skip_annotation(text)
        assert condition == 'This step is optional.'

    def test_step_details_include_skip_condition(self):
        content = (
            '## Step 1: Optional step\n'
            '> **Skip if:** Already done.\n\n'
            'Some prose.\n\n'
            '```yaml\napi: urn:api:test\noperation: op1\n```\n'
        )
        steps = _extract_step_details(content)
        assert steps[0]['skip_condition'] == 'Already done.'
        assert 'Skip if' not in steps[0]['prose_before_html']
        assert 'Some prose' in steps[0]['prose_before_html']

    def test_step_without_skip_has_none(self):
        content = (
            '## Step 1: Normal step\n'
            'Regular prose.\n\n'
            '```yaml\napi: urn:api:test\noperation: op1\n```\n'
        )
        steps = _extract_step_details(content)
        assert steps[0]['skip_condition'] is None


# ============================================================================
# skill_parser._extract_entry_points
# ============================================================================

class TestExtractEntryPoints:
    def test_extracts_execution_paths(self):
        content = (
            'This skill has multiple execution paths:\n\n'
            '- **Full setup**: Steps 1, 2, 3\n'
            '  - When: You need to create everything from scratch\n'
            '  - You\'ll need: `apiUrl`\n\n'
            '- **Apply policy only**: Steps 2, 3\n'
            '  - When: You already have an API instance\n'
            '  - You\'ll need: `organizationId`, `environmentId`, `environmentApiId`\n'
        )
        eps = _extract_entry_points(content)
        assert len(eps) == 2
        assert eps[0]['name'] == 'Full setup'
        assert eps[0]['step'] == 1
        assert eps[0]['condition'] == 'You need to create everything from scratch'
        assert eps[0]['required_vars'] == ['apiUrl']
        assert eps[0]['steps'] == [1, 2, 3]
        assert eps[1]['name'] == 'Apply policy only'
        assert eps[1]['step'] == 2
        assert eps[1]['required_vars'] == ['organizationId', 'environmentId', 'environmentApiId']
        assert eps[1]['steps'] == [2, 3]

    def test_empty_content(self):
        assert _extract_entry_points('') == []

    def test_no_matching_patterns(self):
        assert _extract_entry_points('Just some text about execution paths.') == []

    def test_path_without_when(self):
        content = '- **Quick path**: Steps 2, 4\n'
        eps = _extract_entry_points(content)
        assert len(eps) == 1
        assert eps[0]['name'] == 'Quick path'
        assert eps[0]['steps'] == [2, 4]
        assert eps[0]['condition'] == ''
        assert eps[0]['required_vars'] == []


# ============================================================================
# skill_parser.parse_skill with conditional features
# ============================================================================

class TestParseSkillConditional:
    def test_parse_skill_with_execution_paths(self, tmp_path):
        import textwrap
        skill_md = textwrap.dedent("""\
            ---
            name: conditional-skill
            description: A skill with execution paths
            ---
            ## Overview
            Does things conditionally.

            ## Prerequisites
            Need auth.

            ## Execution Paths

            This skill has multiple execution paths:

            - **Full setup**: Steps 1, 2
              - When: You need everything
              - You'll need: `apiUrl`

            - **From asset**: Steps 2
              - When: You already have an asset
              - You'll need: `groupId`, `assetId`

            ## Step 1: Create Asset

            > **Skip if:** You already have an Exchange asset with `groupId` and `assetId`.

            Creates the asset.

            ```yaml
            api: urn:api:test-api
            operationId: listResources
            inputs: {}
            outputs:
              - name: assetId
                path: $.id
            ```

            ## Step 2: Use Asset

            Normal step.

            ```yaml
            api: urn:api:test-api
            operationId: createResource
            inputs: {}
            ```
        """)
        skill_file = tmp_path / 'conditional-skill' / 'SKILL.md'
        skill_file.parent.mkdir(parents=True)
        skill_file.write_text(skill_md)

        result = parse_skill(skill_file)
        assert result is not None

        # Execution paths fields
        assert result['starting_point_html'] != ''
        assert len(result['entry_points']) == 2
        assert result['entry_points'][0]['name'] == 'Full setup'
        assert result['entry_points'][0]['step'] == 1
        assert result['entry_points'][0]['steps'] == [1, 2]
        assert result['entry_points'][1]['name'] == 'From asset'
        assert result['entry_points'][1]['step'] == 2
        assert result['entry_points'][1]['required_vars'] == ['groupId', 'assetId']
        assert result['entry_points'][1]['steps'] == [2]

        # Skip condition on step 1
        assert result['step_details'][0]['skip_condition'] is not None
        assert 'Exchange asset' in result['step_details'][0]['skip_condition']

        # No skip condition on step 2
        assert result['step_details'][1]['skip_condition'] is None

    def test_parse_skill_without_conditionals(self, tmp_path):
        from tests.conftest import MINIMAL_SKILL_MD
        skill_file = tmp_path / 'plain-skill' / 'SKILL.md'
        skill_file.parent.mkdir(parents=True)
        skill_file.write_text(MINIMAL_SKILL_MD)

        result = parse_skill(skill_file)
        assert result is not None
        assert result['starting_point_html'] == ''
        assert result['entry_points'] == []
        assert result['step_details'][0]['skip_condition'] is None


class TestConvertToPlain:
    def test_dict(self):
        assert _convert_to_plain({'a': 1}) == {'a': 1}

    def test_list(self):
        assert _convert_to_plain([1, 'two']) == [1, 'two']

    def test_nested(self):
        result = _convert_to_plain({'a': [{'b': True}]})
        assert result == {'a': [{'b': True}]}

    def test_none_becomes_empty_string(self):
        assert _convert_to_plain(None) == ''

    def test_bool_preserved(self):
        assert _convert_to_plain(True) is True
        assert _convert_to_plain(False) is False


# ============================================================================
# discovery.calculate_stats
# ============================================================================

class TestCalculateStats:
    def test_single_api(self, sample_api_data):
        stats = calculate_stats([sample_api_data])
        assert stats['api_count'] == 1
        assert stats['endpoint_count'] == 2
        assert stats['skill_count'] == 0
        assert stats['categories'] == ['Platform']

    def test_multiple_apis(self):
        apis = [
            {'operation_count': 5, 'skill_count': 2, 'category': 'Runtime',
             'skills': [{'slug': 'skill-a'}, {'slug': 'skill-b'}]},
            {'operation_count': 3, 'skill_count': 0, 'category': 'Security',
             'skills': []},
            {'operation_count': 1, 'skill_count': 1, 'category': 'Runtime',
             'skills': [{'slug': 'skill-c'}]},
        ]
        stats = calculate_stats(apis)
        assert stats['api_count'] == 3
        assert stats['endpoint_count'] == 9
        assert stats['skill_count'] == 3
        assert stats['categories'] == ['Runtime', 'Security']

    def test_private_apis_excluded_from_stats(self):
        apis = [
            {'operation_count': 5, 'category': 'Runtime', 'skills': []},
            {'operation_count': 3, 'category': 'Security', 'skills': [], 'private': True},
        ]
        stats = calculate_stats(apis)
        assert stats['api_count'] == 1
        assert stats['endpoint_count'] == 5
        assert stats['categories'] == ['Runtime']


# ============================================================================
# skill_parser._extract_related_jobs
# ============================================================================

class TestExtractRelatedJobs:
    def test_parses_standard_entries(self):
        content = '- **apply-policy-stack**: Add security policies to your deployed API'
        jobs = _extract_related_jobs(content)
        assert len(jobs) == 1
        assert jobs[0]['slug'] == 'apply-policy-stack'
        assert jobs[0]['description'] == 'Add security policies to your deployed API'

    def test_multiple_entries(self):
        content = (
            '- **apply-policy-stack**: Add security policies\n'
            '- **setup-routing**: Configure routing\n'
            '- **manage-contracts**: Manage consumer contracts\n'
        )
        jobs = _extract_related_jobs(content)
        assert len(jobs) == 3
        assert [j['slug'] for j in jobs] == [
            'apply-policy-stack', 'setup-routing', 'manage-contracts'
        ]

    def test_empty_content(self):
        assert _extract_related_jobs('') == []

    def test_non_matching_content(self):
        assert _extract_related_jobs('Some random text\n- plain bullet') == []


# ============================================================================
# skill_parser: YAML blocks with dict-style inputs and wildcard outputs
# ============================================================================

class TestExtractYamlBlocksRichFormat:
    def test_dict_style_inputs_parsed(self):
        content = (
            '```yaml\n'
            'api: urn:api:exchange-experience\n'
            'operationId: getAssetsSearch\n'
            'inputs:\n'
            '  search:\n'
            '    userProvided: true\n'
            '    description: Search term\n'
            '  types:\n'
            '    value: rest-api\n'
            '```'
        )
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 1
        assert blocks[0]['api'] == 'urn:api:exchange-experience'
        assert blocks[0]['operationId'] == 'getAssetsSearch'
        inputs = blocks[0]['inputs']
        assert inputs['search']['userProvided'] is True
        assert inputs['types']['value'] == 'rest-api'

    def test_wildcard_output_paths_preserved(self):
        content = (
            '```yaml\n'
            'api: urn:api:exchange-experience\n'
            'operationId: getAssetsSearch\n'
            'outputs:\n'
            '- name: groupId\n'
            '  path: $[*].groupId\n'
            '- name: assetId\n'
            '  path: $[*].assetId\n'
            '```'
        )
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 1
        outputs = blocks[0]['outputs']
        assert len(outputs) == 2
        assert outputs[0]['path'] == '$[*].groupId'
        assert outputs[1]['path'] == '$[*].assetId'

    def test_from_reference_inputs(self):
        content = (
            '```yaml\n'
            'api: urn:api:api-manager\n'
            'operationId: createApi\n'
            'inputs:\n'
            '  organizationId:\n'
            '    from:\n'
            '      api: urn:api:access-management\n'
            '      operation: getOrganizations\n'
            '      field: $.id\n'
            '```'
        )
        blocks = _extract_yaml_blocks(content)
        assert len(blocks) == 1
        org_input = blocks[0]['inputs']['organizationId']
        assert org_input['from']['api'] == 'urn:api:access-management'
        assert org_input['from']['field'] == '$.id'


# ============================================================================
# skill_parser.parse_skill
# ============================================================================

class TestParseSkill:
    def test_parse_minimal_skill(self, tmp_path):
        from tests.conftest import MINIMAL_SKILL_MD
        skill_file = tmp_path / 'deploy-app' / 'SKILL.md'
        skill_file.parent.mkdir(parents=True)
        skill_file.write_text(MINIMAL_SKILL_MD)

        result = parse_skill(skill_file)
        assert result is not None
        assert result['name'] == 'deploy-app'
        assert result['description'] == 'Deploy an application to CloudHub'
        assert result['slug'] == 'deploy-app'
        assert result['step_count'] == 2
        assert len(result['steps']) == 2
        assert 'Step 1: List targets' in result['steps'][0]
        assert 'Step 2: Create resource' in result['steps'][1]
        assert len(result['step_details']) == 2
        assert result['step_details'][0]['yaml'] is not None
        assert result['step_details'][0]['yaml']['api'] == 'urn:api:test-api'
        assert result['overview_html'] != ''
        assert result['prerequisites_html'] != ''
        assert result['raw_content'] is not None

    def test_nonexistent_file_returns_none(self, tmp_path):
        result = parse_skill(tmp_path / 'nonexistent' / 'SKILL.md')
        assert result is None

    def test_wildcard_outputs_in_parsed_skill(self, tmp_path):
        import textwrap
        skill_md = textwrap.dedent("""\
            ---
            name: search-assets
            description: Search for assets in Exchange
            ---
            ## Overview
            Find assets.

            ## Step 1: Search assets
            Search for assets in Exchange.

            ```yaml
            api: urn:api:exchange-experience
            operationId: getAssetsSearch
            outputs:
            - name: groupId
              path: $[*].groupId
            - name: assetId
              path: $[*].assetId
            ```
        """)
        skill_file = tmp_path / 'search-assets' / 'SKILL.md'
        skill_file.parent.mkdir(parents=True)
        skill_file.write_text(skill_md)

        result = parse_skill(skill_file)
        assert result is not None
        outputs = result['step_details'][0]['yaml']['outputs']
        assert outputs[0]['path'] == '$[*].groupId'
        assert outputs[1]['path'] == '$[*].assetId'

    def test_empty_list(self):
        stats = calculate_stats([])
        assert stats['api_count'] == 0
        assert stats['endpoint_count'] == 0
        assert stats['skill_count'] == 0
        assert stats['categories'] == []


# ============================================================================
# discovery._extract_api_refs
# ============================================================================

class TestExtractApiRefs:
    def test_extracts_from_api_field(self):
        skill_data = {
            'step_details': [
                {'yaml': {'api': 'urn:api:api-manager', 'operationId': 'listApis'}},
            ]
        }
        assert _extract_api_refs(skill_data) == ['api-manager']

    def test_extracts_from_input_from_api(self):
        skill_data = {
            'step_details': [
                {
                    'yaml': {
                        'api': 'urn:api:api-manager',
                        'operationId': 'createApi',
                        'inputs': {
                            'orgId': {
                                'from': {
                                    'api': 'urn:api:access-management',
                                    'operation': 'getOrgs',
                                    'field': 'id',
                                }
                            }
                        },
                    }
                },
            ]
        }
        refs = _extract_api_refs(skill_data)
        assert 'access-management' in refs
        assert 'api-manager' in refs

    def test_deduplicates_and_sorts(self):
        skill_data = {
            'step_details': [
                {'yaml': {'api': 'urn:api:beta-api', 'operationId': 'op1'}},
                {'yaml': {'api': 'urn:api:alpha-api', 'operationId': 'op2'}},
                {'yaml': {'api': 'urn:api:beta-api', 'operationId': 'op3'}},
            ]
        }
        assert _extract_api_refs(skill_data) == ['alpha-api', 'beta-api']

    def test_handles_list_style_inputs(self):
        skill_data = {
            'step_details': [
                {
                    'yaml': {
                        'api': 'urn:api:test-api',
                        'operationId': 'op1',
                        'inputs': [
                            {'name': 'limit', 'source': 'literal', 'value': '10'}
                        ],
                    }
                },
            ]
        }
        assert _extract_api_refs(skill_data) == ['test-api']

    def test_empty_step_details(self):
        assert _extract_api_refs({'step_details': []}) == []
        assert _extract_api_refs({}) == []

    def test_step_without_yaml(self):
        skill_data = {'step_details': [{'yaml': None}, {'title': 'no yaml'}]}
        assert _extract_api_refs(skill_data) == []


# ============================================================================
# discovery.discover_skills
# ============================================================================

class TestDiscoverSkills:
    def test_discovers_skill_and_maps_to_api(self, tmp_path):
        from tests.conftest import MINIMAL_SKILL_MD
        skill_dir = tmp_path / 'skills' / 'deploy-app'
        skill_dir.mkdir(parents=True)
        (skill_dir / 'SKILL.md').write_text(MINIMAL_SKILL_MD)

        result = discover_skills(tmp_path)
        assert 'test-api' in result
        assert len(result['test-api']) == 1
        assert result['test-api'][0]['slug'] == 'deploy-app'

    def test_skill_has_api_refs(self, tmp_path):
        from tests.conftest import MINIMAL_SKILL_MD
        skill_dir = tmp_path / 'skills' / 'deploy-app'
        skill_dir.mkdir(parents=True)
        (skill_dir / 'SKILL.md').write_text(MINIMAL_SKILL_MD)

        result = discover_skills(tmp_path)
        skill = result['test-api'][0]
        assert 'api_refs' in skill
        assert 'test-api' in skill['api_refs']

    def test_multi_api_skill_appears_in_each(self, tmp_path):
        import textwrap
        skill_md = textwrap.dedent("""\
            ---
            name: cross-api-skill
            description: A skill referencing two APIs
            ---
            ## Step 1: Get org
            ```yaml
            api: urn:api:access-mgmt
            operationId: getOrg
            ```

            ## Step 2: Create API
            ```yaml
            api: urn:api:api-manager
            operationId: createApi
            ```
        """)
        skill_dir = tmp_path / 'skills' / 'cross-api-skill'
        skill_dir.mkdir(parents=True)
        (skill_dir / 'SKILL.md').write_text(skill_md)

        result = discover_skills(tmp_path)
        assert 'access-mgmt' in result
        assert 'api-manager' in result
        # Same skill object in both
        assert result['access-mgmt'][0]['slug'] == 'cross-api-skill'
        assert result['api-manager'][0]['slug'] == 'cross-api-skill'

    def test_no_skills_dir_returns_empty(self, tmp_path):
        assert discover_skills(tmp_path) == {}

    def test_skips_non_skill_files(self, tmp_path):
        skills_dir = tmp_path / 'skills'
        skills_dir.mkdir()
        (skills_dir / 'README.md').write_text('not a skill')
        (skills_dir / 'some-dir').mkdir()
        # Dir without SKILL.md
        assert discover_skills(tmp_path) == {}
