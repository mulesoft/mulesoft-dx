"""
API and skill discovery.

Scans the repository for API directories (containing api.yaml) and skill files.
Skills live in a top-level ``skills/`` directory and are associated with APIs
by parsing ``urn:api:<slug>`` references inside their YAML step blocks.
"""

import json
import re
from pathlib import Path
from typing import Dict, List

from .parsers import parse_oas, parse_skill
from .utils import get_category

_URN_API_RE = re.compile(r'urn:api:([a-z0-9-]+)')


def _extract_api_refs(skill_data: Dict) -> List[str]:
    """Extract unique API slugs referenced by a skill via urn:api: URNs."""
    slugs: set = set()
    for step in skill_data.get('step_details', []):
        yaml_block = step.get('yaml')
        if not yaml_block:
            continue
        # Top-level api field (the operation's owning API)
        api_field = yaml_block.get('api', '')
        m = _URN_API_RE.search(str(api_field))
        if m:
            slugs.add(m.group(1))
        # Input references to other APIs (inputs.*.from.api)
        inputs = yaml_block.get('inputs') or {}
        input_items = inputs.items() if isinstance(inputs, dict) else ((i, v) for i, v in enumerate(inputs) if isinstance(v, dict))
        for _key, input_val in input_items:
            if isinstance(input_val, dict):
                from_block = input_val.get('from')
                if isinstance(from_block, dict):
                    m = _URN_API_RE.search(str(from_block.get('api', '')))
                    if m:
                        slugs.add(m.group(1))
    return sorted(slugs)


def discover_skills(repo_root: Path) -> Dict[str, List[Dict]]:
    """Discover all skills in the top-level skills/ directory.

    Returns a mapping of ``api_slug -> [skill_data, ...]`` built by parsing
    each skill's ``urn:api:`` references so that every API mentioned in a
    skill gets that skill in its list.
    """
    skills_by_api: Dict[str, List[Dict]] = {}
    skills_dir = repo_root / 'skills'

    if not skills_dir.exists():
        return skills_by_api

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
        skill_data['api_refs'] = api_refs
        print(f"  🎯 Skill: {skill_data.get('name', skill_dir.name)} → APIs: {', '.join(api_refs) or 'none'}")

        for api_slug in api_refs:
            skills_by_api.setdefault(api_slug, []).append(skill_data)

    return skills_by_api


def discover_apis(repo_root: Path) -> List[Dict]:
    """Discover all APIs in the repository"""
    apis = []

    # Discover skills once (top-level skills/ folder)
    skills_by_api = discover_skills(repo_root)

    print("🔍 Scanning for APIs...")

    # APIs are now in the apis/ folder
    apis_dir = repo_root / 'apis'
    if not apis_dir.exists():
        print("⚠️  Warning: apis/ directory not found")
        return []

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
    return apis


def calculate_stats(apis: List[Dict]) -> Dict:
    """Calculate portal statistics (excludes private APIs)."""
    public = [a for a in apis if not a.get('private')]
    total_operations = sum(api['operation_count'] for api in public)
    # Count unique skills (a skill may appear under multiple APIs)
    seen = set()
    for api in public:
        for skill in api.get('skills', []):
            seen.add(skill['slug'])
    total_skills = len(seen)

    return {
        'api_count': len(public),
        'endpoint_count': total_operations,
        'skill_count': total_skills,
        'categories': sorted(set(api['category'] for api in public))
    }
