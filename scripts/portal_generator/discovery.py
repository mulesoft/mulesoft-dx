"""
API, MCP server, skill, and Terraform provider discovery.

Scans the repository for:
- API directories under ``apis/`` (containing ``api.yaml``).
- MCP server directories under ``mcps/`` (containing ``mcp.yaml``).
- Skill files under ``skills/``, associated with APIs and MCPs by parsing
  ``urn:api:<slug>`` / ``urn:mcp:<slug>`` references inside their YAML step
  blocks.
- Terraform provider docs under ``terraform/<provider>/`` (containing
  ``resources/`` and/or ``data-sources/`` subdirectories with markdown files).
"""

import json
import os
import re
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ruamel.yaml import YAML

from .parsers import parse_oas, parse_skill, parse_mcp, parse_terraform_doc
from .utils import get_category, is_valid_version_dirname, sort_versions_desc


def _resolve_skill_type(skill_dir: Path) -> Optional[str]:
    """Resolve skill type from skills-metadata.yaml (hierarchical lookup).

    Checks skill_dir first, then parent dir. Returns 'prose' or 'jtbd',
    or None if no metadata found.
    """
    yaml = YAML(typ='safe')
    for candidate in [skill_dir / 'skills-metadata.yaml', skill_dir.parent / 'skills-metadata.yaml']:
        if candidate.exists():
            try:
                data = yaml.load(candidate)
                if isinstance(data, dict) and 'type' in data:
                    return data['type']
            except Exception:
                pass
    return None

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


def iter_skill_files(skills_dir: Path) -> List[Path]:
    """Return all ``SKILL.md`` files under ``skills_dir``.

    Discovers ``skills/<slug>/SKILL.md`` and one level of nesting
    ``skills/<category>/<slug>/SKILL.md``. This is the single source of truth
    for "which files count as skills", shared by the portal generator and the
    submission-time validator so they can never diverge.
    """
    skill_files: List[Path] = []
    if not skills_dir.exists():
        return skill_files
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir():
            continue
        direct = entry / 'SKILL.md'
        if direct.exists():
            skill_files.append(direct)
            continue
        for nested in sorted(entry.iterdir()):
            if not nested.is_dir():
                continue
            nested_skill = nested / 'SKILL.md'
            if nested_skill.exists():
                skill_files.append(nested_skill)
    return skill_files


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

    # Collect SKILL.md files at skills/<slug>/SKILL.md and
    # skills/<category>/<slug>/SKILL.md (one level of nesting).
    skill_files = iter_skill_files(skills_dir)

    for skill_file in skill_files:
        skill_dir = skill_file.parent
        skill_data = parse_skill(skill_file)
        if not skill_data:
            continue

        skill_data['skill_type'] = _resolve_skill_type(skill_dir)
        skill_data['skill_rel_path'] = str(skill_dir.relative_to(skills_dir))
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


def _parse_single_api(api_dir_path: str) -> Optional[Dict]:
    """Worker: parse a single API directory (runs in subprocess)."""
    api_dir = Path(api_dir_path)
    api_yaml = api_dir / 'api.yaml'

    oas_data = parse_oas(api_yaml)
    if not oas_data:
        return None

    is_private = False
    exchange_file = api_dir / 'exchange.json'
    if exchange_file.exists():
        try:
            exchange_data = json.loads(exchange_file.read_text(encoding='utf-8'))
            is_private = exchange_data.get('visibility') == 'private'
        except (json.JSONDecodeError, OSError):
            pass

    return {
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
        'private': is_private,
    }


def discover_apis(repo_root: Path, workers: int = 0) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """Discover all APIs, MCP servers, and skills in the repository.

    Returns ``(apis, mcp_servers, all_discovered_skills)`` where
    ``all_discovered_skills`` is the flat list of every skill found,
    including prose-only skills that reference no APIs or MCPs.
    """
    apis: List[Dict] = []
    mcp_servers: List[Dict] = []
    if workers <= 0:
        workers = os.cpu_count() or 4

    # Discover skills once (top-level skills/ folder)
    skills_by_api, skills_by_mcp, all_discovered_skills = discover_skills(repo_root)

    print("🔍 Scanning for APIs...")

    # APIs are now in the apis/ folder
    apis_dir = repo_root / 'apis'
    if not apis_dir.exists():
        print("⚠️  Warning: apis/ directory not found")
        return [], [], all_discovered_skills

    # Collect API directories
    api_dirs = []
    for api_dir in sorted(apis_dir.iterdir()):
        if not api_dir.is_dir() or api_dir.name.startswith('.'):
            continue
        if not (api_dir / 'api.yaml').exists():
            continue
        api_dirs.append(api_dir)

    # Parse APIs in parallel
    print(f"  ⚡ Parsing {len(api_dirs)} API specs across {workers} workers...")
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_parse_single_api, str(d)): d.name for d in api_dirs}
        for future in as_completed(futures):
            api_name = futures[future]
            exc = future.exception()
            if exc:
                print(f"  ❌ Error parsing {api_name}: {exc}")
                continue
            api_data = future.result()
            if not api_data:
                continue
            # Attach skills
            skills = skills_by_api.get(api_data['slug'], [])
            api_data['skills'] = skills
            api_data['skill_count'] = len(skills)
            apis.append(api_data)

    # Sort to maintain deterministic order
    apis.sort(key=lambda a: a['slug'])

    for api_data in apis:
        print(f"  📄 Found API: {api_data['slug']}")
        if api_data['skill_count']:
            print(f"    🎯 Found {api_data['skill_count']} skill(s)")

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
    """Calculate portal statistics (excludes private APIs)."""
    public_apis = [a for a in apis if not a.get('private')]
    # All MCPs are public under the new server.json registry schema.
    public_mcps = list(mcp_servers or [])
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


