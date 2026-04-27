"""
API, MCP server, and skill discovery.

Scans the repository for:
- API directories under ``apis/`` (containing ``api.yaml``).
- MCP server directories under ``mcps/`` (containing ``mcp.yaml``).
- Skill files under ``skills/``, associated with APIs and MCPs by parsing
  ``urn:api:<slug>`` / ``urn:mcp:<slug>`` references inside their YAML step
  blocks.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .parsers import parse_oas, parse_skill, parse_mcp
from .utils import get_category

_URN_API_RE = re.compile(r'urn:api:([a-z0-9-]+)')
_URN_MCP_RE = re.compile(r'urn:mcp:([a-z0-9-]+)')


def _extract_urn_refs(skill_data: Dict, pattern: re.Pattern) -> List[str]:
    """Extract unique slugs referenced by a skill for the given URN pattern."""
    slugs: set = set()
    for step in skill_data.get('step_details', []):
        yaml_block = step.get('yaml')
        if not yaml_block:
            continue
        api_field = yaml_block.get('api', '')
        m = pattern.search(str(api_field))
        if m:
            slugs.add(m.group(1))
        inputs = yaml_block.get('inputs') or {}
        input_items = inputs.items() if isinstance(inputs, dict) else ((i, v) for i, v in enumerate(inputs) if isinstance(v, dict))
        for _key, input_val in input_items:
            if isinstance(input_val, dict):
                from_block = input_val.get('from')
                if isinstance(from_block, dict):
                    m = pattern.search(str(from_block.get('api', '')))
                    if m:
                        slugs.add(m.group(1))
    return sorted(slugs)


def _extract_api_refs(skill_data: Dict) -> List[str]:
    """Extract unique API slugs referenced by a skill via urn:api: URNs."""
    return _extract_urn_refs(skill_data, _URN_API_RE)


def _extract_mcp_refs(skill_data: Dict) -> List[str]:
    """Extract unique MCP slugs referenced by a skill via urn:mcp: URNs."""
    return _extract_urn_refs(skill_data, _URN_MCP_RE)


def discover_skills(repo_root: Path) -> Tuple[Dict[str, List[Dict]], Dict[str, List[Dict]], List[Dict]]:
    """Discover all skills in the top-level skills/ directory.

    Returns a tuple of:
    - ``skills_by_api``: mapping of ``api_slug -> [skill_data, ...]``.
    - ``skills_by_mcp``: mapping of ``mcp_slug -> [skill_data, ...]``.
    - ``all_skills``: flat list of every discovered skill (including prose-only
      skills that reference no APIs or MCPs).
    """
    skills_by_api: Dict[str, List[Dict]] = {}
    skills_by_mcp: Dict[str, List[Dict]] = {}
    all_skills: List[Dict] = []
    skills_dir = repo_root / 'skills'

    if not skills_dir.exists():
        return skills_by_api, skills_by_mcp, all_skills

    print("🔍 Scanning for skills...")

    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir():
            continue

        skill_file = skill_dir / 'SKILL.md'
        if not skill_file.exists():
            continue

        skill_data = parse_skill(skill_file)
        if not skill_data:
            continue

        api_refs = _extract_api_refs(skill_data)
        mcp_refs = _extract_mcp_refs(skill_data)
        skill_data['api_refs'] = api_refs
        skill_data['mcp_refs'] = mcp_refs
        all_skills.append(skill_data)
        refs_summary = ', '.join(api_refs + [f'mcp:{s}' for s in mcp_refs]) or 'none'
        print(f"  🎯 Skill: {skill_data.get('name', skill_dir.name)} → {refs_summary}")

        for api_slug in api_refs:
            skills_by_api.setdefault(api_slug, []).append(skill_data)
        for mcp_slug in mcp_refs:
            skills_by_mcp.setdefault(mcp_slug, []).append(skill_data)

    return skills_by_api, skills_by_mcp, all_skills


def discover_apis(repo_root: Path) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """Discover all APIs, MCP servers, and skills in the repository.

    Returns ``(apis, mcp_servers, all_discovered_skills)`` where
    ``all_discovered_skills`` is the flat list of every skill found,
    including prose-only skills that reference no APIs or MCPs.
    """
    apis: List[Dict] = []
    mcp_servers: List[Dict] = []

    # Discover skills once (top-level skills/ folder)
    skills_by_api, skills_by_mcp, all_discovered_skills = discover_skills(repo_root)

    print("🔍 Scanning for APIs...")

    # APIs are now in the apis/ folder
    apis_dir = repo_root / 'apis'
    if not apis_dir.exists():
        print("⚠️  Warning: apis/ directory not found")
        return [], [], all_discovered_skills

    for api_dir in sorted(apis_dir.iterdir()):
        if not api_dir.is_dir():
            continue

        # Skip special directories
        if api_dir.name.startswith('.'):
            continue

        api_yaml = api_dir / 'api.yaml'
        if not api_yaml.exists():
            continue

        print(f"  📄 Found API: {api_dir.name}")

        # Parse OAS
        oas_data = parse_oas(api_yaml)
        if not oas_data:
            continue

        # Read exchange.json for visibility metadata
        is_private = False
        exchange_file = api_dir / 'exchange.json'
        if exchange_file.exists():
            try:
                exchange_data = json.loads(exchange_file.read_text(encoding='utf-8'))
                is_private = exchange_data.get('visibility') == 'private'
            except (json.JSONDecodeError, OSError):
                pass

        # Look up skills that reference this API
        skills = skills_by_api.get(api_dir.name, [])

        # Build API data
        api_data = {
            'id': api_dir.name,
            'slug': api_dir.name,
            'name': oas_data['title'],
            'version': oas_data['version'],
            'description': oas_data['description'][:200] + '...' if len(oas_data['description']) > 200 else oas_data['description'],
            'full_description': oas_data['description'],
            'category': get_category(api_dir.name),
            'operation_count': oas_data['operation_count'],
            'operations': oas_data['operations'],
            'servers': oas_data['servers'],
            'security': oas_data['security'],
            'security_schemes': oas_data['security_schemes'],
            'tags': oas_data['tags'],
            'skills': skills,
            'skill_count': len(skills),
            'private': is_private,
        }

        if skills:
            print(f"    🎯 Found {len(skills)} skill(s)")

        apis.append(api_data)

    print(f"\n✅ Discovered {len(apis)} APIs")

    # Discover MCP servers under mcps/
    mcps_dir = repo_root / 'mcps'
    if mcps_dir.exists():
        print("\n🔍 Scanning for MCP servers...")
        for mcp_dir in sorted(mcps_dir.iterdir()):
            if not mcp_dir.is_dir() or mcp_dir.name.startswith('.'):
                continue
            mcp_data = parse_mcp(mcp_dir)
            if not mcp_data:
                continue
            print(f"  🧩 Found MCP: {mcp_dir.name} "
                  f"({mcp_data['tool_count']} tools, "
                  f"{mcp_data['resource_count']} resources, "
                  f"{mcp_data['prompt_count']} prompts)")
            mcp_skills = skills_by_mcp.get(mcp_dir.name, [])
            mcp_data['skills'] = mcp_skills
            mcp_data['skill_count'] = len(mcp_skills)
            mcp_servers.append(mcp_data)
        print(f"✅ Discovered {len(mcp_servers)} MCP servers")

    return apis, mcp_servers, all_discovered_skills


def calculate_stats(apis: List[Dict], mcp_servers: Optional[List[Dict]] = None) -> Dict:
    """Calculate portal statistics (excludes private APIs / MCPs)."""
    public_apis = [a for a in apis if not a.get('private')]
    public_mcps = [m for m in (mcp_servers or []) if not m.get('private')]
    total_operations = sum(api['operation_count'] for api in public_apis)
    total_tools = sum(mcp['tool_count'] for mcp in public_mcps)
    # Count unique skills (a skill may appear under multiple APIs or MCPs)
    seen = set()
    for api in public_apis:
        for skill in api.get('skills', []):
            seen.add(skill['slug'])
    for mcp in public_mcps:
        for skill in mcp.get('skills', []):
            seen.add(skill['slug'])
    total_skills = len(seen)

    categories = set(api['category'] for api in public_apis)

    return {
        'api_count': len(public_apis),
        'endpoint_count': total_operations,
        'mcp_count': len(public_mcps),
        'mcp_tool_count': total_tools,
        'skill_count': total_skills,
        'categories': sorted(categories),
    }
