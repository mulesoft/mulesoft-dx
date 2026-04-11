#!/usr/bin/env python3
"""
Common parameter patterns and their default sources.

Defines well-known parameters and where they typically come from.
"""

from typing import Dict, Any, Optional


# Known parameter patterns with their default sources
COMMON_PATTERNS: Dict[str, Dict[str, Any]] = {
    'organizationId': {
        'api': 'urn:api:access-management',
        'operation': 'getOrganizations',
        'values': '$.id',
        'labels': '$.name',
        'name': 'currentOrganization',
        'description': 'Organization Business Group GUID',
        'alternatives': [
            {
                'values': '$.subOrganizationIds[*]',
                'labels': '$.subOrganizations[*].name',
                'description': 'Or use a sub-organization ID for child business groups'
            }
        ]
    },
    'environmentId': {
        'api': 'urn:api:access-management',
        'operation': 'listEnvironments',
        'values': '$.data[*].id',
        'labels': '$.data[*].name',
        'description': 'Target environment ID (e.g., Production, Sandbox)'
    },
    'groupId': {
        'api': 'urn:api:access-management',
        'operation': 'getOrganizations',
        'values': '$.id',
        'labels': '$.name',
        'description': 'Organization ID (typically same as organizationId)'
    },
    'assetId': {
        'description': 'Asset identifier from Exchange',
        'userProvided': True,
        'example': 'my-api'
    },
    'assetVersion': {
        'description': 'Asset version from Exchange',
        'userProvided': True,
        'example': '1.0.0'
    },
}


def match_common_pattern(param_name: str) -> Optional[Dict[str, Any]]:
    """
    Check if parameter name matches a known pattern.

    Args:
        param_name: Parameter name to check

    Returns:
        Pattern definition if found, None otherwise

    Examples:
        match_common_pattern('organizationId')
        -> {'api': 'urn:api:access-management', ...}

        match_common_pattern('unknownParam')
        -> None
    """
    return COMMON_PATTERNS.get(param_name)


def is_id_field(param_name: str) -> bool:
    """
    Check if parameter name looks like an ID field.

    Args:
        param_name: Parameter name to check

    Returns:
        True if it looks like an ID field

    Examples:
        is_id_field('environmentApiId') -> True
        is_id_field('gatewayId') -> True
        is_id_field('name') -> False
    """
    lower_name = param_name.lower()
    return lower_name.endswith('id') or lower_name.endswith('_id')


def is_likely_user_provided(param_name: str) -> bool:
    """
    Check if parameter is likely user-provided based on name.

    Args:
        param_name: Parameter name to check

    Returns:
        True if likely user-provided

    Examples:
        is_likely_user_provided('asset.assetId') -> True
        is_likely_user_provided('endpoint.uri') -> True
        is_likely_user_provided('name') -> True
        is_likely_user_provided('organizationId') -> False
    """
    # Check if it's a known pattern first
    if param_name in COMMON_PATTERNS:
        pattern = COMMON_PATTERNS[param_name]
        return pattern.get('userProvided', False)

    # Common user-provided patterns
    user_provided_patterns = [
        'asset.',          # Exchange asset details
        'endpoint.',       # API endpoint configuration
        'spec.',           # API spec details
        'name',            # Names are usually user-provided
        'description',     # Descriptions are user-provided
        'label',           # Labels are user-provided
        'uri',             # URIs are user-provided
        'url',             # URLs are user-provided
        'version',         # Versions often user-provided
    ]

    param_lower = param_name.lower()
    return any(pattern in param_lower for pattern in user_provided_patterns)


def get_example_for_param(param_name: str, param_schema: Dict[str, Any]) -> Optional[str]:
    """
    Get an appropriate example value for a parameter.

    Args:
        param_name: Parameter name
        param_schema: Parameter schema definition

    Returns:
        Example value if available

    Examples:
        get_example_for_param('assetId', {...})
        -> 'my-api'
    """
    # Check if schema has an example
    if 'example' in param_schema:
        return str(param_schema['example'])

    # Check common patterns
    pattern = match_common_pattern(param_name)
    if pattern and 'example' in pattern:
        return pattern['example']

    # Generate based on type and name
    param_type = param_schema.get('type', 'string')
    param_lower = param_name.lower()

    if param_type == 'boolean':
        return 'true'
    elif param_type == 'integer' or param_type == 'number':
        return '100'
    elif 'uri' in param_lower or 'url' in param_lower:
        return 'https://api.example.com'
    elif 'email' in param_lower:
        return 'user@example.com'
    elif 'version' in param_lower:
        return '1.0.0'
    elif param_lower.endswith('id'):
        return '12345'
    else:
        return None
