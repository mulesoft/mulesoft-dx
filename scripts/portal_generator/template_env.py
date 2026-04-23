"""Jinja2 environment configuration for portal templates."""

import json
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

from .builders.tree_builder import build_operation_tree, count_tree_operations

_TEMPLATES_DIR = Path(__file__).parent / 'templates'


def _nl2br(value):
    """Convert newlines to <br> tags, preserving auto-escaping."""
    escaped = Markup.escape(value)
    return Markup(escaped.replace('\n', '<br>'))


def _nl2br_html(value):
    """Convert newlines to <br> tags while preserving existing HTML tags."""
    if not value:
        return Markup('')
    # Don't escape - preserve existing HTML like <br>, <code>, etc.
    # Just convert remaining newlines to <br>
    return Markup(str(value).replace('\n', '<br>'))


def _render_markdown(value):
    """Convert basic markdown to HTML for use in description cells."""
    if not value:
        return Markup('')

    # Escape HTML first to prevent injection
    html = Markup.escape(str(value))
    html = str(html)

    # Inline code (before bold/italic so backticks aren't mangled)
    html = re.sub(r'`(.+?)`', r'<code>\1</code>', html)

    # Bold
    html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
    html = re.sub(r'__(.+?)__', r'<strong>\1</strong>', html)

    # Italic (use word-boundary-aware patterns to avoid matching mid-word underscores)
    html = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'<em>\1</em>', html)
    html = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'<em>\1</em>', html)

    # Links
    html = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', html)

    # Bullet lists: consecutive lines starting with "- "
    def _replace_list(m):
        items = m.group(0).strip().split('\n')
        li = ''.join(f'<li>{item.lstrip("- ").strip()}</li>' for item in items if item.strip())
        return f'<ul>{li}</ul>'

    html = re.sub(r'(?:^|\n)(- .+(?:\n- .+)*)', _replace_list, html)

    # Line breaks (for remaining newlines)
    html = html.replace('\n', '<br>')

    return Markup(html)


def _tojson_raw(value, indent=2):
    """Serialize to JSON with indentation for embedding in <script> tags."""
    return Markup(json.dumps(value, indent=indent))


def _titleize_operation(value):
    """Convert camelCase operationId to readable Title Case.

    Examples:
        createOrganizationsApplications -> Create Organizations Applications
        getAPIInstance -> Get API Instance
        listAPIs -> List APIs
        listOrganizationsEnvironmentsApis -> List Organizations Environments Apis
    """
    if not value:
        return ''

    # Insert space before uppercase letters (except at the start)
    # Handle consecutive uppercase letters (like API, ID) specially
    result = []

    for i, char in enumerate(value):
        if i > 0 and char.isupper():
            prev_char = value[i - 1]
            next_char = value[i + 1] if i + 1 < len(value) else None

            # Add space before uppercase if:
            # - Previous char was lowercase (camelCase boundary), OR
            # - Previous char was uppercase AND next char is lowercase (e.g., "APIInstance" -> "API Instance")
            #   But NOT if we're at the end or followed by another uppercase (e.g., "listAPIs" stays "APIs")
            if prev_char.islower() or (prev_char.isupper() and next_char and next_char.islower()):
                result.append(' ')

        result.append(char)

    # Join and capitalize first letter
    spaced = ''.join(result)
    return spaced[0].upper() + spaced[1:] if spaced else ''


def _slugify(value):
    """Convert a string to a URL-friendly slug.

    Examples:
        "Get Current Organization" -> "get-current-organization"
        "List Environments" -> "list-environments"
    """
    if not value:
        return ''

    # Convert to lowercase
    slug = str(value).lower()

    # Replace spaces and special chars with hyphens
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)

    # Strip leading/trailing hyphens
    return slug.strip('-')


