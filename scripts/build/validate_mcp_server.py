#!/usr/bin/env python3
"""
MCP server.yaml validator.

Validates every ``mcps/<name>/server.yaml`` in the repository against
``docs/schemas/mcp-server.schema.json``.

Usage:
    python3 scripts/build/validate_mcp_server.py [repo_root]

If no argument is given, the repo root is inferred from the script location.
Exits with status 1 when any server.yaml fails validation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List, Tuple

try:
    import yaml
except ImportError:  # pragma: no cover
    print("ERROR: PyYAML is required. Install with: pip install PyYAML")
    sys.exit(2)

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover
    print("ERROR: jsonschema is required. Install with: pip install jsonschema")
    sys.exit(2)


def _repo_root_from_script(script: Path) -> Path:
    # script lives at <repo>/scripts/build/validate_mcp_server.py
    return script.resolve().parents[2]


def _load_yaml(path: Path):
    with path.open('r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def _load_schema(repo_root: Path):
    schema_path = repo_root / 'docs' / 'schemas' / 'mcp-server.schema.json'
    if not schema_path.exists():
        print(f"ERROR: Schema not found at {schema_path}")
        sys.exit(2)
    with schema_path.open('r', encoding='utf-8') as f:
        return json.load(f)


def validate_server_yaml(path: Path, validator: Draft7Validator) -> List[str]:
    try:
        data = _load_yaml(path)
    except yaml.YAMLError as e:
        return [f"YAML parse error: {e}"]
    if data is None:
        return ["File is empty."]
    if not isinstance(data, dict):
        return [f"Top-level value must be a mapping, got {type(data).__name__}."]

    errors: List[str] = []
    for err in validator.iter_errors(data):
        pointer = '/'.join(str(p) for p in err.absolute_path) or '<root>'
        errors.append(f"{pointer}: {err.message}")
    return errors


def discover_server_yaml(repo_root: Path) -> List[Path]:
    mcps_dir = repo_root / 'mcps'
    if not mcps_dir.exists():
        return []
    found: List[Path] = []
    for mcp_dir in sorted(mcps_dir.iterdir()):
        if not mcp_dir.is_dir() or mcp_dir.name.startswith('.'):
            continue
        server_yaml = mcp_dir / 'server.yaml'
        if server_yaml.exists():
            found.append(server_yaml)
    return found


def main(argv: List[str]) -> int:
    repo_root = Path(argv[1]).resolve() if len(argv) > 1 else _repo_root_from_script(Path(__file__))

    schema = _load_schema(repo_root)
    validator = Draft7Validator(schema)

    server_files = discover_server_yaml(repo_root)
    if not server_files:
        print("No mcps/<name>/server.yaml files found — nothing to validate.")
        return 0

    print(f"Validating {len(server_files)} MCP server.yaml file(s)...")
    print("=" * 60)

    total_errors = 0
    results: List[Tuple[Path, List[str]]] = []
    for path in server_files:
        errors = validate_server_yaml(path, validator)
        results.append((path, errors))
        total_errors += len(errors)

    for path, errors in results:
        rel = path.relative_to(repo_root)
        if errors:
            print(f"\n❌ {rel}")
            for msg in errors:
                print(f"   • {msg}")
        else:
            print(f"✅ {path.relative_to(repo_root)}")

    print()
    print("=" * 60)
    if total_errors:
        print(f"❌ {total_errors} violation(s) across {sum(1 for _, e in results if e)} file(s)")
        return 1
    print(f"✅ All {len(server_files)} MCP server.yaml file(s) valid")
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
