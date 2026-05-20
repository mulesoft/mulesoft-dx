"""Helpers that build minimal portal-render setups against malicious fixtures."""

from pathlib import Path


def build_mcp_with_xss_capabilities(tmp_path: Path) -> str:
    """Render a minimal MCP overview page with attacker-controlled capability flags.

    Returns the rendered HTML so the caller can parse and assert on it.
    """
    from portal_generator.template_env import create_env

    env = create_env()
    template = env.get_template('mcp/overview.html')
    mcp = {
        'name': 'fixture-mcp',
        'description': '',
        'full_description': '',
        'capabilities': {
            'tools': {
                '<img src=x onerror=alert(1)>': True,
                'normal_flag': False,
            },
        },
        'mcp_type': 'remote',
        'servers': [],
        'transport': {},
        'tool_count': 0,
        'prompt_count': 0,
        'resource_count': 0,
        'resource_template_count': 0,
        'tools': [],
        'prompts': [],
        'resources': [],
        'resource_templates': [],
        'install': {},
        'ide_configs': {},
        'security_schemes': {},
    }
    return template.render(mcp=mcp)
