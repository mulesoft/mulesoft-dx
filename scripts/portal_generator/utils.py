"""
Utility functions and constants for the portal generator.
"""

import hashlib
import re
from typing import Dict, List, Tuple

# ============================================================================
# Category Mapping
# ============================================================================

CATEGORY_MAPPING = {
    'access-management': 'Access & Identity',
    'api-manager': 'API Management',
    'api-platform': 'API Management',
    'cloudhub': 'Runtime',
    'cloudhub-20': 'Runtime',
    'runtime-fabric': 'Runtime',
    'flex-gateway-manager': 'Gateway',
    'anypoint-mq-admin': 'Messaging',
    'anypoint-mq-broker': 'Messaging',
    'anypoint-mq-stats': 'Messaging',
    'object-store-v2': 'Storage',
    'object-store-v2-stats': 'Storage',
    'secrets-manager': 'Security',
    'anypoint-security-policies': 'Security',
    'arm-monitoring-query': 'Monitoring',
    'anypoint-monitoring-archive': 'Monitoring',
    'metrics': 'Monitoring',
    'audit-log-query': 'Governance',
    'exchange-experience': 'Exchange',
    'partner-manager-v2-partners': 'B2B',
    'partner-manager-v2-tracking': 'B2B',
    'amc-application-manager': 'Management',
    'analytics-event-export': 'Analytics',
    'api-designer-experience': 'Design',
    'citizen-platform-experience': 'Platform',
    'mule-agent-plugin': 'Management',
    'proxies-xapi': 'Gateway',
    'tokenization-creation-and-mgmt': 'Security',
    'tokenization-runtime-service': 'Security',
    'usage': 'Monitoring',
    'api-portal-xapi': 'Platform',
}


def get_category(api_name: str) -> str:
    """Get category for an API"""
    return CATEGORY_MAPPING.get(api_name, 'Platform')


def hash_asset_filename(filename: str, content: str) -> str:
    """Return filename with 8-char content hash inserted before the final extension."""
    dot_pos = filename.rfind('.')
    digest = hashlib.md5(content.encode('utf-8')).hexdigest()[:8]  # noqa: S324
    if dot_pos == -1:
        return f"{filename}.{digest}"
    base = filename[:dot_pos]
    ext = filename[dot_pos:]
    return f"{base}.{digest}{ext}"


# ============================================================================
# Semver helpers
# ============================================================================

_SEMVER_RE = re.compile(
    r"^v?(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z0-9.-]+))?(?:\+[A-Za-z0-9.-]+)?$"
)


def parse_semver(version_str: str) -> Tuple[int, int, int, str]:
    """Parse a semver string into ``(major, minor, patch, prerelease)``."""
    match = _SEMVER_RE.match(version_str)
    if not match:
        raise ValueError(f"not a valid semver: {version_str!r}")
    major, minor, patch, pre = match.groups()
    return int(major), int(minor), int(patch), pre or ""


def is_valid_version_dirname(name: str) -> bool:
    """Return True if ``name`` is a syntactically valid semver directory name."""
    return _SEMVER_RE.match(name) is not None


def _prerelease_key(pre: str) -> Tuple[int, list]:
    """Build a comparison key for the prerelease segment.

    Implements SemVer 2.0 §11: a version without a prerelease has higher
    precedence than one with a prerelease. Within prereleases, numeric
    identifiers compare numerically and rank lower than alphanumerics.
    """
    if not pre:
        return (1, [])
    parts = []
    for ident in pre.split("."):
        if ident.isdigit():
            parts.append((0, int(ident)))
        else:
            parts.append((1, ident))
    return (0, parts)


def sort_versions_desc(versions: List[str]) -> List[str]:
    """Return ``versions`` sorted descending by semver precedence."""
    def key(v: str):
        major, minor, patch, pre = parse_semver(v)
        return (major, minor, patch, _prerelease_key(pre))
    return sorted(versions, key=key, reverse=True)
