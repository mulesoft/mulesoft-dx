"""Tests for the MCP spec parser."""

import json
import shutil
import textwrap
from pathlib import Path

import pytest

from portal_generator.parsers.mcp_parser import (
    parse_mcp,
    _collect_xorigin_refs,
    _load_enrichment,
    _apply_enrichment,
)


MINIMAL_SERVER_JSON = json.dumps({
    '$schema': 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    'name': 'com.mulesoft/exchange',
    'title': 'Exchange MCP API',
    'description': 'The Exchange MCP server.',
    'version': '2.4.5',
    'websiteUrl': 'https://anypoint.mulesoft.com/exchange',
    'remotes': [
        {'type': 'streamable-http', 'url': 'https://anypoint.mulesoft.com/exchange/mcp'},
        {'type': 'streamable-http', 'url': 'https://eu1.anypoint.mulesoft.com/exchange/mcp'},
        {'type': 'streamable-http', 'url': 'https://ca1.platform.mulesoft.com/exchange/mcp'},
    ],
})

MINIMAL_MCP_YAML = textwrap.dedent("""\
    capabilities:
      tools:
        listChanged: false
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
    'tags': ['Exchange', 'Asset Management'],
})


@pytest.fixture
def mcp_dir(tmp_path):
    d = tmp_path / 'exchange'
    d.mkdir()
    (d / 'server.json').write_text(MINIMAL_SERVER_JSON)
    (d / 'mcp.yaml').write_text(MINIMAL_MCP_YAML)
    (d / 'exchange.json').write_text(EXCHANGE_JSON)
    return d


def _write_minimal(d: Path, *, server_json=MINIMAL_SERVER_JSON, mcp_yaml: str = MINIMAL_MCP_YAML):
    """Helper: write the minimum files (server.json + mcp.yaml) to a dir."""
    (d / 'server.json').write_text(server_json)
    (d / 'mcp.yaml').write_text(mcp_yaml)


class TestParseMcp:
    def test_returns_none_when_mcp_yaml_missing(self, tmp_path):
        empty = tmp_path / 'empty'
        empty.mkdir()
        assert parse_mcp(empty) is None

    def test_reads_name_and_version_from_server_json(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['name'] == 'Exchange MCP API'
        assert data['version'] == '2.4.5'
        assert data['slug'] == 'exchange'

    def test_parses_without_server_json(self, tmp_path):
        d = tmp_path / 'no-server'
        d.mkdir()
        (d / 'mcp.yaml').write_text(MINIMAL_MCP_YAML)
        data = parse_mcp(d)
        assert data is not None
        assert data['slug'] == 'no-server'
        assert data['name'] == 'No Server MCP'
        assert data['servers'] == []

    def test_falls_back_to_directory_name_when_no_title(self, tmp_path):
        d = tmp_path / 'custom-mcp'
        d.mkdir()
        _write_minimal(d, server_json=json.dumps({
            '$schema': 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
            'name': 'com.example/custom',
            'version': '0.0.1',
            'remotes': [{'type': 'streamable-http', 'url': 'https://example.com/mcp'}],
        }))
        data = parse_mcp(d)
        # title absent -> fall back to server.name
        assert data['name'] == 'com.example/custom'
        assert data['slug'] == 'custom-mcp'

    def test_mcp_type_remote_with_http_remotes(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['mcp_type'] == 'remote'

    def test_mcp_type_local_with_stdio_transport(self, tmp_path):
        d = tmp_path / 'local-mcp'
        d.mkdir()
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            capabilities:
              tools:
                listChanged: true
            transport:
              kind: stdio
              command: npx my-mcp start
            tools:
              - name: doStuff
                description: Does stuff
                inputSchema:
                  type: object
                  properties: {}
        """))
        data = parse_mcp(d)
        assert data['mcp_type'] == 'local'
        assert data['transport']['kind'] == 'stdio'
        assert data['transport']['command'] == 'npx my-mcp start'
        assert data['servers'] == []

    def test_local_mcp_name_from_exchange_json(self, tmp_path):
        d = tmp_path / 'my-local'
        d.mkdir()
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            capabilities:
              tools: { listChanged: false }
            transport:
              kind: stdio
              command: npx my-local start
            tools: []
        """))
        (d / 'exchange.json').write_text(json.dumps({
            'name': 'My Local MCP',
            'version': '1.0.0',
            'tags': ['Local', 'IDE'],
        }))
        data = parse_mcp(d)
        assert data['name'] == 'My Local MCP'
        assert data['version'] == '1.0.0'
        assert data['mcp_type'] == 'local'
        assert [t['name'] for t in data['tags']] == ['Local', 'IDE']

    def test_transport_derived_from_remotes(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['transport']['kind'] == 'streamableHttp'

    def test_servers_come_from_remotes(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert len(data['servers']) == 3
        urls = [s['url'] for s in data['servers']]
        assert 'https://anypoint.mulesoft.com/exchange/mcp' in urls
        assert 'https://eu1.anypoint.mulesoft.com/exchange/mcp' in urls
        assert 'https://ca1.platform.mulesoft.com/exchange/mcp' in urls

    def test_extracts_tools_with_counts_and_display_names(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['tool_count'] == 2
        tools_by_name = {t['name']: t for t in data['tools']}
        assert tools_by_name['searchAssets']['_display_name'] == 'Search Assets'
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

    def test_tags_come_from_exchange_json(self, mcp_dir):
        data = parse_mcp(mcp_dir)
        assert data['tag_names'] == ['Exchange', 'Asset Management']
        assert data['tags'][0]['name'] == 'Exchange'
        assert data['tags'][0]['description'] == ''

    def test_tags_empty_when_no_exchange_json(self, tmp_path):
        d = tmp_path / 'no-tags'
        d.mkdir()
        _write_minimal(d)
        data = parse_mcp(d)
        assert data['tag_names'] == []
        assert data['tags'] == []

    def test_missing_type_falls_back_to_any(self, tmp_path):
        d = tmp_path / 'untyped'
        d.mkdir()
        (d / 'server.json').write_text(MINIMAL_SERVER_JSON)
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            tools:
              - name: anyValue
                inputSchema:
                  type: object
                  properties:
                    passthrough:
                      description: Accepts any JSON value
        """))
        data = parse_mcp(d)
        prop = data['tools'][0]['inputSchema']['properties']['passthrough']
        assert prop['_display_type'] == 'any'
        assert prop['_primary_type'] == 'any'

    def test_union_type_rendered_as_pipe(self, tmp_path):
        d = tmp_path / 'union'
        d.mkdir()
        (d / 'server.json').write_text(MINIMAL_SERVER_JSON)
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
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
        (d / 'server.json').write_text(MINIMAL_SERVER_JSON)
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
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
        (d / 'server.json').write_text(MINIMAL_SERVER_JSON)
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
            capabilities: {}
        """))
        data = parse_mcp(d)
        assert data['tool_count'] == 0
        assert data['prompt_count'] == 0
        assert data['resource_count'] == 0
        assert data['resource_template_count'] == 0

    def test_xorigin_refs_collected_from_tools(self, tmp_path):
        d = tmp_path / 'with-xorigin'
        d.mkdir()
        (d / 'server.json').write_text(MINIMAL_SERVER_JSON)
        (d / 'exchange.json').write_text(EXCHANGE_JSON)
        (d / 'mcp.yaml').write_text(textwrap.dedent("""\
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


