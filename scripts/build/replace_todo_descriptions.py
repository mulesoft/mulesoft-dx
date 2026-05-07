#!/usr/bin/env python3
"""
Replace placeholder TODO descriptions emitted by the api-schema-inferrer skill.

The api-schema-inferrer skill bootstraps OAS schemas from examples and leaves
placeholders of two forms:

  Field-level (3,445 occurrences in apis/access-management/api.yaml):
    description: 'Auto-generated from example. TODO: Add meaningful description for ''<fieldName>'''

  Schema-level (234 occurrences):
    description: 'Auto-generated from example. TODO: Add meaningful description'

This script replaces the field-level placeholders using a curated dictionary
keyed by field name, and the schema-level placeholders using the parent
operation's operationId and the body location (request vs. response).

The rewrite is text-based (regex on the raw source) so YAML formatting,
comment placement, key order, and line folding are preserved exactly. The only
diff hunks should be the description: lines themselves.

Usage:
    python3 scripts/build/replace_todo_descriptions.py apis/access-management/api.yaml
    python3 scripts/build/replace_todo_descriptions.py apis/access-management/api.yaml --dry-run

Exit codes:
    0  All placeholders resolved.
    1  At least one placeholder had no canonical entry; nothing was written.
    2  CLI usage error.
"""

import argparse
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import yaml


