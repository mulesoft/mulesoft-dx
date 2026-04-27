"""Tests for the MCP spec parser."""

import json
import textwrap
from pathlib import Path

import pytest

from portal_generator.parsers.mcp_parser import parse_mcp, _collect_xorigin_refs


MINIMAL_SERVER_YAML = textwrap.dedent("""\
    servers:
      - url: https://anypoint.mulesoft.com/exchange
      - url: https://eu1.anypoint.mulesoft.com/exchange
      - url: https://{region}.platform.mulesoft.com/exchange
        variables:
          region:
            default: ca1
            description: Region identifier
""")

MINIMAL_MCP_YAML = textwrap.dedent("""\
    capabilities:
      tools:
        listChanged: false
    transport:
      kind: streamableHttp
      path: /mcp
    tools:
      - name: searchAssets
        description: Search for assets
        inputSchema:
          type: object
          properties:
            q:
              type: string
              description: Query string
            limit:
              type: integer
              default: 20
          required:
            - q
      - name: getProfile
        title: User Profile
        description: Get current user profile
        inputSchema:
          type: object
          properties: {}
          required: []
    prompts:
      - name: reviewTemplate
        description: Review asset quality
        arguments:
          - name: assetId
            description: Asset identifier
            required: true
    resources:
      - name: readme
        uri: exchange://docs/readme
        description: Exchange readme
        mimeType: text/markdown
    resourceTemplates:
      - name: assetDoc
        uriTemplate: exchange://docs/{assetId}
        description: Per-asset documentation
""")

EXCHANGE_JSON = json.dumps({
    'main': 'mcp.yaml',
    'name': 'Exchange MCP API',
    'groupId': 'com.example.anypoint-platform',
    'assetId': 'exchange',
    'version': '2.4.5',
    'apiVersion': 'v2',
    'classifier': 'mcp-metadata',
})


@pytest.fixture
def mcp_dir(tmp_path):
    d = tmp_path / 'exchange'
    d.mkdir()
    (d / 'server.yaml').write_text(MINIMAL_SERVER_YAML)
    (d / 'mcp.yaml').write_text(MINIMAL_MCP_YAML)
    (d / 'exchange.json').write_text(EXCHANGE_JSON)
    return d