class TestLocalCatalogStdioTransport:
    """Unit-level guard for the central design decision (#1/#2): a local MCP
    whose server.json carries a ``_meta`` catalog with tools + stdio transport
    + capabilities (and NO mcp.yaml) must parse as ``local`` with the command
    resolved from inside the catalog and all tools surfaced.

    This documents the contract the migration relies on. It exercises the
    parser against a synthetic tmp_path fixture, so it goes green as soon as
    the parser supports catalogs (which it already does)."""

    def _catalog_server_json(self):
        return json.dumps({
            '$schema': 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
            'name': 'com.mulesoft/local-cat',
            'title': 'Local Catalog MCP',
            'description': 'A local MCP whose tools live in the server.json catalog.',
            'version': '9.9.9',
            'websiteUrl': 'https://example.com/local',
            '_meta': {
                'com.mulesoft.omni/catalog': {
                    'capabilities': {'tools': {'listChanged': False}},
                    'transport': {'kind': 'stdio', 'command': 'npx local-cat start'},
                    'tools': [
                        {
                            'name': 'alpha',
                            'description': 'Alpha tool',
                            'inputSchema': {'type': 'object', 'properties': {}},
                        },
                        {
                            'name': 'beta',
                            'title': 'Beta Tool',
                            'description': 'Beta tool',
                            'inputSchema': {'type': 'object', 'properties': {}},
                        },
                    ],
                }
            },
        })

    def test_classified_as_local(self, tmp_path):
        d = tmp_path / 'local-cat'
        d.mkdir()
        (d / 'server.json').write_text(self._catalog_server_json())
        data = parse_mcp(d)
        assert data is not None
        assert data['mcp_type'] == 'local'
        assert data['servers'] == []

    def test_command_resolved_from_catalog_transport(self, tmp_path):
        d = tmp_path / 'local-cat'
        d.mkdir()
        (d / 'server.json').write_text(self._catalog_server_json())
        data = parse_mcp(d)
        assert data['transport']['kind'] == 'stdio'
        assert data['transport']['command'] == 'npx local-cat start'

    def test_tools_surfaced_from_catalog(self, tmp_path):
        d = tmp_path / 'local-cat'
        d.mkdir()
        (d / 'server.json').write_text(self._catalog_server_json())
        data = parse_mcp(d)
        assert data['tool_count'] == 2
        assert {t['name'] for t in data['tools']} == {'alpha', 'beta'}

    def test_capabilities_resolved_from_catalog(self, tmp_path):
        d = tmp_path / 'local-cat'
        d.mkdir()
        (d / 'server.json').write_text(self._catalog_server_json())
        data = parse_mcp(d)
        assert data['capabilities'] == {'tools': {'listChanged': False}}

    def test_ide_command_uses_catalog_transport(self, tmp_path):
        d = tmp_path / 'local-cat'
        d.mkdir()
        (d / 'server.json').write_text(self._catalog_server_json())
        data = parse_mcp(d)
        claude = data['ide_configs']['claude_code']['config']['mcpServers']['local-cat']
        assert claude['command'] == 'npx'
        assert claude['args'] == ['-y', 'local-cat', 'start']

    def test_catalog_without_transport_key(self, tmp_path):
        d = tmp_path / 'no-transport'
        d.mkdir()
        (d / 'server.json').write_text(json.dumps({
            '$schema': 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
            'name': 'com.mulesoft/no-transport',
            'title': 'No Transport MCP',
            'description': 'Catalog with tools but no transport key.',
            'version': '1.0.0',
            '_meta': {
                'com.mulesoft.omni/catalog': {
                    'capabilities': {'tools': {'listChanged': False}},
                    'tools': [
                        {'name': 'ping', 'description': 'Ping', 'inputSchema': {'type': 'object', 'properties': {}}},
                    ],
                }
            },
        }))
        data = parse_mcp(d)
        assert data is not None
        assert data['tool_count'] == 1
        # no transport key — parser must not crash; mcp_type falls back gracefully
        assert data['mcp_type'] in ('local', 'remote', 'unknown')