# ---------------------------------------------------------------------------
# Canonical descriptions for the 292 unique field names that appear with
# TODO placeholders in apis/access-management/api.yaml. Each entry must be
# generic enough to fit every occurrence of that field across the spec.
# ---------------------------------------------------------------------------
CANONICAL_DESCRIPTIONS: Dict[str, str] = {
    # ------------------------- Identifiers -------------------------
    "id": "The unique identifier of the resource.",
    "org_id": "The unique identifier of the organization.",
    "organizationId": "The unique identifier of the organization.",
    "organization_id": "The unique identifier of the organization.",
    "owner_org_id": "The unique identifier of the organization that owns the resource.",
    "ownerId": "The unique identifier of the user who owns the resource.",
    "client_id": "The unique identifier of the client application.",
    "clientId": "The unique identifier of the client application.",
    "client_name": "The display name of the client application.",
    "idprovider_id": "The unique identifier of the identity provider.",
    "provider_id": "The unique identifier of the identity provider.",
    "providerId": "The unique identifier of the identity provider.",
    "client_management_provider_id": "The unique identifier of the client management identity provider associated with the resource.",
    "suggestedClientManagementProviderIds": "Identifiers of the client management identity providers suggested for use with this organization.",
    "role_id": "The unique identifier of the role.",
    "role_group_id": "The unique identifier of the role group (legacy term for team).",
    "user_role_group_id": "The unique identifier of the role-group assignment for the user.",
    "client_role_id": "The unique identifier of the role assignment for the client.",
    "role_group_assignment_id": "The unique identifier of the role-group assignment.",
    "envId": "The unique identifier of the environment.",
    "environment_id": "The unique identifier of the environment.",
    "environment_ids": "Identifiers of the environments associated with the resource.",
    "userId": "The unique identifier of the user.",
    "idpUserId": "The identifier of the user as recorded in the external identity provider.",
    "apiId": "The unique identifier of the API.",
    "sf_org_id": "The Salesforce organization identifier associated with this organization.",
    "parentId": "The unique identifier of the parent resource.",
    "parent_organization_ids": "Identifiers of the organizations that are ancestors of this organization in the hierarchy.",
    "parentOrganizationIds": "Identifiers of the organizations that are ancestors of this organization in the hierarchy.",
    "subOrganizationIds": "Identifiers of the organizations that are direct children of this organization.",
    "subOrganizations": "The organizations that are direct children of this organization.",
    "tenantOrganizationIds": "Identifiers of the tenant organizations associated with this organization.",
    "memberOfOrganizations": "The organizations the user is a member of.",
    "contributorOfOrganizations": "The organizations the user has contributor access to.",

    # ------------------------- Names / labels -------------------------
    "name": "The display name of the resource.",
    "parentName": "The display name of the parent resource.",
    "client_uri": "URL of the homepage of the client application.",
    "policy_uri": "URL of the privacy policy of the client application.",
    "tos_uri": "URL of the terms of service of the client application.",
    "username": "The username used to authenticate the user.",
    "firstName": "The user's first name.",
    "lastName": "The user's last name.",
    "email": "The user's email address.",
    "email_verified_at": "The date and time when the user's email address was verified, in ISO 8601 format.",
    "phoneNumber": "The user's phone number.",
    "domain": "The domain name associated with the organization.",
    "external_names": "Alternative names by which the resource is known in external systems.",
    "organizationName": "The display name of the organization.",
    "apiName": "The display name of the API.",
    "idpUserName": "The username of the user as recorded in the external identity provider.",
    "external_group_name": "The name of the group as defined in the external identity provider.",

    # ------------------------- Timestamps -------------------------
    "createdAt": "The date and time when the resource was created, in ISO 8601 format.",
    "created_at": "The date and time when the resource was created, in ISO 8601 format.",
    "updatedAt": "The date and time when the resource was last updated, in ISO 8601 format.",
    "updated_at": "The date and time when the resource was last updated, in ISO 8601 format.",
    "deleted_at": "The date and time when the resource was deleted, in ISO 8601 format.",
    "lastLogin": "The date and time of the user's most recent successful login, in ISO 8601 format.",
    "lastLoginAt": "The date and time of the user's most recent successful login, in ISO 8601 format.",
    "previousLastLogin": "The date and time of the user's previous successful login, in ISO 8601 format.",
    "password_updatedAt": "The date and time when the user's password was last updated, in ISO 8601 format.",
    "expiration": "The expiration date and time of the resource, in ISO 8601 format.",
    "expires": "The expiration date and time of the resource, in ISO 8601 format.",
    "dateTime": "A date and time value in ISO 8601 format.",

    # ------------------------- State / booleans -------------------------
    "enabled": "Whether the feature or resource is currently enabled.",
    "active": "Whether the feature or resource is currently active.",
    "deleted": "Whether the resource has been marked as deleted.",
    "deleted_through_org": "Whether the resource was deleted as a side effect of the parent organization being deleted.",
    "editable": "Whether the resource can be edited by the current user.",
    "isFederated": "Whether the organization uses a federated identity provider for authentication.",
    "isRoot": "Whether the organization is the root organization in the hierarchy.",
    "isMaster": "Whether the organization is the master organization.",
    "isProduction": "Whether the environment is a production environment.",
    "isApiConsumer": "Whether the user has been granted API consumer access.",
    "internal": "Whether the resource is for internal use only.",
    "secure": "Whether the connection should use TLS.",
    "ignoreTLS": "Whether TLS certificate validation should be skipped for the connection.",
    "trust": "Whether the resource is trusted by the platform.",
    "termsAccepted": "Whether the user has accepted the terms of service.",
    "isHyperAutomation": "Whether the entitlement applies to MuleSoft Hyperautomation.",
    "unlimitedConnectors": "Whether the entitlement allows the use of an unlimited number of connectors.",
    "globalDeployment": "Whether the entitlement allows global deployment of MuleSoft applications.",
    "generate_iss_claim_without_token": "Whether the issuer claim should be generated when no access token is present.",

    # ------------------------- OAuth / clients -------------------------
    "client_secret": "The client secret used to authenticate the application when requesting tokens.",
    "grant_types": "The OAuth 2.0 grant types supported by the application.",
    "grant_type": "The OAuth 2.0 grant type used in the request.",
    "redirect_uris": "The redirect URIs the user is sent to after authorization completes.",
    "redirect_uri": "The redirect URI the user is sent to after authorization completes.",
    "scopes": "The OAuth 2.0 scopes granted to the resource.",
    "scope": "The OAuth 2.0 scope granted to the resource.",
    "audience": "The audience (intended recipient) of the issued token, as defined by the OAuth 2.0 specification.",
    "public_keys": "The public keys used to verify signatures issued by the resource.",
    "public_key": "The public key used to verify signatures issued by the resource.",
    "access_token": "The OAuth 2.0 access token issued to the client.",
    "token_type": "The type of the issued token (typically 'Bearer').",
    "code": "The OAuth 2.0 authorization code returned to the client.",
    "issuer": "The identifier of the entity that issued the token.",
    "claims_mapping": "Mapping between identity provider claims and platform user attributes.",
    "ac_client": "The client used by the platform to perform authorization-code flows.",
    "rs_client": "The client used by the platform to perform resource-server operations.",
    "ro_client": "The client used by the platform to perform resource-owner operations.",
    "cc_client": "The client used by the platform to perform client-credentials flows.",
    "im_client": "The client used by the platform to integrate with the identity manager.",
    "cp_client": "The client used by the platform to communicate with the control plane.",
    "cs_auth": "Configuration for Anypoint Platform authentication settings.",
    "session_timeout": "Length of an authenticated session before re-authentication is required, in milliseconds.",
    "sessionTimeout": "Length of an authenticated session before re-authentication is required, in milliseconds.",
    "service_provider": "Configuration of the SAML service provider.",
    "sign_on": "URL the identity provider redirects to for single sign-on.",
    "sign_out": "URL the identity provider redirects to for single sign-out.",
    "urls": "URLs associated with the identity provider.",
    "saml": "Configuration for the SAML identity provider.",
    "identity_management": "Configuration of the identity management integration for the organization.",
    "externalIdentity": "Whether the user belongs to an external identity provider.",
    "group_attribute": "Name of the SAML/OIDC attribute that maps to platform group membership.",
    "loginProfileData": "Profile data captured during the most recent login.",

    # ------------------------- Pagination / collections -------------------------
    "data": "The list of items returned by the request.",
    "total": "The total number of items available across all pages.",
    "extra": "Additional information returned with the response.",
    "additional": "Supplementary information returned with the response.",
    "values": "The list of values returned by the request.",
    "value": "A single value returned by the request.",
    "resources": "The list of resources affected by the request.",
    "namespaces": "The list of permission namespaces affected by the request.",
    "permissions": "The permissions assigned to the resource.",
    "assignments": "The role and team assignments associated with the user or client.",
    "userAccounts": "The user accounts associated with the resource.",

    # ------------------------- Hierarchy / structure -------------------------
    "org": "The organization slug or short identifier used in API paths.",
    "organization": "The organization that owns the resource.",
    "owner": "The user or entity that owns the resource.",
    "user": "The user associated with the resource.",
    "client": "The client application associated with the resource.",
    "env": "The environment slug or short identifier used in API paths.",
    "environment": "The environment associated with the resource.",
    "environments": "The environments configured for the organization.",
    "environmentsCount": "The number of environments configured for the organization.",
    "context_params": "Additional parameters that scope the operation to a specific organization or environment.",
    "namespace": "The permission namespace the operation applies to (for example, cloudhub or exchange).",
    "action": "The action authorized by the operation (for example, GET, POST, PUT, DELETE).",
    "resource": "The resource path the operation authorizes against.",
    "target": "The target of the operation.",
    "object": "The object affected by the operation.",
    "host": "The hostname of the server.",
    "port": "The port on which the server is reachable.",
    "country": "The country associated with the resource, as an ISO 3166-1 alpha-2 code.",
    "location": "The geographic location associated with the resource.",
    "dataRegion": "The cloud region where data for this organization is stored.",
    "level": "The level or tier of the resource.",
    "category": "The category that classifies the resource.",
    "type": "The type of the resource.",
    "orgType": "The classification of the organization (for example, customer, partner, internal).",
    "attachmentType": "The kind of attachment associated with the resource.",
    "branch": "The source-control branch associated with the resource.",
    "tag": "The source-control tag associated with the resource.",
    "short": "The short form of the value.",
    "long": "The long form of the value.",
    "description": "A human-readable description of the resource.",
    "status": "The current status of the resource.",
    "error": "Error information returned with the response.",
    "amount": "A numeric quantity associated with the resource.",
    "duration": "The duration associated with the resource.",
    "unit": "The unit of measurement that applies to the value.",
    "timeout": "The timeout for the operation, in milliseconds.",
    "timeLeft": "Remaining time before the resource expires, in milliseconds.",
    "timeUsed": "Elapsed time consumed by the resource, in milliseconds.",
    "format": "The format identifier of the value.",
    "product": "The MuleSoft product the resource belongs to.",
    "productSKU": "The product SKU that identifies the entitlement.",
    "subscription": "The subscription that controls the entitlements available to the organization.",
    "entitlements": "The features and capabilities the organization is entitled to use.",
    "category": "The category that classifies the resource.",
    "properties": "Additional properties associated with the resource.",
    "organizationPreferences": "Per-organization user preferences.",
    "defaultEnvironment": "The default environment selected by the user for this organization.",
    "defaultAccessManagementUi": "The Access Management UI variant the organization defaults to.",
    "activeOrganizationId": "The unique identifier of the organization currently active in the user's session.",
    "attachedOrg": "Information about the parent organization this organization is attached to.",
    "fromName": "The display name used in the from address of outbound emails.",
    "fromAddress": "The from address used in outbound emails.",
    "view": "The view granted to the resource.",
    "ipAllowlistExcluded": "Whether the resource is excluded from organization-level IP allowlist enforcement.",
    "salesforce": "Configuration of the Salesforce integration for the organization.",
    "apiEndpoint": "Endpoint URL of the integrated service.",
    "password": "The user's password. Write-only.",
    "messages": "Per-message limits or counters defined for the entitlement.",
    "throughput": "Throughput limits defined for the entitlement.",
    "highAvailability": "Whether the entitlement allows high-availability deployments.",
    "clustering": "Whether the entitlement allows clustered deployments.",
    "cpu": "CPU resource limits or reservations associated with the entitlement.",
    "memory": "Memory resource limits or reservations associated with the entitlement.",
    "flows": "Flow-related limits associated with the entitlement.",

    # ------------------------- Entitlements: capacity -------------------------
    "addOn": "Additional capacity provisioned on top of the base allowance.",
    "base": "The base allowance included with the entitlement.",
    "vCoresProduction": "Number of production vCores included in the entitlement.",
    "vCoresSandbox": "Number of sandbox vCores included in the entitlement.",
    "vCoresDesign": "Number of design-time vCores included in the entitlement.",
    "productionUnits": "Number of production units included in the entitlement.",
    "preProductionUnits": "Number of pre-production units included in the entitlement.",
    "storageBase": "Base storage allowance included with the entitlement, in GB.",
    "storageAddOn": "Additional storage capacity provisioned on top of the base allowance, in GB.",
    "rawStorageOverrideGB": "Override for the raw storage allowance, in GB.",
    "staticIps": "Number of static IPs available to the organization.",
    "vpcs": "Number of Anypoint VPCs available to the organization.",
    "vpns": "Number of VPN connections available to the organization.",
    "networkConnections": "Number of network connections available to the organization.",
    "loadBalancer": "Number of dedicated load balancers available to the organization.",
    "schedules": "Whether scheduled flows are available to the organization.",
    "workerClouds": "Whether MuleSoft worker clouds are available to the organization.",
    "runtimeFabric": "Whether Anypoint Runtime Fabric is available to the organization.",
    "runtimeFabricCloud": "Whether Anypoint Runtime Fabric (Cloud) is available to the organization.",
    "serviceMesh": "Whether Anypoint Service Mesh is available to the organization.",
    "flexGateway": "Whether Anypoint Flex Gateway is available to the organization.",
    "managedGatewaySmall": "Number of small managed gateways available to the organization.",
    "managedGatewayLarge": "Number of large managed gateways available to the organization.",
    "rtfManagedGateway": "Number of Runtime Fabric managed gateways available to the organization.",
    "gateways": "Number of API gateways available to the organization.",
    "cloudhub1": "Whether CloudHub 1.0 is available to the organization.",
    "hybrid": "Whether hybrid deployments are available to the organization.",
    "autoscaling": "Whether deployment autoscaling is available to the organization.",
    "armAlerts": "Whether Anypoint Runtime Manager alerts are available to the organization.",
    "hybridAutoDiscoverProperties": "Whether hybrid runtimes can auto-discover platform properties.",
    "hybridInsight": "Whether Hybrid Insight is available to the organization.",
    "workerLoggingOverride": "Whether the organization can override worker logging configuration.",
    "messaging": "Whether Anypoint MQ is available to the organization.",
    "mqMessages": "Number of Anypoint MQ messages included in the entitlement.",
    "mqRequests": "Number of Anypoint MQ requests included in the entitlement.",
    "mqAdvancedFeatures": "Whether Anypoint MQ advanced features are available to the organization.",
    "objectStoreRequestUnits": "Number of Object Store request units included in the entitlement.",
    "objectStoreKeys": "Number of Object Store keys included in the entitlement.",

    # ------------------------- Entitlements: products -------------------------
    "designCenter": "Whether Anypoint Design Center is available to the organization.",
    "mozart": "Whether MuleSoft Mozart is available to the organization.",
    "apiVisual": "Whether the visual API designer is available to the organization.",
    "apiExample": "Whether API example projects are available to the organization.",
    "apiCatalog": "Whether the API catalog is available to the organization.",
    "apiMonitoring": "Whether API monitoring is available to the organization.",
    "apiCommunityManager": "Whether Anypoint API Community Manager is available to the organization.",
    "apiExperienceHub": "Whether Anypoint API Experience Hub is available to the organization.",
    "apiManager": "Whether Anypoint API Manager is available to the organization.",
    "apiGovernance": "Whether Anypoint API Governance is available to the organization.",
    "apiGovernanceDomain": "Whether the API Governance domain feature is available to the organization.",
    "apiQuery": "Whether API Query is available to the organization.",
    "apiQueryC360": "Whether API Query for Customer 360 is available to the organization.",
    "apisPerMonth": "Number of APIs the organization is allowed to manage per month.",
    "monitoringCenter": "Whether Anypoint Monitoring Center is available to the organization.",
    "exchange2": "Whether Anypoint Exchange 2 features are available to the organization.",
    "appViz": "Whether Anypoint Application Visualization is available to the organization.",
    "telemetryExporter": "Whether the telemetry exporter is available to the organization.",
    "rpa": "Whether MuleSoft RPA is available to the organization.",
    "composer": "Whether MuleSoft Composer is available to the organization.",
    "composerVersion": "The version of MuleSoft Composer available to the organization.",
    "tasksPerMonth": "Number of tasks the organization is allowed to run per month.",
    "maxConnectors": "Maximum number of connectors the organization is allowed to use.",
    "muleDxWebIde": "Whether the Mule DX web IDE is available to the organization.",
    "muleDxGenAI": "Whether Mule DX generative AI features are available to the organization.",
    "muleDxEDA": "Whether Mule DX event-driven architecture features are available to the organization.",
    "muleRuntimeIntegration": "Whether Mule Runtime integration features are available to the organization.",
    "AutomationCreditsDW": "Number of automation credits available to the organization in Data Warehouse units.",
    "kpiDashboard": "Whether the KPI dashboard is available to the organization.",
    "assetUsageAndEngagement": "Whether asset usage and engagement metrics are available to the organization.",
    "crowd": "Whether the Crowd developer experience is available to the organization.",
    "crowdSelfServiceMigration": "Whether self-service migration to Crowd is available to the organization.",
    "cam": "Whether Anypoint Connectivity Access Management (CAM) is available to the organization.",
    "hideApiManagerDesigner": "Whether the legacy API Manager designer is hidden from the organization.",
    "hideFormerApiPlatform": "Whether the former API Platform UI is hidden from the organization.",
    "pcf": "Whether the Pivotal Cloud Foundry integration is available to the organization.",
    "usageBasedPricing": "Whether usage-based pricing applies to the organization.",
    "usageBasedPricingLimits": "Limits that apply to the organization under usage-based pricing.",
    "anypointSecurityEdgePolicies": "Whether Anypoint Security edge policies are available to the organization.",
    "anypointSecurityTokenization": "Whether Anypoint Security tokenization is available to the organization.",
    "tradingPartnersProduction": "Whether B2B Trading Partner Manager production capacity is available to the organization.",
    "tradingPartnersSandbox": "Whether B2B Trading Partner Manager sandbox capacity is available to the organization.",
    "partnersProduction": "Whether production capacity for partner-managed APIs is available to the organization.",
    "partnersSandbox": "Whether sandbox capacity for partner-managed APIs is available to the organization.",
    "createSubOrgs": "Whether the organization is allowed to create sub-organizations.",
    "createEnvironments": "Whether the organization is allowed to create environments.",
    "idp": "Whether the organization can configure its own identity provider.",
    "production": "Whether the resource is available in production.",
    "sandbox": "Whether the resource is available in sandbox environments.",
    "governance": "Whether governance features are available to the organization.",
    "support": "The level of support available to the organization.",
    "admin": "Whether administrative access is granted by the resource.",
    "cloudhub": "Whether CloudHub access is granted by the resource.",
    "exchange": "Whether Exchange access is granted by the resource.",
    "partner_manager": "Whether Partner Manager access is granted by the resource.",
    "nonSplitPolicyModelDeprecated": "Whether the non-split policy model has been deprecated for the organization.",
    "angGovernance": "Whether the Anypoint API Governance feature is enabled for the organization.",
    "apis": "Per-API limits or counters defined for the entitlement.",
    "api": "Per-API capacity included in the entitlement.",

    # ------------------------- Action verbs (RBAC permission verbs) -------------------------
    "assigned": "Whether the role or team has been assigned to the user or client.",
    "reassigned": "Whether the role or team has been reassigned to a different scope.",

    # ------------------------- GUID-keyed dynamic fields -------------------------
    "0a14e2fd-1cfe-4310-acbc-54bf93eb8420": "Per-organization preferences keyed by organization id.",
    "20460a62-bbdc-469d-9330-5eec892abd05": "Per-resource entry keyed by identifier.",
    "20460a62-bbdc-469d-9660-5eec892abd05": "Per-resource entry keyed by identifier.",
    "d74ef94a-4292-4896-b860-b05bd7f90d6d": "Per-resource entry keyed by identifier.",
    "f0c9b011-980e-4928-9430-e60e3a97c043": "Per-resource entry keyed by identifier.",
}


