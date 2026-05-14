"""Tests for the Terraform provider doc parser."""

import textwrap

import pytest

from portal_generator.parsers.terraform_parser import parse_terraform_doc
from tests.conftest import MINIMAL_TERRAFORM_MD


class TestParseTerraformDoc:
    def test_parses_full_frontmatter(self, tmp_path):
        """Frontmatter fields are extracted into the result dict."""
        resources_dir = tmp_path / 'resources'
        resources_dir.mkdir()
        md_file = resources_dir / 'anypoint_api_instance.md'
        md_file.write_text(MINIMAL_TERRAFORM_MD)

        result = parse_terraform_doc(md_file)
        assert result['page_title'] == 'anypoint_api_instance Resource - terraform-provider-anypoint'
        assert result['subcategory'] == 'API Management'
        assert 'Manages an API instance' in result['description']

    def test_extracts_name_from_page_title(self, tmp_path):
        """Name is the part before ' - ' in page_title, stripping ' Resource' / ' Data Source' suffix."""
        md = textwrap.dedent("""\
            ---
            page_title: "foo Resource - terraform-provider-anypoint"
            subcategory: "Cat"
            description: "x"
            ---
            # foo
        """)
        md_file = tmp_path / 'resources' / 'foo.md'
        md_file.parent.mkdir()
        md_file.write_text(md)

        result = parse_terraform_doc(md_file)
        assert result['name'] == 'foo'

    def test_name_falls_back_when_no_separator(self, tmp_path):
        """When page_title has no ' - ', name equals page_title."""
        md = textwrap.dedent("""\
            ---
            page_title: "single_value"
            subcategory: "Cat"
            description: "x"
            ---
            # body
        """)
        md_file = tmp_path / 'resources' / 'single.md'
        md_file.parent.mkdir()
        md_file.write_text(md)

        result = parse_terraform_doc(md_file)
        assert result['name'] == 'single_value'

    def test_doc_type_from_resources_dir(self, tmp_path):
        """doc_type reflects 'resources' parent directory name."""
        md_file = tmp_path / 'resources' / 'anypoint_api_instance.md'
        md_file.parent.mkdir()
        md_file.write_text(MINIMAL_TERRAFORM_MD)

        result = parse_terraform_doc(md_file)
        assert result['doc_type'] == 'resources'

    def test_doc_type_from_data_sources_dir(self, tmp_path):
        """doc_type reflects 'data-sources' parent directory name."""
        md_file = tmp_path / 'data-sources' / 'anypoint_api_instance.md'
        md_file.parent.mkdir()
        md_file.write_text(MINIMAL_TERRAFORM_MD)

        result = parse_terraform_doc(md_file)
        assert result['doc_type'] == 'data-sources'

    def test_renders_body_html(self, tmp_path):
        """Markdown body is rendered to HTML with headings/code blocks."""
        md_file = tmp_path / 'resources' / 'anypoint_api_instance.md'
        md_file.parent.mkdir()
        md_file.write_text(MINIMAL_TERRAFORM_MD)

        result = parse_terraform_doc(md_file)
        assert '<h1>' in result['body_html']
        assert '<pre>' in result['body_html']

    def test_returns_none_for_missing_frontmatter(self, tmp_path):
        """Files without YAML frontmatter return None."""
        md_file = tmp_path / 'resources' / 'no_fm.md'
        md_file.parent.mkdir()
        md_file.write_text('# Just a heading\n\nNo frontmatter here.\n')

        assert parse_terraform_doc(md_file) is None

    def test_returns_none_for_missing_file(self, tmp_path):
        """Nonexistent file path raises FileNotFoundError when read."""
        with pytest.raises(FileNotFoundError):
            parse_terraform_doc(tmp_path / 'nope' / 'missing.md')

    def test_slug_is_filename_without_extension(self, tmp_path):
        """slug equals the .md filename stem."""
        md_file = tmp_path / 'resources' / 'anypoint_api_instance.md'
        md_file.parent.mkdir()
        md_file.write_text(MINIMAL_TERRAFORM_MD)

        result = parse_terraform_doc(md_file)
        assert result['slug'] == 'anypoint_api_instance'
