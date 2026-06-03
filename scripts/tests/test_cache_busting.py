"""Tests for cache-busting asset filename hashing."""
import pytest
from portal_generator.utils import hash_asset_filename


class TestHashAssetFilename:
    def test_simple_css(self):
        result = hash_asset_filename('styles.css', 'body { color: red; }')
        assert result.startswith('styles.')
        assert result.endswith('.css')
        parts = result.split('.')
        assert len(parts) == 3
        assert len(parts[1]) == 8

    def test_deterministic(self):
        content = 'body { color: red; }'
        r1 = hash_asset_filename('styles.css', content)
        r2 = hash_asset_filename('styles.css', content)
        assert r1 == r2

    def test_different_content_different_hash(self):
        r1 = hash_asset_filename('styles.css', 'body { color: red; }')
        r2 = hash_asset_filename('styles.css', 'body { color: blue; }')
        assert r1 != r2

    def test_js_extension(self):
        result = hash_asset_filename('portal.js', 'console.log("hi")')
        assert result.startswith('portal.')
        assert result.endswith('.js')

    def test_dotted_filename(self):
        result = hash_asset_filename('jsonpath-plus.min.js', 'var x=1;')
        assert result.startswith('jsonpath-plus.min.')
        assert result.endswith('.js')
        parts = result.rsplit('.', 2)
        assert len(parts[1]) == 8