# Field-level placeholder. Tolerant of YAML soft-folds: `\s+` matches a
# single space (single-line form) or a newline plus continuation indent
# (folded form). The fold can occur anywhere between words, so every
# inter-word whitespace uses `\s+`.
FIELD_RE = re.compile(
    r"description:\s+'Auto-generated\s+from\s+example\.\s+"
    r"TODO:\s+Add\s+meaningful\s+description\s+for\s+''(?P<name>[^']+)'''"
)

# Schema-level placeholder (no field name). Run after FIELD_RE has already
# stripped the field-level form, so any remaining placeholder is schema-level.
SCHEMA_LEVEL_RE = re.compile(
    r"description:\s+'Auto-generated\s+from\s+example\.\s+"
    r"TODO:\s+Add\s+meaningful\s+description'"
)


def yaml_quote(text: str) -> str:
    """Encode `text` as a single-quoted YAML scalar."""
    return "'" + text.replace("'", "''") + "'"


def line_starts(text: str) -> List[int]:
    """Return character offsets at which each line begins."""
    starts = [0]
    for i, ch in enumerate(text):
        if ch == "\n":
            starts.append(i + 1)
    return starts


def offset_to_line(starts: List[int], offset: int) -> int:
    """Convert a character offset to a 1-based line number."""
    import bisect
    return bisect.bisect_right(starts, offset)


