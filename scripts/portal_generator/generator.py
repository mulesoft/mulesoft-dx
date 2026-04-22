"""
Main portal generator orchestrator.

Coordinates discovery, rendering, and file output to produce the complete portal.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, List

from .discovery import discover_apis, calculate_stats
from .builders.tree_builder import build_operation_tree
from .assets import get_css, get_js, get_jsonpath_js
from .template_env import create_env
from .mulesoft_chrome import fetch_mulesoft_chrome


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


class PortalGenerator:
    def __init__(self, output_dir: Path, proxy_url: str = 'http://localhost:8080/proxy',
                 build_label: str = 'unknown', base_url: str = 'https://dev-portal.mulesoft.com'):
        self.output_dir = output_dir
        self.proxy_url = proxy_url
        self.build_label = build_label
        self.base_url = base_url.rstrip('/')
        self.env = create_env()
        self.apis = []
        self.public_apis = []
        self.stats = {}
        self.all_skills = []
        self.repo_root = None
        self.chrome = None

    def generate(self, repo_root: Path):
        """Generate the complete portal"""
        print("\n🚀 Starting Portal Generation\n")
        print("=" * 60)

        # Store repo root for later use
        self.repo_root = repo_root

        # Discover APIs and skills
        self.apis, all_discovered_skills = discover_apis(repo_root)
        self.public_apis = [a for a in self.apis if not a.get('private')]
        self.stats = calculate_stats(self.apis)

        # Pre-compute data for templates
        _prepare_operations(self.apis)

        # Collect unique skills from public APIs only
        seen_slugs = set()
        for api in self.public_apis:
            for skill in api['skills']:
                if skill['slug'] not in seen_slugs:
                    seen_slugs.add(skill['slug'])
                    self.all_skills.append(skill)

        # Also collect prose-only skills (no API refs, not tied to any API)
        for skill in all_discovered_skills:
            if not skill.get('api_refs') and skill['slug'] not in seen_slugs:
                seen_slugs.add(skill['slug'])
                self.all_skills.append(skill)

        # Update skill count to include prose-only skills
        self.stats['skill_count'] = len(self.all_skills)

        print(f"\n📊 Statistics:")
        print(f"  • {self.stats['api_count']} APIs")
        print(f"  • {self.stats['endpoint_count']} Endpoints")
        print(f"  • {self.stats['skill_count']} Skills")
        print(f"  • {len(self.stats['categories'])} Categories")

        # Clean and create output directories to avoid stale artifacts
        print(f"\n📁 Creating output directories...")
        for subdir in ['apis', 'skills', 'assets', 'schemas']:
            target = self.output_dir / subdir
            if target.exists():
                shutil.rmtree(target)
            target.mkdir(parents=True, exist_ok=True)

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
        print(f"\n📝 Generating portal files...")
        self._generate_homepage()
        self._generate_detail_pages()
        self._generate_skill_pages()
        self._generate_registry()
        self._generate_schemas()
        self._generate_agents_md()
        self._generate_llms_txt()
        self._generate_css()
        self._generate_js()
        self._copy_images()

        print("\n" + "=" * 60)
        print("✅ Portal generation complete!")
        print(f"\n📂 Output: {self.output_dir}/")
        print(f"🌐 Open: {self.output_dir}/index.html")
        print(f"📋 Registry: {self.output_dir}/registry.json")
        print(f"🤖 Agent guide: {self.output_dir}/AGENTS.md")

    def _generate_homepage(self):
        """Generate index.html"""
        print("  ✓ Generating homepage...")
        template = self.env.get_template('homepage.html')

        # Create unified list of APIs and skills, sorted alphabetically by name
        all_items = []

        # Add APIs with type marker
        for api in self.public_apis:
            api_copy = api.copy()
            api_copy['_item_type'] = 'api'
            all_items.append(api_copy)

        # Add skills with type marker
        if self.all_skills:
            for skill in self.all_skills:
                skill_copy = skill.copy()
                skill_copy['_item_type'] = 'skill'
                all_items.append(skill_copy)

        # Sort all items alphabetically by name
        all_items.sort(key=lambda x: x.get('name', '').lower())

        html = template.render(
            css_path='assets/styles.css',
            icons_path='assets/icons',
            apis=self.public_apis,
            stats=self.stats,
            all_skills=self.all_skills,
            all_items=all_items,
            proxy_url=self.proxy_url,
            chrome=self.chrome,
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

    def _generate_detail_pages(self):
        """Generate individual API pages (public APIs only)"""
        print(f"  ✓ Generating {len(self.public_apis)} API detail pages...")

        op_lookup = self._build_operation_lookup()
        template = self.env.get_template('detail_page.html')

        for api in self.public_apis:
            api_meta = _build_api_meta(api)
            operation_tree = build_operation_tree(api['operations'])
            html = template.render(
                css_path='../assets/styles.css',
                icons_path='../assets/icons',
                api=api,
                api_meta=api_meta,
                op_lookup=op_lookup,
                operation_tree=operation_tree,
                proxy_url=self.proxy_url,
                build_label=self.build_label,
                base_url=self.base_url,
            )
            output_path = self.output_dir / 'apis' / f"{api['slug']}.html"
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
            skill_name = skill.get('name', skill['slug']).replace('-', ' ').title()
            api_refs = skill.get('api_refs', [])

            # Build op_lookup scoped to APIs this skill references
            op_lookup = {slug: full_op_lookup[slug] for slug in api_refs if slug in full_op_lookup}

            # Build api_meta from the first referenced API (for auth/server info)
            first_api = api_by_slug.get(api_refs[0]) if api_refs else None
            api_meta = _build_api_meta(first_api) if first_api else {'servers': [], 'securitySchemes': {}, 'security': []}

            prose_only = skill.get('step_count', 0) == 0

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
                css_path='../assets/styles.css',
                icons_path='../assets/icons',
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
            )
            output_path = self.output_dir / 'skills' / f"{skill['slug']}.html"
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)

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

        # Add Skill documents (one entry per unique skill, with agent-context preamble)
        for skill in self.all_skills:
            skill_slug = skill.get('slug', '')
            skill_urn = f"urn:skill:{skill_slug}"

            source_skill = self.repo_root / 'skills' / skill_slug / 'SKILL.md'
            if source_skill.exists():
                skill_output_dir = self.output_dir / 'skills' / skill_slug
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
                'href': f"skills/{skill_slug}/SKILL.md",
                'docs': f"skills/{skill_slug}.html",
                'apis': skill.get('api_refs', []),
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

        print(f"    • {len(self.apis)} APIs + {len(self.all_skills)} Skills + {len(schema_entries)} Schemas = {len(registry)} documents in registry")

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
            all_skills=self.all_skills,
        )
        output_path = self.output_dir / 'llms.txt'
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)

    def _generate_css(self):
        """Generate styles.css"""
        print("  ✓ Generating CSS...")
        output_path = self.output_dir / 'assets' / 'styles.css'
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(get_css())

    def _generate_js(self):
        """Generate portal.js and jsonpath-plus library"""
        print("  ✓ Generating JavaScript...")
        output_path = self.output_dir / 'assets' / 'portal.js'
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(get_js())
        jsonpath_path = self.output_dir / 'assets' / 'jsonpath-plus.min.js'
        with open(jsonpath_path, 'w', encoding='utf-8') as f:
            f.write(get_jsonpath_js())

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
