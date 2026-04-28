#!/usr/bin/env python3
"""
Improve operation IDs to be more concise and intuitive.

Transforms verbose IDs like:
  createOrganizationsEnvironmentsApis -> createEnvironmentApi
  listOrganizationsEnvironmentsApisUpstreams -> listApiUpstreams
"""

import sys
import yaml
import re
from pathlib import Path
from typing import Dict, Any, List


# Map path segments to resource names
RESOURCE_MAP = {
    'apis': 'Api',
    'applications': 'Application',
    'upstreams': 'Upstream',
    'policies': 'Policy',
    'tiers': 'Tier',
    'contracts': 'Contract',
    'alerts': 'Alert',
    'tags': 'Tag',
    'environments': 'Environment',
    'organizations': 'Organization',
    'group-tiers': 'GroupTier',
    'group-contracts': 'GroupContract',
    'groupInstances': 'GroupInstance',
    'managedServiceApis': 'ManagedServiceApi',
    'custom-policy-templates': 'CustomPolicyTemplate',
    'policy-templates': 'PolicyTemplate',
    'automated-policies': 'AutomatedPolicy',
    'groups': 'Group',
    'versions': 'GroupVersion',
    'assets': 'GroupAsset',
    'instances': 'Instance',
    'apiInstances': 'ApiInstance',
    'configuration': 'Configuration',
    'definition': 'Definition',
    'pin': 'Pin',
    'bundle': 'Bundle',
    'autodiscoveryProperties': 'AutodiscoveryProperties',
    'tls-contexts': 'TlsContext',
    'incompatible-apis': 'IncompatibleApi',
    'implementationAssets': 'ImplementationAsset',
    'implementationAsset': 'ImplementationAsset',
}


def extract_resources(path: str) -> List[str]:
    """Extract meaningful resource names from path."""
    segments = []
    parts = path.split('/')

    for part in parts:
        if part and not part.startswith('{'):
            segments.append(part)

    return segments


def generate_operation_id(path: str, method: str) -> str:
    """Generate a concise, descriptive operation ID."""
    segments = extract_resources(path)

    # Filter out 'organizations' and 'environments' as they're context, not resources
    main_resources = []
    for seg in segments:
        if seg not in ['organizations']:
            main_resources.append(seg)

    if not main_resources:
        return f"{method}Resource"

    # Determine method prefix
    has_id_param = re.search(r'\{[^}]*[Ii]d\}$', path)

    method_prefix = {
        'get': 'get' if has_id_param else 'list',
        'post': 'create',
        'put': 'update',
        'patch': 'update',
        'delete': 'delete',
        'head': 'check'
    }.get(method.lower(), method.lower())

    # Build resource name from the most specific resources
    # Use last 1-2 segments for the resource name
    resource_parts = []

    if len(main_resources) >= 2:
        # For nested resources like /apis/{id}/policies
        # Use last 2 segments: "ApiPolicy"
        last_two = main_resources[-2:]
        for seg in last_two:
            resource_parts.append(RESOURCE_MAP.get(seg, seg.capitalize()))
    elif len(main_resources) == 1:
        # Single resource like /apis
        resource_parts.append(RESOURCE_MAP.get(main_resources[0], main_resources[0].capitalize()))
    else:
        resource_parts.append('Resource')

    # Join parts
    resource_name = ''.join(resource_parts)

    # Special cases for better naming
    if 'EnvironmentApi' in resource_name and 'ManagedService' not in resource_name:
        # Simplify to just "Api" for environment APIs
        resource_name = resource_name.replace('EnvironmentApi', 'Api')

    operation_id = f"{method_prefix}{resource_name}"

    return operation_id


def improve_operation_ids(spec: Dict[str, Any]) -> int:
    """Improve operation IDs. Returns count updated."""
    count = 0
    paths = spec.get('paths', {})

    changes = []

    for path, methods in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']:
            if method in methods:
                operation = methods[method]
                if isinstance(operation, dict):
                    old_id = operation.get('operationId', '')
                    new_id = generate_operation_id(path, method)

                    if old_id != new_id:
                        operation['operationId'] = new_id
                        count += 1
                        changes.append((method.upper(), path, old_id, new_id))

    # Print changes
    for method, path, old_id, new_id in changes:
        print(f"  {method:6s} {path:80s}")
        print(f"         {old_id:50s} -> {new_id}")

    return count


def add_missing_descriptions(spec: Dict[str, Any]) -> int:
    """Add descriptions to endpoints missing them."""
    count = 0
    paths = spec.get('paths', {})

    descriptions = {
        '/organizations/{organizationId}/environments/{environmentId}/managedServiceApis': {
            'get': 'Retrieves list of managed service APIs for an environment'
        },
        '/organizations/{organizationId}/environments/{environmentId}/managedServiceApis/{managedServiceApiId}/policies': {
            'get': 'Lists all policies applied to a managed service API'
        },
        '/organizations/{organizationId}/environments/{environmentId}/managedServiceApis/{managedServiceApiId}/policies/{policyId}': {
            'get': 'Retrieves details of a specific policy on a managed service API'
        }
    }

    for path, methods_desc in descriptions.items():
        if path in paths:
            for method, desc in methods_desc.items():
                if method in paths[path]:
                    operation = paths[path][method]
                    if isinstance(operation, dict) and not operation.get('description'):
                        operation['description'] = desc
                        count += 1
                        print(f"  Added description to {method.upper()} {path}")

    return count


def main():
    if len(sys.argv) < 2:
        print("Usage: python improve_operation_ids.py <spec-file.yaml>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    print(f"Loading spec from: {input_path}")

    # Load YAML
    with open(input_path, 'r') as f:
        spec = yaml.safe_load(f)

    print("\n" + "="*80)
    print("IMPROVING OPERATION IDs")
    print("="*80 + "\n")

    # Improve operation IDs
    ops_updated = improve_operation_ids(spec)
    print(f"\n✓ Improved {ops_updated} operation IDs")

    print("\n" + "="*80)
    print("ADDING MISSING DESCRIPTIONS")
    print("="*80 + "\n")

    # Add missing descriptions
    desc_added = add_missing_descriptions(spec)
    print(f"\n✓ Added {desc_added} descriptions")

    # Save updated spec
    print(f"\nSaving updated spec to: {input_path}")
    with open(input_path, 'w') as f:
        yaml.dump(spec, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print("\n" + "="*80)
    print("✅ COMPLETED")
    print("="*80)
    print(f"\nRun validator to check:")
    print(f"  anypoint-cli-v4 api-project validate --json --location={input_path.parent}")


if __name__ == "__main__":
    main()
