"""Tests for Google Tag Manager (GTM) + OneTrust consent gating (W-23196384).

Covers the acceptance criteria from
docs/superpowers/specs/2026-06-29-ga4-onetrust-consent-gating-design.md and
docs/superpowers/plans/2026-06-29-ga4-onetrust-consent-gating-plan.md.

The contract under test:

  * Container `GTM-NH8DNZL` is a hardcoded Python constant in
    ``scripts/portal_generator/generator.py``. ``PortalGenerator`` accepts a
    ``gtm_container_id`` kwarg defaulting to that constant. Tests pass
    ``gtm_container_id=''`` to render the "GA off" variant.
  * No CLI flag, no env var, no Makefile plumbing.
  * When enabled, base.html injects:
      - a Consent Mode v2 default-denied preamble that initializes
        ``window.dataLayer`` and calls ``gtag('consent','default', {...denied})``
        BEFORE the GTM loader runs.
      - the official GTM head snippet loading
        ``https://www.googletagmanager.com/gtm.js?id=GTM-NH8DNZL`` (via the
        standard ``(function(w,d,s,l,i){...})`` IIFE with ``j.async=true``).
      - the ``<noscript>`` iframe half of the GTM snippet immediately after
        ``<body>``.
  * ``OptanonWrapper()`` bridges OneTrust to GTM by pushing an
    ``OneTrustGroupsUpdated`` event onto ``window.dataLayer`` (guarded by
    ``typeof dataLayer !== 'undefined'``) — it does NOT call
    ``gtag('consent','update', ...)`` directly. GTM triggers handle that.
  * OneTrust integration and the local "Cookie Settings" button remain intact.

These tests intentionally exercise the *generated HTML* — the implementation
detail of how ``gtm_container_id`` reaches the templates is up to the
implementation agent.
"""

import re

import pytest
from bs4 import BeautifulSoup

from portal_generator import PortalGenerator
from tests.conftest import (
    MINIMAL_OAS_YAML,
    MINIMAL_EXCHANGE_JSON,
    MINIMAL_SKILL_MD,
    MINIMAL_MCP_SERVER_JSON,
    MINIMAL_MCP_YAML,
    MINIMAL_MCP_EXCHANGE_JSON,
    MINIMAL_TERRAFORM_MD,
    setup_schema_docs,
)


GTM_CONTAINER_ID = 'GTM-TEST123'