def build_operation_index(spec_text: str):
    """
    Parse the spec once with PyYAML to map line numbers -> nearest enclosing
    operation context. Returns a list of (start_line, end_line, info) tuples,
    sorted by start_line, where `info` describes the operation, body location,
    and parent property name (when a schema-level placeholder is nested inside
    a property).

    The walker tracks paths -> methods -> requestBody / responses[code] /
    parameters / components.requestBodies / components.responses. The returned
    list lets us look up: "for line N, which operation/body am I inside?"
    """
    spec = yaml.safe_load(spec_text)

    # Map each top-level location (path + method + body slot) to a (start, end)
    # range of source lines. We re-find the ranges by searching for textual
    # markers since PyYAML's safe_load discards line info.
    # Practical approach: parse the spec for structural lookup, then rely on
    # ruamel-style line tracking via a second loader.

    # Use ruamel.yaml for line tracking if available.
    try:
        from ruamel.yaml import YAML
        ry = YAML(typ="rt")
        from io import StringIO
        data = ry.load(StringIO(spec_text))
        return _build_index_with_lines(data)
    except ImportError:
        # Fallback: regex-based path tracking on raw text.
        return _build_index_from_text(spec_text)


def _build_index_with_lines(data):
    """
    Walk a ruamel.yaml round-trip CommentedMap to collect (start, end, info)
    intervals for each operation body location.
    """
    intervals = []

    paths = data.get("paths", {}) or {}
    for path, methods in paths.items():
        if not hasattr(methods, "lc"):
            continue
        for method, op in methods.items():
            if method not in ("get", "post", "put", "patch", "delete", "head", "options"):
                continue
            if not hasattr(op, "lc"):
                continue
            op_id = op.get("operationId") or f"{method.upper()} {path}"
            op_summary = op.get("summary") or op.get("description") or ""

            # requestBody
            rb = op.get("requestBody")
            if rb is not None and hasattr(op, "lc") and "requestBody" in op:
                start = op.lc.value("requestBody")[0]
                end = _next_sibling_line(op, "requestBody", default=start + 10000)
                intervals.append((start, end, {
                    "kind": "requestBody",
                    "operationId": op_id,
                    "summary": op_summary,
                    "path": path,
                    "method": method,
                }))

            # responses
            responses = op.get("responses")
            if responses is not None and "responses" in op:
                for code, resp in responses.items():
                    if not hasattr(responses, "lc"):
                        continue
                    try:
                        start = responses.lc.value(code)[0]
                    except KeyError:
                        continue
                    end = _next_sibling_line(responses, code, default=start + 10000)
                    intervals.append((start, end, {
                        "kind": "response",
                        "code": str(code),
                        "operationId": op_id,
                        "summary": op_summary,
                        "path": path,
                        "method": method,
                    }))

    # components.requestBodies / components.responses
    components = data.get("components", {}) or {}
    rb_map = components.get("requestBodies", {}) or {}
    if hasattr(rb_map, "lc"):
        for name in rb_map:
            try:
                start = rb_map.lc.value(name)[0]
            except KeyError:
                continue
            end = _next_sibling_line(rb_map, name, default=start + 10000)
            intervals.append((start, end, {
                "kind": "componentRequestBody",
                "operationId": name,
                "summary": "",
                "path": "components.requestBodies",
                "method": "",
            }))
    resp_map = components.get("responses", {}) or {}
    if hasattr(resp_map, "lc"):
        for name in resp_map:
            try:
                start = resp_map.lc.value(name)[0]
            except KeyError:
                continue
            end = _next_sibling_line(resp_map, name, default=start + 10000)
            intervals.append((start, end, {
                "kind": "componentResponse",
                "operationId": name,
                "summary": "",
                "path": "components.responses",
                "method": "",
            }))

    # components.parameters: inline schemas under parameter definitions get
    # the parameter name as their "operationId" for description purposes.
    param_map = components.get("parameters", {}) or {}
    if hasattr(param_map, "lc"):
        for name in param_map:
            try:
                start = param_map.lc.value(name)[0]
            except KeyError:
                continue
            end = _next_sibling_line(param_map, name, default=start + 10000)
            intervals.append((start, end, {
                "kind": "componentParameter",
                "operationId": name,
                "summary": "",
                "path": "components.parameters",
                "method": "",
            }))

    intervals.sort(key=lambda t: t[0])
    return intervals