class TestParseMcp:
    def test_returns_none_when_mcp_yaml_missing(self, tmp_path):
        empty = tmp_path / 'empty'
        empty.mkdir()
        assert parse_mcp(empty) is None

    def test_reads_name_and_version_from_exchange(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['name'] == 'Exchange MCP API'
        assert data['version'] == '2.4.5'
        assert data['slug'] == 'exchange'

    def test_falls_back_to_directory_name_when_no_exchange(self, tmp_path):
        d = tmp_path / 'custom-mcp'
        d.mkdir()
        (d / 'mcp.yaml').write_text(MINIMAL_MCP_YAML)
        data = parse_mcp(d)
        # Title-cased slug + ' MCP'
        assert 'Custom-Mcp' in data['name'] or 'Custom Mcp' in data['name']
        assert data['slug'] == 'custom-mcp'

    def test_normalizes_transport(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['transport']['kind'] == 'streamableHttp'
        assert data['transport']['path'] == '/mcp'
        assert data['transport']['sse_path'] == ''

    def test_normalizes_servers_with_variables(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert len(data['servers']) == 3
        urls = [s['url'] for s in data['servers']]
        assert 'https://anypoint.mulesoft.com/exchange' in urls
        regional = next(s for s in data['servers'] if '{region}' in s['url'])
        assert 'region' in regional['variables']
        assert regional['variables']['region']['default'] == 'ca1'

    def test_extracts_tools_with_counts_and_display_names(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['tool_count'] == 2
        tools_by_name = {t['name']: t for t in data['tools']}
        assert tools_by_name['searchAssets']['_display_name'] == 'searchAssets'
        # title takes precedence
        assert tools_by_name['getProfile']['_display_name'] == 'User Profile'

    def test_extracts_prompts(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['prompt_count'] == 1
        prompt = data['prompts'][0]
        assert prompt['name'] == 'reviewTemplate'
        assert prompt['arguments'][0]['name'] == 'assetId'

    def test_extracts_resources(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['resource_count'] == 1
        assert data['resources'][0]['uri'] == 'exchange://docs/readme'

    def test_extracts_resource_templates(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['resource_template_count'] == 1
        assert data['resource_templates'][0]['uriTemplate'] == 'exchange://docs/{assetId}'

    def test_marks_private_visibility(self, tmp_path):
        d = tmp_path / 'priv'
        d.mkdir()
        (d / 'mcp.yaml').write_text(MINIMAL_MCP_YAML)
        priv_exchange = json.loads(EXCHANGE_JSON)
        priv_exchange['visibility'] = 'private'
        (d / 'exchange.json').write_text(json.dumps(priv_exchange))
        data = parse_mcp(d)
        assert data['private'] is True

    def test_union_type_rendered_as_pipe(self, tmp_path):
        d = tmp_path / 'union'
        d.mkdir()
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            transport:
              kind: streamableHttp
              path: /mcp
            tools:
              - name: withUnion
                inputSchema:
                  type: object
                  properties:
                    name:
                      anyOf:
                        - type: string
                        - type: 'null'
                      default: alice
                    state:
                      type: [string, 'null']
                  required: [name]
        """))
        data = parse_mcp(d)
        tool = data['tools'][0]
        props = tool['inputSchema']['properties']
        assert props['name']['_display_type'] == 'string | null'
        assert props['name']['_primary_type'] == 'string'
        assert props['name']['default'] == 'alice'
        assert props['state']['_display_type'] == 'string | null'

    def test_default_propagates_to_input_properties(self, tmp_path):
        d = tmp_path / 'defaults'
        d.mkdir()
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            transport:
              kind: streamableHttp
              path: /mcp
            tools:
              - name: withDefaults
                inputSchema:
                  type: object
                  properties:
                    limit:
                      type: integer
                      default: 20
        """))
        data = parse_mcp(d)
        prop = data['tools'][0]['_input_properties'][0]
        assert prop['schema']['default'] == 20

    def test_missing_optional_sections_default_to_empty(self, tmp_path):
        d = tmp_path / 'minimal'
        d.mkdir()
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            transport:
              kind: streamableHttp
              path: /mcp
        """))
        data = parse_mcp(d)
        assert data['tool_count'] == 0
        assert data['prompt_count'] == 0
        assert data['resource_count'] == 0
        assert data['resource_template_count'] == 0

    def test_xorigin_refs_collected_from_tools(self, tmp_path):
        d = tmp_path / 'with-xorigin'
        d.mkdir()
        (d / 'server.yaml').write_text(MINIMAL_SERVER_YAML)
        (d / 'exchange.json').write_text(EXCHANGE_JSON)
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            transport:
              kind: streamableHttp
              path: /mcp
            tools:
              - name: getAsset
                description: Get asset details
                inputSchema:
                  type: object
                  properties:
                    assetId:
                      type: string
                      x-origin:
                        - api: urn:mcp:exchange
                          operation: searchAssets
                          values: $[*].assetId
                    envId:
                      type: string
                      x-origin:
                        - api: urn:api:access-management
                          operation: listEnvironments
                          values: $.data[*].id
                  required:
                    - assetId
        """))
        data = parse_mcp(d)
        assert data['xorigin_api_refs'] == {'access-management'}
        assert data['xorigin_mcp_refs'] == {'exchange'}

    def test_xorigin_refs_empty_when_no_xorigin(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['xorigin_api_refs'] == set()
        assert data['xorigin_mcp_refs'] == set()


class TestCollectXoriginRefs:
    def test_extracts_api_refs(self):
        tools = [{'inputSchema': {'properties': {
            'envId': {'type': 'string', 'x-origin': [
                {'api': 'urn:api:access-management', 'operation': 'listEnvs', 'values': '$.data[*].id'}
            ]}
        }}}]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == {'access-management'}
        assert mcp_refs == set()

    def test_extracts_mcp_refs(self):
        tools = [{'inputSchema': {'properties': {
            'assetId': {'type': 'string', 'x-origin': [
                {'api': 'urn:mcp:exchange', 'operation': 'searchAssets', 'values': '$[*].assetId'}
            ]}
        }}}]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == set()
        assert mcp_refs == {'exchange'}

    def test_mixed_api_and_mcp_refs(self):
        tools = [{'inputSchema': {'properties': {
            'assetId': {'type': 'string', 'x-origin': [
                {'api': 'urn:mcp:exchange', 'operation': 'searchAssets', 'values': '$[*].assetId'},
                {'api': 'urn:api:catalog', 'operation': 'listAssets', 'values': '$[*].id'},
            ]}
        }}}]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == {'catalog'}
        assert mcp_refs == {'exchange'}

    def test_multiple_tools_aggregate_refs(self):
        tools = [
            {'inputSchema': {'properties': {
                'envId': {'type': 'string', 'x-origin': [
                    {'api': 'urn:api:access-management', 'operation': 'listEnvs', 'values': '$.data[*].id'}
                ]}
            }}},
            {'inputSchema': {'properties': {
                'orgId': {'type': 'string', 'x-origin': [
                    {'api': 'urn:api:core-services', 'operation': 'getOrgs', 'values': '$[*].id'}
                ]}
            }}},
        ]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == {'access-management', 'core-services'}
        assert mcp_refs == set()

    def test_no_xorigin_returns_empty(self):
        tools = [{'inputSchema': {'properties': {
            'q': {'type': 'string'},
            'limit': {'type': 'integer'},
        }}}]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == set()
        assert mcp_refs == set()

    def test_empty_tools_list(self):
        api_refs, mcp_refs = _collect_xorigin_refs([])
        assert api_refs == set()
        assert mcp_refs == set()

    def test_tool_without_input_schema(self):
        tools = [{'name': 'noSchema'}]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == set()
        assert mcp_refs == set()

    def test_skips_non_dict_xorigin(self):
        tools = [{'inputSchema': {'properties': {
            'x': {'type': 'string', 'x-origin': 'not-a-list'}
        }}}]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == set()
        assert mcp_refs == set()

    def test_skips_non_dict_source_entries(self):
        tools = [{'inputSchema': {'properties': {
            'x': {'type': 'string', 'x-origin': ['not-a-dict']}
        }}}]
        api_refs, mcp_refs = _collect_xorigin_refs(tools)
        assert api_refs == set()
        assert mcp_refs == set()
