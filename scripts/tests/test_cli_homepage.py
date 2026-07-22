"""End-to-end smoke tests for the CLIs asset category.

Covers spec acceptance criteria that only surface after the whole pipeline
has run (parser → discovery → generator → templates):

- CLIs tab on the homepage catalog.
- ≥ 2 CLI cards rendered (Anypoint CLI, sf CLI).
- Detail page per CLI with name, description, install command, and at least
  one rendered command doc.
- Registry / llms.txt include CLI entries.
- resultsCount sum accounts for CLIs.
- Zero-CLI repos still render the homepage (guarded branch).
"""

import json
import textwrap
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from portal_generator import PortalGenerator
from tests.conftest import (
    MINIMAL_OAS_YAML,
    MINIMAL_EXCHANGE_JSON,
    setup_schema_docs,
)


def _seed_cli(repo, slug, name, short_description, install_pkg, install_cmd,
              docs_source, docs_base_url, command_name, doc_body, tags):
    """Create a `clis/<slug>/` fixture matching the cli.yaml schema in the spec."""
    cli_dir = repo / 'clis' / slug
    (cli_dir / 'docs').mkdir(parents=True)
    (cli_dir / 'cli.yaml').write_text(textwrap.dedent(f"""\
        name: {name}
        slug: {slug}
        short_description: {short_description}
        install:
          {install_pkg}: "{install_cmd}"
        docs:
          source: "{docs_source}"
          base_url: "{docs_base_url}"
        commands:
          - name: {command_name}
            doc_path: docs/{command_name}.md
        tags:
{chr(10).join(f'          - {t}' for t in tags)}
    """))
    (cli_dir / 'docs' / f'{command_name}.md').write_text(doc_body)
    return cli_dir


