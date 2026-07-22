"""Tests for the CLI metadata parser."""

import textwrap
import pytest

from portal_generator.parsers.cli_parser import parse_cli_yaml


def _seed_cli(tmp_path, slug, yaml_body, docs=None):
    cli_dir = tmp_path / 'clis' / slug
    cli_dir.mkdir(parents=True)
    (cli_dir / 'cli.yaml').write_text(textwrap.dedent(yaml_body))
    if docs:
        docs_dir = cli_dir / 'docs'
        docs_dir.mkdir()
        for name, body in docs.items():
            (docs_dir / name).write_text(textwrap.dedent(body))
    return cli_dir


class TestParseCliYaml:
    def test_parses_full_metadata(self, tmp_path):
        cli_dir = _seed_cli(
            tmp_path,
            'anypoint-cli',
            """\
            name: Anypoint CLI
            slug: anypoint-cli
            short_description: Command-line interface for Anypoint Platform.
            install:
              npm: "npm install -g anypoint-cli-v4"
            docs:
              source: "scrape"
              base_url: "https://docs.mulesoft.com/anypoint-cli/latest/"
            commands:
              - name: secrets-manager
                doc_path: docs/secrets-manager.md
            tags:
              - cli
              - anypoint
            """,
            docs={'secrets-manager.md': "# secrets-manager\n\nBody."},
        )

        result = parse_cli_yaml(cli_dir)

        assert result['slug'] == 'anypoint-cli'
        assert result['name'] == 'Anypoint CLI'
        assert result['install']['npm'] == 'npm install -g anypoint-cli-v4'
        assert result['docs']['source'] == 'scrape'
        assert len(result['commands']) == 1
        cmd = result['commands'][0]
        assert cmd['name'] == 'secrets-manager'
        assert cmd['doc_path'] == 'docs/secrets-manager.md'
        assert '<h1' in cmd['doc_html']
        assert 'secrets-manager' in cmd['doc_html']
        assert result['tags'] == ['cli', 'anypoint']

    def test_missing_yaml_raises(self, tmp_path):
        cli_dir = tmp_path / 'clis' / 'ghost'
        cli_dir.mkdir(parents=True)
        with pytest.raises(FileNotFoundError):
            parse_cli_yaml(cli_dir)

    def test_missing_required_field_raises(self, tmp_path):
        cli_dir = _seed_cli(
            tmp_path,
            'broken',
            """\
            slug: broken
            short_description: no name field
            install: {}
            docs:
              source: native
              base_url: ""
            commands: []
            tags: []
            """,
        )
        with pytest.raises(ValueError, match="name"):
            parse_cli_yaml(cli_dir)

    def test_missing_doc_path_hard_fails(self, tmp_path):
        cli_dir = _seed_cli(
            tmp_path,
            'anypoint-cli',
            """\
            name: Anypoint CLI
            slug: anypoint-cli
            short_description: x
            install: {}
            docs:
              source: scrape
              base_url: ""
            commands:
              - name: secrets-manager
                doc_path: docs/does-not-exist.md
            tags: []
            """,
        )
        with pytest.raises(FileNotFoundError, match='does-not-exist'):
            parse_cli_yaml(cli_dir)

    def test_zero_commands_ok(self, tmp_path):
        cli_dir = _seed_cli(
            tmp_path,
            'bare',
            """\
            name: Bare CLI
            slug: bare
            short_description: no commands
            install: {}
            docs:
              source: native
              base_url: ""
            commands: []
            tags: []
            """,
        )
        result = parse_cli_yaml(cli_dir)
        assert result['commands'] == []

    def test_multiple_commands_parsed_in_order(self, tmp_path):
        """AC (Deliverables → Detail): a CLI may declare multiple commands and
        each must show up in the parsed output in declaration order — the
        detail page renders them in that order."""
        cli_dir = _seed_cli(
            tmp_path,
            'multi',
            """\
            name: Multi CLI
            slug: multi
            short_description: many commands
            install:
              npm: "npm install -g multi"
            docs:
              source: native
              base_url: "https://example.com/docs"
            commands:
              - name: alpha
                doc_path: docs/alpha.md
              - name: beta
                doc_path: docs/beta.md
              - name: gamma
                doc_path: docs/gamma.md
            tags: [cli]
            """,
            docs={
                'alpha.md': '# alpha\nA body.',
                'beta.md': '# beta\nB body.',
                'gamma.md': '# gamma\nC body.',
            },
        )
        result = parse_cli_yaml(cli_dir)
        assert [c['name'] for c in result['commands']] == ['alpha', 'beta', 'gamma']
        # Each command renders its markdown body to HTML — this is what the
        # detail template surfaces on the CLI detail page.
        for cmd in result['commands']:
            assert cmd['doc_html'], f"command {cmd['name']} missing doc_html"

    def test_docs_base_url_preserved(self, tmp_path):
        """AC (cli.yaml schema): `docs.base_url` is preserved through parsing
        so the detail page can render the 'Full documentation' link that maps
        back to the canonical docs home."""
        cli_dir = _seed_cli(
            tmp_path,
            'anypoint-cli',
            """\
            name: Anypoint CLI
            slug: anypoint-cli
            short_description: x
            install: {}
            docs:
              source: scrape
              base_url: "https://docs.mulesoft.com/anypoint-cli/latest/"
            commands: []
            tags: [cli]
            """,
        )
        result = parse_cli_yaml(cli_dir)
        assert result['docs']['base_url'] == 'https://docs.mulesoft.com/anypoint-cli/latest/'
        assert result['docs']['source'] == 'scrape'

    def test_all_documented_doc_sources_accepted(self, tmp_path):
        """AC (standardization template): the allowed `docs.source` values are
        scrape, markdown-repo, help-output, native. The parser should accept
        all four without complaint."""
        for source in ('scrape', 'markdown-repo', 'help-output', 'native'):
            slug = f'src-{source}'
            cli_dir = _seed_cli(
                tmp_path,
                slug,
                f"""\
                name: {slug}
                slug: {slug}
                short_description: variant
                install: {{}}
                docs:
                  source: {source}
                  base_url: "https://example.com/"
                commands: []
                tags: []
                """,
            )
            result = parse_cli_yaml(cli_dir)
            assert result['docs']['source'] == source, (
                f"docs.source={source!r} should round-trip through the parser"
            )

    def test_slug_matches_directory_convention(self, tmp_path):
        """AC (Detail URLs): the slug in cli.yaml drives the detail page URL
        (clis/<slug>/index.html or clis/<slug>.html). The parser must return
        the slug as-is so the generator can use it for path construction."""
        cli_dir = _seed_cli(
            tmp_path,
            'anypoint-cli',
            """\
            name: Anypoint CLI
            slug: anypoint-cli
            short_description: x
            install: {}
            docs:
              source: scrape
              base_url: ""
            commands: []
            tags: []
            """,
        )
        result = parse_cli_yaml(cli_dir)
        assert result['slug'] == 'anypoint-cli'

    def test_auto_split_from_docs_file(self, tmp_path):
        """docs.file mode: parser splits a single scraped markdown reference
        on `## <command>` headings and derives name, usage, description, body."""
        doc_body = textwrap.dedent("""\
            # CLI for Secrets Manager

            Intro paragraph.

            ## secrets-mgr:secret-group:create

            > secrets-mgr:secret-group:create [flags]

            Creates a new secret group with the name specified by `--name`

            Extra prose that should not become the description.

            ## secrets-mgr:secret-group:delete

            > secrets-mgr:secret-group:delete [flags]

            > [!WARNING] This command does not prompt for confirmation before deleting.

            Deletes the secret group specified by `--id`
            """)
        cli_dir = _seed_cli(
            tmp_path,
            'secrets-manager',
            """\
            name: Secrets Manager
            slug: secrets-manager
            short_description: Secrets Manager plugin.
            parent_cli:
              name: Anypoint CLI
              slug: anypoint-cli
            install:
              npm: "npm install -g anypoint-cli-v4"
            docs:
              source: scrape
              base_url: "https://docs.mulesoft.com/anypoint-cli/latest/secrets-manager"
              file: docs/secrets-manager.md
            tags: [cli, anypoint]
            """,
            docs={'secrets-manager.md': doc_body},
        )
        result = parse_cli_yaml(cli_dir)

        assert result['parent_cli'] == {'name': 'Anypoint CLI', 'slug': 'anypoint-cli'}
        assert len(result['commands']) == 2
        create, delete = result['commands']

        assert create['name'] == 'secrets-mgr:secret-group:create'
        assert create['usage'] == 'secrets-mgr:secret-group:create [flags]'
        assert create['description'].startswith('Creates a new secret group')
        assert '<h' not in create['description']

        # The admonition blockquote must not be picked up as the description.
        assert delete['name'] == 'secrets-mgr:secret-group:delete'
        assert delete['description'].startswith('Deletes the secret group')

    def test_auto_split_empty_doc_hard_fails(self, tmp_path):
        cli_dir = _seed_cli(
            tmp_path,
            'noheadings',
            """\
            name: No Headings
            slug: noheadings
            short_description: broken doc
            install: {}
            docs:
              source: scrape
              base_url: "https://example.com"
              file: docs/ref.md
            tags: []
            """,
            docs={'ref.md': '# Reference\n\nNo level-2 headings at all.'},
        )
        with pytest.raises(ValueError, match='0 commands'):
            parse_cli_yaml(cli_dir)

    def test_install_command_available_to_template(self, tmp_path):
        """AC (Detail page): the install command from cli.yaml must survive
        parsing so cli_detail.html can render an install block."""
        cli_dir = _seed_cli(
            tmp_path,
            'anypoint-cli',
            """\
            name: Anypoint CLI
            slug: anypoint-cli
            short_description: x
            install:
              npm: "npm install -g anypoint-cli-v4"
              brew: "brew install anypoint-cli"
            docs:
              source: native
              base_url: ""
            commands: []
            tags: []
            """,
        )
        result = parse_cli_yaml(cli_dir)
        assert result['install']['npm'] == 'npm install -g anypoint-cli-v4'
        assert result['install']['brew'] == 'brew install anypoint-cli'