def _build_repo(tmp_path):
    """Build a minimal repo (API + skill + MCP + Terraform) for testing."""
    repo = tmp_path / 'repo'
    repo.mkdir()

    # API
    apis_dir = repo / 'apis'
    apis_dir.mkdir()
    api_dir = apis_dir / 'test-api'
    api_dir.mkdir()
    (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
    (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

    # Skill
    (repo / 'skills').mkdir(parents=True, exist_ok=True)
    (repo / 'skills' / 'skills-metadata.yaml').write_text('type: jtbd\n')
    skill_dir = repo / 'skills' / 'deploy-app'
    skill_dir.mkdir(parents=True)
    (skill_dir / 'SKILL.md').write_text(MINIMAL_SKILL_MD)

    # MCP
    mcp_dir = repo / 'mcps' / 'test-mcp'
    mcp_dir.mkdir(parents=True)
    (mcp_dir / 'server.json').write_text(MINIMAL_MCP_SERVER_JSON)
    (mcp_dir / 'mcp.yaml').write_text(MINIMAL_MCP_YAML)
    (mcp_dir / 'exchange.json').write_text(MINIMAL_MCP_EXCHANGE_JSON)

    # Terraform
    tf_version_dir = repo / 'terraform' / 'anypoint-provider' / '0.0.6'
    (tf_version_dir / 'resources').mkdir(parents=True)
    (tf_version_dir / 'data-sources').mkdir(parents=True)
    (tf_version_dir / 'resources' / 'anypoint_api_instance.md').write_text(MINIMAL_TERRAFORM_MD)
    (tf_version_dir / 'data-sources' / 'anypoint_api_instance.md').write_text(MINIMAL_TERRAFORM_MD)

    setup_schema_docs(repo)
    return repo


@pytest.fixture
def portal_with_gtm(tmp_path):
    """Generate a portal with GTM enabled (test container id)."""
    repo = _build_repo(tmp_path)
    output = tmp_path / 'portal_output'
    generator = PortalGenerator(
        output,
        base_url='https://test-api-portal.example.com',
        gtm_container_id=GTM_CONTAINER_ID,
    )
    generator.generate(repo)
    return output


@pytest.fixture
def portal_without_gtm(tmp_path):
    """Generate a portal with GTM disabled (empty container id)."""
    repo = _build_repo(tmp_path)
    output = tmp_path / 'portal_output_no_gtm'
    generator = PortalGenerator(
        output,
        base_url='https://test-api-portal.example.com',
        gtm_container_id='',
    )
    generator.generate(repo)
    return output


def _inline_scripts_text(soup) -> str:
    """Concatenate all inline <script> bodies for substring assertions."""
    return ' '.join((s.string or '') for s in soup.find_all('script'))


def _head_text(soup) -> str:
    """Return the raw HTML of the <head> section."""
    head = soup.find('head')
    return str(head) if head else ''


def _body_text(soup) -> str:
    """Return the raw HTML of the <body> section."""
    body = soup.find('body')
    return str(body) if body else ''


# ---------------------------------------------------------------------------
# AC2: When gtm_container_id is empty, no GTM snippet is emitted.
# ---------------------------------------------------------------------------
class TestGTMDisabledByDefault:
    """AC2 — With gtm_container_id='' the GTM snippet is fully absent."""

    def test_no_gtm_loader_when_disabled(self, portal_without_gtm):
        html = (portal_without_gtm / 'index.html').read_text(encoding='utf-8')
        assert 'googletagmanager.com/gtm.js' not in html, (
            'GTM loader must not be emitted when gtm_container_id is empty'
        )

    def test_no_gtm_noscript_iframe_when_disabled(self, portal_without_gtm):
        html = (portal_without_gtm / 'index.html').read_text(encoding='utf-8')
        assert 'googletagmanager.com/ns.html' not in html, (
            'GTM <noscript> iframe must not be emitted when gtm_container_id '
            'is empty'
        )

    def test_no_consent_default_when_disabled(self, portal_without_gtm):
        # The Consent Mode v2 preamble shares the same {% if gtm_container_id %}
        # guard as the GTM loader (see plan Snippet 1). No GTM → no preamble.
        html = (portal_without_gtm / 'index.html').read_text(encoding='utf-8')
        assert "gtag('consent', 'default'" not in html
        assert 'gtag("consent", "default"' not in html

    def test_no_legacy_gtag_js_when_disabled(self, portal_without_gtm):
        # Regression: the legacy gtag.js loader must not resurface anywhere.
        html = (portal_without_gtm / 'index.html').read_text(encoding='utf-8')
        assert 'googletagmanager.com/gtag/js' not in html, (
            'Legacy gtag.js loader must not be emitted (migration to GTM)'
        )


# ---------------------------------------------------------------------------
# AC1 / AC13 / AC15: When enabled, the GTM snippet is emitted correctly.
# ---------------------------------------------------------------------------
class TestGTMEnabledHomepage:
    """AC1/13/15 — When gtm_container_id is set, GTM loader + noscript emit."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, portal_with_gtm):
        html = (portal_with_gtm / 'index.html').read_text(encoding='utf-8')
        self.html = html
        self.soup = BeautifulSoup(html, 'html.parser')
        self.scripts_text = _inline_scripts_text(self.soup)

    def test_gtm_loader_url_with_container_id(self):
        # AC1: the container id is wired into both halves of the GTM snippet —
        # the IIFE call (which builds `gtm.js?id=<id>` at runtime) and the
        # noscript iframe (which embeds `ns.html?id=<id>` as a literal). The
        # literal we can assert against is the noscript iframe src.
        assert f'ns.html?id={GTM_CONTAINER_ID}' in self.html, (
            'GTM noscript iframe must reference '
            f"'ns.html?id={GTM_CONTAINER_ID}'"
        )
        # And the container id must also appear as the IIFE's final arg.
        assert f"'{GTM_CONTAINER_ID}'" in self.html, (
            f"GTM IIFE must be invoked with '{GTM_CONTAINER_ID}' as its "
            'container id argument'
        )

    def test_gtm_iife_snippet_present(self):
        # AC1: the standard GTM IIFE loader is inlined in <head>.
        # Look for the canonical hallmarks: gtm.start push + the (w,d,s,l,i)
        # signature. Whitespace is normalized to survive minification.
        normalized = re.sub(r'\s+', '', self.scripts_text)
        assert "'gtm.start'" in normalized or '"gtm.start"' in normalized, (
            "GTM IIFE must push {'gtm.start': ...} onto dataLayer"
        )
        assert '(function(w,d,s,l,i)' in normalized, (
            'GTM IIFE must use the standard (w,d,s,l,i) signature'
        )

    def test_gtm_loader_is_async(self):
        # AC13: GTM's IIFE sets `j.async=true` on the injected <script>.
        normalized = re.sub(r'\s+', '', self.scripts_text)
        assert 'j.async=true' in normalized or 'async=true' in normalized, (
            'GTM IIFE must mark the injected script as async (j.async=true)'
        )

    def test_gtm_loader_in_head(self):
        head_html = _head_text(self.soup)
        assert 'googletagmanager.com/gtm.js' in head_html, (
            'GTM loader must be in <head> (before consent updates propagate)'
        )

    def test_gtm_noscript_iframe_in_body(self):
        # AC1: <noscript><iframe src=".../ns.html?id=..."></iframe></noscript>
        # immediately after <body>.
        body_html = _body_text(self.soup)
        assert (
            f'googletagmanager.com/ns.html?id={GTM_CONTAINER_ID}' in body_html
        ), (
            'GTM <noscript> iframe must reference '
            f"'googletagmanager.com/ns.html?id={GTM_CONTAINER_ID}' in the body"
        )
        # Confirm the noscript wrapper is present (parsed or raw).
        assert '<noscript' in body_html, (
            'GTM iframe must be wrapped in <noscript> to only render for '
            'clients with JS disabled'
        )

    def test_datalayer_initialized(self):
        # The Consent Mode v2 preamble initializes window.dataLayer.
        assert re.search(
            r'window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\s*\]',
            self.scripts_text,
        ), (
            'Expected `window.dataLayer = window.dataLayer || []` in the '
            'Consent Mode v2 preamble'
        )

    def test_no_legacy_gtag_js_loader(self):
        # Regression: the old gtag.js block must not coexist with GTM.
        assert 'googletagmanager.com/gtag/js' not in self.html, (
            'Legacy gtag.js loader must be removed in favor of GTM'
        )


# ---------------------------------------------------------------------------
# AC3: Consent Mode v2 default-denied preamble runs before GTM loads.
# ---------------------------------------------------------------------------
class TestConsentModeDefaults:
    """AC3 — Default consent set to 'denied' before the GTM loader runs."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, portal_with_gtm):
        html = (portal_with_gtm / 'index.html').read_text(encoding='utf-8')
        self.html = html
        self.soup = BeautifulSoup(html, 'html.parser')
        self.scripts_text = _inline_scripts_text(self.soup)

    def test_consent_default_call_present(self):
        # The preamble emits consent defaults using a local
        # `function gtag(){dataLayer.push(arguments);}` shim — GTM's Consent
        # Mode v2 idiom (see plan Decision 2).
        assert re.search(
            r"""gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]""",
            self.scripts_text,
        ), "Expected gtag('consent', 'default', {...}) call in the preamble"

    def test_analytics_storage_denied_by_default(self):
        assert re.search(
            r"""['"]analytics_storage['"]\s*:\s*['"]denied['"]""",
            self.scripts_text,
        ), "Expected analytics_storage default to be 'denied'"

    def test_ad_storage_denied_by_default(self):
        assert re.search(
            r"""['"]ad_storage['"]\s*:\s*['"]denied['"]""",
            self.scripts_text,
        ), "Expected ad_storage default to be 'denied'"

    def test_ad_user_data_denied_by_default(self):
        assert re.search(
            r"""['"]ad_user_data['"]\s*:\s*['"]denied['"]""",
            self.scripts_text,
        ), "Expected ad_user_data default to be 'denied'"

    def test_ad_personalization_denied_by_default(self):
        assert re.search(
            r"""['"]ad_personalization['"]\s*:\s*['"]denied['"]""",
            self.scripts_text,
        ), "Expected ad_personalization default to be 'denied'"

    def test_consent_default_before_gtm_load(self):
        # AC3: the consent-default preamble MUST appear in the HTML source
        # before the GTM loader — otherwise GTM tags could fire without the
        # denied defaults being in effect.
        consent_idx = self.html.find("'default'")
        if consent_idx == -1:
            consent_idx = self.html.find('"default"')
        gtm_idx = self.html.find('googletagmanager.com/gtm.js')
        assert consent_idx != -1, (
            "Consent Mode v2 default call missing from rendered HTML"
        )
        assert gtm_idx != -1, "GTM loader missing from rendered HTML"
        assert consent_idx < gtm_idx, (
            "gtag('consent', 'default', ...) must appear before the GTM "
            "loader is injected (Consent Mode v2 requirement)"
        )

    def test_gtag_shim_defined_before_consent_default(self):
        # The preamble defines a local `function gtag(){dataLayer.push(...)}`
        # before calling `gtag('consent','default', ...)`. That's how the
        # GTM/Consent-Mode-v2 idiom works without loading gtag.js.
        shim_idx = self.scripts_text.find('dataLayer.push(arguments)')
        consent_idx = self.scripts_text.find("'default'")
        if consent_idx == -1:
            consent_idx = self.scripts_text.find('"default"')
        assert shim_idx != -1, (
            'Expected local `function gtag(){dataLayer.push(arguments);}` '
            'shim in the Consent Mode v2 preamble'
        )
        assert consent_idx != -1
        assert shim_idx < consent_idx, (
            'The gtag shim must be defined before the consent default call'
        )


# ---------------------------------------------------------------------------
# AC4 / AC5 / AC6 / AC7: OptanonWrapper bridges OneTrust to GTM via dataLayer.
# ---------------------------------------------------------------------------
class TestOptanonWrapperConsentBridge:
    """AC4/5/6/7 — OptanonWrapper writes localStorage and pushes GTM event."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, portal_with_gtm):
        html = (portal_with_gtm / 'index.html').read_text(encoding='utf-8')
        self.html = html
        self.soup = BeautifulSoup(html, 'html.parser')
        self.scripts_text = _inline_scripts_text(self.soup)

    def test_optanon_wrapper_function_present(self):
        assert 'function OptanonWrapper' in self.scripts_text

    def test_optanon_wrapper_preserves_localstorage_write(self):
        # AC4: otsettings is still written on every callback invocation.
        assert re.search(
            r"""localStorage\.setItem\(\s*['"]otsettings['"]\s*,\s*OptanonActiveGroups""",
            self.scripts_text,
        ), 'OptanonWrapper must still write OptanonActiveGroups to localStorage'

    def test_optanon_wrapper_pushes_gtm_event(self):
        # AC5: OptanonWrapper pushes `{ event: 'OneTrustGroupsUpdated', ... }`
        # onto window.dataLayer. GTM's own trigger listens for that event.
        assert re.search(
            r"""dataLayer\.push\s*\(\s*\{[^}]*event\s*:\s*['"]OneTrustGroupsUpdated['"]""",
            self.scripts_text,
        ), (
            "Expected dataLayer.push({ event: 'OneTrustGroupsUpdated', ... }) "
            'inside OptanonWrapper — this is how OneTrust hands consent to '
            'GTM (plan Decision 4)'
        )

    def test_optanon_wrapper_forwards_active_groups(self):
        # The pushed event should carry the active-groups string so the GTM
        # trigger can inspect it (e.g. RegEx-match ,C0002,). Accept either a
        # direct reference to OptanonActiveGroups or a local variable that
        # captures it (e.g. `var groups = ... OptanonActiveGroups ...`).
        assert re.search(
            r"""OnetrustActiveGroups\s*:\s*[A-Za-z_$][\w$]*""",
            self.scripts_text,
        ), (
            'dataLayer.push payload must include an `OnetrustActiveGroups: '
            '<identifier>` field so the GTM trigger can inspect the active '
            'groups string'
        )
        # Whichever identifier is used, it must ultimately be sourced from
        # OptanonActiveGroups somewhere in the wrapper.
        assert 'OptanonActiveGroups' in self.scripts_text, (
            'OptanonWrapper must reference OptanonActiveGroups to source the '
            'active-groups string that gets forwarded to GTM'
        )

    def test_optanon_wrapper_does_not_call_consent_update(self):
        # AC5: consent-mode updates are handled INSIDE GTM via triggers, not
        # by direct gtag('consent','update', ...) calls from the wrapper.
        assert not re.search(
            r"""gtag\(\s*['"]consent['"]\s*,\s*['"]update['"]""",
            self.scripts_text,
        ), (
            "OptanonWrapper must NOT call gtag('consent','update', ...) "
            'directly — GTM handles consent updates via its trigger on '
            'OneTrustGroupsUpdated (plan Decision 4)'
        )

    def test_c0002_check_uses_comma_bounded_match(self):
        # AC6: the C0002 check must use exact ,C0002, match (not bare 'C0002')
        # so C00021 does not falsely match.
        assert ',C0002,' in self.scripts_text, (
            'C0002 check must be a comma-bounded substring (",C0002,") to '
            'avoid matching unrelated category IDs like C00021'
        )

    def test_c0002_bare_token_not_used_unsafely(self):
        # Ensure the snippet does not naively `indexOf('C0002')` without commas
        # — that would also match `C00021`.
        unsafe_patterns = [
            "indexOf('C0002')",
            'indexOf("C0002")',
            "includes('C0002')",
            'includes("C0002")',
        ]
        for pat in unsafe_patterns:
            assert pat not in self.scripts_text, (
                f'Unsafe C0002 substring match found ({pat!r}); use a '
                f'comma-bounded match like ",C0002," to avoid C00021 collisions'
            )

    def test_numeric_performance_category_also_matched(self):
        # Some OneTrust domain scripts return numeric category IDs (",2,")
        # instead of the canonical ",C0002,". The wrapper must accept both
        # so the bridge fires regardless of the domain script's taxonomy.
        assert ',2,' in self.scripts_text, (
            'OptanonWrapper must also match the numeric Performance category '
            '(",2,") — some domain scripts return numeric IDs instead of '
            '"C000X" strings, and the consent bridge would never fire otherwise'
        )

    def test_datalayer_guard_present(self):
        # AC7: the dataLayer.push is guarded by
        # `typeof dataLayer !== 'undefined'` so the wrapper is safe when GTM
        # is off (gtm_container_id='' — no loader, no dataLayer).
        assert re.search(
            r"""typeof\s+dataLayer\s*!==?\s*['"]undefined['"]""",
            self.scripts_text,
        ), (
            'OptanonWrapper must guard the dataLayer.push with '
            "`typeof dataLayer !== 'undefined'` so it stays safe when GTM "
            'is disabled (plan Risk 1)'
        )

    def test_no_legacy_gtag_function_guard(self):
        # Regression: the old `typeof gtag === 'function'` guard belonged to
        # the gtag.js path. With GTM the guard is on dataLayer instead.
        assert not re.search(
            r"""typeof\s+gtag\s*===?\s*['"]function['"]""",
            self.scripts_text,
        ), (
            "Legacy `typeof gtag === 'function'` guard must be replaced "
            "with `typeof dataLayer !== 'undefined'` (migration to GTM)"
        )


# ---------------------------------------------------------------------------
# AC7 (backwards-compat): OptanonWrapper stays safe when GTM is disabled.
# ---------------------------------------------------------------------------
class TestOptanonWrapperWithoutGTM:
    """AC7 — With GTM off, OptanonWrapper still writes localStorage safely."""

    def test_optanon_wrapper_present_even_without_gtm(self, portal_without_gtm):
        html = (portal_without_gtm / 'index.html').read_text(encoding='utf-8')
        assert 'function OptanonWrapper' in html, (
            'OneTrust integration (OptanonWrapper) must remain intact when '
            'GTM is off'
        )

    def test_optanon_wrapper_still_writes_localstorage(self, portal_without_gtm):
        html = (portal_without_gtm / 'index.html').read_text(encoding='utf-8')
        assert re.search(
            r"""localStorage\.setItem\(\s*['"]otsettings['"]""",
            html,
        ), 'otsettings localStorage write must still happen with GTM off'

    def test_datalayer_guard_still_present_when_gtm_disabled(self, portal_without_gtm):
        # When GTM is disabled, dataLayer will not exist. The guard must
        # still be present so the wrapper body doesn't throw ReferenceError.
        html = (portal_without_gtm / 'index.html').read_text(encoding='utf-8')
        assert re.search(
            r"""typeof\s+dataLayer\s*!==?\s*['"]undefined['"]""",
            html,
        ), (
            "OptanonWrapper must guard dataLayer access even with GTM off, "
            'so the callback stays safe when the loader never ran'
        )


# ---------------------------------------------------------------------------
# AC8: Local "Cookie Settings" button is rendered to reopen OneTrust banner
# (GDPR Art. 7(3)). Independent of GTM.
# ---------------------------------------------------------------------------
class TestCookieSettingsButton:
    """AC8 — Local 'Cookie Settings' button reopens OneTrust banner."""

    @pytest.fixture(autouse=True)
    def _parse_homepage(self, portal_with_gtm):
        html = (portal_with_gtm / 'index.html').read_text(encoding='utf-8')
        self.html = html
        self.soup = BeautifulSoup(html, 'html.parser')

    def test_cookie_settings_button_present(self):
        btn = self.soup.find(class_='ot-sdk-show-settings')
        assert btn is not None, (
            "Expected a 'Cookie Settings' element with class "
            "'ot-sdk-show-settings' (GDPR Art. 7(3) requires a way to "
            'reopen the consent banner)'
        )

    def test_cookie_settings_button_has_visible_label(self):
        btn = self.soup.find(class_='ot-sdk-show-settings')
        assert btn is not None
        text = btn.get_text(strip=True).lower()
        assert any(
            phrase in text
            for phrase in ('cookie settings', 'cookie preferences', 'manage cookies')
        ), (
            f'Cookie Settings button must have a visible label; got: {text!r}'
        )

    def test_cookie_settings_button_toggles_onetrust_banner(self):
        btn = self.soup.find(class_='ot-sdk-show-settings')
        assert btn is not None
        onclick = btn.get('onclick', '') or ''
        page_has_toggle_ref = 'ToggleInfoDisplay' in self.html
        assert 'ToggleInfoDisplay' in onclick or page_has_toggle_ref, (
            'Cookie Settings button must trigger Optanon/OneTrust '
            'ToggleInfoDisplay() (Phase 3 of the plan)'
        )


# ---------------------------------------------------------------------------
# AC1 (across page types): GTM snippet propagates across all generated pages.
# ---------------------------------------------------------------------------
class TestGTMOnAllPageTypes:
    """AC1 — GTM snippet must render on every base.html-derived page."""

    @pytest.mark.parametrize('rel_path', [
        'index.html',
        'apis/test-api.html',
        'mcps/test-mcp.html',
        'skills/deploy-app.html',
        'terraform/anypoint-provider/0.0.6.html',
    ])
    def test_page_emits_gtm_loader(self, portal_with_gtm, rel_path):
        page = portal_with_gtm / rel_path
        assert page.exists(), f'Expected generated page at {rel_path}'
        html = page.read_text(encoding='utf-8')
        # The GTM head IIFE builds `gtm.js?id=<container>` at runtime — so we
        # assert the two literal shapes actually present in the emitted HTML:
        # the noscript iframe and the IIFE's container-id argument.
        assert f'ns.html?id={GTM_CONTAINER_ID}' in html, (
            f'GTM noscript iframe missing on {rel_path} — expected '
            f'ns.html?id={GTM_CONTAINER_ID}'
        )
        assert f"'{GTM_CONTAINER_ID}'" in html, (
            f'GTM IIFE container-id arg missing on {rel_path}'
        )

    @pytest.mark.parametrize('rel_path', [
        'index.html',
        'apis/test-api.html',
        'mcps/test-mcp.html',
        'skills/deploy-app.html',
        'terraform/anypoint-provider/0.0.6.html',
    ])
    def test_page_emits_gtm_noscript_iframe(self, portal_with_gtm, rel_path):
        page = portal_with_gtm / rel_path
        assert page.exists()
        html = page.read_text(encoding='utf-8')
        assert f'googletagmanager.com/ns.html?id={GTM_CONTAINER_ID}' in html, (
            f'GTM <noscript> iframe missing on {rel_path} — expected '
            f'ns.html?id={GTM_CONTAINER_ID} on every base.html-derived page'
        )

    @pytest.mark.parametrize('rel_path', [
        'index.html',
        'apis/test-api.html',
        'mcps/test-mcp.html',
        'skills/deploy-app.html',
        'terraform/anypoint-provider/0.0.6.html',
    ])
    def test_page_emits_consent_default(self, portal_with_gtm, rel_path):
        page = portal_with_gtm / rel_path
        assert page.exists()
        html = page.read_text(encoding='utf-8')
        assert (
            "gtag('consent', 'default'" in html
            or 'gtag("consent", "default"' in html
        ), f'Consent Mode default must be emitted on {rel_path}'


# ---------------------------------------------------------------------------
# OneTrust SDK regression: still loads unchanged after switching to GTM.
# ---------------------------------------------------------------------------
class TestOneTrustIntegrationPreserved:
    """OneTrust SDK integration is not broken by the GTM migration."""

    def test_onetrust_sdk_stub_still_loaded(self, portal_with_gtm):
        html = (portal_with_gtm / 'index.html').read_text(encoding='utf-8')
        assert 'otSDKStub.js' in html, (
            'OneTrust SDK stub must still be loaded after switching to GTM'
        )

    def test_onetrust_domain_script_id_present(self, portal_with_gtm):
        html = (portal_with_gtm / 'index.html').read_text(encoding='utf-8')
        assert 'fc594183-7384-4f03-8c43-1f81571521b7' in html, (
            'OneTrust data-domain-script attribute must remain intact'
        )

    def test_onetrust_css_still_loaded(self, portal_with_gtm):
        html = (portal_with_gtm / 'index.html').read_text(encoding='utf-8')
        assert 'onetrust.min.css' in html
        assert 'onetrust-mulesoft-custom.css' in html


# ---------------------------------------------------------------------------
# AC2 (rollout safety): empty-string gtm_container_id disables GTM entirely.
# ---------------------------------------------------------------------------
class TestEmptyStringDisablesGTM:
    """Empty-string gtm_container_id must be treated as disabled (test override)."""

    def test_empty_string_does_not_emit_gtm_loader(self, tmp_path):
        repo = _build_repo(tmp_path)
        output = tmp_path / 'portal_output_empty_gtm'
        generator = PortalGenerator(
            output,
            base_url='https://test-api-portal.example.com',
            gtm_container_id='',
        )
        generator.generate(repo)
        html = (output / 'index.html').read_text(encoding='utf-8')
        assert 'googletagmanager.com/gtm.js' not in html, (
            "Empty gtm_container_id must be treated as 'GTM off' — this is "
            "the test-only override that lets us render the 'GA off' variant"
        )

    def test_empty_string_does_not_emit_noscript_iframe(self, tmp_path):
        repo = _build_repo(tmp_path)
        output = tmp_path / 'portal_output_empty_gtm_iframe'
        generator = PortalGenerator(
            output,
            base_url='https://test-api-portal.example.com',
            gtm_container_id='',
        )
        generator.generate(repo)
        html = (output / 'index.html').read_text(encoding='utf-8')
        assert 'googletagmanager.com/ns.html' not in html, (
            "Empty gtm_container_id must also suppress the <noscript> iframe"
        )
