"""Tests for CLI discovery."""

import textwrap

from portal_generator.discovery import discover_clis


def _seed(clis_root, slug, yaml_body, docs):
    cli_dir = clis_root / slug
    cli_dir.mkdir(parents=True)
    (cli_dir / 'cli.yaml').write_text(textwrap.dedent(yaml_body))
    docs_dir = cli_dir / 'docs'
    docs_dir.mkdir()
    for name, body in docs.items():
        (docs_dir / name).write_text(body)


class TestDiscoverClis:
    def test_returns_empty_when_no_clis_dir(self, tmp_path):
        assert discover_clis(tmp_path) == []

    def test_returns_all_clis_sorted_by_slug(self, tmp_path):
        clis_root = tmp_path / 'clis'
        clis_root.mkdir()
        _seed(
            clis_root, 'sf-cli',
            """\
            name: Salesforce CLI
            slug: sf-cli
            short_description: sf
            install: {npm: "npm install -g @salesforce/cli"}
            docs: {source: native, base_url: ""}
            commands:
              - {name: org-list, doc_path: docs/org-list.md}
            tags: [cli]
            """,
            {'org-list.md': '# org-list'},
        )
        _seed(
            clis_root, 'anypoint-cli',
            """\
            name: Anypoint CLI
            slug: anypoint-cli
            short_description: ap
            install: {npm: "npm install -g anypoint-cli-v4"}
            docs: {source: scrape, base_url: ""}
            commands:
              - {name: secrets-manager, doc_path: docs/secrets-manager.md}
            tags: [cli]
            """,
            {'secrets-manager.md': '# secrets-manager'},
        )

        result = discover_clis(tmp_path)
        assert [c['slug'] for c in result] == ['anypoint-cli', 'sf-cli']
        assert result[0]['_item_type'] == 'cli'
        assert result[0]['command_count'] == 1

    def test_skips_hidden_dirs(self, tmp_path):
        clis_root = tmp_path / 'clis'
        clis_root.mkdir()
        (clis_root / '.hidden').mkdir()
        assert discover_clis(tmp_path) == []

    def test_skips_dir_without_cli_yaml_with_warning(self, tmp_path, capsys):
        """AC (Error handling): missing cli.yaml → skip the directory with a
        warning. Mirrors how discovery handles other malformed seeds; must not
        raise and must not include the broken CLI in the returned list.
        """
        clis_root = tmp_path / 'clis'
        clis_root.mkdir()
        # A well-formed CLI
        _seed(
            clis_root, 'good-cli',
            """\
            name: Good CLI
            slug: good-cli
            short_description: ok
            install: {}
            docs: {source: native, base_url: ""}
            commands: []
            tags: []
            """,
            {},
        )
        # A directory with no cli.yaml
        (clis_root / 'malformed').mkdir()

        result = discover_clis(tmp_path)
        slugs = [c['slug'] for c in result]
        assert 'good-cli' in slugs
        assert 'malformed' not in slugs

    def test_command_count_matches_declared_commands(self, tmp_path):
        """AC (Detail page → listing card): command_count is what the homepage
        card surfaces ('N command(s)'). It must reflect the number of
        commands declared in cli.yaml."""
        clis_root = tmp_path / 'clis'
        clis_root.mkdir()
        _seed(
            clis_root, 'multi',
            """\
            name: Multi CLI
            slug: multi
            short_description: many
            install: {}
            docs: {source: native, base_url: ""}
            commands:
              - {name: a, doc_path: docs/a.md}
              - {name: b, doc_path: docs/b.md}
              - {name: c, doc_path: docs/c.md}
            tags: []
            """,
            {'a.md': '# a', 'b.md': '# b', 'c.md': '# c'},
        )
        result = discover_clis(tmp_path)
        assert len(result) == 1
        assert result[0]['command_count'] == 3

    def test_every_entry_has_cli_item_type(self, tmp_path):
        """AC (homepage catalog): every returned entry must carry
        _item_type='cli' so it lands in the CLIs filter of the homepage
        catalog (via the type dispatcher in homepage.html)."""
        clis_root = tmp_path / 'clis'
        clis_root.mkdir()
        for slug in ('anypoint-cli', 'sf-cli'):
            _seed(
                clis_root, slug,
                f"""\
                name: {slug}
                slug: {slug}
                short_description: x
                install: {{}}
                docs: {{source: native, base_url: ""}}
                commands: []
                tags: []
                """,
                {},
            )
        result = discover_clis(tmp_path)
        assert len(result) == 2
        for entry in result:
            assert entry['_item_type'] == 'cli'
