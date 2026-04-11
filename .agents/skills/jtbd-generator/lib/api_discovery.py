#!/usr/bin/env python3
"""
API Discovery - Find operations in OpenAPI specs.

Provides functions to list APIs, search operations by keywords,
and get detailed operation information.
"""

import difflib
from pathlib import Path
from typing import List, Dict, Any, Optional

from .utils import (
    load_openapi_spec,
    find_api_dirs,
    path_to_urn,
    extract_operation_id,
    resolve_ref
)


def list_available_apis(repo_root: Path) -> List[Dict[str, str]]:
    """
    List all available APIs in the repository.

    Args:
        repo_root: Repository root directory

    Returns:
        List of API metadata:
        [
            {
                'urn': 'urn:api:api-manager',
                'title': 'API Manager API',
                'version': 'v1',
                'operations': 118,
                'path': '/path/to/api-manager'
            },
            ...
        ]

    Example:
        apis = list_available_apis(Path("."))
        for api in apis:
            print(f"{api['urn']}: {api['title']} ({api['operations']} operations)")
    """
    api_dirs = find_api_dirs(repo_root)
    results = []

    for api_dir in api_dirs:
        api_path = api_dir / 'api.yaml'

        try:
            spec = load_openapi_spec(api_path)
            urn = path_to_urn(api_path)

            # Count operations
            operation_count = 0
            if 'paths' in spec:
                for path_item in spec['paths'].values():
                    if isinstance(path_item, dict):
                        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']:
                            if method in path_item:
                                operation_count += 1

            results.append({
                'urn': urn,
                'title': spec.get('info', {}).get('title', 'Unknown'),
                'version': spec.get('info', {}).get('version', 'unknown'),
                'operations': operation_count,
                'path': str(api_dir)
            })
        except Exception as e:
            # Skip APIs that can't be loaded
            continue

    return sorted(results, key=lambda x: x['title'])


def search_operations(
    query: str,
    api_urn: Optional[str] = None,
    repo_root: Path = Path(".")
) -> List[Dict[str, Any]]:
    """
    Search for operations matching query keywords.

    Uses fuzzy matching on operationId, summary, and description.

    Args:
        query: Search keywords (e.g., "create api", "get asset")
        api_urn: Optional API URN to limit search (e.g., "urn:api:api-manager")
        repo_root: Repository root directory

    Returns:
        List of matching operations with scores, sorted by relevance:
        [
            {
                'operationId': 'createOrganizationsEnvironmentsApis',
                'api': 'urn:api:api-manager',
                'method': 'POST',
                'path': '/organizations/{organizationId}/environments/{environmentId}/apis',
                'summary': 'Create a new API instance',
                'description': '...',
                'score': 0.85
            },
            ...
        ]

    Example:
        # Search all APIs
        ops = search_operations("create api")

        # Search specific API
        ops = search_operations("get asset", "urn:api:exchange-experience")
    """
    from .utils import urn_to_path

    query_lower = query.lower()
    query_terms = query_lower.split()
    results = []

    # Determine which APIs to search
    if api_urn:
        api_path = urn_to_path(api_urn, repo_root)
        apis_to_search = [(api_urn, api_path)]
    else:
        # Search all APIs
        api_dirs = find_api_dirs(repo_root)
        apis_to_search = [
            (path_to_urn(api_dir / 'api.yaml'), api_dir / 'api.yaml')
            for api_dir in api_dirs
        ]

    for urn, api_path in apis_to_search:
        try:
            spec = load_openapi_spec(api_path)

            if 'paths' not in spec:
                continue

            for path, path_item in spec['paths'].items():
                if not isinstance(path_item, dict):
                    continue

                for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']:
                    if method not in path_item:
                        continue

                    operation = path_item[method]
                    if not isinstance(operation, dict):
                        continue

                    operation_id = operation.get('operationId', '')
                    summary = operation.get('summary', '')
                    description = operation.get('description', '')

                    # Build searchable text
                    searchable = f"{operation_id} {summary} {description}".lower()

                    # Calculate score based on term matches
                    score = 0.0
                    for term in query_terms:
                        if term in searchable:
                            score += 1.0
                            # Boost if in operationId or summary
                            if term in operation_id.lower():
                                score += 0.5
                            if term in summary.lower():
                                score += 0.3

                    # Normalize score
                    if len(query_terms) > 0:
                        score = score / (len(query_terms) * 1.8)

                    # Only include if score is decent
                    if score > 0.3:
                        results.append({
                            'operationId': operation_id,
                            'api': urn,
                            'method': method.upper(),
                            'path': path,
                            'summary': summary,
                            'description': description[:200] if description else '',
                            'score': round(score, 2)
                        })

        except Exception as e:
            # Skip APIs that can't be loaded
            continue

    # Sort by score (descending)
    results.sort(key=lambda x: x['score'], reverse=True)

    return results