# Repo root resolved from this test file: scripts/tests/<file> -> parents[2] == worktree root.
# If this file is ever moved, update the index accordingly.
_REPO_ROOT = Path(__file__).resolve().parents[2]
assert (_REPO_ROOT / 'mcps').is_dir(), (
    f"_REPO_ROOT ({_REPO_ROOT}) does not look like the repo root — update parents[N] if this file moved"
)
_LOCAL_MCP_DIR = _REPO_ROOT / 'mcps' / 'mulesoft-mcp-server'

# Expected, migration-invariant facts about the real local MCP.
_EXPECTED_TOOL_COUNT = 21
_EXPECTED_STDIO_COMMAND = 'npx mulesoft-mcp-server start'

# Source-of-truth tool-name set, extracted from the PRE-migration
# mcps/mulesoft-mcp-server/mcp.yaml (grep -E '^  - name:'). The migration
# folds mcp.yaml into server.json's catalog; the post-migration
# server.json-only parse must yield EXACTLY this set — no tool lost OR renamed.
# Asserting the set (==) is stricter than a count: a rename keeps the count
# at 21 but breaks the set, which a count check would miss.
_EXPECTED_TOOL_NAMES = frozenset({
    'create_mule_project',
    'generate_mule_flow',
    'create_mcp_server',
    'deploy_mule_application',
    'list_applications',
    'update_mule_application',
    'run_local_mule_application',
    'create_install_runtime_fabric',
    'delete_runtime_fabric',
    'upgrade_runtime_fabric',
    'create_and_manage_assets',
    'search_asset',
    'get_platform_insights',
    'get_reuse_metrics',
    'manage_api_instance_policy',
    'list_api_instances',
    'create_and_manage_api_instances',
    'manage_flex_gateway_policy_project',
    'get_flex_gateway_policy_example',
    'create_api_spec_project',
    'generate_api_spec',
})