def _next_sibling_line(mapping, key, default):
    """Return the line number of the key that comes after `key` in `mapping`,
    or `default` if `key` is the last entry."""
    if not hasattr(mapping, "lc"):
        return default
    keys = list(mapping.keys())
    try:
        idx = keys.index(key)
    except ValueError:
        return default
    if idx + 1 >= len(keys):
        return default
    next_key = keys[idx + 1]
    try:
        return mapping.lc.value(next_key)[0]
    except (KeyError, AttributeError):
        return default


def _build_index_from_text(spec_text: str):
    """Fallback regex walker if ruamel.yaml is unavailable."""
    intervals = []
    lines = spec_text.split("\n")
    # Track current path / method / body kind by indent level.
    cur_path = None
    cur_method = None
    cur_op_id = None
    cur_op_start = None
    cur_kind = None
    cur_kind_start = None

    def flush_kind(end_line):
        nonlocal cur_kind, cur_kind_start
        if cur_kind is not None and cur_op_id is not None:
            intervals.append((cur_kind_start, end_line, {
                "kind": cur_kind,
                "operationId": cur_op_id,
                "summary": "",
                "path": cur_path or "",
                "method": cur_method or "",
            }))
        cur_kind = None
        cur_kind_start = None

    for i, line in enumerate(lines, start=1):
        # Top-level path
        m = re.match(r"^  (/[^:]*):\s*$", line)
        if m:
            flush_kind(i - 1)
            cur_path = m.group(1)
            cur_method = None
            cur_op_id = None
            continue
        # Method under a path
        m = re.match(r"^    (get|post|put|patch|delete|head|options):\s*$", line)
        if m and cur_path:
            flush_kind(i - 1)
            cur_method = m.group(1)
            cur_op_id = None
            continue
        # operationId
        m = re.match(r"^      operationId:\s*(\S+)\s*$", line)
        if m and cur_method:
            cur_op_id = m.group(1)
            continue
        # requestBody / responses
        m = re.match(r"^      (requestBody):\s*$", line)
        if m and cur_method:
            flush_kind(i - 1)
            cur_kind = "requestBody"
            cur_kind_start = i
            continue
        m = re.match(r"^        '?(\d{3})'?:\s*$", line)
        if m and cur_method:
            flush_kind(i - 1)
            cur_kind = f"response:{m.group(1)}"
            cur_kind_start = i
            continue
    flush_kind(len(lines))
    intervals.sort(key=lambda t: t[0])
    return intervals