def get_operation_details(
    api_urn: str,
    operation_id: str,
    repo_root: Path = Path(".")
) -> Optional[Dict[str, Any]]:
    """
    Get complete details for a specific operation.

    Args:
        api_urn: API URN (e.g., "urn:api:api-manager")
        operation_id: Operation ID (e.g., "createOrganizationsEnvironmentsApis")
        repo_root: Repository root directory

    Returns:
        Operation details including parameters and responses:
        {
            'operationId': 'createOrganizationsEnvironmentsApis',
            'api': 'urn:api:api-manager',
            'method': 'POST',
            'path': '/organizations/{organizationId}/environments/{environmentId}/apis',
            'summary': '...',
            'description': '...',
            'parameters': [
                {
                    'name': 'organizationId',
                    'in': 'path',
                    'required': True,
                    'schema': {'type': 'string'},
                    'description': '...'
                },
                ...
            ],
            'requestBody': {...},
            'responses': {
                '201': {
                    'description': 'Created',
                    'content': {
                        'application/json': {
                            'schema': {...}
                        }
                    }
                }
            }
        }

        None if operation not found

    Example:
        op = get_operation_details(
            "urn:api:api-manager",
            "createOrganizationsEnvironmentsApis"
        )
        print(f"Parameters: {len(op['parameters'])}")
    """
    from .utils import urn_to_path

    try:
        api_path = urn_to_path(api_urn, repo_root)
        spec = load_openapi_spec(api_path)

        if 'paths' not in spec:
            return None

        # Find the operation
        for path, path_item in spec['paths'].items():
            if not isinstance(path_item, dict):
                continue

            for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']:
                if method not in path_item:
                    continue

                operation = path_item[method]
                if not isinstance(operation, dict):
                    continue

                if operation.get('operationId') == operation_id:
                    # Found it - extract details
                    result = {
                        'operationId': operation_id,
                        'api': api_urn,
                        'method': method.upper(),
                        'path': path,
                        'summary': operation.get('summary', ''),
                        'description': operation.get('description', ''),
                        'parameters': [],
                        'requestBody': operation.get('requestBody'),
                        'responses': operation.get('responses', {})
                    }

                    # Collect parameters (path-level and operation-level)
                    all_parameters = []

                    # Path-level parameters
                    if 'parameters' in path_item:
                        all_parameters.extend(path_item['parameters'])

                    # Operation-level parameters
                    if 'parameters' in operation:
                        all_parameters.extend(operation['parameters'])

                    # Resolve $ref in parameters
                    for param in all_parameters:
                        if isinstance(param, dict):
                            if '$ref' in param:
                                try:
                                    param = resolve_ref(param['$ref'], spec, api_path)
                                except:
                                    pass  # Skip unresolvable refs
                            result['parameters'].append(param)

                    return result

        return None

    except Exception as e:
        return None


def get_operations_by_api(
    api_urn: str,
    repo_root: Path = Path(".")
) -> List[Dict[str, Any]]:
    """
    Get all operations for a specific API.

    Args:
        api_urn: API URN (e.g., "urn:api:api-manager")
        repo_root: Repository root directory

    Returns:
        List of all operations in the API:
        [
            {
                'operationId': 'listOrganizationsEnvironmentsApis',
                'method': 'GET',
                'path': '/organizations/{organizationId}/environments/{environmentId}/apis',
                'summary': 'List all APIs'
            },
            ...
        ]

    Example:
        ops = get_operations_by_api("urn:api:api-manager")
        print(f"Found {len(ops)} operations")
    """
    from .utils import urn_to_path

    try:
        api_path = urn_to_path(api_urn, repo_root)
        spec = load_openapi_spec(api_path)

        if 'paths' not in spec:
            return []

        operations = []

        for path, path_item in spec['paths'].items():
            if not isinstance(path_item, dict):
                continue

            for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']:
                if method not in path_item:
                    continue

                operation = path_item[method]
                if not isinstance(operation, dict):
                    continue

                operations.append({
                    'operationId': operation.get('operationId', ''),
                    'method': method.upper(),
                    'path': path,
                    'summary': operation.get('summary', ''),
                    'description': operation.get('description', '')[:100]
                })

        return sorted(operations, key=lambda x: x['operationId'])

    except Exception as e:
        return []