class TestRealLocalMcpMigration:
    """Tests against the REAL ``mcps/mulesoft-mcp-server/`` directory.

    These are the genuine RED tests for this change. They assert the
    post-migration state (mcp.yaml gone, tools+transport sourced from the
    server.json catalog) and therefore FAIL on today's pre-migration data.
    They guard no-regression: the migrated local MCP must stay ``local`` with
    all 21 tools and its stdio command intact."""

    def test_local_mcp_dir_resolves(self):
        # Guard against a wrong repo-root computation: if this fails the other
        # tests would fail for the wrong reason (path, not assertion).
        assert _LOCAL_MCP_DIR.is_dir()
        assert (_LOCAL_MCP_DIR / 'server.json').exists()

    def test_mcp_yaml_removed(self):
        # RED today: mcp.yaml still exists pre-migration. GREEN after Task 5.
        assert not (_LOCAL_MCP_DIR / 'mcp.yaml').exists()

    def test_server_json_carries_catalog_with_transport(self):
        # RED today: server.json has only display fields, no _meta catalog.
        # GREEN after Task 3 ports tools+transport into the catalog.
        server_data = json.loads((_LOCAL_MCP_DIR / 'server.json').read_text(encoding='utf-8'))
        meta = server_data.get('_meta')
        assert isinstance(meta, dict), 'server.json must carry a _meta block'
        catalog = next(
            (v for k, v in meta.items() if isinstance(k, str) and k.endswith('/catalog')),
            None,
        )
        assert isinstance(catalog, dict), 'server.json _meta must hold a /catalog object'
        transport = catalog.get('transport') or {}
        assert transport.get('command') == _EXPECTED_STDIO_COMMAND

    def _server_only_copy(self, tmp_path):
        """Copy ONLY the real server.json + exchange.json (NOT mcp.yaml) into a
        tmp dir keeping the same slug. This isolates the single-source path:
        whatever the parser produces here came exclusively from server.json.

        Pre-migration server.json has no catalog -> parser returns None (no
        mcp.yaml fallback present). Post-migration the catalog supplies tools
        and transport. This is what makes these tests genuinely RED today even
        though the live dir (with mcp.yaml) would parse identically."""
        dest = tmp_path / _LOCAL_MCP_DIR.name
        dest.mkdir()
        shutil.copy(_LOCAL_MCP_DIR / 'server.json', dest / 'server.json')
        exch = _LOCAL_MCP_DIR / 'exchange.json'
        if exch.exists():
            shutil.copy(exch, dest / 'exchange.json')
        return dest

    def test_command_resolved_from_server_json_only(self, tmp_path):
        # RED today: server.json alone has no catalog -> parse_mcp returns None
        # (no mcp.yaml in the isolated copy). GREEN after migration: command
        # resolves from the catalog transport block.
        dest = self._server_only_copy(tmp_path)
        data = parse_mcp(dest)
        assert data is not None, 'server.json alone must parse once it carries the catalog'
        assert data['mcp_type'] == 'local'
        assert data['transport']['kind'] == 'stdio'
        assert data['transport']['command'] == _EXPECTED_STDIO_COMMAND

    def test_all_tools_present_from_server_json_only(self, tmp_path):
        # RED today: server.json alone has no catalog -> None. GREEN after
        # migration: the catalog surfaces EXACTLY the pre-migration tool set.
        # Asserts the SET of names (==), not a count, so a renamed or dropped
        # tool fails even when the count still happens to be 21.
        dest = self._server_only_copy(tmp_path)
        data = parse_mcp(dest)
        assert data is not None
        tool_names = {t['name'] for t in data['tools']}
        assert tool_names == _EXPECTED_TOOL_NAMES

    def test_tools_have_non_empty_input_schemas(self, tmp_path):
        # Spot-check: a silently corrupted/dropped inputSchema would still pass
        # a name-set check — verify at least a few known tools have valid schemas.
        dest = self._server_only_copy(tmp_path)
        data = parse_mcp(dest)
        assert data is not None
        tools_by_name = {t['name']: t for t in data['tools']}
        # create_mule_project has known string properties
        schema = tools_by_name['create_mule_project']['inputSchema']
        assert schema.get('type') == 'object'
        assert 'projectPath' in schema.get('properties', {})
        # search_asset must also carry a schema
        assert tools_by_name['search_asset']['inputSchema'].get('type') == 'object'

    def test_ide_command_uses_server_json_transport(self, tmp_path):
        # RED today: server.json alone has no catalog -> None. GREEN after
        # migration: IDE command derives from the catalog transport.
        dest = self._server_only_copy(tmp_path)
        data = parse_mcp(dest)
        assert data is not None
        slug = _LOCAL_MCP_DIR.name
        claude = data['ide_configs']['claude_code']['config']['mcpServers'][slug]
        assert claude['command'] == 'npx'
        assert claude['args'] == ['-y', 'mulesoft-mcp-server', 'start']

    def test_exchange_json_main_points_to_server_json(self):
        exchange = json.loads((_LOCAL_MCP_DIR / 'exchange.json').read_text(encoding='utf-8'))
        assert exchange.get('main') == 'server.json', (
            'exchange.json "main" must point to server.json (single source of truth)'
        )

    def test_live_dir_still_parses_as_local_no_regression(self):
        # No-regression guard against the LIVE dir (mcp.yaml present today,
        # catalog after migration). Output must be migration-invariant: local
        # type, 21 tools, stdio command. PASSES today AND after migration —
        # this is the equivalence oracle, not a red test.
        data = parse_mcp(_LOCAL_MCP_DIR)
        assert data is not None
        assert data['mcp_type'] == 'local'
        assert data['tool_count'] == _EXPECTED_TOOL_COUNT
        assert {t['name'] for t in data['tools']} == _EXPECTED_TOOL_NAMES
        assert data['transport']['command'] == _EXPECTED_STDIO_COMMAND


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


