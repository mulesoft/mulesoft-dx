#!/usr/bin/env python3
"""
Add comprehensive descriptions to all endpoints in an OpenAPI spec.

Generates contextual, meaningful descriptions based on operation ID, path, and method.
"""

import sys
import yaml
import re
from pathlib import Path
from typing import Dict, Any, Optional


def parse_operation_context(operation_id: str, path: str, method: str) -> Dict[str, str]:
    """Extract context from operation to generate descriptions."""
    # Extract resource names from operation ID
    # e.g., createApiPolicy -> resource: ApiPolicy, action: create

    action_verbs = {
        'list': 'Retrieves a list of',
        'get': 'Retrieves details of',
        'create': 'Creates a new',
        'update': 'Updates an existing',
        'delete': 'Deletes an existing',
        'check': 'Checks existence of',
    }

    # Detect action
    action = None
    resource = operation_id

    for verb in action_verbs.keys():
        if operation_id.lower().startswith(verb):
            action = verb
            resource = operation_id[len(verb):]
            break

    if not action:
        action = method.lower()

    # Convert camelCase to space-separated words
    resource_words = re.sub('([A-Z])', r' \1', resource).strip().lower()

    return {
        'action': action,
        'resource': resource_words,
        'verb_phrase': action_verbs.get(action, action)
    }


