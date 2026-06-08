"""
Main portal generator orchestrator.

Coordinates discovery, rendering, and file output to produce the complete portal.
"""

import html as _html
import json
import os
import shutil
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List
from urllib.parse import quote as _urlquote

from .discovery import discover_apis, discover_terraform, calculate_stats
from .builders.tree_builder import build_operation_tree
from .assets import get_css, get_js, get_jsonpath_js
from .template_env import create_env, _skill_title
from .mulesoft_chrome import fetch_mulesoft_chrome
from .utils import hash_asset_filename

_SKILL_SKIP_DIRS = {'node_modules', '__pycache__', '.git', '.sdd'}
_SKILL_SKIP_FILES = {'.DS_Store'}
_SKILL_SKIP_EXTS = {'.pyc'}


def _generate_skill_manifest(source_dir: Path, output_dir: Path) -> None:
    """Generate manifest.json listing skill files and copy them to output."""
    output_dir.mkdir(parents=True, exist_ok=True)
    files = []
    for f in sorted(source_dir.rglob('*')):
        if not f.is_file():
            continue
        rel = f.relative_to(source_dir)
        if any(part in _SKILL_SKIP_DIRS for part in rel.parts):
            continue
        if f.name in _SKILL_SKIP_FILES or f.suffix in _SKILL_SKIP_EXTS:
            continue
        files.append(str(rel))
        dest = output_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest)
    manifest = {'files': files}
    with open(output_dir / 'manifest.json', 'w', encoding='utf-8') as mf:
        json.dump(manifest, mf)


def _resolve_prose_only(skill: Dict) -> bool:
    """Return True for prose skills, False for jtbd. Fail loud on an unresolved type.

    Skill type is the single source of truth (resolved by discovery via
    _resolve_skill_type + skills-metadata.yaml; enforced by validate_skills.py
    R6). The generator must not assume a default for an unresolved type — that
    is the silent mis-render this WI removed — so raise instead.
    """
    skill_type = skill.get('skill_type')
    if skill_type not in ('prose', 'jtbd'):
        raise ValueError(
            f"Skill '{skill.get('slug', skill.get('name', '?'))}' has unresolved skill_type "
            f"{skill_type!r}; declare type in skills-metadata.yaml (enforced by validate_skills.py R6)."
        )
    return skill_type == 'prose'


def _build_api_meta(api: Dict) -> Dict:
    """Build the metadata object for JavaScript access."""
    servers = []
    for s in api.get('servers', []):
        if isinstance(s, dict):
            variables = {}
            for vname, vdef in (s.get('variables') or {}).items():
                if isinstance(vdef, dict):
                    variables[str(vname)] = {
                        'default': str(vdef.get('default', '')),
                        'description': str(vdef.get('description', '')),
                    }
            servers.append({
                'url': str(s.get('url', '')),
                'description': str(s.get('description', '')),
                'variables': variables,
            })

    security_schemes = {}
    for name, scheme in api.get('security_schemes', {}).items():
        if isinstance(scheme, dict):
            entry = {
                'type': str(scheme.get('type', '')),
                'scheme': str(scheme.get('scheme', '')),
                'description': str(scheme.get('description', '')),
            }
            flows = scheme.get('flows', {})
            if flows and isinstance(flows, dict):
                entry['flows'] = {}
                for flow_name, flow_data in flows.items():
                    if isinstance(flow_data, dict):
                        entry['flows'][str(flow_name)] = {
                            'tokenUrl': str(flow_data.get('tokenUrl', '')),
                        }
            security_schemes[str(name)] = entry

    security = []
    for s in api.get('security', []):
        if isinstance(s, dict):
            security.append({str(k): list(v) if isinstance(v, list) else [] for k, v in s.items()})

    return {
        'servers': servers,
        'securitySchemes': security_schemes,
        'security': security,
    }


def _get_example_body(operation: Dict) -> str:
    """Get the best example body for the Try It Out textarea."""
    rb = operation.get('requestBody')
    if not rb:
        return ''

    for ct, named in rb.get('examples', {}).items():
        for name, json_str in named.items():
            return json_str

    for ct, schema in rb.get('raw_schemas', {}).items():
        if isinstance(schema, dict) and schema.get('properties'):
            stub = {}
            for prop_name, prop_def in schema['properties'].items():
                if isinstance(prop_def, dict):
                    ptype = prop_def.get('type', 'string')
                    default = prop_def.get('default')
                    if default is not None:
                        stub[str(prop_name)] = default
                    elif ptype == 'string':
                        stub[str(prop_name)] = ''
                    elif ptype == 'integer':
                        stub[str(prop_name)] = 0
                    elif ptype == 'boolean':
                        stub[str(prop_name)] = False
                    elif ptype == 'array':
                        stub[str(prop_name)] = []
                    elif ptype == 'object':
                        stub[str(prop_name)] = {}
                    else:
                        stub[str(prop_name)] = ''
            if stub:
                return json.dumps(stub, indent=2)

    return ''


def _prepare_operations(apis: List[Dict]):
    """Pre-compute example bodies for operations (data prep before rendering)."""
    for api in apis:
        for op in api.get('operations', []):
            op['_example_body'] = _get_example_body(op)


def _render_api_page(args: Dict) -> None:
    """Worker: render a single API detail page (runs in subprocess)."""
    env = create_env()
    template = env.get_template('detail_page.html')
    api = args['api']
    operation_tree = build_operation_tree(api['operations'])
    html = template.render(
        **args['asset_paths'],
        api=api,
        api_meta=_build_api_meta(api),
        op_lookup=args['op_lookup'],
        operation_tree=operation_tree,
        proxy_url=args['proxy_url'],
        build_label=args['build_label'],
        base_url=args['base_url'],
        chrome=args['chrome'],
        repo_url=args['repo_url'],
        repo_branch=args['repo_branch'],
        source_path=f"apis/{api['slug']}/api.yaml",
        asset_type='api',
        asset_name=api.get('name', api['slug']),
    )
    Path(args['output_path']).write_text(html, encoding='utf-8')


