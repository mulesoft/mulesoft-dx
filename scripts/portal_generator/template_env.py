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
                'from': {'step': 'Get Current Organization', 'output': 'organizationId'},
                'description': '...'
            }
        }

    To:
        {
            'organizationId': {
                'ref': '${step1.organizationId}',
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

    # Build a mapping from step title to step number
    step_title_to_num = {}
    if step_details:
        for i, step in enumerate(step_details):
            title = step.get('title', '')
            # Strip "Step N: " prefix if present
            title = re.sub(r'^Step \d+:\s*', '', title)
            step_title_to_num[title] = i + 1

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
                step_title = from_ref.get('step', '')
                # Try both 'output' and 'input' fields
                var_name = from_ref.get('output') or from_ref.get('input', '')

                if step_title and var_name:
                    # Find the step number
                    step_num = step_title_to_num.get(step_title)
                    if step_num:
                        # Create the reference string
                        ref_string = f'${{step{step_num}.{var_name}}}'
                        # Replace 'from' with 'ref'
                        new_config = param_config.copy()
                        del new_config['from']
                        new_config['ref'] = ref_string
                        result[param_name] = new_config
                        continue

        # No transformation needed, keep as-is
        result[param_name] = param_config

    return result


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

    # Global functions available in all templates
    env.globals['build_operation_tree'] = build_operation_tree
    env.globals['count_tree_operations'] = count_tree_operations

    return env
