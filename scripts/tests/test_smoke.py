"""End-to-end smoke test for the portal generator."""

import json
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from portal_generator import PortalGenerator
from tests.conftest import (
    MINIMAL_OAS_YAML, MINIMAL_EXCHANGE_JSON, MINIMAL_SKILL_MD,
    PRIVATE_EXCHANGE_JSON, PRIVATE_API_SKILL_MD, PROSE_ONLY_SKILL_MD,
    NESTED_SKILL_MD, NON_API_STEPS_SKILL_MD, setup_schema_docs,
    MINIMAL_MCP_SERVER_JSON, MINIMAL_MCP_YAML, MINIMAL_MCP_EXCHANGE_JSON,
    MINIMAL_TERRAFORM_MD,
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

    nested_skill_dir = repo / 'skills' / 'ops-category' / 'run-diagnostics'
    nested_skill_dir.mkdir(parents=True)
    (nested_skill_dir / 'SKILL.md').write_text(NESTED_SKILL_MD)

    non_api_skill_dir = repo / 'skills' / 'build-mule-app'
    non_api_skill_dir.mkdir(parents=True)
    (non_api_skill_dir / 'SKILL.md').write_text(NON_API_STEPS_SKILL_MD)

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
        css_files = list((generated_portal / 'assets').glob('styles.*.css'))
        assert len(css_files) == 1
        assert css_files[0].stat().st_size > 0

    def test_portal_js_exists(self, generated_portal):
        js_files = list((generated_portal / 'assets').glob('portal.*.js'))
        assert len(js_files) == 1
        assert js_files[0].stat().st_size > 0

    def test_jsonpath_js_exists(self, generated_portal):
        jp_files = list((generated_portal / 'assets').glob('jsonpath-plus.min.*.js'))
        assert len(jp_files) == 1


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

    def test_has_sort_indicator(self):
        indicator = self.soup.find(id='sortIndicator')
        assert indicator is not None
        assert indicator.get('style') == 'display: none;'
        label = indicator.find(id='sortLabel')
        assert label is not None

    def test_sort_options_use_count_not_endpoints(self):
        sort_select = self.soup.find(id='sortBy')
        assert sort_select is not None
        options = [opt.get('value') for opt in sort_select.find_all('option')]
        assert 'count' in options
        assert 'endpoints' not in options


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
    """Prose-only skills render the header but hide auth and interactive elements, keep Install Command."""
    @pytest.fixture(autouse=True)
    def _parse_prose_skill_page(self, generated_portal):
        html = (generated_portal / 'skills' / 'platform-guide.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_prose_skill_page_exists(self, generated_portal):
        assert (generated_portal / 'skills' / 'platform-guide.html').exists()

    def test_has_header_bar(self):
        header = self.soup.find('div', class_='auth-panel-header-bar')
        assert header is not None

    def test_has_install_command(self):
        btn = self.soup.find('button', class_='skill-split-main')
        assert btn is not None
        assert 'Install Command' in btn.get_text()

    def test_no_auth_button(self):
        auth_btn = self.soup.find('button', class_='auth-panel-status')
        assert auth_btn is None

    def test_no_auth_modal(self):
        modal = self.soup.find('div', class_='auth-modal')
        assert modal is None

    def test_no_interactive_mode_toggle(self):
        toggle = self.soup.find('div', class_='skill-mode-toggle-container')
        assert toggle is None

    def test_has_guide_badge(self):
        badge = self.soup.find('span', class_='badge-version', string='Guide')
        assert badge is not None


class TestNonApiStepsSkillPage:
    """Skills with step headers but no YAML API blocks should hide auth and interactive mode, keep Install Command."""

    @pytest.fixture(autouse=True)
    def _parse_non_api_skill_page(self, generated_portal):
        html = (generated_portal / 'skills' / 'build-mule-app.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_page_exists(self, generated_portal):
        assert (generated_portal / 'skills' / 'build-mule-app.html').exists()

    def test_has_install_command(self):
        btn = self.soup.find('button', class_='skill-split-main')
        assert btn is not None
        assert 'Install Command' in btn.get_text()

    def test_no_interactive_mode_toggle(self):
        toggle = self.soup.find('div', class_='skill-mode-toggle-container')
        assert toggle is None

    def test_no_auth_button(self):
        auth_btn = self.soup.find('button', class_='auth-panel-status')
        assert auth_btn is None

    def test_no_api_meta_script(self):
        scripts = self.soup.find_all('script')
        api_meta = [s for s in scripts if s.string and '__API_META__' in s.string]
        assert len(api_meta) == 0

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

    def test_skill_href_points_to_skill_md(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        skill_entries = [e for e in registry if e['kind'] == 'agent-skill']
        for entry in skill_entries:
            assert entry['href'].startswith('skills/'), f"Expected skills/ prefix, got {entry['href']}"
            assert entry['href'].endswith('/SKILL.md'), f"Expected /SKILL.md suffix, got {entry['href']}"

    def test_nested_skill_href_includes_category(self, generated_portal):
        registry = json.loads((generated_portal / 'registry.json').read_text())
        entry = next(e for e in registry if e.get('slug') == 'run-diagnostics')
        assert entry['href'] == 'skills/ops-category/run-diagnostics/SKILL.md'

    def test_nested_skill_copy_exists(self, generated_portal):
        skill_md = generated_portal / 'skills' / 'ops-category' / 'run-diagnostics' / 'SKILL.md'
        assert skill_md.exists()
        content = skill_md.read_text(encoding='utf-8')
        assert 'name: run-diagnostics' in content

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
        assert link.get('rel') == ['llms-txt']

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


class TestPrivateApiNotInRelatedApis:
    """Verify private APIs do not appear in skill Related APIs sidebar."""

    @pytest.fixture
    def portal_with_skill_referencing_private(self, tmp_path):
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

        # Skill referencing both
        skills_dir = repo / 'skills' / 'mixed-api-skill'
        skills_dir.mkdir(parents=True)
        (skills_dir / 'SKILL.md').write_text(PRIVATE_API_SKILL_MD)

        setup_schema_docs(repo)

        output = tmp_path / 'output'
        generator = PortalGenerator(output)
        generator.generate(repo)
        return output

    def test_private_api_not_in_skill_sidebar(self, portal_with_skill_referencing_private):
        html = (portal_with_skill_referencing_private / 'skills' / 'mixed-api-skill.html').read_text(encoding='utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        apis_panel = soup.find(id='apis-panel')
        assert apis_panel is not None
        links = apis_panel.find_all('a')
        link_hrefs = [a.get('href', '') for a in links]
        assert any('public-api' in h for h in link_hrefs)
        assert not any('private-api' in h for h in link_hrefs)

    def test_private_api_not_in_skill_markdown_apis_section(self, portal_with_skill_referencing_private):
        md = (portal_with_skill_referencing_private / 'skills' / 'mixed-api-skill.md').read_text(encoding='utf-8')
        assert '[public-api]' in md
        assert '[private-api]' not in md


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
        assert entry['href'] == 'mcps/test-mcp/server.json'
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


class TestTerraformPageGeneration:
    """Verify the terraform provider page renders with the single-page architecture."""

    @pytest.fixture
    def portal_with_terraform(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()

        provider_dir = repo / 'terraform' / 'anypoint-provider'
        resources_dir = provider_dir / 'resources'
        data_sources_dir = provider_dir / 'data-sources'
        resources_dir.mkdir(parents=True)
        data_sources_dir.mkdir(parents=True)
        (resources_dir / 'anypoint_api_instance.md').write_text(MINIMAL_TERRAFORM_MD)
        (data_sources_dir / 'anypoint_api_instance.md').write_text(MINIMAL_TERRAFORM_MD)

        setup_schema_docs(repo)

        output = tmp_path / 'output'
        generator = PortalGenerator(output)
        generator.generate(repo)
        return output

    @pytest.fixture
    def terraform_soup(self, portal_with_terraform):
        html = (portal_with_terraform / 'terraform' / 'anypoint-provider.html').read_text(encoding='utf-8')
        return BeautifulSoup(html, 'html.parser')

    def test_generates_one_html_per_provider(self, portal_with_terraform):
        """A single .html is emitted under terraform/ for each provider."""
        assert (portal_with_terraform / 'terraform' / 'anypoint-provider.html').exists()

    def test_overview_div_has_id_overview(self, terraform_soup):
        """The overview subsection uses id='overview'."""
        overview = terraform_soup.find('div', id='overview')
        assert overview is not None

    def test_doc_subsections_have_doc_prefix_id(self, terraform_soup):
        """Each parsed doc renders as a div with id='doc-<slug>'."""
        section = terraform_soup.find('div', id='doc-anypoint_api_instance')
        assert section is not None
        assert 'terraform-subsection' in section.get('class', [])

    def test_no_auth_panel_status_button(self, terraform_soup):
        """prose_only mode hides the auth-panel-status button."""
        btn = terraform_soup.find(class_='auth-panel-status')
        assert btn is None

    def test_sidebar_links_to_doc_anchors(self, terraform_soup):
        """At least one sidebar link points to a #doc-<slug> anchor."""
        link = terraform_soup.find('a', href=lambda h: h and h.startswith('#doc-'))
        assert link is not None

    def test_resources_appear_before_data_sources_in_nav(self, terraform_soup):
        """Sidebar lists 'Resources' before 'Data Sources' within each category."""
        group_names = [el.get_text(strip=True) for el in terraform_soup.select('.sidebar-nav .group-name')]
        resources_idx = group_names.index('Resources')
        data_sources_idx = group_names.index('Data Sources')
        assert resources_idx < data_sources_idx

    def test_prism_light_and_dark_themes_loaded(self, terraform_soup):
        """Both Prism themes are linked in <head>."""
        head = str(terraform_soup.find('head'))
        assert 'prism.min.css' in head
        assert 'prism-tomorrow.min.css' in head

    def test_wrap_terraform_code_blocks_invoked(self, terraform_soup):
        """The page calls wrapTerraformCodeBlocks() in a script block."""
        scripts = terraform_soup.find_all('script')
        text = ' '.join(s.string or '' for s in scripts)
        assert 'wrapTerraformCodeBlocks()' in text


SECURITY_FIXTURES = Path(__file__).parent / 'fixtures' / 'security'


def _copy_fixture_dir(src: Path, dst: Path):
    """Copy each file from src into dst (which is created)."""
    dst.mkdir(parents=True, exist_ok=True)
    for entry in src.iterdir():
        if entry.is_file():
            (dst / entry.name).write_bytes(entry.read_bytes())


class TestMaliciousSpecSmokeXSS:
    """E2E: a malicious OpenAPI spec must not produce executable XSS in the rendered page."""

    @pytest.fixture
    def portal_with_malicious_spec(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()
        api_dir = repo / 'apis' / 'malicious-test'
        _copy_fixture_dir(SECURITY_FIXTURES / 'malicious_spec', api_dir)
        setup_schema_docs(repo)

        output = tmp_path / 'output'
        PortalGenerator(output).generate(repo)
        return output

    @pytest.fixture
    def detail_html(self, portal_with_malicious_spec):
        return (portal_with_malicious_spec / 'apis' / 'malicious-test.html').read_text(encoding='utf-8')

    def test_no_javascript_href(self, detail_html):
        soup = BeautifulSoup(detail_html, 'html.parser')
        for a in soup.find_all('a'):
            href = (a.get('href') or '').strip().lower()
            assert not href.startswith('javascript:'), f'unsafe href: {href!r}'

    def test_no_unescaped_script_breakout_in_inline_scripts(self, detail_html):
        """Inline <script> bodies must not contain a literal </script> sequence
        that would close the tag and let attacker-supplied content execute."""
        soup = BeautifulSoup(detail_html, 'html.parser')
        for s in soup.find_all('script'):
            body = s.string or ''
            assert '</script>' not in body

    def test_no_onerror_image_payload(self, detail_html):
        """No <img> tag with an onerror handler should be present in the DOM."""
        soup = BeautifulSoup(detail_html, 'html.parser')
        for img in soup.find_all('img'):
            assert not img.has_attr('onerror'), 'img onerror attribute present'


class TestMaliciousMcpSmokeXSS:
    """E2E: a malicious MCP descriptor must not produce executable XSS in the rendered page."""

    @pytest.fixture
    def portal_with_malicious_mcp(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()
        # Discovery short-circuits if apis/ is missing, so create an empty one.
        (repo / 'apis').mkdir()
        mcp_dir = repo / 'mcps' / 'malicious-test'
        _copy_fixture_dir(SECURITY_FIXTURES / 'malicious_mcp', mcp_dir)
        setup_schema_docs(repo)

        output = tmp_path / 'output'
        PortalGenerator(output).generate(repo)
        return output

    @pytest.fixture
    def mcp_html(self, portal_with_malicious_mcp):
        return (portal_with_malicious_mcp / 'mcps' / 'malicious-test.html').read_text(encoding='utf-8')

    def test_no_onerror_image_payload(self, mcp_html):
        """The malicious onerror payload must not become a real img element."""
        soup = BeautifulSoup(mcp_html, 'html.parser')
        for img in soup.find_all('img'):
            assert not img.has_attr('onerror')

    def test_no_inline_script_breakout(self, mcp_html):
        """Inline <script> bodies must not contain a literal </script>
        sequence that would close the tag and let attacker-supplied content
        execute (covers the JSON-encoded fixture payloads)."""
        soup = BeautifulSoup(mcp_html, 'html.parser')
        for s in soup.find_all('script'):
            body = s.string or ''
            assert '</script>' not in body


class TestMaliciousTerraformSmokeRawHtml:
    """E2E: terraform docs with raw HTML must have it stripped (html: False)."""

    @pytest.fixture
    def portal_with_malicious_terraform(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()
        (repo / 'apis').mkdir()
        provider_dir = repo / 'terraform' / 'anypoint-provider'
        resources_dir = provider_dir / 'resources'
        resources_dir.mkdir(parents=True)
        (resources_dir / 'dangerous.md').write_bytes(
            (SECURITY_FIXTURES / 'malicious_terraform' / 'dangerous.md').read_bytes()
        )
        setup_schema_docs(repo)

        output = tmp_path / 'output'
        PortalGenerator(output).generate(repo)
        return output

    @pytest.fixture
    def terraform_html(self, portal_with_malicious_terraform):
        return (portal_with_malicious_terraform / 'terraform' / 'anypoint-provider.html').read_text(encoding='utf-8')

    def test_no_iframe_tags(self, terraform_html):
        soup = BeautifulSoup(terraform_html, 'html.parser')
        assert soup.find('iframe') is None

    def test_no_inline_script_with_evil_payload(self, terraform_html):
        soup = BeautifulSoup(terraform_html, 'html.parser')
        for s in soup.find_all('script'):
            body = s.string or ''
            assert 'evil.example' not in body


class TestCacheBustingIntegration:
    """Verify generated HTML pages reference the correct hashed asset filenames."""

    def test_homepage_references_hashed_css(self, generated_portal):
        html = (generated_portal / 'index.html').read_text(encoding='utf-8')
        css_files = list((generated_portal / 'assets').glob('styles.*.css'))
        assert len(css_files) == 1
        css_name = css_files[0].name
        assert f'assets/{css_name}' in html

    def test_homepage_references_hashed_js(self, generated_portal):
        html = (generated_portal / 'index.html').read_text(encoding='utf-8')
        js_files = list((generated_portal / 'assets').glob('portal.*.js'))
        assert len(js_files) == 1
        assert js_files[0].name in html

    def test_detail_page_references_hashed_css(self, generated_portal):
        detail_pages = list((generated_portal / 'apis').glob('*.html'))
        assert len(detail_pages) > 0
        html = detail_pages[0].read_text(encoding='utf-8')
        css_files = list((generated_portal / 'assets').glob('styles.*.css'))
        css_name = css_files[0].name
        assert f'assets/{css_name}' in html

    def test_detail_page_references_hashed_js(self, generated_portal):
        detail_pages = list((generated_portal / 'apis').glob('*.html'))
        assert len(detail_pages) > 0
        html = detail_pages[0].read_text(encoding='utf-8')
        js_files = list((generated_portal / 'assets').glob('portal.*.js'))
        assert js_files[0].name in html

    def test_no_unhashed_asset_references(self, generated_portal):
        for html_file in generated_portal.rglob('*.html'):
            content = html_file.read_text(encoding='utf-8')
            assert 'assets/styles.css' not in content, f"{html_file} still references unhashed styles.css"
            assert 'assets/portal.js' not in content, f"{html_file} still references unhashed portal.js"
            assert 'assets/jsonpath-plus.min.js' not in content, f"{html_file} still references unhashed jsonpath-plus.min.js"