def lookup_context(intervals, line_no):
    """Find the most-deeply-nested (smallest) interval containing line_no."""
    best = None
    for start, end, info in intervals:
        if start <= line_no <= end:
            if best is None or (end - start) < (best[1] - best[0]):
                best = (start, end, info)
    return best[2] if best else None


def synthesize_schema_description(info, parent_property: str | None) -> str:
    """Build a description for a schema-level placeholder using context."""
    op_id = info.get("operationId") or "the operation"
    kind = info.get("kind", "")
    if parent_property:
        canonical = CANONICAL_DESCRIPTIONS.get(parent_property)
        if canonical:
            return canonical
    if kind == "requestBody" or kind == "componentRequestBody":
        return f"Request payload for {op_id}."
    if kind.startswith("response"):
        return f"Response payload for {op_id}."
    if kind == "componentResponse":
        return f"Response payload for {op_id}."
    if kind == "componentParameter":
        return f"Schema for the {op_id} parameter."
    return f"Payload for {op_id}."


def find_parent_property(spec_text: str, lines_at: List[int], match_start: int) -> str | None:
    """
    For a schema-level TODO at character offset `match_start`, scan backwards
    through the source to find the nearest YAML key that's a less-indented
    sibling — i.e., the property whose `type:`/`description:` block contains
    this placeholder.
    """
    line_no = offset_to_line(lines_at, match_start)
    src_lines = spec_text.split("\n")
    if line_no - 1 >= len(src_lines):
        return None
    cur_line = src_lines[line_no - 1]
    cur_indent = len(cur_line) - len(cur_line.lstrip(" "))

    # Walk upward looking for a key at a strictly smaller indent.
    for i in range(line_no - 2, max(line_no - 200, 0) - 1, -1):
        if i < 0:
            break
        ln = src_lines[i]
        if not ln.strip():
            continue
        indent = len(ln) - len(ln.lstrip(" "))
        if indent < cur_indent:
            m = re.match(r"^\s*([A-Za-z_][\w-]*):\s*$", ln)
            if m:
                key = m.group(1)
                # Skip wrappers that don't carry semantics for the schema.
                if key in {"schema", "items", "properties", "additionalProperties",
                           "allOf", "oneOf", "anyOf", "not", "content", "application/json"}:
                    cur_indent = indent
                    continue
                return key
            cur_indent = indent
    return None