class TestLoadEnrichment:
    def test_loads_inline_xorigin(self, tmp_path):
        (tmp_path / 'enrichment.yaml').write_text(textwrap.dedent("""\
            parameters:
              organization_id:
                x-origin:
                  - api: urn:api:access-management
                    operation: listMe
                    values: $.user.organization.id
        """))
        result = _load_enrichment(tmp_path)
        assert 'organization_id' in result
        assert result['organization_id']['x-origin'][0]['api'] == 'urn:api:access-management'

    def test_resolves_ref_in_xorigin(self, tmp_path):
        # Create fragment
        fragment_dir = tmp_path / 'fragments'
        fragment_dir.mkdir()
        (fragment_dir / 'shared.yaml').write_text(textwrap.dedent("""\
            components:
              parameters:
                orgId:
                  x-origin:
                    - api: urn:api:access-management
                      operation: listMe
                      values: $.user.organization.id
        """))
        # Create enrichment with $ref
        mcp_dir = tmp_path / 'mcps' / 'my-mcp'
        mcp_dir.mkdir(parents=True)
        (mcp_dir / 'enrichment.yaml').write_text(textwrap.dedent("""\
            parameters:
              organization_id:
                x-origin:
                  $ref: ../../fragments/shared.yaml#/components/parameters/orgId/x-origin
        """))
        result = _load_enrichment(mcp_dir)
        assert 'organization_id' in result
        xorigin = result['organization_id']['x-origin']
        assert isinstance(xorigin, list)
        assert xorigin[0]['api'] == 'urn:api:access-management'

    def test_missing_file_returns_empty(self, tmp_path):
        assert _load_enrichment(tmp_path) == {}

    def test_missing_ref_target_keeps_ref(self, tmp_path):
        (tmp_path / 'enrichment.yaml').write_text(textwrap.dedent("""\
            parameters:
              org_id:
                x-origin:
                  $ref: nonexistent.yaml#/foo
        """))
        result = _load_enrichment(tmp_path)
        assert '$ref' in result['org_id']['x-origin']


