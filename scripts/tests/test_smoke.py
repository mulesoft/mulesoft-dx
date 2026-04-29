"""End-to-end smoke test for the portal generator."""

import json
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from portal_generator import PortalGenerator
from tests.conftest import (
    MINIMAL_OAS_YAML, MINIMAL_EXCHANGE_JSON, MINIMAL_SKILL_MD,
    PRIVATE_EXCHANGE_JSON, PROSE_ONLY_SKILL_MD, setup_schema_docs,
    MINIMAL_MCP_SERVER_JSON, MINIMAL_MCP_YAML, MINIMAL_MCP_EXCHANGE_JSON,
)


@pytest.fixture
def generated_portal(tmp_path):
    """Run the full generator against a minimal fixture and return the output dir."""
    repo = tmp_path / 'repo'
    repo.mkdir()

    # APIs now live under apis/ folder
    apis_dir = repo / 'apis'
    apis_dir.mkdir()

    api_dir = apis_dir / 'test-api'
    api_dir.mkdir()
    (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
    (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

    skill_dir = repo / 'skills' / 'deploy-app'
    skill_dir.mkdir(parents=True)
    (skill_dir / 'SKILL.md').write_text(MINIMAL_SKILL_MD)

    prose_skill_dir = repo / 'skills' / 'platform-guide'
    prose_skill_dir.mkdir(parents=True)
    (prose_skill_dir / 'SKILL.md').write_text(PROSE_ONLY_SKILL_MD)

    mcp_dir = repo / 'mcps' / 'test-mcp'
    mcp_dir.mkdir(parents=True)
    (mcp_dir / 'server.json').write_text(MINIMAL_MCP_SERVER_JSON)
    (mcp_dir / 'mcp.yaml').write_text(MINIMAL_MCP_YAML)
    (mcp_dir / 'exchange.json').write_text(MINIMAL_MCP_EXCHANGE_JSON)

    setup_schema_docs(repo)

    output = tmp_path / 'portal_output'
    generator = PortalGenerator(output, base_url='https://test-api-portal.example.com')
    generator.generate(repo)
    return output


class TestGeneratedFiles:
    def test_index_html_exists(self, generated_portal):
        assert (generated_portal / 'index.html').exists()

    def test_detail_page_exists(self, generated_portal):
        assert (generated_portal / 'apis' / 'test-api.html').exists()

    def test_css_exists(self, generated_portal):
        css = generated_portal / 'assets' / 'styles.css'
        assert css.exists()
        assert css.stat().st_size > 0

    def test_portal_js_exists(self, generated_portal):
        js = generated_portal / 'assets' / 'portal.js'
        assert js.exists()
        assert js.stat().st_size > 0

    def test_jsonpath_js_exists(self, generated_portal):
        assert (generated_portal / 'assets' / 'jsonpath-plus.min.js').exists()


class TestHomepageStructure:
    @pytest.fixture(autouse=True)
    def _parse_homepage(self, generated_portal):
        html = (generated_portal / 'index.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_has_main_element(self):
        main = self.soup.find('main')
        assert main is not None

    def test_has_title(self):
        title = self.soup.find('title')
        assert title is not None
        assert len(title.string.strip()) > 0

    def test_contains_api_card(self):
        assert self.soup.find(string=lambda t: t and 'Test API' in t) is not None

    def test_links_to_detail_page(self):
        link = self.soup.find('a', href=lambda h: h and 'test-api' in h)
        assert link is not None


class TestDetailPageStructure:
    @pytest.fixture(autouse=True)
    def _parse_detail(self, generated_portal):
        html = (generated_portal / 'apis' / 'test-api.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_has_main_element(self):
        main = self.soup.find('main')
        assert main is not None

    def test_has_sidebar_nav(self):
        nav = self.soup.find('nav')
        assert nav is not None

    def test_contains_operation_ids(self):
        html_text = str(self.soup)
        assert 'listResources' in html_text
        assert 'createResource' in html_text

    def test_contains_api_title(self):
        assert self.soup.find(string=lambda t: t and 'Test API' in t) is not None

    def test_links_to_skill_page(self):
        link = self.soup.find('a', href=lambda h: h and 'skills/deploy-app.html' in h)
        assert link is not None


class TestSkillPageStructure:
    @pytest.fixture(autouse=True)
    def _parse_skill_page(self, generated_portal):
        html = (generated_portal / 'skills' / 'deploy-app.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_skill_page_exists(self, generated_portal):
        assert (generated_portal / 'skills' / 'deploy-app.html').exists()

    def test_has_main_element(self):
        assert self.soup.find('main') is not None

    def test_contains_skill_content(self):
        html_text = str(self.soup)
        assert 'deploy-app' in html_text
        assert 'List targets' in html_text

    def test_has_sidebar(self):
        assert self.soup.find('aside') is not None

    def test_has_xorigin_modal(self):
        modal = self.soup.find('div', id='xorigin-modal')
        assert modal is not None

    def test_has_api_link_prefix(self):
        scripts = self.soup.find_all('script')
        script_text = ' '.join(s.string or '' for s in scripts)
        assert "__API_LINK_PREFIX__" in script_text


class TestProseOnlySkillPage:
    """Prose-only skills render the header but hide auth panel and interactive elements."""
    @pytest.fixture(autouse=True)
    def _parse_prose_skill_page(self, generated_portal):
        html = (generated_portal / 'skills' / 'platform-guide.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_prose_skill_page_exists(self, generated_portal):
        assert (generated_portal / 'skills' / 'platform-guide.html').exists()

    def test_has_header_bar(self):
        header = self.soup.find('div', class_='auth-panel-header-bar')
        assert header is not None

    def test_no_auth_panel_right(self):
        right = self.soup.find('div', class_='auth-panel-right')
        assert right is None

    def test_no_auth_modal(self):
        modal = self.soup.find('div', class_='auth-modal')
        assert modal is None

    def test_no_interactive_mode_toggle(self):
        toggle = self.soup.find('div', class_='skill-mode-toggle-container')
        assert toggle is None

    def test_has_guide_badge(self):
        badge = self.soup.find('span', class_='badge-version', string='Guide')
        assert badge is not None


class TestHomepageSkillLinks:
    @pytest.fixture(autouse=True)
    def _parse_homepage(self, generated_portal):
        html = (generated_portal / 'index.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_skill_card_links_to_skill_page(self):
        link = self.soup.find('a', href=lambda h: h and h == 'skills/deploy-app.html')
        assert link is not None

    def test_skill_card_has_skill_badge(self):
        badge = self.soup.find('span', class_='badge-skills', string='Skill')
        assert badge is not None


class TestRegistryStructure:
    def test_registry_exists(self, generated_portal):
        assert (generated_portal / 'registry.json').exists()

    def test_skill_docs_points_to_skill_page(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        skill_entries = [e for e in registry if e['kind'] == 'agent-skill']
        assert len(skill_entries) > 0
        for entry in skill_entries:
            assert entry['docs'].startswith('skills/')
            assert entry['docs'].endswith('.html')

    def test_registry_has_api_and_skill_entries(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        kinds = {e['kind'] for e in registry}
        assert 'oas' in kinds
        assert 'agent-skill' in kinds

    def test_skill_entries_are_unique(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        skill_entries = [e for e in registry if e['kind'] == 'agent-skill']
        slugs = [e['slug'] for e in skill_entries]
        assert len(slugs) == len(set(slugs)), "Skills should appear once, not duplicated per API"

    def test_skill_entries_have_apis_array(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        skill_entries = [e for e in registry if e['kind'] == 'agent-skill']
        assert len(skill_entries) > 0
        for entry in skill_entries:
            assert 'apis' in entry, "Skill entries should have 'apis' array, not 'api' string"
            assert isinstance(entry['apis'], list)
            assert 'api' not in entry

    def test_skill_href_is_flat_path(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        skill_entries = [e for e in registry if e['kind'] == 'agent-skill']
        for entry in skill_entries:
            parts = entry['href'].split('/')
            assert len(parts) == 3, f"Expected skills/{{slug}}/SKILL.md, got {entry['href']}"
            assert parts[0] == 'skills'
            assert parts[2] == 'SKILL.md'

    def test_registry_has_schema_entries(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        schema_entries = [e for e in registry if e['kind'] in ('json-schema', 'schema-doc')]
        assert len(schema_entries) == 2
        ids = {e['$id'] for e in schema_entries}
        assert 'urn:schema:x-origin' in ids
        assert 'urn:schema:jtbd' in ids

    def test_registry_schema_href_points_to_files(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        for entry in registry:
            if entry['$id'] == 'urn:schema:x-origin':
                assert entry['href'] == 'schemas/x-origin.schema.json'
                assert entry['docs'] == 'schemas/x-origin-schema.md'
            elif entry['$id'] == 'urn:schema:jtbd':
                assert entry['href'] == 'schemas/jtbd-schema.md'


class TestAgentFiles:
    """Verify AGENTS.md, llms.txt, and schema files are generated."""

    def test_agents_md_exists(self, generated_portal):
        agents_md = generated_portal / 'AGENTS.md'
        assert agents_md.exists()
        content = agents_md.read_text(encoding='utf-8')
        assert 'registry.json' in content
        assert 'urn:api:' in content

    def test_agents_md_uses_base_url(self, generated_portal):
        content = (generated_portal / 'AGENTS.md').read_text(encoding='utf-8')
        assert 'https://test-api-portal.example.com' in content

    def test_agents_md_lists_apis(self, generated_portal):
        content = (generated_portal / 'AGENTS.md').read_text(encoding='utf-8')
        assert 'Test API' in content

    def test_llms_txt_exists(self, generated_portal):
        llms_txt = generated_portal / 'llms.txt'
        assert llms_txt.exists()
        content = llms_txt.read_text(encoding='utf-8')
        assert 'AGENTS.md' in content
        assert 'registry.json' in content

    def test_llms_txt_uses_base_url(self, generated_portal):
        content = (generated_portal / 'llms.txt').read_text(encoding='utf-8')
        assert 'https://test-api-portal.example.com' in content

    def test_schemas_directory_exists(self, generated_portal):
        schemas_dir = generated_portal / 'schemas'
        assert schemas_dir.is_dir()
        assert (schemas_dir / 'x-origin.schema.json').exists()
        assert (schemas_dir / 'x-origin-schema.md').exists()
        assert (schemas_dir / 'jtbd-schema.md').exists()
        assert (schemas_dir / 'jtbd-template.md').exists()


class TestSkillPreamble:
    """Verify SKILL.md portal copies include the agent directive after frontmatter."""

    def test_skill_copy_has_agent_directive(self, generated_portal):
        skill_md = generated_portal / 'skills' / 'deploy-app' / 'SKILL.md'
        assert skill_md.exists()
        content = skill_md.read_text(encoding='utf-8')
        assert '> **Agent context:**' in content
        assert 'AGENTS.md' in content

    def test_directive_is_after_frontmatter(self, generated_portal):
        content = (generated_portal / 'skills' / 'deploy-app' / 'SKILL.md').read_text(encoding='utf-8')
        fm_end = content.index('---', content.index('---') + 3) + 3
        after_fm = content[fm_end:]
        assert '> **Agent context:**' in after_fm

    def test_skill_copy_preserves_original_content(self, generated_portal):
        content = (generated_portal / 'skills' / 'deploy-app' / 'SKILL.md').read_text(encoding='utf-8')
        assert 'name: deploy-app' in content
        assert 'urn:api:test-api' in content


class TestHtmlLinkTags:
    """Verify HTML pages include agent-discovery link tags."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, generated_portal):
        html = (generated_portal / 'index.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_has_registry_link(self):
        link = self.soup.find('link', rel='alternate', type='application/json')
        assert link is not None
        assert 'registry.json' in link.get('href', '')

    def test_has_agents_link(self):
        link = self.soup.find('link', attrs={'title': 'Agent Guide'})
        assert link is not None
        assert 'AGENTS.md' in link.get('href', '')

    def test_has_robots_meta(self):
        meta = self.soup.find('meta', attrs={'name': 'robots'})
        assert meta is not None
        assert meta.get('content') == 'index, follow'


class TestHomepageAgentLinks:
    """Verify the homepage has <link> tags in <head> for agent discovery."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, generated_portal):
        html = (generated_portal / 'index.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_has_agents_md_head_link(self):
        link = self.soup.find('link', attrs={'href': lambda v: v and 'AGENTS.md' in v})
        assert link is not None
        assert link.get('rel') == ['help']

    def test_has_llms_txt_head_link(self):
        link = self.soup.find('link', attrs={'href': lambda v: v and 'llms.txt' in v})
        assert link is not None
        assert link.get('type') == 'text/plain'

    def test_has_registry_json_head_link(self):
        link = self.soup.find('link', attrs={'href': lambda v: v and 'registry.json' in v})
        assert link is not None
        assert link.get('type') == 'application/json'


# Removed TestSkillPageRawLink class - SKILL.MD button was removed from UI
# Per user request: "Remove the SKILL.MD button"


class TestGenerationWithoutSkills:
    """Verify the generator works with an API that has no skills."""

    def test_generates_without_skills(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()

        # APIs now live under apis/ folder
        apis_dir = repo / 'apis'
        apis_dir.mkdir()

        api_dir = apis_dir / 'simple-api'
        api_dir.mkdir()
        (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
        (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)
        setup_schema_docs(repo)

        output = tmp_path / 'output'
        generator = PortalGenerator(output)
        generator.generate(repo)

        assert (output / 'index.html').exists()
        assert (output / 'apis' / 'simple-api.html').exists()
        assert (output / 'AGENTS.md').exists()
        assert (output / 'llms.txt').exists()


class TestGenerationMultipleApis:
    """Verify the generator handles multiple APIs."""

    def test_multiple_apis_produce_separate_pages(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()

        # APIs now live under apis/ folder
        apis_dir = repo / 'apis'
        apis_dir.mkdir()

        for name in ['alpha-api', 'beta-api']:
            api_dir = apis_dir / name
            api_dir.mkdir()
            (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
            (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

        setup_schema_docs(repo)

        output = tmp_path / 'output'
        generator = PortalGenerator(output)
        generator.generate(repo)

        assert (output / 'apis' / 'alpha-api.html').exists()
        assert (output / 'apis' / 'beta-api.html').exists()

        index_html = (output / 'index.html').read_text(encoding='utf-8')
        assert 'alpha-api' in index_html
        assert 'beta-api' in index_html


class TestPrivateApiExclusion:
    """Verify private APIs are excluded from portal but included in registry."""

    @pytest.fixture
    def portal_with_private_api(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()
        apis_dir = repo / 'apis'
        apis_dir.mkdir()

        # Public API
        public_dir = apis_dir / 'public-api'
        public_dir.mkdir()
        (public_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
        (public_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

        # Private API
        private_dir = apis_dir / 'private-api'
        private_dir.mkdir()
        (private_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
        (private_dir / 'exchange.json').write_text(PRIVATE_EXCHANGE_JSON)

        setup_schema_docs(repo)

        output = tmp_path / 'output'
        generator = PortalGenerator(output)
        generator.generate(repo)
        return output

    def test_private_api_not_on_homepage(self, portal_with_private_api):
        html = (portal_with_private_api / 'index.html').read_text(encoding='utf-8')
        assert 'private-api.html' not in html

    def test_public_api_on_homepage(self, portal_with_private_api):
        html = (portal_with_private_api / 'index.html').read_text(encoding='utf-8')
        assert 'public-api' in html

    def test_private_api_no_detail_page(self, portal_with_private_api):
        assert not (portal_with_private_api / 'apis' / 'private-api.html').exists()

    def test_public_api_has_detail_page(self, portal_with_private_api):
        assert (portal_with_private_api / 'apis' / 'public-api.html').exists()

    def test_private_api_in_registry(self, portal_with_private_api):
        registry = json.loads((portal_with_private_api / 'registry.json').read_text())
        api_entries = [e for e in registry if e['kind'] == 'oas']
        slugs = [e['slug'] for e in api_entries]
        assert 'private-api' in slugs

    def test_private_api_registry_has_no_docs(self, portal_with_private_api):
        registry = json.loads((portal_with_private_api / 'registry.json').read_text())
        private_entry = [e for e in registry if e.get('slug') == 'private-api'][0]
        assert 'docs' not in private_entry
        assert 'href' in private_entry

    def test_public_api_registry_has_docs(self, portal_with_private_api):
        registry = json.loads((portal_with_private_api / 'registry.json').read_text())
        public_entry = [e for e in registry if e.get('slug') == 'public-api'][0]
        assert 'docs' in public_entry

    def test_private_api_yaml_copied(self, portal_with_private_api):
        assert (portal_with_private_api / 'apis' / 'private-api' / 'api.yaml').exists()


class TestRefSubdirectoriesCopied:
    """Verify that subdirectories (schemas, examples, requests) next to api.yaml
    are copied to the portal output so that $ref links resolve correctly."""

    @pytest.fixture
    def portal_with_ref_subdirs(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()
        apis_dir = repo / 'apis'
        apis_dir.mkdir()

        api_dir = apis_dir / 'ref-api'
        api_dir.mkdir()
        (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
        (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

        # Create subdirectories with schema/example files
        schemas_dir = api_dir / 'schemas'
        schemas_dir.mkdir()
        (schemas_dir / 'model.json').write_text('{"type": "object"}')

        requests_dir = api_dir / 'requests'
        requests_dir.mkdir()
        (requests_dir / 'body.json').write_text('{"type": "object"}')

        # Nested subdirectory
        nested_dir = schemas_dir / 'responses'
        nested_dir.mkdir()
        (nested_dir / 'success.json').write_text('{"type": "object"}')

        setup_schema_docs(repo)

        output = tmp_path / 'output'
        generator = PortalGenerator(output)
        generator.generate(repo)
        return output

    def test_schema_file_copied(self, portal_with_ref_subdirs):
        assert (portal_with_ref_subdirs / 'apis' / 'ref-api' / 'schemas' / 'model.json').exists()

    def test_requests_file_copied(self, portal_with_ref_subdirs):
        assert (portal_with_ref_subdirs / 'apis' / 'ref-api' / 'requests' / 'body.json').exists()

    def test_nested_subdir_copied(self, portal_with_ref_subdirs):
        assert (portal_with_ref_subdirs / 'apis' / 'ref-api' / 'schemas' / 'responses' / 'success.json').exists()

    def test_api_yaml_still_exists(self, portal_with_ref_subdirs):
        assert (portal_with_ref_subdirs / 'apis' / 'ref-api' / 'api.yaml').exists()


class TestMcpDetailPage:
    """Verify MCP server detail page renders and shows up on the homepage."""

    @pytest.fixture(autouse=True)
    def _parse_mcp_page(self, generated_portal):
        html = (generated_portal / 'mcps' / 'test-mcp.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_mcp_page_exists(self, generated_portal):
        assert (generated_portal / 'mcps' / 'test-mcp.html').exists()

    def test_mcp_page_renders_tool_section(self):
        section = self.soup.find('section', id='tool-searchAssets')
        assert section is not None
        assert section.get('data-mcp-kind') == 'tool'

    def test_mcp_page_has_auth_panel(self):
        header = self.soup.find('div', class_='auth-panel-header-bar')
        assert header is not None

    def test_mcp_page_injects_mcp_meta(self):
        scripts = self.soup.find_all('script')
        text = ' '.join(s.string or '' for s in scripts)
        assert '__MCP_META__' in text
        assert 'streamableHttp' in text

    def test_homepage_has_mcp_card(self, generated_portal):
        html = (generated_portal / 'index.html').read_text(encoding='utf-8')
        assert 'mcps/test-mcp.html' in html
        assert 'Test MCP API' in html

    def test_registry_has_mcp_entry(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        mcp_entries = [e for e in registry if e['kind'] == 'mcp']
        assert len(mcp_entries) == 1
        entry = mcp_entries[0]
        assert entry['$id'] == 'urn:mcp:test-mcp'
        assert entry['href'] == 'mcps/test-mcp/mcp.yaml'
        assert entry['docs'] == 'mcps/test-mcp.html'
        assert entry['tool_count'] == 1

    def test_mcp_source_files_copied(self, generated_portal):
        mcp_out = generated_portal / 'mcps' / 'test-mcp'
        assert (mcp_out / 'mcp.yaml').exists()
        assert (mcp_out / 'server.json').exists()

    def test_mcp_page_has_xorigin_modal(self):
        modal = self.soup.find('div', id='xorigin-modal')
        assert modal is not None
        assert modal.get('role') == 'dialog'

    def test_mcp_page_injects_mcp_lookup(self):
        scripts = self.soup.find_all('script')
        text = ' '.join(s.string or '' for s in scripts)
        assert '__MCP_LOOKUP__' in text

    def test_mcp_page_injects_op_lookup(self):
        scripts = self.soup.find_all('script')
        text = ' '.join(s.string or '' for s in scripts)
        assert '__OP_LOOKUP__' in text

    def test_mcp_page_injects_link_prefixes(self):
        scripts = self.soup.find_all('script')
        text = ' '.join(s.string or '' for s in scripts)
        assert '__API_LINK_PREFIX__' in text
        assert '__MCP_LINK_PREFIX__' in text


class TestMcpXoriginPage:
    """Verify MCP page with x-origin has scoped lookups."""

    @pytest.fixture
    def portal_with_xorigin_mcp(self, tmp_path):
        import textwrap
        repo = tmp_path / 'repo'
        repo.mkdir()

        apis_dir = repo / 'apis'
        apis_dir.mkdir()
        api_dir = apis_dir / 'test-api'
        api_dir.mkdir()
        (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
        (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

        mcp_dir = repo / 'mcps' / 'exchange'
        mcp_dir.mkdir(parents=True)
        (mcp_dir / 'server.json').write_text(MINIMAL_MCP_SERVER_JSON)
        (mcp_dir / 'exchange.json').write_text(MINIMAL_MCP_EXCHANGE_JSON)
        (mcp_dir / 'mcp.yaml').write_text(textwrap.dedent("""\
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
                  required:
                    - q
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
                          labels: $[*].name
                    envId:
                      type: string
                      x-origin:
                        - api: urn:api:test-api
                          operation: listResources
                          values: $.data[*].id
                  required:
                    - assetId
            prompts: []
            resources: []
            resourceTemplates: []
        """))

        setup_schema_docs(repo)

        output = tmp_path / 'portal_output'
        generator = PortalGenerator(output, base_url='https://test.example.com')
        generator.generate(repo)
        return output

    def test_mcp_lookup_contains_self_reference(self, portal_with_xorigin_mcp):
        html = (portal_with_xorigin_mcp / 'mcps' / 'exchange.html').read_text(encoding='utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        scripts = soup.find_all('script')
        text = ' '.join(s.string or '' for s in scripts)
        assert '"exchange"' in text or "'exchange'" in text
        assert 'searchAssets' in text

    def test_op_lookup_contains_api_reference(self, portal_with_xorigin_mcp):
        html = (portal_with_xorigin_mcp / 'mcps' / 'exchange.html').read_text(encoding='utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        scripts = soup.find_all('script')
        text = ' '.join(s.string or '' for s in scripts)
        assert 'test-api' in text
        assert 'listResources' in text

    def test_xorigin_input_has_search_button(self, portal_with_xorigin_mcp):
        html = (portal_with_xorigin_mcp / 'mcps' / 'exchange.html').read_text(encoding='utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        btn = soup.find('button', class_='btn-xorigin-search')
        assert btn is not None

    def test_xorigin_input_has_data_attribute(self, portal_with_xorigin_mcp):
        html = (portal_with_xorigin_mcp / 'mcps' / 'exchange.html').read_text(encoding='utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        xorigin_input = soup.find('input', attrs={'data-x-origins': True})
        assert xorigin_input is not None