def _render_mcp_page(args: Dict) -> None:
    """Worker: render a single MCP detail page (runs in subprocess)."""
    env = create_env()
    template = env.get_template('mcp_detail_page.html')
    mcp = args['mcp']

    mcp_meta = args['mcp_meta']
    html = template.render(
        **args['asset_paths'],
        mcp=mcp,
        mcp_meta=mcp_meta,
        op_lookup=args['op_lookup'],
        mcp_lookup=args['mcp_lookup'],
        proxy_url=args['proxy_url'],
        build_label=args['build_label'],
        base_url=args['base_url'],
        chrome=args['chrome'],
        repo_url=args['repo_url'],
        repo_branch=args['repo_branch'],
        source_path=f"mcps/{mcp['slug']}/mcp.yaml",
        asset_type='mcp',
        asset_name=mcp.get('name', mcp['slug']),
    )
    Path(args['output_path']).write_text(html, encoding='utf-8')


def _render_skill_page(args: Dict) -> None:
    """Worker: render a single skill page (runs in subprocess)."""
    env = create_env()
    template = env.get_template('skill_page.html')
    skill = args['skill']
    skill_name = _skill_title(skill.get('name', skill['slug']))

    html = template.render(
        **args['asset_paths'],
        skill=skill,
        skill_name=skill_name,
        api_meta=args['api_meta'],
        op_lookup=args['op_lookup'],
        api_link_prefix='../apis/',
        private_api_slugs=args['private_api_slugs'],
        linked_apis=args['linked_apis'],
        proxy_url=args['proxy_url'],
        build_label=args['build_label'],
        base_url=args['base_url'],
        prose_only=args['prose_only'],
        chrome=args['chrome'],
        repo_url=args['repo_url'],
        repo_branch=args['repo_branch'],
        source_path=f"skills/{skill.get('skill_rel_path', skill['slug'])}/SKILL.md",
        asset_type='skill',
        asset_name=skill_name,
    )
    Path(args['output_path']).write_text(html, encoding='utf-8')

    # Generate manifest
    if args.get('skill_source_dir'):
        source_dir = Path(args['skill_source_dir'])
        manifest_output_dir = Path(args['manifest_output_dir'])
        if source_dir.is_dir():
            _generate_skill_manifest(source_dir, manifest_output_dir)


def _render_terraform_page(args: Dict) -> None:
    """Worker: render a single Terraform version page (runs in subprocess)."""
    env = create_env()
    template = env.get_template('terraform_page.html')
    provider = args['provider']
    version = args['version']

    html = template.render(
        **args['asset_paths'],
        provider=provider,
        version=version,
        nav_tree=version['nav_tree'],
        nav_tree_by_type=version['nav_tree_by_type'],
        version_anchors=args['version_anchors'],
        home_link='../../index.html',
        build_label=args['build_label'],
        base_url=args['base_url'],
        chrome=args.get('chrome'),
        repo_url=args.get('repo_url', ''),
        repo_branch=args.get('repo_branch', ''),
        source_path=args.get('source_path', ''),
        asset_type='terraform',
        asset_name=provider['name'],
    )
    Path(args['output_path']).parent.mkdir(parents=True, exist_ok=True)
    Path(args['output_path']).write_text(html, encoding='utf-8')