def generate_description(operation_id: str, path: str, method: str, existing_desc: str = '') -> str:
    """Generate a contextual description for an endpoint."""

    if existing_desc and len(existing_desc.strip()) > 20:
        # Keep existing good descriptions
        return existing_desc

    context = parse_operation_context(operation_id, path, method)

    # Special handling for specific patterns
    if 'pin' in path.lower():
        if method.lower() == 'put':
            return "Pins an API to prevent accidental modifications"
        elif method.lower() == 'delete':
            return "Unpins an API to allow modifications"

    if 'bundle' in path.lower():
        return "Retrieves API bundle information including configuration and dependencies"

    if 'tag' in path.lower():
        if method.lower() == 'put':
            return "Adds or updates a tag on the API for organization and filtering"
        elif method.lower() == 'delete':
            return "Removes a tag from the API"

    if 'autodiscovery' in path.lower():
        return "Retrieves autodiscovery properties required for gateway to track the API"

    if 'tls-context' in path.lower():
        action = context['action']
        if action == 'list':
            return "Retrieves list of TLS contexts configured for the API"
        elif action == 'create':
            return "Creates a new TLS context for secure API communication"
        elif action == 'update':
            return "Updates TLS context configuration for the API"
        elif action == 'delete':
            return "Removes a TLS context from the API"

    if 'upstream' in path.lower():
        action = context['action']
        if action == 'list':
            return "Retrieves list of upstream services configured for the API"
        elif action == 'get':
            return "Retrieves details of a specific upstream service configuration"
        elif action == 'create':
            return "Creates a new upstream service configuration for the API"
        elif action == 'update':
            return "Updates upstream service configuration"
        elif action == 'delete':
            return "Removes an upstream service from the API configuration"

    if 'polic' in path.lower():
        action = context['action']
        if action == 'list':
            return "Retrieves list of policies applied to the API"
        elif action == 'get':
            return "Retrieves details of a specific policy configuration"
        elif action == 'create':
            return "Applies a new policy to the API"
        elif action == 'update':
            return "Updates policy configuration and settings"
        elif action == 'delete':
            return "Removes a policy from the API"

        if 'implementationAsset' in path:
            return "Uploads policy implementation asset (JAR or other artifact)"

    if 'tier' in path.lower():
        action = context['action']
        if 'group-tier' in path.lower():
            if action == 'list':
                return "Retrieves list of group-level SLA tiers available for the API"
            elif action == 'create':
                return "Creates a new group-level SLA tier for API access control"
            elif action == 'check':
                return "Checks existence of group-level SLA tiers"
        else:
            if action == 'list':
                return "Retrieves list of SLA tiers configured for the API"
            elif action == 'get':
                return "Retrieves details of a specific SLA tier"
            elif action == 'create':
                return "Creates a new SLA tier for API rate limiting and access control"
            elif action == 'update':
                return "Updates SLA tier limits and configuration"
            elif action == 'delete':
                return "Removes an SLA tier from the API"
            elif action == 'check':
                return "Checks existence of SLA tiers for the API"

    if 'contract' in path.lower():
        action = context['action']
        if 'group-contract' in path.lower():
            if action == 'list':
                return "Retrieves list of group-level contracts for API access"
            elif action == 'create':
                return "Creates a new group-level contract granting API access"
        else:
            if action == 'list':
                return "Retrieves list of application contracts for API access"
            elif action == 'get':
                return "Retrieves details of a specific API contract"
            elif action == 'create':
                return "Creates a new contract granting application access to the API"
            elif action == 'update':
                return "Updates contract status or SLA tier assignment"
            elif action == 'delete':
                return "Revokes a contract, removing application access to the API"
            elif action == 'check':
                return "Checks existence of contracts for the resource"

    if 'alert' in path.lower():
        action = context['action']
        if action == 'list':
            return "Retrieves list of alerts configured for API monitoring"
        elif action == 'get':
            return "Retrieves details of a specific alert configuration"
        elif action == 'create':
            return "Creates a new alert for API monitoring and notifications"
        elif action == 'update':
            return "Updates alert thresholds and notification settings"
        elif action == 'delete':
            return "Removes an alert from API monitoring"

    if 'application' in path.lower():
        if method.lower() == 'post':
            return "Imports a client application from an external client provider. Connected Apps require Manage Client Applications scope."

    if 'groupInstance' in path or 'group-instance' in path.lower():
        action = context['action']
        if action == 'list':
            if 'contract' in path:
                return "Retrieves list of contracts for the API group instance"
            elif 'tier' in path:
                return "Retrieves list of SLA tiers for the API group instance"
            elif 'apiInstance' in path:
                return "Retrieves list of API instances belonging to the group"
            else:
                return "Retrieves list of API group instances in the environment"
        elif action == 'get':
            if 'contract' in path:
                return "Retrieves details of a specific group instance contract"
            elif 'tier' in path:
                return "Retrieves details of a specific group instance SLA tier"
            else:
                return "Retrieves details of a specific API group instance"
        elif action == 'create':
            if 'contract' in path:
                return "Creates a new contract for the API group instance"
            elif 'tier' in path:
                return "Creates a new SLA tier for the API group instance"
            else:
                return "Creates a new API group instance"
        elif action == 'update':
            if 'contract' in path:
                return "Updates contract configuration for the group instance"
            elif 'tier' in path:
                return "Updates SLA tier limits for the group instance"
            else:
                return "Updates API group instance configuration"
        elif action == 'delete':
            if 'contract' in path:
                return "Removes a contract from the API group instance"
            elif 'tier' in path:
                return "Removes an SLA tier from the API group instance"
            else:
                return "Deletes an API group instance"
        elif action == 'check':
            return "Checks existence of contracts for the API group instance"

    if 'managedServiceApi' in path or 'managed-service' in path.lower():
        action = context['action']
        if action == 'list':
            if 'polic' in path:
                return "Retrieves list of policies applied to the managed service API"
            elif 'tier' in path:
                return "Retrieves list of SLA tiers for the managed service API"
            elif 'contract' in path:
                return "Retrieves list of contracts for the managed service API"
            else:
                return "Retrieves list of managed service APIs in the environment"
        elif action == 'get':
            if 'polic' in path:
                return "Retrieves details of a specific policy on the managed service API"
            elif 'contract' in path:
                return "Retrieves details of a specific managed service API contract"
            else:
                return "Retrieves details of a specific managed service API"
        elif action == 'create':
            if 'polic' in path:
                return "Applies a new policy to the managed service API"
            elif 'tier' in path:
                return "Creates a new SLA tier for the managed service API"
            elif 'contract' in path:
                return "Creates a new contract for the managed service API"
        elif action == 'update':
            if 'polic' in path:
                return "Updates policy configuration on the managed service API"
            elif 'tier' in path:
                return "Updates SLA tier for the managed service API"
            elif 'contract' in path:
                return "Updates contract for the managed service API"
            else:
                return "Updates managed service API configuration"
        elif action == 'delete':
            if 'polic' in path:
                return "Removes a policy from the managed service API"
            elif 'tier' in path:
                return "Removes an SLA tier from the managed service API"
            elif 'contract' in path:
                return "Revokes a contract from the managed service API"

    if 'custom-policy-template' in path.lower():
        action = context['action']
        if action == 'list':
            if 'configuration' in path:
                return "Retrieves configuration schema for the custom policy template"
            elif 'definition' in path:
                return "Retrieves definition (YAML) of the custom policy template"
            else:
                return "Retrieves list of custom policy templates in the organization"
        elif action == 'get':
            return "Retrieves details of a specific custom policy template"
        elif action == 'create':
            return "Creates a new custom policy template with definition and configuration"
        elif action == 'update':
            return "Updates custom policy template definition or configuration"
        elif action == 'delete':
            return "Removes a custom policy template from the organization"

    if 'policy-template' in path.lower() and 'custom' not in path.lower():
        action = context['action']
        if action == 'list':
            return "Retrieves list of available policy templates (system and custom)"
        elif action == 'get':
            return "Retrieves details of a specific policy template"

    if 'automated-polic' in path.lower():
        action = context['action']
        if action == 'list':
            if 'apis' in path:
                return "Retrieves list of APIs affected by the automated policy"
            else:
                return "Retrieves list of automated policies in the organization"
        elif action == 'get':
            return "Retrieves details of a specific automated policy"
        elif action == 'create':
            if 'implementationAsset' in path:
                return "Uploads implementation asset for the automated policy"
            else:
                return "Creates a new automated policy for automatic application to APIs"
        elif action == 'update':
            return "Updates automated policy configuration and rules"
        elif action == 'delete':
            if 'incompatible-api' in path:
                return "Removes an API from the automated policy's incompatible list"
            else:
                return "Removes an automated policy from the organization"
        elif action == 'check':
            return "Checks existence of automated policies"

    if 'group' in path.lower() and 'groupInstance' not in path:
        action = context['action']
        if action == 'list':
            if 'version' in path:
                if 'instance' in path:
                    return "Retrieves list of instances for the API group version"
                else:
                    return "Retrieves list of versions for the API group"
            else:
                return "Retrieves list of API groups in the organization"
        elif action == 'get':
            if 'version' in path:
                return "Retrieves details of a specific API group version"
            else:
                return "Retrieves details of a specific API group"
        elif action == 'create':
            if 'asset' in path:
                return "Adds an asset to the API group"
            elif 'version' in path:
                return "Creates a new version of the API group"
            else:
                return "Creates a new API group for managing multiple APIs together"
        elif action == 'update':
            if 'version' in path:
                return "Updates API group version configuration"
            else:
                return "Updates API group configuration"
        elif action == 'delete':
            if 'version' in path:
                return "Removes a version from the API group"
            else:
                return "Deletes an API group and all its associations"

    # Generic API operations
    if '/apis' in path and 'groupInstance' not in path and 'managedService' not in path:
        action = context['action']
        if action == 'list':
            return "Retrieves list of APIs in the environment"
        elif action == 'get':
            return "Retrieves details of a specific API including configuration and status"
        elif action == 'create':
            return "Creates a new API in the environment. Connected Apps require Manage APIs Configuration and Exchange Viewer scopes."
        elif action == 'update':
            return "Updates API configuration, endpoint, or settings"
        elif action == 'delete':
            return "Deletes an API from the environment"

    # Fallback: generate generic description
    verb_phrase = context['verb_phrase']
    resource = context['resource']

    return f"{verb_phrase.capitalize()} {resource}"


def add_descriptions(spec: Dict[str, Any]) -> int:
    """Add descriptions to all endpoints. Returns count added."""
    count = 0
    paths = spec.get('paths', {})

    for path, methods in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']:
            if method in methods:
                operation = methods[method]
                if isinstance(operation, dict):
                    operation_id = operation.get('operationId', '')
                    existing_desc = operation.get('description', '')

                    # Generate description
                    new_desc = generate_description(operation_id, path, method, existing_desc)

                    if not existing_desc or len(existing_desc.strip()) < 20:
                        operation['description'] = new_desc
                        count += 1
                        print(f"  {method.upper():6s} {path}")
                        print(f"         → {new_desc}")

    return count


def main():
    if len(sys.argv) < 2:
        print("Usage: python add_descriptions.py <spec-file.yaml>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    print(f"Loading spec from: {input_path}")

    # Load YAML
    with open(input_path, 'r') as f:
        spec = yaml.safe_load(f)

    print("\n" + "="*80)
    print("ADDING ENDPOINT DESCRIPTIONS")
    print("="*80 + "\n")

    # Add descriptions
    desc_added = add_descriptions(spec)

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