def replace_placeholders(spec_text: str) -> Tuple[str, List[str], Counter, Counter]:
    """
    Apply field-level and schema-level replacements.

    Returns:
      new_text         -- spec source with placeholders resolved
      missing_names    -- list of field names that lack a canonical entry
      field_stats      -- Counter of {name: replacements_applied}
      schema_stats     -- Counter of {kind: replacements_applied}
    """
    missing_names: List[str] = []
    field_stats: Counter = Counter()
    schema_stats: Counter = Counter()

    def field_repl(match):
        name = match.group("name")
        canonical = CANONICAL_DESCRIPTIONS.get(name)
        if canonical is None:
            missing_names.append(name)
            return match.group(0)
        field_stats[name] += 1
        return f"description: {yaml_quote(canonical)}"

    text = FIELD_RE.sub(field_repl, spec_text)

    if missing_names:
        return text, missing_names, field_stats, schema_stats

    intervals = build_operation_index(text)
    starts = line_starts(text)

    def schema_repl(match):
        offset = match.start()
        line_no = offset_to_line(starts, offset)
        info = lookup_context(intervals, line_no) or {"kind": "", "operationId": "the operation"}
        parent = find_parent_property(text, starts, offset)
        desc = synthesize_schema_description(info, parent)
        schema_stats[info.get("kind", "unknown")] += 1
        return f"description: {yaml_quote(desc)}"

    text = SCHEMA_LEVEL_RE.sub(schema_repl, text)

    return text, missing_names, field_stats, schema_stats


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("spec", type=Path, help="OpenAPI spec to rewrite (e.g., apis/access-management/api.yaml)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be replaced without writing")
    args = parser.parse_args()

    if not args.spec.exists():
        print(f"ERROR: spec not found: {args.spec}", file=sys.stderr)
        sys.exit(2)

    spec_text = args.spec.read_text()
    new_text, missing, field_stats, schema_stats = replace_placeholders(spec_text)

    if missing:
        unique_missing = sorted(set(missing))
        print(f"ERROR: {len(missing)} placeholder occurrence(s) reference {len(unique_missing)} field name(s) "
              f"with no canonical entry. Add them to CANONICAL_DESCRIPTIONS:", file=sys.stderr)
        miss_counter = Counter(missing)
        for name, count in miss_counter.most_common():
            print(f"  {count:5d}  {name}", file=sys.stderr)
        sys.exit(1)

    field_total = sum(field_stats.values())
    schema_total = sum(schema_stats.values())
    print(f"Field-level replacements:  {field_total} (across {len(field_stats)} unique names)")
    print(f"Schema-level replacements: {schema_total}")
    for kind, count in schema_stats.most_common():
        print(f"  {kind or '(uncategorized)'}: {count}")

    if args.dry_run:
        print("Dry run: no file written.")
        return

    args.spec.write_text(new_text)
    print(f"Wrote {args.spec}")


if __name__ == "__main__":
    main()
