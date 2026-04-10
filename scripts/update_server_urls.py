#!/usr/bin/env python3
"""
Bulk-update OAS specs to support 3 server URL patterns:
  1. https://anypoint.mulesoft.com/<path>                  (US, unchanged)
  2. https://eu1.anypoint.mulesoft.com/<path>               (EU, fixed)
  3. https://{region}.platform.mulesoft.com/<path>           (Platform regions, variable)

Transforms the current dual-server pattern:
  - https://anypoint.mulesoft.com/<path>
  - https://{region}.anypoint.mulesoft.com/<path>  (default eu1)

Into the 3-server pattern above.

Usage:
    python3 scripts/update_server_urls.py [--dry-run]
"""

import argparse
import copy
import os
import re
import sys

from ruamel.yaml import YAML

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# APIs to update (from REGIONAL_URLS_CHANGES.md)
APIS_TO_UPDATE = [
    'access-management',
    'amc-application-manager',
    'anypoint-mq-admin',
    'anypoint-mq-stats',
    'anypoint-security-policies',
    'api-designer-experience',
    'api-manager',
    'api-platform',
    'arm-monitoring-query',
    'arm-rest-services',
    'audit-log-query',
    'analytics-event-export',
    'cloudhub',
    'cloudhub-20',
    'exchange-experience',
    'metrics',
    'partner-manager-v2-partners',
    'partner-manager-v2-tracking',
    'runtime-fabric',
    'secrets-manager',
    'tokenization-creation-and-mgmt',
]

REGION_PATTERN = re.compile(r'https://\{region\}\.anypoint\.mulesoft\.com(/.*)?')


def find_spec_files(api_name):
    """Find source and portal copies of the spec."""
    files = []
    source = os.path.join(REPO_ROOT, api_name, 'api.yaml')
    if os.path.isfile(source):
        files.append(source)
    portal = os.path.join(REPO_ROOT, 'portal', 'apis', api_name, 'api.yaml')
    if os.path.isfile(portal):
        files.append(portal)
    return files


def transform_servers(servers):
    """Transform servers list: replace {region}.anypoint with fixed eu1 + {region}.platform."""
    new_servers = []
    for server in servers:
        url = server.get('url', '')
        match = REGION_PATTERN.match(url)
        if match:
            path_part = match.group(1) or ''

            # Build EU server (fixed, no region variable)
            eu_server = copy.deepcopy(server)
            eu_server['url'] = f'https://eu1.anypoint.mulesoft.com{path_part}'
            # Remove region variable, keep others
            if 'variables' in eu_server:
                eu_vars = {k: v for k, v in eu_server['variables'].items() if k != 'region'}
                if eu_vars:
                    eu_server['variables'] = eu_vars
                else:
                    del eu_server['variables']
            new_servers.append(eu_server)

            # Build platform server (with region variable)
            platform_server = copy.deepcopy(server)
            platform_server['url'] = f'https://{{region}}.platform.mulesoft.com{path_part}'
            # Update region variable default to ca1
            if 'variables' in platform_server and 'region' in platform_server['variables']:
                platform_server['variables']['region']['default'] = 'ca1'
            new_servers.append(platform_server)
        else:
            # Keep non-regional servers as-is (US default, relative URLs, etc.)
            new_servers.append(server)

    return new_servers


def update_spec(filepath, dry_run=False):
    """Update a single spec file."""
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.width = 4096  # Prevent line wrapping

    with open(filepath) as f:
        spec = yaml.load(f)

    if 'servers' not in spec:
        print(f'  SKIP {filepath} (no servers)')
        return False

    # Check if already transformed (has platform.mulesoft.com)
    for s in spec['servers']:
        if 'platform.mulesoft.com' in s.get('url', ''):
            print(f'  SKIP {filepath} (already has platform.mulesoft.com)')
            return False

    # Check if has a regional server to transform
    has_regional = any(REGION_PATTERN.match(s.get('url', '')) for s in spec['servers'])
    if not has_regional:
        print(f'  SKIP {filepath} (no {{region}}.anypoint.mulesoft.com server)')
        return False

    spec['servers'] = transform_servers(spec['servers'])

    if dry_run:
        print(f'  DRY RUN {filepath}')
        yaml.dump(spec, sys.stdout)
        print('---')
    else:
        with open(filepath, 'w') as f:
            yaml.dump(spec, f)
        print(f'  UPDATED {filepath}')

    return True


def main():
    parser = argparse.ArgumentParser(description='Update OAS specs with 3-server URL pattern')
    parser.add_argument('--dry-run', action='store_true', help='Print changes without writing')
    args = parser.parse_args()

    updated = 0
    skipped = 0

    for api_name in sorted(APIS_TO_UPDATE):
        print(f'\n{api_name}:')
        files = find_spec_files(api_name)
        if not files:
            print(f'  WARNING: no spec files found')
            skipped += 1
            continue
        for filepath in files:
            if update_spec(filepath, dry_run=args.dry_run):
                updated += 1
            else:
                skipped += 1

    print(f'\nDone: {updated} files updated, {skipped} skipped')


if __name__ == '__main__':
    main()