class PortalGenerator:
    REPO_URL = 'https://github.com/mulesoft/anypoint-public-api-specs'
    REPO_BRANCH = 'master'

    def __init__(self, output_dir: Path, proxy_url: str = 'http://localhost:8080/proxy',
                 build_label: str = 'unknown', base_url: str = 'https://dev-portal.mulesoft.com',
                 workers: int = 0):
        self.output_dir = output_dir
        self.proxy_url = proxy_url
        self.build_label = build_label
        self.base_url = base_url.rstrip('/')
        self.env = create_env()
        self.apis = []
        self.public_apis = []
        self.mcp_servers = []
        self.public_mcps = []
        self.stats = {}
        self.all_skills = []
        self.terraform_providers = []
        self.repo_root = None
        self.chrome = None
        self.workers = workers if workers > 0 else os.cpu_count() or 4

    def generate(self, repo_root: Path):
        """Generate the complete portal"""
        print("\n🚀 Starting Portal Generation\n")
        print("=" * 60)

        # Store repo root for later use
        self.repo_root = repo_root

        # Discover APIs, MCP servers, and skills
        self.apis, self.mcp_servers, all_discovered_skills = discover_apis(repo_root)
        self.public_apis = [a for a in self.apis if not a.get('private')]
        # All MCP servers are public — visibility was dropped when we switched
        # to the MCP registry server.json schema. Alias kept to avoid churning
        # callers that still reference public_mcps.
        self.public_mcps = list(self.mcp_servers)
        self.stats = calculate_stats(self.apis, self.mcp_servers)

        # Pre-compute data for templates
        _prepare_operations(self.apis)

        # Collect unique skills from public APIs and MCPs
        seen_slugs = set()
        for api in self.public_apis:
            for skill in api['skills']:
                if skill['slug'] not in seen_slugs:
                    seen_slugs.add(skill['slug'])
                    self.all_skills.append(skill)
        for mcp in self.public_mcps:
            for skill in mcp.get('skills', []):
                if skill['slug'] not in seen_slugs:
                    seen_slugs.add(skill['slug'])
                    self.all_skills.append(skill)

        # Also collect prose-only skills (no API or MCP refs)
        for skill in all_discovered_skills:
            if (not skill.get('api_refs') and not skill.get('mcp_refs')
                    and skill['slug'] not in seen_slugs):
                seen_slugs.add(skill['slug'])
                self.all_skills.append(skill)

        # Update skill count to include prose-only skills
        self.stats['skill_count'] = len(self.all_skills)

        # Discover Terraform providers
        self.terraform_providers = discover_terraform(repo_root)

        print(f"\n📊 Statistics:")
        print(f"  • {self.stats['api_count']} APIs")
        print(f"  • {self.stats['endpoint_count']} Endpoints")
        print(f"  • {self.stats['mcp_count']} MCP Servers ({self.stats['mcp_tool_count']} tools)")
        print(f"  • {self.stats['skill_count']} Skills")
        print(f"  • {len(self.stats['categories'])} Categories")

        # Clean and create output directories to avoid stale artifacts
        print(f"\n📁 Creating output directories...")
        for subdir in ['apis', 'skills', 'mcps', 'assets', 'schemas', 'terraform']:
            target = self.output_dir / subdir
            if target.exists():
                shutil.rmtree(target)
            target.mkdir(parents=True, exist_ok=True)

        # Copy fragments directory so that $ref links in api.yaml resolve correctly
        source_fragments = self.repo_root / 'fragments'
        if source_fragments.is_dir():
            dest_fragments = self.output_dir / 'fragments'
            if dest_fragments.exists():
                shutil.rmtree(dest_fragments)
            shutil.copytree(source_fragments, dest_fragments)

        # Fetch MuleSoft header and footer
        print(f"\n🌐 Fetching MuleSoft header and footer...")
        try:
            self.chrome = fetch_mulesoft_chrome()
        except Exception as e:
            print(f"    ⚠️  Failed to fetch chrome elements: {e}")
            print(f"    ℹ️  Using minimal fallback header/footer")
            self.chrome = {
                'dependencies': '',
                'header': '<header style="padding: 1rem; background: #fff; border-bottom: 1px solid #ddd;"><a href="https://www.mulesoft.com">MuleSoft</a></header>',
                'footer': '<footer style="padding: 1rem; background: #f5f5f5; border-top: 1px solid #ddd; text-align: center;"><p>© MuleSoft</p></footer>'
            }

        # Generate files
        print(f"\n📝 Generating portal files (workers={self.workers})...")
        self._css_filename = self._generate_css()
        self._js_filename, self._jsonpath_filename = self._generate_js()
        self._generate_404()
        self._generate_500()
        self._generate_error_page()
        self._generate_homepage()
        self._generate_detail_pages_parallel()
        self._generate_registry()
        self._generate_schemas()
        self._generate_agents_md()
        self._generate_llms_txt()
        self._generate_markdown_pages()
        self._generate_headers()
        self._copy_images()

        print("\n" + "=" * 60)
        print("✅ Portal generation complete!")
        print(f"\n📂 Output: {self.output_dir}/")
        print(f"🌐 Open: {self.output_dir}/index.html")
        print(f"📋 Registry: {self.output_dir}/registry.json")
        print(f"🤖 Agent guide: {self.output_dir}/AGENTS.md")

    def _asset_paths(self, depth: int = 1) -> dict:
        """Return template variables for hashed asset paths at the given directory depth."""
        prefix = '../' * depth if depth > 0 else ''
        return {
            'css_path': f"{prefix}assets/{self._css_filename}",
            'icons_path': f"{prefix}assets/icons",
            'portal_js_path': f"{prefix}assets/{self._js_filename}",
            'jsonpath_js_path': f"{prefix}assets/{self._jsonpath_filename}",
        }

    def _generate_static_error_page(self, template_name: str, output_name: str) -> None:
        """Render a static error page template to output_dir/output_name."""
        template = self.env.get_template(template_name)
        html = template.render(
            **self._asset_paths(0),
            build_label=self.build_label,
            base_url=self.base_url,
            chrome={k: v for k, v in self.chrome.items() if k != 'header'} if self.chrome else None,
        )
        (self.output_dir / output_name).write_text(html, encoding='utf-8')

    def _generate_404(self):
        """Generate 404.html error page."""
        print("  ✓ Generating 404 page...")
        self._generate_static_error_page('404.html', '404.html')

    def _generate_500(self):
        """Generate 500.html error page."""
        print("  ✓ Generating 500 page...")
        self._generate_static_error_page('500.html', '500.html')

    def _generate_error_page(self):
        """Generate error.html generic fallback error page."""
        print("  ✓ Generating generic error page...")
        self._generate_static_error_page('error.html', 'error.html')

    def _generate_homepage(self):
        """Generate index.html"""
        print("  ✓ Generating homepage...")
        template = self.env.get_template('homepage.html')

        # Create unified list of APIs, MCP servers, and skills (alpha by name)
        all_items = []

        for api in self.public_apis:
            api_copy = api.copy()
            api_copy['_item_type'] = 'api'
            all_items.append(api_copy)

        for mcp in self.public_mcps:
            mcp_copy = mcp.copy()
            mcp_copy['_item_type'] = 'mcp'
            all_items.append(mcp_copy)

        if self.all_skills:
            for skill in self.all_skills:
                skill_copy = skill.copy()
                skill_copy['_item_type'] = 'skill'
                all_items.append(skill_copy)

        if self.terraform_providers:
            for provider in self.terraform_providers:
                provider_copy = provider.copy()
                provider_copy['_item_type'] = 'terraform'
                all_items.append(provider_copy)

        all_items.sort(key=lambda x: x.get('name', '').lower())

        html = template.render(
            **self._asset_paths(0),
            apis=self.public_apis,
            mcp_servers=self.public_mcps,
            stats=self.stats,
            all_skills=self.all_skills,
            terraform_providers=self.terraform_providers,
            all_items=all_items,
            proxy_url=self.proxy_url,
            chrome={k: v for k, v in self.chrome.items() if k != 'header'} if self.chrome else None,
            build_label=self.build_label,
            base_url=self.base_url,
        )

        output_path = self.output_dir / 'index.html'
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)

    def _build_operation_lookup(self) -> Dict:
        """Build a lookup map of all operations across all APIs.
        Returns {apiSlug: {ops: {operationId: {method, path, parameters, description, summary}}, servers: [...]}}."""
        lookup = {}
        for api in self.apis:
            ops = {}
            for op in api.get('operations', []):
                ops[op['operationId']] = {
                    'method': op['method'],
                    'path': op['path'],
                    'parameters': op.get('parameters', []),
                    'requestBody': op.get('requestBody'),
                    'description': op.get('description', ''),
                    'summary': op.get('summary', ''),
                }
            servers = []
            for s in api.get('servers', []):
                if isinstance(s, dict):
                    entry = {'url': str(s.get('url', ''))}
                    variables = {}
                    for vname, vdef in (s.get('variables') or {}).items():
                        if isinstance(vdef, dict):
                            variables[str(vname)] = {
                                'default': str(vdef.get('default', '')),
                                'description': str(vdef.get('description', '')),
                            }
                    if variables:
                        entry['variables'] = variables
                    servers.append(entry)
            lookup[api['slug']] = {'ops': ops, 'servers': servers}
        return lookup

    def _generate_detail_pages_parallel(self):
        """Generate all detail pages (APIs, MCPs, skills, terraform) in parallel."""
        op_lookup = self._build_operation_lookup()
        mcp_lookup = self._build_mcp_lookup()
        chrome = ({'footer': self.chrome.get('footer', ''), 'dependencies': self.chrome.get('dependencies', '')}
                  if self.chrome else None)

        tasks = []

        # API detail pages
        print(f"  ✓ Queuing {len(self.public_apis)} API detail pages...")
        for api in self.public_apis:
            tasks.append((_render_api_page, {
                'api': api,
                'op_lookup': op_lookup,
                'proxy_url': self.proxy_url,
                'build_label': self.build_label,
                'base_url': self.base_url,
                'chrome': chrome,
                'repo_url': self.REPO_URL,
                'repo_branch': self.REPO_BRANCH,
                'asset_paths': self._asset_paths(1),
                'output_path': str(self.output_dir / 'apis' / f"{api['slug']}.html"),
            }))

        # MCP detail pages
        if self.public_mcps:
            print(f"  ✓ Queuing {len(self.public_mcps)} MCP detail pages...")
            for mcp in self.public_mcps:
                api_refs = mcp.get('xorigin_api_refs', set())
                mcp_refs = mcp.get('xorigin_mcp_refs', set())
                scoped_op_lookup = {s: op_lookup[s] for s in api_refs if s in op_lookup}
                scoped_mcp_lookup = {s: mcp_lookup[s] for s in mcp_refs if s in mcp_lookup}

                tasks.append((_render_mcp_page, {
                    'mcp': mcp,
                    'mcp_meta': self._build_mcp_meta(mcp),
                    'op_lookup': scoped_op_lookup,
                    'mcp_lookup': scoped_mcp_lookup,
                    'proxy_url': self.proxy_url,
                    'build_label': self.build_label,
                    'base_url': self.base_url,
                    'chrome': chrome,
                    'repo_url': self.REPO_URL,
                    'repo_branch': self.REPO_BRANCH,
                    'asset_paths': self._asset_paths(1),
                    'output_path': str(self.output_dir / 'mcps' / f"{mcp['slug']}.html"),
                }))

        # Skill pages
        print(f"  ✓ Queuing {len(self.all_skills)} skill pages...")
        api_by_slug = {api['slug']: api for api in self.apis}
        private_api_slugs = {api['slug'] for api in self.apis if api.get('private')}

        for skill in self.all_skills:
            api_refs = skill.get('api_refs', [])
            scoped_op_lookup = {slug: op_lookup[slug] for slug in api_refs if slug in op_lookup}
            first_api = api_by_slug.get(api_refs[0]) if api_refs else None
            api_meta = _build_api_meta(first_api) if first_api else {'servers': [], 'securitySchemes': {}, 'security': []}

            prose_only = _resolve_prose_only(skill)

            linked_apis = []
            for api_slug in api_refs:
                if api_slug in api_by_slug:
                    api_data = api_by_slug[api_slug]
                    linked_apis.append({
                        'name': api_data.get('name', ''),
                        'slug': api_slug,
                        'operation_count': len(api_data.get('operations', [])),
                        'private': api_data.get('private', False)
                    })

            skill_rel = skill.get('skill_rel_path', skill['slug'])
            skill_source_dir = self.repo_root / 'skills' / skill_rel
            tasks.append((_render_skill_page, {
                'skill': skill,
                'api_meta': api_meta,
                'op_lookup': scoped_op_lookup,
                'private_api_slugs': private_api_slugs,
                'linked_apis': linked_apis,
                'proxy_url': self.proxy_url,
                'build_label': self.build_label,
                'base_url': self.base_url,
                'prose_only': prose_only,
                'chrome': chrome,
                'repo_url': self.REPO_URL,
                'repo_branch': self.REPO_BRANCH,
                'asset_paths': self._asset_paths(1),
                'output_path': str(self.output_dir / 'skills' / f"{skill['slug']}.html"),
                'skill_source_dir': str(skill_source_dir) if skill_source_dir.is_dir() else None,
                'manifest_output_dir': str(self.output_dir / 'skills' / skill_rel),
            }))

        # Terraform pages — one task per (provider, version)
        if self.terraform_providers:
            version_count = sum(len(p['versions']) for p in self.terraform_providers)
            total_docs = sum(
                sum(v['doc_count'] for v in p['versions']) for p in self.terraform_providers
            )
            print(f"  ✓ Queuing {version_count} Terraform page(s) "
                  f"across {len(self.terraform_providers)} provider(s) ({total_docs} docs)...")
            for provider in self.terraform_providers:
                version_anchors = self._build_version_anchors(provider)
                provider_dir = self.output_dir / 'terraform' / provider['slug']
                for version in provider['versions']:
                    tasks.append((_render_terraform_page, {
                        'provider': provider,
                        'version': version,
                        'version_anchors': version_anchors,
                        'build_label': self.build_label,
                        'base_url': self.base_url,
                        'output_path': str(provider_dir / f"{version['version']}.html"),
                        'chrome': {'footer': self.chrome.get('footer', ''), 'dependencies': self.chrome.get('dependencies', '')} if self.chrome else None,
                        'repo_url': self.REPO_URL,
                        'repo_branch': self.REPO_BRANCH,
                        'asset_paths': self._asset_paths(2),
                        'source_path': f"terraform/{provider['slug']}/{version['version']}",
                    }))

        # Execute all tasks in parallel
        total = len(tasks)
        print(f"  ⚡ Rendering {total} pages across {self.workers} workers...")
        with ProcessPoolExecutor(max_workers=self.workers) as executor:
            futures = {executor.submit(fn, args): args.get('output_path', '') for fn, args in tasks}
            done = 0
            for future in as_completed(futures):
                done += 1
                exc = future.exception()
                if exc:
                    path = futures[future]
                    print(f"    ❌ Error rendering {path}: {exc}")
                    raise exc
        print(f"  ✓ All {total} pages rendered.")

        # Terraform redirect stubs (lightweight, not worth parallelizing)
        if self.terraform_providers:
            for provider in self.terraform_providers:
                provider_dir = self.output_dir / 'terraform' / provider['slug']
                provider_dir.mkdir(parents=True, exist_ok=True)
                # index.html — meta-refresh to latest version
                latest_url = f"{provider['latest_version']}.html"
                (provider_dir / 'index.html').write_text(
                    self._render_redirect_stub(latest_url, label=f"{provider['name']} {provider['latest_version']}"),
                    encoding='utf-8',
                )
                # Legacy <slug>.html — redirect to versioned path
                legacy_path = self.output_dir / 'terraform' / f"{provider['slug']}.html"
                legacy_path.write_text(
                    self._render_redirect_stub(f"{provider['slug']}/index.html", label=provider['name']),
                    encoding='utf-8',
                )

    def _generate_detail_pages(self):
        """Generate individual API pages (public APIs only) - sequential fallback."""
        print(f"  ✓ Generating {len(self.public_apis)} API detail pages...")

        op_lookup = self._build_operation_lookup()
        template = self.env.get_template('detail_page.html')

        for api in self.public_apis:
            api_meta = _build_api_meta(api)
            operation_tree = build_operation_tree(api['operations'])
            html = template.render(
                **self._asset_paths(1),
                api=api,
                api_meta=api_meta,
                op_lookup=op_lookup,
                operation_tree=operation_tree,
                proxy_url=self.proxy_url,
                build_label=self.build_label,
                base_url=self.base_url,
                chrome={'footer': self.chrome.get('footer', ''), 'dependencies': self.chrome.get('dependencies', '')} if self.chrome else None,
                repo_url=self.REPO_URL,
                repo_branch=self.REPO_BRANCH,
                source_path=f"apis/{api['slug']}/api.yaml",
                asset_type='api',
                asset_name=api.get('name', api['slug']),
            )
            output_path = self.output_dir / 'apis' / f"{api['slug']}.html"
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)

    def _build_mcp_meta(self, mcp: Dict) -> Dict:
        """Build the metadata object for JavaScript access on the MCP page."""
        servers = []
        for s in mcp.get('servers', []):
            if isinstance(s, dict):
                servers.append({
                    'url': str(s.get('url', '')),
                    'description': str(s.get('description', '')),
                    'variables': {},
                    'transport': str(s.get('_transport_kind', '')),
                })

        security_schemes = {}
        for name, scheme in mcp.get('security_schemes', {}).items():
            if isinstance(scheme, dict):
                security_schemes[str(name)] = {
                    'type': str(scheme.get('type', '')),
                    'scheme': str(scheme.get('scheme', '')),
                    'description': str(scheme.get('description', '')),
                }

        return {
            'slug': mcp.get('slug', ''),
            'servers': servers,
            'securitySchemes': security_schemes,
            'tools': mcp.get('tools', []),
            'prompts': mcp.get('prompts', []),
            'resources': mcp.get('resources', []),
            'resourceTemplates': mcp.get('resource_templates', []),
        }

    def _build_mcp_lookup(self) -> Dict:
        """Build a lookup map of MCP servers for x-origin resolution.

        Returns ``{mcpSlug: {tools: {name: {inputSchema, description}}, servers, transport}}``.
        """
        lookup: Dict = {}
        for mcp in self.mcp_servers:
            tools: Dict = {}
            for tool in mcp.get('tools', []):
                if isinstance(tool, dict) and tool.get('name'):
                    tools[tool['name']] = {
                        'inputSchema': tool.get('inputSchema', {}),
                        'description': tool.get('description', ''),
                    }
            lookup[mcp['slug']] = {
                'tools': tools,
                'servers': [
                    {'url': s.get('url', ''), 'variables': s.get('variables', {})}
                    for s in mcp.get('servers', []) if isinstance(s, dict)
                ],
            }
        return lookup

    def _generate_mcp_detail_pages(self):
        """Generate individual MCP server pages (public servers only)."""
        if not self.public_mcps:
            return
        print(f"  ✓ Generating {len(self.public_mcps)} MCP detail pages...")

        full_op_lookup = self._build_operation_lookup()
        full_mcp_lookup = self._build_mcp_lookup()
        template = self.env.get_template('mcp_detail_page.html')

        for mcp in self.public_mcps:
            mcp_meta = self._build_mcp_meta(mcp)

            api_refs = mcp.get('xorigin_api_refs', set())
            mcp_refs = mcp.get('xorigin_mcp_refs', set())
            op_lookup = {s: full_op_lookup[s] for s in api_refs if s in full_op_lookup}
            mcp_lookup = {s: full_mcp_lookup[s] for s in mcp_refs if s in full_mcp_lookup}

            html = template.render(
                **self._asset_paths(1),
                mcp=mcp,
                mcp_meta=mcp_meta,
                op_lookup=op_lookup,
                mcp_lookup=mcp_lookup,
                proxy_url=self.proxy_url,
                build_label=self.build_label,
                base_url=self.base_url,
                chrome={'footer': self.chrome.get('footer', ''), 'dependencies': self.chrome.get('dependencies', '')} if self.chrome else None,
                repo_url=self.REPO_URL,
                repo_branch=self.REPO_BRANCH,
                source_path=f"mcps/{mcp['slug']}/mcp.yaml",
                asset_type='mcp',
                asset_name=mcp.get('name', mcp['slug']),
            )
            output_path = self.output_dir / 'mcps' / f"{mcp['slug']}.html"
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)

    def _generate_skill_pages(self):
        """Generate individual skill pages"""
        print(f"  ✓ Generating {len(self.all_skills)} skill pages...")

        full_op_lookup = self._build_operation_lookup()
        # Build a lookup from api slug to api data for api_meta
        api_by_slug = {api['slug']: api for api in self.apis}
        private_api_slugs = {api['slug'] for api in self.apis if api.get('private')}

        template = self.env.get_template('skill_page.html')

        for skill in self.all_skills:
            skill_name = _skill_title(skill.get('name', skill['slug']))
            api_refs = skill.get('api_refs', [])

            # Build op_lookup scoped to APIs this skill references
            op_lookup = {slug: full_op_lookup[slug] for slug in api_refs if slug in full_op_lookup}

            # Build api_meta from the first referenced API (for auth/server info)
            first_api = api_by_slug.get(api_refs[0]) if api_refs else None
            api_meta = _build_api_meta(first_api) if first_api else {'servers': [], 'securitySchemes': {}, 'security': []}

            prose_only = _resolve_prose_only(skill)

            # Build linked APIs list for sidebar
            linked_apis = []
            for api_slug in api_refs:
                if api_slug in api_by_slug:
                    api_data = api_by_slug[api_slug]
                    linked_apis.append({
                        'name': api_data.get('name', ''),
                        'slug': api_slug,
                        'operation_count': len(api_data.get('operations', [])),
                        'private': api_data.get('private', False)
                    })

            html = template.render(
                **self._asset_paths(1),
                skill=skill,
                skill_name=skill_name,
                api_meta=api_meta,
                op_lookup=op_lookup,
                api_link_prefix='../apis/',
                private_api_slugs=private_api_slugs,
                linked_apis=linked_apis,
                proxy_url=self.proxy_url,
                build_label=self.build_label,
                base_url=self.base_url,
                prose_only=prose_only,
                chrome={'footer': self.chrome.get('footer', ''), 'dependencies': self.chrome.get('dependencies', '')} if self.chrome else None,
                repo_url=self.REPO_URL,
                repo_branch=self.REPO_BRANCH,
                source_path=f"skills/{skill.get('skill_rel_path', skill['slug'])}/SKILL.md",
                asset_type='skill',
                asset_name=skill_name,
            )
            output_path = self.output_dir / 'skills' / f"{skill['slug']}.html"
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)

            # Generate manifest for on-demand ZIP download
            skill_rel = skill.get('skill_rel_path', skill['slug'])
            skill_source_dir = self.repo_root / 'skills' / skill_rel
            if skill_source_dir.is_dir():
                _generate_skill_manifest(skill_source_dir, self.output_dir / 'skills' / skill_rel)

    def _build_skill_preamble(self) -> str:
        """Build the agent-context directive injected after frontmatter in portal-output SKILL.md copies."""
        base = self.base_url
        return (
            f"> **Agent context:** For execution instructions, authentication, input types, "
            f"and x-origin resolution, read [{base}/AGENTS.md]({base}/AGENTS.md).\n"
        )

    @staticmethod
    def _inject_after_frontmatter(content: str, preamble: str) -> str:
        """Insert preamble after the closing --- of YAML frontmatter."""
        parts = content.split('---', 2)
        if len(parts) >= 3:
            return f"---{parts[1]}---\n\n{preamble}\n{parts[2]}"
        return preamble + "\n" + content


    @staticmethod
    def _build_version_anchors(provider: Dict) -> Dict[str, List[str]]:
        """Map version -> list of doc anchors available in that version."""
        return {
            v['version']: [d['slug'] for d in v['docs']]
            for v in provider['versions']
        }

    @staticmethod
    def _render_redirect_stub(target_relative_url: str, label: str) -> str:
        """Tiny static-site-friendly redirect page.

        Forwards via inline JS so ``location.hash`` (e.g. ``#doc-foo``) is
        preserved, with a ``<meta http-equiv="refresh">`` fallback for clients
        that block scripts. Both inputs are escaped: ``label`` via
        :func:`html.escape`, ``target_relative_url`` via
        :func:`urllib.parse.quote` for attribute-value safety.
        """
        url = _urlquote(target_relative_url, safe="/.-#?=&")
        label_safe = _html.escape(label, quote=True)
        url_attr = _html.escape(url, quote=True)
        # JSON-encode the URL for safe injection into the inline script.
        url_js = json.dumps(url)
        return (
            f"<!doctype html>\n"
            f"<html lang=\"en\"><head>"
            f"<meta charset=\"utf-8\">"
            f"<meta http-equiv=\"refresh\" content=\"0; url={url_attr}\">"
            f"<title>Redirecting to {label_safe}</title>"
            f"<link rel=\"canonical\" href=\"{url_attr}\">"
            f"<script>"
            f"(function(){{var t={url_js};"
            f"location.replace(t+(location.hash||''));}})();"
            f"</script>"
            f"</head><body>"
            f"<noscript><a href=\"{url_attr}\">Continue to {label_safe}</a></noscript>"
            f"</body></html>\n"
        )

    def _generate_registry(self):
        """Generate registry.json - a document registry for APIs, Skills, and Schemas."""
        print(f"  ✓ Generating document registry...")

        registry = []
        preamble = self._build_skill_preamble()

        # Add API documents
        for api in self.apis:
            slug = api['slug']
            urn = f"urn:api:{slug}"

            # Copy source api.yaml and referenced subdirectories to output
            source_dir = self.repo_root / 'apis' / slug
            source_yaml = source_dir / 'api.yaml'
            if source_yaml.exists():
                api_output_dir = self.output_dir / 'apis' / slug
                api_output_dir.mkdir(parents=True, exist_ok=True)
                dest_yaml = api_output_dir / 'api.yaml'
                shutil.copy2(source_yaml, dest_yaml)

                # Copy subdirectories (schemas, examples, requests, etc.)
                # so that $ref links in the spec resolve correctly
                for child in source_dir.iterdir():
                    if child.is_dir():
                        dest_child = api_output_dir / child.name
                        if dest_child.exists():
                            shutil.rmtree(dest_child)
                        shutil.copytree(child, dest_child)

            entry = {
                '$id': urn,
                'kind': 'oas',
                'slug': slug,
                'name': api.get('name', ''),
                'version': api.get('version', ''),
                'category': api.get('category', ''),
                'description': api.get('description', ''),
                'href': f"apis/{slug}/api.yaml",
            }

            # Only public APIs get a docs link (private APIs have no HTML page)
            if not api.get('private'):
                entry['docs'] = f"apis/{slug}.html"

            registry.append(entry)

        # Add MCP server documents
        for mcp in self.mcp_servers:
            slug = mcp['slug']
            urn = f"urn:mcp:{slug}"

            # Copy source mcp.yaml + server.yaml to the portal output
            source_dir = self.repo_root / 'mcps' / slug
            if source_dir.exists():
                mcp_output_dir = self.output_dir / 'mcps' / slug
                mcp_output_dir.mkdir(parents=True, exist_ok=True)
                for filename in ('mcp.yaml', 'server.json', 'exchange.json'):
                    src = source_dir / filename
                    if src.exists():
                        shutil.copy2(src, mcp_output_dir / filename)

            entry = {
                '$id': urn,
                'kind': 'mcp',
                'slug': slug,
                'name': mcp.get('name', ''),
                'version': mcp.get('version', ''),
                'description': mcp.get('description', ''),
                'href': f"mcps/{slug}/server.json",
                'docs': f"mcps/{slug}.html",
                'tool_count': mcp.get('tool_count', 0),
                'resource_count': mcp.get('resource_count', 0),
                'prompt_count': mcp.get('prompt_count', 0),
            }

            registry.append(entry)

        # Add Skill documents (one entry per unique skill, with agent-context preamble)
        for skill in self.all_skills:
            skill_slug = skill.get('slug', '')
            skill_rel = skill.get('skill_rel_path', skill_slug)
            skill_urn = f"urn:skill:{skill_slug}"

            source_skill = self.repo_root / 'skills' / skill_rel / 'SKILL.md'
            if source_skill.exists():
                skill_output_dir = self.output_dir / 'skills' / skill_rel
                skill_output_dir.mkdir(parents=True, exist_ok=True)
                dest_skill = skill_output_dir / 'SKILL.md'
                original = source_skill.read_text(encoding='utf-8')
                dest_skill.write_text(self._inject_after_frontmatter(original, preamble), encoding='utf-8')

            skill_entry = {
                '$id': skill_urn,
                'kind': 'agent-skill',
                'slug': skill_slug,
                'name': skill.get('name', ''),
                'description': skill.get('description', ''),
                'href': f"skills/{skill_rel}/SKILL.md",
                'docs': f"skills/{skill_slug}.html",
                'apis': skill.get('api_refs', []),
                'mcps': skill.get('mcp_refs', []),
            }

            registry.append(skill_entry)

        # Add Schema documents
        schema_entries = [
            {
                '$id': 'urn:schema:x-origin',
                'kind': 'json-schema',
                'slug': 'x-origin',
                'name': 'x-origin Extension Schema',
                'description': 'Defines dynamic enum sources for OpenAPI parameters. '
                               'Specifies which API operation provides enum values and how to extract identifiers and labels.',
                'href': 'schemas/x-origin.schema.json',
                'docs': 'schemas/x-origin-schema.md',
            },
            {
                '$id': 'urn:schema:jtbd',
                'kind': 'schema-doc',
                'slug': 'jtbd',
                'name': 'Jobs-to-be-Done Skill Schema',
                'description': 'Defines the structure for agent workflow skills (SKILL.md files) '
                               'including frontmatter, steps, inputs, and outputs.',
                'href': 'schemas/jtbd-schema.md',
                'docs': 'schemas/jtbd-schema.md',
            },
        ]
        registry.extend(schema_entries)

        # Write registry.json
        registry_path = self.output_dir / 'registry.json'
        with open(registry_path, 'w', encoding='utf-8') as f:
            json.dump(registry, f, indent=2, ensure_ascii=False)

        print(
            f"    • {len(self.apis)} APIs + {len(self.mcp_servers)} MCPs + "
            f"{len(self.all_skills)} Skills + {len(schema_entries)} Schemas = "
            f"{len(registry)} documents in registry"
        )

    def _generate_schemas(self):
        """Copy schema definition files to the portal output."""
        print("  ✓ Copying schema definitions...")
        schemas_dir = self.output_dir / 'schemas'

        schema_files = {
            'x-origin.schema.json': self.repo_root / 'docs' / 'schemas' / 'x-origin.schema.json',
            'x-origin-schema.md': self.repo_root / 'docs' / 'x-origin-schema.md',
            'jtbd-schema.md': self.repo_root / 'docs' / 'x-jobs-to-be-done-schema.md',
            'jtbd-template.md': self.repo_root / 'docs' / 'job-template.md',
        }

        count = 0
        for dest_name, source in schema_files.items():
            if source.exists():
                shutil.copy2(source, schemas_dir / dest_name)
                count += 1
        print(f"    • {count} schema files copied")

    def _generate_agents_md(self):
        """Generate AGENTS.md -- the primary entry point for AI agents."""
        print("  ✓ Generating AGENTS.md...")
        template = self.env.get_template('agents_md.html')
        private_apis = [a for a in self.apis if a.get('private')]
        content = template.render(
            base_url=self.base_url,
            apis=self.public_apis,
            private_apis=private_apis,
            all_skills=self.all_skills,
            stats=self.stats,
            build_label=self.build_label,
        )
        output_path = self.output_dir / 'AGENTS.md'
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)

    def _generate_llms_txt(self):
        """Generate llms.txt -- lightweight LLM discovery file."""
        print("  ✓ Generating llms.txt...")
        template = self.env.get_template('llms_txt.html')
        content = template.render(
            base_url=self.base_url,
            apis=self.public_apis,
            mcp_servers=self.public_mcps,
            all_skills=self.all_skills,
        )
        output_path = self.output_dir / 'llms.txt'
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)

    def _generate_markdown_pages(self):
        """Generate .md alternatives for all HTML pages (AI-readiness)."""
        print("  ✓ Generating markdown page alternatives...")
        count = 0

        # Homepage
        tmpl = self.env.get_template('markdown/homepage.md.html')
        md = tmpl.render(
            base_url=self.base_url,
            apis=self.public_apis,
            mcp_servers=self.public_mcps,
            all_skills=self.all_skills,
            terraform_providers=self.terraform_providers,
        )
        (self.output_dir / 'index.md').write_text(md, encoding='utf-8')
        count += 1

        # API pages
        api_tmpl = self.env.get_template('markdown/api_page.md.html')
        for api in self.public_apis:
            md = api_tmpl.render(base_url=self.base_url, api=api)
            (self.output_dir / 'apis' / f"{api['slug']}.md").write_text(md, encoding='utf-8')
            count += 1

        # MCP pages
        if self.public_mcps:
            mcp_tmpl = self.env.get_template('markdown/mcp_page.md.html')
            for mcp in self.public_mcps:
                md = mcp_tmpl.render(base_url=self.base_url, mcp=mcp)
                (self.output_dir / 'mcps' / f"{mcp['slug']}.md").write_text(md, encoding='utf-8')
                count += 1

        # Skill pages
        skill_tmpl = self.env.get_template('markdown/skill_page.md.html')
        private_slugs = {a['slug'] for a in self.apis if a.get('private')}
        for skill in self.all_skills:
            md = skill_tmpl.render(base_url=self.base_url, skill=skill, private_api_slugs=private_slugs)
            (self.output_dir / 'skills' / f"{skill['slug']}.md").write_text(md, encoding='utf-8')
            count += 1

        print(f"    • {count} markdown pages generated")

    def _generate_headers(self):
        """Generate _headers file for CDN/hosting cache control."""
        print("  ✓ Generating _headers file...")
        headers = """/llms.txt
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/plain; charset=utf-8

/AGENTS.md
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/markdown; charset=utf-8

/registry.json
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/index.md
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/markdown; charset=utf-8

/apis/*.md
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/markdown; charset=utf-8

/mcps/*.md
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/markdown; charset=utf-8

/skills/*.md
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/markdown; charset=utf-8

/apis/*.yaml
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/mcps/*/mcp.yaml
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/skills/*/SKILL.md
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Content-Type: text/markdown; charset=utf-8

/schemas/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/assets/*
  Cache-Control: public, max-age=604800, immutable
"""
        (self.output_dir / '_headers').write_text(headers, encoding='utf-8')

    def _generate_css(self) -> str:
        """Generate styles.css with content-hashed filename."""
        print("  ✓ Generating CSS...")
        content = get_css()
        hashed_name = hash_asset_filename('styles.css', content)
        output_path = self.output_dir / 'assets' / hashed_name
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return hashed_name

    def _generate_js(self) -> tuple:
        """Generate portal.js and jsonpath-plus library with content-hashed filenames."""
        print("  ✓ Generating JavaScript...")
        js_content = get_js()
        js_name = hash_asset_filename('portal.js', js_content)
        output_path = self.output_dir / 'assets' / js_name
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(js_content)

        jsonpath_content = get_jsonpath_js()
        jsonpath_name = hash_asset_filename('jsonpath-plus.min.js', jsonpath_content)
        jsonpath_path = self.output_dir / 'assets' / jsonpath_name
        with open(jsonpath_path, 'w', encoding='utf-8') as f:
            f.write(jsonpath_content)
        return (js_name, jsonpath_name)

    def _copy_images(self):
        
        """Copy icons directory to assets directory"""
        import shutil

        print("  ✓ Copying images...")
        assets_src_dir = Path(__file__).parent / 'assets'
        assets_dest_dir = self.output_dir / 'assets'

        # Copy icons directory (includes all SVG icons and hero backgrounds)
        icons_src_dir = assets_src_dir / 'icons'
        icons_dest_dir = assets_dest_dir / 'icons'
        if icons_src_dir.exists():
            if icons_dest_dir.exists():
                shutil.rmtree(icons_dest_dir)
            shutil.copytree(icons_src_dir, icons_dest_dir)