def _resolve_skill_inputs(inputs_dict, step_details):
    """Transform skill inputs from step references to variable reference format.

    Converts:
        {
            'organizationId': {
                'from': {'variable': 'organizationId'},
                'description': '...'
            }
        }

    To:
        {
            'organizationId': {
                'ref': '${organizationId}',
                'description': '...'
            }
        }

    Args:
        inputs_dict: Dictionary of input parameters with 'from' references
        step_details: List of step dictionaries with 'title' keys

    Returns:
        Transformed inputs dictionary
    """
    if not inputs_dict or not isinstance(inputs_dict, dict):
        return inputs_dict

    # Transform each input parameter
    result = {}
    for param_name, param_config in inputs_dict.items():
        if not isinstance(param_config, dict):
            # Simple value, keep as-is
            result[param_name] = param_config
            continue

        # Check if this has a 'from' reference
        if 'from' in param_config:
            from_ref = param_config['from']
            if isinstance(from_ref, dict):
                # Check if it's a variable reference (has 'variable' key)
                if 'variable' in from_ref:
                    var_name = from_ref['variable']

                    if var_name:
                        # Create the reference string - just ${variableName}
                        ref_string = f'${{{var_name}}}'
                        # Replace 'from' with 'ref'
                        new_config = param_config.copy()
                        del new_config['from']
                        new_config['ref'] = ref_string
                        result[param_name] = new_config
                        continue

                # Check if it's an x-origin style reference (has 'api' and 'operation')
                elif 'api' in from_ref and 'operation' in from_ref:
                    # This is an x-origin reference - remove 'from' and leave value empty
                    # The user will need to fetch the value via x-origin modal
                    new_config = param_config.copy()
                    del new_config['from']
                    # Don't set a ref or value - leave it empty
                    result[param_name] = new_config
                    continue

        # No transformation needed, keep as-is
        result[param_name] = param_config

    return result


_UPPERCASE_WORDS = {'api', 'apis', 'mcp', 'ip', 'id', 'url', 'http', 'https', 'sdk', 'cli', 'jtbd'}


def _skill_title(value):
    """Convert a slug like 'apply-policy-to-api-instance' to 'Apply Policy to API Instance'.

    Preserves known acronyms in uppercase and keeps short words lowercase."""
    if not value:
        return ''
    words = str(value).replace('-', ' ').split()
    result = []
    for word in words:
        lower = word.lower()
        if lower in _UPPERCASE_WORDS:
            result.append(lower.upper())
        else:
            result.append(word.capitalize())
    return ' '.join(result)


def _truncate_text(text, max_length=25):
    """Truncate text to max_length characters, adding ellipsis if truncated."""
    if not text or len(text) <= max_length:
        return text
    return text[:max_length] + '...'


def _should_collapse_description(text):
    """Check if a description should be collapsed based on content."""
    if not text:
        return False

    # Convert to string if it's a Markup object
    text_str = str(text)

    # Check for HTML elements that indicate multi-line content
    multiline_indicators = ['<ul>', '<ol>', '<li>', '<br>', '</p>', '\n']
    has_multiline = any(indicator in text_str for indicator in multiline_indicators)

    # Check text length (approximate 2 lines = ~150 characters)
    is_long = len(text_str) > 150

    return has_multiline or is_long


def create_env() -> Environment:
    """Create and configure the Jinja2 template environment."""
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(['html']),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    # Custom filters
    env.filters['nl2br'] = _nl2br
    env.filters['nl2br_html'] = _nl2br_html
    env.filters['md'] = _render_markdown
    env.filters['tojson_raw'] = _tojson_raw
    env.filters['titleize_operation'] = _titleize_operation
    env.filters['slugify'] = _slugify
    env.filters['resolve_skill_inputs'] = _resolve_skill_inputs
    env.filters['skill_title'] = _skill_title
    env.filters['truncate_text'] = _truncate_text
    env.filters['should_collapse_description'] = _should_collapse_description

    # Global functions available in all templates
    env.globals['build_operation_tree'] = build_operation_tree
    env.globals['count_tree_operations'] = count_tree_operations

    return env
