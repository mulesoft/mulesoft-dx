"""Asset loaders for CSS and JavaScript."""

from pathlib import Path

_ASSETS_DIR = Path(__file__).parent


def get_css() -> str:
    return (_ASSETS_DIR / 'styles.css').read_text(encoding='utf-8')


def get_js() -> str:
    return (_ASSETS_DIR / 'portal.js').read_text(encoding='utf-8')


def get_jsonpath_js() -> str:
    return (_ASSETS_DIR / 'jsonpath-plus.min.js').read_text(encoding='utf-8')