def discover_terraform(repo_root: Path) -> List[Dict]:
    """Discover Terraform provider documentation grouped by version.

    Layout: ``terraform/<provider>/<version>/{provider.json, resources/, data-sources/, guides/}``.

    Each provider dict includes:
    - ``slug``, ``name``: provider identity
    - ``versions``: list of version dicts sorted descending by semver, each with
      ``version``, ``is_latest``, ``docs``, ``nav_tree``, ``nav_tree_by_type``,
      ``doc_count``, ``install_info``
    - ``latest_version``: the version string of ``versions[0]``
    - ``docs``, ``nav_tree``, ``nav_tree_by_type``, ``doc_count``, ``install_info``:
      aliases of the latest version's fields (preserved for homepage card compat)
    """
    terraform_dir = repo_root / 'terraform'
    if not terraform_dir.exists():
        return []

    print("\n🔍 Scanning for Terraform providers...")
    providers: List[Dict] = []

    for provider_dir in sorted(terraform_dir.iterdir()):
        if not provider_dir.is_dir() or provider_dir.name.startswith('.'):
            continue

        # Enumerate version subdirs
        candidates: List[Path] = []
        for child in sorted(provider_dir.iterdir()):
            if not child.is_dir():
                continue
            if not is_valid_version_dirname(child.name):
                print(f"  ⚠  Skipping non-semver directory: {provider_dir.name}/{child.name}")
                continue
            candidates.append(child)

        if not candidates:
            continue

        sorted_versions = sort_versions_desc([c.name for c in candidates])
        by_name = {c.name: c for c in candidates}
        version_entries: List[Dict] = []
        for idx, version in enumerate(sorted_versions):
            entry = _parse_version_dir(by_name[version], version, is_latest=(idx == 0))
            if entry is not None:
                version_entries.append(entry)
            else:
                print(f"  ⚠  Skipping empty version directory: {provider_dir.name}/{version}")

        if not version_entries:
            continue

        provider_name = provider_dir.name.replace('-', ' ').title()
        latest = version_entries[0]
        provider = {
            'slug': provider_dir.name,
            'name': provider_name,
            'versions': version_entries,
            'latest_version': latest['version'],
            # Aliases of the latest version (homepage card compat)
            'docs': latest['docs'],
            'nav_tree': latest['nav_tree'],
            'nav_tree_by_type': latest['nav_tree_by_type'],
            'doc_count': latest['doc_count'],
            'install_info': latest['install_info'],
        }
        providers.append(provider)
        print(f"  🏗️  Provider: {provider_name} ({len(version_entries)} version(s), latest={latest['version']})")

    if providers:
        print(f"✅ Discovered {len(providers)} Terraform provider(s)")
    return providers


def _parse_version_dir(version_dir: Path, version: str, is_latest: bool) -> Optional[Dict]:
    """Parse a single ``terraform/<provider>/<version>/`` directory."""
    docs: List[Dict] = []
    for doc_type_dir in sorted(version_dir.iterdir()):
        if not doc_type_dir.is_dir():
            continue
        if doc_type_dir.name not in ('resources', 'data-sources', 'guides'):
            continue
        for md_file in sorted(doc_type_dir.glob('*.md')):
            doc = parse_terraform_doc(md_file)
            if doc:
                docs.append(doc)

    if not docs:
        return None

    nav_tree: Dict[str, Dict[str, List[Dict]]] = {}
    nav_tree_by_type: Dict[str, Dict[str, List[Dict]]] = {}
    for doc in docs:
        subcat = doc['subcategory']
        dtype = doc['doc_type']
        nav_tree.setdefault(subcat, {}).setdefault(dtype, []).append(doc)
        nav_tree_by_type.setdefault(dtype, {}).setdefault(subcat, []).append(doc)

    install_info = None
    provider_json = version_dir / 'provider.json'
    if provider_json.exists():
        try:
            install_info = json.loads(provider_json.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            install_info = None

    return {
        'version': version,
        'is_latest': is_latest,
        'docs': docs,
        'nav_tree': nav_tree,
        'nav_tree_by_type': nav_tree_by_type,
        'doc_count': len(docs),
        'install_info': install_info,
    }
