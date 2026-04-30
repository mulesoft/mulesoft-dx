#!/usr/bin/env python3
"""
Shared utility functions for JTBD generation.

Provides common helpers for spec loading, URN handling, and text formatting.
"""

import re
import yaml
from pathlib import Path
from typing import Dict, Any, Optional


def load_openapi_spec(api_path: Path) -> Dict[str, Any]:
    """
    Load and parse OpenAPI spec from YAML file.

    Args:
        api_path: Path to the API spec file (e.g., api-manager/api.yaml)

    Returns:
        Parsed OpenAPI spec as dictionary

    Raises:
        FileNotFoundError: If spec file doesn't exist
        yaml.YAMLError: If spec is invalid YAML
    """
    if not api_path.exists():
        raise FileNotFoundError(f"API spec not found: {api_path}")

    with open(api_path, 'r', encoding='utf-8') as f:
        try:
            spec = yaml.safe_load(f)
            return spec
        except yaml.YAMLError as e:
            raise yaml.YAMLError(f"Failed to parse {api_path}: {e}")


def urn_to_path(urn: str, repo_root: Path) -> Path:
    """
    Convert API URN to filesystem path.

    Args:
        urn: API URN in format urn:api:folder-name
        repo_root: Repository root directory

    Returns:
        Path to the API spec file

    Example:
        urn_to_path("urn:api:api-manager", Path("."))
        -> Path("apis/api-manager/api.yaml")
    """
    if not urn.startswith('urn:api:'):
        raise ValueError(f"Invalid URN format: {urn}. Expected 'urn:api:folder-name'")

    folder_name = urn.replace('urn:api:', '')
    api_path = repo_root / 'apis' / folder_name / 'api.yaml'

    return api_path


def path_to_urn(api_path: Path) -> str:
    """
    Convert filesystem path to API URN.

    Args:
        api_path: Path to API spec (e.g., api-manager/api.yaml)

    Returns:
        URN in format urn:api:folder-name

    Example:
        path_to_urn(Path("api-manager/api.yaml"))
        -> "urn:api:api-manager"
    """
    folder_name = api_path.parent.name
    return f"urn:api:{folder_name}"


def kebab_case(text: str) -> str:
    """
    Convert text to kebab-case for filenames.

    Args:
        text: Input text

    Returns:
        kebab-case version

    Examples:
        kebab_case("Deploy API with Flex Gateway") -> "deploy-api-with-flex-gateway"
        kebab_case("Get GAV from Exchange") -> "get-gav-from-exchange"
    """
    # Convert to lowercase
    text = text.lower()
    # Replace spaces and underscores with hyphens
    text = re.sub(r'[\s_]+', '-', text)
    # Remove non-alphanumeric characters except hyphens
    text = re.sub(r'[^a-z0-9-]', '', text)
    # Remove consecutive hyphens
    text = re.sub(r'-+', '-', text)
    # Remove leading/trailing hyphens
    text = text.strip('-')
    return text


def resolve_ref(ref: str, spec: Dict[str, Any], spec_path: Path) -> Dict[str, Any]:
    """
    Resolve $ref reference (internal or external).

    Args:
        ref: Reference string (e.g., "#/components/parameters/organizationId")
        spec: OpenAPI spec containing the reference
        spec_path: Path to the spec file (for external refs)

    Returns:
        Resolved schema/parameter definition

    Raises:
        ValueError: If reference cannot be resolved
    """
    if not ref.startswith('#/'):
        # External reference (e.g., "./schemas/request.json#/Asset")
        if '#' in ref:
            file_ref, json_ref = ref.split('#', 1)
            external_path = (spec_path.parent / file_ref).resolve()

            if not external_path.exists():
                raise ValueError(f"External ref file not found: {external_path}")

            with open(external_path, 'r', encoding='utf-8') as f:
                external_spec = yaml.safe_load(f)

            # Recursively resolve in external file
            return resolve_ref(f"#{json_ref}", external_spec, external_path)
        else:
            # Entire external file
            external_path = (spec_path.parent / ref).resolve()
            if not external_path.exists():
                raise ValueError(f"External ref file not found: {external_path}")

            with open(external_path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)

    # Internal reference - traverse the spec
    parts = ref.lstrip('#/').split('/')
    current = spec

    for part in parts:
        if not isinstance(current, dict):
            raise ValueError(f"Cannot traverse into non-dict at '{part}' in ref '{ref}'")

        if part not in current:
            raise ValueError(f"Reference path not found: {ref}")

        current = current[part]

    return current


def find_api_dirs(repo_root: Path) -> list[Path]:
    """
    Find all directories containing api.yaml files.

    Args:
        repo_root: Repository root directory

    Returns:
        List of paths to directories containing api.yaml

    Example:
        find_api_dirs(Path("."))
        -> [Path("apis/api-manager"), Path("apis/access-management"), ...]
    """
    api_dirs = []

    # Search for api.yaml files under apis/ (excluding hidden dirs and node_modules)
    for api_file in repo_root.glob('apis/*/api.yaml'):
        if not any(part.startswith('.') for part in api_file.parts):
            api_dirs.append(api_file.parent)

    return sorted(api_dirs)


def extract_operation_id(path_item: Dict[str, Any], method: str) -> Optional[str]:
    """
    Extract operationId from a path item and method.

    Args:
        path_item: OpenAPI path item object
        method: HTTP method (get, post, put, patch, delete)

    Returns:
        operationId if found, None otherwise
    """
    if method not in path_item:
        return None

    operation = path_item[method]
    if not isinstance(operation, dict):
        return None

    return operation.get('operationId')


def get_operation_summary(operation: Dict[str, Any]) -> str:
    """
    Get operation summary or generate from operationId.

    Args:
        operation: OpenAPI operation object

    Returns:
        Human-readable summary
    """
    if 'summary' in operation:
        return operation['summary']

    if 'description' in operation:
        # Use first line of description
        return operation['description'].split('\n')[0]

    # Fallback: format operationId
    op_id = operation.get('operationId', 'Unknown')
    # Convert camelCase to Title Case
    return re.sub(r'([A-Z])', r' \1', op_id).strip()
