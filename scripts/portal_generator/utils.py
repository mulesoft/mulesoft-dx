"""
Utility functions and constants for the portal generator.
"""

from typing import Dict

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