class TestApplyEnrichment:
    def test_merges_xorigin_into_matching_properties(self):
        tools = [{'inputSchema': {'properties': {
            'organization_id': {'type': 'string', 'title': 'Org ID'},
            'name': {'type': 'string'},
        }}}]
        enrichment = {
            'organization_id': {
                'x-origin': [{'api': 'urn:api:am', 'operation': 'listMe', 'values': '$.id'}]
            }
        }
        _apply_enrichment(tools, enrichment)
        assert 'x-origin' in tools[0]['inputSchema']['properties']['organization_id']
        assert 'x-origin' not in tools[0]['inputSchema']['properties']['name']

    def test_applies_to_multiple_tools(self):
        tools = [
            {'inputSchema': {'properties': {'org_id': {'type': 'string'}}}},
            {'inputSchema': {'properties': {'org_id': {'type': 'string'}}}},
        ]
        enrichment = {'org_id': {'x-origin': [{'api': 'urn:api:am', 'operation': 'op'}]}}
        _apply_enrichment(tools, enrichment)
        assert 'x-origin' in tools[0]['inputSchema']['properties']['org_id']
        assert 'x-origin' in tools[1]['inputSchema']['properties']['org_id']

    def test_empty_enrichment_no_op(self):
        tools = [{'inputSchema': {'properties': {'x': {'type': 'string'}}}}]
        _apply_enrichment(tools, {})
        assert 'x-origin' not in tools[0]['inputSchema']['properties']['x']

    def test_skips_tools_without_matching_properties(self):
        tools = [{'inputSchema': {'properties': {'name': {'type': 'string'}}}}]
        enrichment = {'org_id': {'x-origin': [{'api': 'urn:api:am', 'operation': 'op'}]}}
        _apply_enrichment(tools, enrichment)
        assert 'x-origin' not in tools[0]['inputSchema']['properties']['name']


class TestEnrichmentIntegration:
    def test_parse_mcp_applies_enrichment(self, tmp_path):
        """End-to-end: parse_mcp loads enrichment.yaml and merges x-origin."""
        # Create fragment
        fragment_dir = tmp_path / 'fragments'
        fragment_dir.mkdir()
        (fragment_dir / 'fragment.yaml').write_text(textwrap.dedent("""\
            components:
              parameters:
                orgId:
                  x-origin:
                    - api: urn:api:access-management
                      operation: listMe
                      values: $.user.organization.id
                      labels: $.user.organization.name
        """))
        # Create MCP dir
        mcp_dir = tmp_path / 'my-mcp'
        mcp_dir.mkdir()
        (mcp_dir / 'server.json').write_text(json.dumps({
            '$schema': 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
            'name': 'com.example/test',
            'title': 'Test MCP',
            'version': '1.0.0',
            'remotes': [{'type': 'streamable-http', 'url': 'https://example.com/mcp'}],
        }))
        (mcp_dir / 'mcp.yaml').write_text(textwrap.dedent("""\
            capabilities:
              tools:
                listChanged: false
            tools:
              - name: listApps
                description: List applications
                inputSchema:
                  type: object
                  properties:
                    organization_id:
                      type: string
                      title: Organization ID
                    name:
                      type: string
                  required:
                    - organization_id
        """))
        (mcp_dir / 'enrichment.yaml').write_text(textwrap.dedent("""\
            parameters:
              organization_id:
                x-origin:
                  $ref: ../fragments/fragment.yaml#/components/parameters/orgId/x-origin
        """))
        result = parse_mcp(mcp_dir)
        assert result is not None
        tool = result['tools'][0]
        org_prop = tool['inputSchema']['properties']['organization_id']
        assert 'x-origin' in org_prop
        assert org_prop['x-origin'][0]['api'] == 'urn:api:access-management'
        assert 'access-management' in result['xorigin_api_refs']