@pytest.fixture
def portal_with_clis(tmp_path):
    """Full portal generation with 2 seeded CLIs alongside a minimal API."""
    repo = tmp_path / 'repo'
    repo.mkdir()

    # Discovery expects apis/ to exist; supply one minimal API.
    apis_dir = repo / 'apis'
    apis_dir.mkdir()
    api_dir = apis_dir / 'test-api'
    api_dir.mkdir()
    (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
    (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

    _seed_cli(
        repo,
        slug='anypoint-cli',
        name='Anypoint CLI',
        short_description='Command-line interface for Anypoint Platform.',
        install_pkg='npm',
        install_cmd='npm install -g anypoint-cli-v4',
        docs_source='scrape',
        docs_base_url='https://docs.mulesoft.com/anypoint-cli/latest/',
        command_name='secrets-manager',
        doc_body=(
            '# anypoint-cli secrets-manager\n\n'
            'Manage secrets in the Anypoint Platform.\n\n'
            '## Usage\n\n    anypoint-cli-v4 secrets-manager --help\n'
        ),
        tags=['cli', 'anypoint'],
    )
    _seed_cli(
        repo,
        slug='sf-cli',
        name='Salesforce CLI',
        short_description='Command-line interface for Salesforce (sf).',
        install_pkg='npm',
        install_cmd='npm install -g @salesforce/cli',
        docs_source='native',
        docs_base_url='https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/',
        command_name='org-list',
        doc_body='# sf org list\n\nLists all authenticated Salesforce orgs.\n',
        tags=['cli', 'salesforce'],
    )

    setup_schema_docs(repo)

    output = tmp_path / 'portal_output'
    PortalGenerator(output, base_url='https://cli-portal.example.com').generate(repo)
    return output


class TestHomepageCliTab:
    """AC (Deliverables → Category surface): CLIs tab on the homepage catalog."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, portal_with_clis):
        html = (portal_with_clis / 'index.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')
        self.html = html

    def test_homepage_has_cli_filter_tab(self):
        """AC: The homepage exposes a CLIs tab (data-filter='cli')."""
        tab = self.soup.find(attrs={'data-filter': 'cli'})
        assert tab is not None, (
            "Homepage should include a hero-tab with data-filter='cli' so the "
            "user can filter the catalog down to CLIs."
        )

    def test_cli_tab_label_is_clis(self):
        """AC: category-surface copy is exactly 'CLIs' — not Tools, not Developer Tools."""
        tab = self.soup.find(attrs={'data-filter': 'cli'})
        assert tab is not None
        # Tab text may include an icon; check the visible label contains 'CLIs'.
        assert 'CLIs' in tab.get_text(), (
            f"CLIs tab label must read 'CLIs' verbatim; got {tab.get_text()!r}"
        )

    def test_results_count_includes_clis(self):
        """AC: `resultsCount` must reflect the CLIs count when clis/ is
        populated. Both CLIs live in the fixture, so the number must be at
        least 2 (plus whatever other items exist)."""
        counter = self.soup.find(id='resultsCount')
        assert counter is not None
        rendered = counter.get_text(strip=True)
        # Must be a non-empty integer >= 2 (2 CLIs + 1 API in the fixture = 3)
        assert rendered.isdigit(), f"resultsCount not an integer: {rendered!r}"
        assert int(rendered) >= 2, (
            f"resultsCount={rendered} must include the 2 seeded CLIs"
        )


class TestHomepageCliListing:
    """AC (Deliverables → Listing): at least 2 CLI cards rendered on the homepage."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, portal_with_clis):
        html = (portal_with_clis / 'index.html').read_text(encoding='utf-8')
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_homepage_contains_anypoint_cli_card(self):
        assert self.soup.find(string=lambda t: t and 'Anypoint CLI' in t) is not None

    def test_homepage_contains_sf_cli_card(self):
        assert self.soup.find(string=lambda t: t and 'Salesforce CLI' in t) is not None

    def test_homepage_has_two_cli_typed_cards(self):
        """AC: the CLIs listing must expose at least 2 cards typed as `cli`
        for the tab filter to have something to show."""
        cli_cards = self.soup.find_all(attrs={'data-type': 'cli'})
        assert len(cli_cards) >= 2, (
            f"Expected ≥ 2 cards with data-type='cli' for the CLIs listing "
            f"filter to work; got {len(cli_cards)}"
        )


class TestCliDetailPage:
    """AC (Deliverables → Detail): per-CLI page with name, description,
    install command, and rendered command doc."""

    def _detail_soup(self, portal_with_clis, slug):
        # Support both `clis/<slug>.html` and `clis/<slug>/index.html`
        # since the plan sketches an `index.html` per slug but existing MCP
        # pages use `<slug>.html`. Whichever is emitted, the test passes.
        candidates = [
            portal_with_clis / 'clis' / f'{slug}.html',
            portal_with_clis / 'clis' / slug / 'index.html',
        ]
        for path in candidates:
            if path.exists():
                return BeautifulSoup(path.read_text(encoding='utf-8'), 'html.parser')
        raise AssertionError(
            f"No detail page found for slug={slug!r}; tried: "
            f"{[str(p) for p in candidates]}"
        )

    def test_anypoint_cli_detail_exists(self, portal_with_clis):
        self._detail_soup(portal_with_clis, 'anypoint-cli')

    def test_sf_cli_detail_exists(self, portal_with_clis):
        self._detail_soup(portal_with_clis, 'sf-cli')

    def test_detail_page_has_cli_name(self, portal_with_clis):
        """AC: detail page must show the CLI name."""
        soup = self._detail_soup(portal_with_clis, 'anypoint-cli')
        assert soup.find(string=lambda t: t and 'Anypoint CLI' in t) is not None

    def test_detail_page_has_short_description(self, portal_with_clis):
        """AC: detail page must expose the short description."""
        soup = self._detail_soup(portal_with_clis, 'anypoint-cli')
        assert soup.find(
            string=lambda t: t and 'Command-line interface for Anypoint Platform' in t
        ) is not None

    def test_detail_page_has_install_command(self, portal_with_clis):
        """AC: install command block must render the actual install command."""
        soup = self._detail_soup(portal_with_clis, 'anypoint-cli')
        html_text = str(soup)
        assert 'npm install -g anypoint-cli-v4' in html_text, (
            "Detail page must show the install command from cli.yaml"
        )

    def test_detail_page_renders_ingested_command_doc(self, portal_with_clis):
        """AC: the detail page must render the ingested/linked command doc so
        the reader can see the command's actual documentation, not just a stub.
        """
        soup = self._detail_soup(portal_with_clis, 'anypoint-cli')
        html_text = str(soup)
        assert 'secrets-manager' in html_text, (
            "Detail page must reference the command name (secrets-manager)"
        )
        assert 'Manage secrets in the Anypoint Platform.' in html_text, (
            "Detail page must render the body of the ingested markdown doc"
        )

    def test_detail_page_has_main_element(self, portal_with_clis):
        """AC: page must be structurally valid (has <main>) for navigation +
        accessibility."""
        soup = self._detail_soup(portal_with_clis, 'anypoint-cli')
        assert soup.find('main') is not None


class TestCliRegistryEntries:
    """AC (Deliverables → Approach → 'Registry & llms.txt: extend so CLI
    entries appear there too'). Verify the discovery pipeline surfaces CLIs
    in registry.json in a way analogous to MCP / terraform entries."""

    def test_registry_has_cli_entries(self, portal_with_clis):
        registry = json.loads((portal_with_clis / 'registry.json').read_text())
        cli_entries = [e for e in registry if e.get('kind') == 'cli']
        assert len(cli_entries) >= 2, (
            f"registry.json must include entries with kind='cli' for both "
            f"seeded CLIs; got {len(cli_entries)}"
        )

    def test_registry_cli_slugs_match_seed(self, portal_with_clis):
        registry = json.loads((portal_with_clis / 'registry.json').read_text())
        slugs = {e.get('slug') for e in registry if e.get('kind') == 'cli'}
        assert {'anypoint-cli', 'sf-cli'}.issubset(slugs), (
            f"registry CLI slugs missing seed slugs; got {slugs}"
        )


class TestCliInLlmsTxt:
    """AC: llms.txt generation is extended so CLI entries appear there too."""

    def test_llms_txt_mentions_cli_assets(self, portal_with_clis):
        content = (portal_with_clis / 'llms.txt').read_text(encoding='utf-8')
        # At least one CLI name should be discoverable from llms.txt so the
        # LLM can find the assets. This mirrors how mcp/terraform names show up.
        assert 'Anypoint CLI' in content or 'anypoint-cli' in content or 'clis/' in content, (
            "llms.txt should reference CLI assets when clis/ is seeded"
        )


class TestZeroClisFallback:
    """AC (Error handling → 'Zero CLIs in `clis/`: generator emits no CLI tab
    / no CLI section — homepage still renders')."""

    @pytest.fixture
    def portal_without_clis(self, tmp_path):
        repo = tmp_path / 'repo'
        repo.mkdir()
        apis_dir = repo / 'apis'
        apis_dir.mkdir()
        api_dir = apis_dir / 'lonely-api'
        api_dir.mkdir()
        (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
        (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)
        setup_schema_docs(repo)

        output = tmp_path / 'output_no_clis'
        PortalGenerator(output).generate(repo)
        return output

    def test_homepage_still_renders_without_clis(self, portal_without_clis):
        """The homepage must not blow up when clis/ is missing."""
        index = portal_without_clis / 'index.html'
        assert index.exists()
        html = index.read_text(encoding='utf-8')
        assert '<main' in html, "Homepage should still render a <main> element"

    def test_no_cli_detail_pages_without_clis(self, portal_without_clis):
        """AC: no CLI detail pages should be produced when clis/ is absent."""
        clis_out = portal_without_clis / 'clis'
        # Either the dir does not exist, or it contains no .html files
        if clis_out.exists():
            html_files = list(clis_out.rglob('*.html'))
            assert html_files == [], (
                f"No CLI detail pages should exist when clis/ is missing; "
                f"got {html_files}"
            )


class TestCliDoBundleDeliverables:
    """AC (Deliverables checklist):

    - `docs/cli-doc-template.md` — standardization template.
    - `docs/cli-ingestion-research.md` — comparison ≥ 2 options with tradeoffs.

    These live in the working tree (not in portal output), so we check the
    real repo — the test fails until the implementation agent has produced
    them.
    """

    REPO = Path(__file__).resolve().parents[2]

    def test_cli_doc_template_exists(self):
        template = self.REPO / 'docs' / 'cli-doc-template.md'
        assert template.exists(), (
            f"Deliverable missing: {template} — 'docs/cli-doc-template.md' is "
            f"required by the spec's deliverables checklist."
        )

    def test_cli_doc_template_covers_minimum_requirements(self):
        """AC (spec Standardization template): must document name/slug/short
        description, install command(s), command list with example, and link
        to canonical docs."""
        template = self.REPO / 'docs' / 'cli-doc-template.md'
        if not template.exists():
            pytest.skip("template file not yet produced by implementation agent")
        text = template.read_text(encoding='utf-8').lower()
        for keyword in ('slug', 'install', 'command', 'docs'):
            assert keyword in text, (
                f"cli-doc-template.md missing coverage of {keyword!r}; the "
                f"template must document minimum publishing requirements."
            )

    def test_cli_ingestion_research_exists(self):
        research = self.REPO / 'docs' / 'cli-ingestion-research.md'
        assert research.exists(), (
            f"Deliverable missing: {research} — the WI requires a written "
            f"comparison of ingestion approaches (≥ 2 options)."
        )

    def test_ingestion_research_covers_at_least_two_options(self):
        """AC (Deliverables → 'Doc-ingestion research: comparison table in
        this spec (≥ 2 options with tradeoffs)')."""
        research = self.REPO / 'docs' / 'cli-ingestion-research.md'
        if not research.exists():
            pytest.skip("research file not yet produced by implementation agent")
        text = research.read_text(encoding='utf-8').lower()
        # The comparison table names ingestion options; at least two of these
        # canonical values (per the spec table) must appear.
        options = ('scrape', 'markdown-repo', 'help-output', 'native')
        matches = [opt for opt in options if opt in text]
        assert len(matches) >= 2, (
            f"cli-ingestion-research.md must compare ≥ 2 ingestion options; "
            f"found only: {matches}"
        )


class TestCliAssetsCopied:
    """AC (Data flow): `clis/<slug>/cli.yaml` and referenced docs must be
    copied into the portal output so the deployed site is self-contained
    (same pattern as apis/, mcps/, terraform/)."""

    def test_cli_yaml_copied_to_output(self, portal_with_clis):
        for slug in ('anypoint-cli', 'sf-cli'):
            src = portal_with_clis / 'clis' / slug / 'cli.yaml'
            assert src.exists(), (
                f"clis/{slug}/cli.yaml should be copied into the portal output "
                f"(mirrors how apis/*/api.yaml is copied)."
            )

    def test_cli_docs_copied_to_output(self, portal_with_clis):
        """The linked markdown docs must be copied so deep-linked references
        from the detail page work at runtime."""
        assert (portal_with_clis / 'clis' / 'anypoint-cli' / 'docs' / 'secrets-manager.md').exists()
        assert (portal_with_clis / 'clis' / 'sf-cli' / 'docs' / 'org-list.md').exists()
