"""Tests for the MCP spec parser."""

import json
import textwrap
from pathlib import Path

import pytest

from portal_generator.parsers.mcp_parser import parse_mcp


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
