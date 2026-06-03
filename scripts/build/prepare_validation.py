"""Prepare a working directory for API validation.

The Anypoint CLI (AMF) validator cannot correctly handle external $ref in
component definitions — it resolves the file but corrupts internal schema
resolution. This script creates a validation work area where fragment $ref
entries are inlined with the actual YAML content.

Usage:
    python3 scripts/build/prepare_validation.py [--work-dir .validation-work]
"""

import argparse
import re
import shutil
from pathlib import Path

import yaml


FRAGMENT_REF_RE = re.compile(
    r'^(\s+)\$ref:\s*[\'"]?(?:\.\./)*fragments/([^#\s\'"]+)#(/[^\s\'"]*)[\'"]?\s*$'
)


def _load_fragments(repo_root: Path) -> dict:
    """Load all fragment YAML files."""
    cache = {}
    fragments_dir = repo_root / 'fragments'
    if fragments_dir.is_dir():
        for fpath in fragments_dir.glob('*.yaml'):
            with fpath.open('r', encoding='utf-8') as f:
                cache[fpath.name] = yaml.safe_load(f)
    return cache


def _resolve_pointer(data, pointer: str):
    """Navigate a JSON pointer (e.g. /components/parameters/orgId)."""
    parts = [p for p in pointer.strip('/').split('/') if p]
    for part in parts:
        if isinstance(data, dict) and part in data:
            data = data[part]
        else:
            return None
    return data


def _inline_refs(content: str, fragments: dict) -> str:
    """Replace $ref lines pointing to fragments with inlined YAML."""
    lines = content.split('\n')
    result = []
    i = 0
    while i < len(lines):
        m = FRAGMENT_REF_RE.match(lines[i])
        if m:
            indent = m.group(1)
            filename = m.group(2)
            pointer = m.group(3)
            frag = fragments.get(filename)
            if frag:
                resolved = _resolve_pointer(frag, pointer)
                if resolved is not None:
                    dumped = yaml.dump(
                        resolved, default_flow_style=False,
                        allow_unicode=True, width=9999, sort_keys=False,
                    )
                    for dline in dumped.rstrip('\n').split('\n'):
                        result.append(indent + dline)
                    i += 1
                    continue
        result.append(lines[i])
        i += 1
    return '\n'.join(result)


def prepare(repo_root: Path, work_dir: Path):
    fragments = _load_fragments(repo_root)
    apis_dir = repo_root / 'apis'

    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True)

    for api_entry in sorted(apis_dir.iterdir()):
        if not api_entry.is_dir():
            continue
        if not (api_entry / 'api.yaml').exists():
            continue
        if not (api_entry / 'exchange.json').exists():
            continue

        dest = work_dir / api_entry.name
        shutil.copytree(api_entry, dest)

        api_yaml = dest / 'api.yaml'
        content = api_yaml.read_text(encoding='utf-8')
        inlined = _inline_refs(content, fragments)
        api_yaml.write_text(inlined, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description='Prepare validation work area')
    parser.add_argument('--work-dir', default='.validation-work')
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent.parent
    work_dir = repo_root / args.work_dir
    prepare(repo_root, work_dir)
    print(f"Validation work area ready at: {work_dir}")


if __name__ == '__main__':
    main()
