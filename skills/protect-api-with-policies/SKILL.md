---
name: protect-api-with-policies
description: |
  Protect an API by applying a policy from the catalog. Handles multiple starting
  points: from an existing API Manager instance, from an Exchange asset that needs
  an instance, or from scratch. Use when the user wants to secure an API, add
  rate limiting, apply OAuth2, enforce IP allowlisting, or protect any API with
  a policy — regardless of where they are in the setup process.
---

# Protect an API with Policies

## Overview

Applies a security or traffic management policy to an API and deploys it to a self-managed Flex Gateway, walking through the full process from identifying the target API to selecting a policy, configuring it, and deploying. Supports multiple starting points depending on what the user already has set up — an API Manager instance, an Exchange asset, or just an API URL.

**What you'll build:** A fully configured policy enforced on your API instance, deployed to a Flex Gateway

## Prerequisites

Before starting, ensure you have:

1. **Authentication ready**
   - Valid Bearer token for Anypoint Platform. If you only have username/password, call `createLogin` (`POST /accounts/login`) from the `urn:api:access-management` API with body `{"username":"...","password":"..."}` to obtain a Bearer token first.
   - API Manager permissions: **View APIs Configuration** and **Manage Policies** scopes

2. **Organization Id**
   - Call `listMe` (`GET /accounts/api/me`) from `urn:api:access-management` to get your organization ID
   - Extract `organizationId` from `$.user.organization.id` in the response
   - This is used to list environments, browse the policy catalog, check Exchange, etc.

3. **One of the following**
   - An API instance already in API Manager (skip to Step 6)
   - An Exchange asset ready to be promoted to API Manager (skip to Step 2)
   - An API specification or URL that needs to be published first (start at Step 1)

## Starting Point

This skill has multiple entry points depending on what you already have:

- **Start at Step 1** if you have an API specification file and need to publish it to Exchange first
  - You'll need: `organizationId`, API specification file
  - Steps: 1, 2, 3, 4, 5, 6, 7

- **Start at Step 2** if you already have an Exchange asset and need to create an API Manager instance
  - You'll need: `organizationId`, `groupId`, `assetId`, `assetVersion`
  - Steps: 2, 3, 4, 5, 6, 7

- **Start at Step 6** if you already have an API Manager instance and want to apply a policy
  - You'll need: `organizationId`, `environmentId`, `environmentApiId`
  - Steps: 2, 6, 7


## Step 1: Publish API to Exchange

> **Skip if:** You already have an Exchange asset with a known `groupId`, `assetId`, and `assetVersion`.

Publishes your API specification to Exchange as a reusable asset. This makes it available for API Manager to create managed instances from it.

**What you'll need:**
- Organization ID
- API specification file (OAS or RAML)
- Asset name, groupId, assetId, and version

**Action:** Create a new asset in Exchange with your API specification.

```yaml
api: urn:api:exchange-experience
operationId: createAssets
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Your organization's Business Group GUID
  groupId:
    userProvided: true
    description: The group ID for the asset (typically matches your organization ID)
    example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  assetId:
    userProvided: true
    description: A unique identifier for the asset in kebab-case
    example: "inventory-api"
  version:
    userProvided: true
    description: Semantic version for the asset
    example: "1.0.0"
outputs:
  - name: groupId
    path: $.groupId
    description: The group ID of the published asset
  - name: assetId
    path: $.assetId
    description: The asset ID of the published asset
  - name: assetVersion
    path: $.version
    description: The version of the published asset
```

**What happens next:** Your API specification is now available in Exchange. Next, you'll create an API Manager instance from this asset so you can apply policies to it.


## Step 2: List Environments

> **Skip if:** You already know the `environmentId`.

List all environments in the organization so you can confirm or select the one where your API instance lives.

**What you'll need:**
- Organization ID

**Action:** List available environments and select the target.

```yaml
api: urn:api:access-management
operationId: listEnvironments
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Organization ID from Prerequisites
outputs:
  - name: environmentId
    path: $.data[*].id
    labels: $.data[*].name
    description: Selected environment ID (e.g., Production, Sandbox)
```

**What happens next:** With the environment selected, you can create an API instance or browse policies.

## Step 3: Select Deployment Target

List available gateway targets registered in the environment. You need the target ID and gateway version before creating the API instance, because the deployment configuration is set via a PATCH after creation.

**What you'll need:**
- Organization ID and Environment ID

**Action:** List gateway targets and select the Flex Gateway where the API will run. Prefer a target with `status: "RUNNING"`.

```yaml
api: urn:api:api-portal-xapi
operationId: getGatewayTargets
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Organization ID
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
outputs:
  - name: targetId
    path: $.rows[*].id
    labels: $.rows[*].name
    description: Selected gateway target ID
  - name: targetName
    path: $.rows[*].name
    description: Name of the selected gateway target
  - name: gatewayVersion
    value: "1.0.0"
    description: Gateway version to use for deployment. The targets response may return "-" instead of a real version; use "1.0.0" as the default.
```

**What happens next:** You have a deployment target and its gateway version. Next, create the API instance and then configure its deployment target.

## Step 4: Create API Manager Instance

> **Skip if:** You already have an API Manager instance with a known `environmentApiId`.

Creates a managed API instance in API Manager from your Exchange asset. This creates the API configuration; deployment to the Flex Gateway happens in Step 5.

**Important:** For Flex Gateway instances, `isCloudHub` must be `null` (not `false`). Setting it to `false` causes a validation error.

**What you'll need:**
- Organization ID and Environment ID
- Exchange asset coordinates (groupId, assetId, version)

**Action:** Create an API instance in the target environment.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Your organization's Business Group GUID
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Target environment ID from Step 2
  groupId:
    from:
      step: Publish API to Exchange
      output: groupId
    description: Exchange asset group ID from Step 1
  assetId:
    from:
      step: Publish API to Exchange
      output: assetId
    description: Exchange asset ID from Step 1
  assetVersion:
    from:
      step: Publish API to Exchange
      output: assetVersion
    description: Exchange asset version from Step 1
  instanceLabel:
    userProvided: true
    description: A human-readable label for this API instance (e.g., "cars-api-v1")
    example: "cars-api-v1"
  technology:
    value: "flexGateway"
    description: Gateway technology — this skill targets Flex Gateway deployments
  endpoint.isCloudHub:
    value: null
    description: "Must be null for flexGateway technology (not false — false causes a validation error)"
  endpoint.proxyUri:
    userProvided: true
    description: "The proxy listener URI. Ask the user which port the Flex Gateway should listen on, then use http://0.0.0.0:<port>/"
    example: "http://0.0.0.0:8081/"
  endpoint.uri:
    userProvided: true
    optional: true
    description: The upstream backend URL for the API. Ask the user if they want to provide it now or configure it later.
    example: "https://backend.example.com/api/v1"
outputs:
  - name: environmentApiId
    path: $.id
    description: The API instance ID in API Manager
```

**What happens next:** The API instance exists but is not yet deployed. Next, deploy it to the Flex Gateway target selected in Step 3.

## Step 5: Deploy to Flex Gateway

Deploys the API instance to the selected Flex Gateway target. This uses the Proxies API deployment endpoint with flat top-level fields — do **not** use the nested `target` object, which requires additional fields that are not needed for self-managed Flex Gateway deployments.

**What you'll need:**
- Organization ID, Environment ID, and API instance ID from Step 4
- Deployment target ID and gateway version from Step 3

**Action:** Create a deployment for the API instance on the selected Flex Gateway.

```yaml
api: urn:api:proxies-xapi
operationId: createOrganizationsByOrganizationidEnvironmentsByEnvironmentidApisByEnvironmentapiidDeployments
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Organization ID
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
  environmentApiId:
    from:
      step: Create API Manager Instance
      output: environmentApiId
    description: API instance ID from Step 4
  type:
    value: "HY"
    description: "Deployment type for self-managed Flex Gateway (HY = Hybrid)"
  targetId:
    from:
      step: Select Deployment Target
      output: targetId
    description: Flex Gateway target ID from Step 3
  targetName:
    from:
      step: Select Deployment Target
      output: targetName
    description: Flex Gateway target name from Step 3
  gatewayVersion:
    value: "1.0.0"
    description: "Gateway version for deployment. Use \"1.0.0\" as the default."
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID (required in the deployment body for HY type)
  overwrite:
    value: false
    description: "Whether to overwrite an existing deployment"
outputs:
  - name: deploymentId
    path: $.id
    description: The ID of the proxy deployment
```

**Request body structure:** Use flat top-level fields, not the nested `target` object:

```json
{
  "type": "HY",
  "targetId": "<from Step 3>",
  "targetName": "<from Step 3>",
  "gatewayVersion": "1.0.0",
  "environmentId": "<from Step 2>",
  "overwrite": false
}
```

**What happens next:** The API instance is now deployed to the Flex Gateway. Next, browse the policy catalog to select which policy to apply.

**Common issues:**
- **`"Field environmentId is required for deployment type HY"`**: The `environmentId` must be in the request body, not just the URL path parameter.
- **`"Field gatewayVersion is required for deployment type HY"`**: Use the version from the `getGatewayTargets` response (Step 3). Using an incorrect version causes policy implementation errors.
- **`"Policy implementations cannot be set because runtime version is unknown"`**: The `gatewayVersion` value doesn't match a known Flex Gateway version. Verify the version from the target's actual runtime version in Step 3.
- **409 Conflict**: The API may already be deployed to this target. List existing deployments with `GET .../deployments` first to check.

## Step 6: Browse Exchange Policy Catalog

List all available policy templates from Exchange for your organization. This endpoint returns the full Exchange coordinates (`groupId`, `assetId`, `assetVersion`) and gateway-compatible configuration for each template — these are required when applying a policy.

**Important:** Use the `api-portal-xapi` endpoint (`getExchangePolicyTemplates`) instead of the generic `listOrganizationsPolicytemplates` endpoint. The generic endpoint does not return Exchange coordinates or gateway-specific configuration property names, which are required for the apply step.

**What you'll need:**
- Organization ID
- Environment ID and API instance ID (to filter for compatible templates)

**Action:** List Exchange policy templates and select the one to apply. Pass `apiInstanceId` and `environmentId` to filter for templates compatible with your API's gateway type (e.g., Flex Gateway, Mule Gateway).

```yaml
api: urn:api:api-portal-xapi
operationId: getExchangePolicyTemplates
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Organization ID
  apiInstanceId:
    from:
      step: Create API Manager Instance
      output: environmentApiId
    description: API instance ID from Step 4 (filters for compatible templates)
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
  latest:
    value: "true"
    description: Return only the latest version of each template
  includeConfiguration:
    value: "true"
    description: Include the configuration schema for each template
outputs:
  - name: policyGroupId
    path: $[*].groupId
    labels: $[*].assetId
    description: Exchange group ID of the selected policy template
  - name: policyAssetId
    path: $[*].assetId
    description: Exchange asset ID of the selected policy template
  - name: policyAssetVersion
    path: $[*].version
    description: Exchange version of the selected policy template (gateway-compatible)
  - name: policyConfiguration
    path: $[*].configuration
    description: Configuration schema with gateway-compatible property names and defaults
```

**What happens next:** You have the policy template's Exchange coordinates and its configuration schema with the correct property names for your gateway type. Review the `policyConfiguration` output to understand what settings the policy accepts before applying it.

**Common issues:**
- **Empty list**: Pass `apiInstanceId` and `environmentId` to get templates compatible with your gateway type. Without these filters, some templates may not appear.
- **Wrong config property names**: Always use the configuration from this endpoint — the generic `listOrganizationsPolicytemplates` endpoint may return different (non-gateway-compatible) property names and defaults.

## Step 7: Apply Policy to API Instance

Apply the selected policy to your API instance with the appropriate configuration. Use the Exchange coordinates and configuration property names from Step 6.

**What you'll need:**
- Organization ID, Environment ID, and API instance ID
- Policy Exchange coordinates (groupId, assetId, assetVersion) from Step 6
- Policy configuration based on the schema from Step 6's `policyConfiguration` output

**Action:** Apply the policy to your API instance. Build the `configurationData` object using the property names and defaults from Step 6's configuration schema.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisPolicies
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Organization ID
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
  environmentApiId:
    from:
      step: Create API Manager Instance
      output: environmentApiId
    description: API instance ID from Step 4 (or provided manually)
  groupId:
    from:
      step: Browse Exchange Policy Catalog
      output: policyGroupId
    description: Policy Exchange group ID from Step 6
  assetId:
    from:
      step: Browse Exchange Policy Catalog
      output: policyAssetId
    description: Policy Exchange asset ID from Step 6
  assetVersion:
    from:
      step: Browse Exchange Policy Catalog
      output: policyAssetVersion
    description: Policy Exchange version from Step 6
outputs:
  - name: policyId
    path: $.id
    description: The ID of the applied policy instance
```

**What happens next:** Your API is now protected with the selected policy. Since the API instance was configured with deployment information in Step 5, the policy is active and enforcing on the Flex Gateway.

**Common issues:**
- **400 Bad Request — missing groupId/assetId/assetVersion**: The apply endpoint requires full Exchange coordinates, not just a template ID. Make sure you used `getExchangePolicyTemplates` (Step 6) to get these values.
- **400 Bad Request — invalid configurationData**: The configuration property names differ between gateway types. Use the property names from Step 6's `policyConfiguration` output, not from the generic template endpoint. For example, Flex Gateway uses `credentialsOriginHasHttpBasicAuthenticationHeader` while the generic template uses `credentialsOrigin`.
- **409 Conflict**: A policy of this type may already be applied to the API instance. List existing policies first to check, or add `?allowDuplicated=true` to the request URL to apply a second instance of the same policy type.
- **403 Forbidden**: You need **Manage Policies** permission in the target environment.

## Completion Checklist

After completing all steps, verify:

- [ ] API instance is bound to the Flex Gateway target (deployment info visible in API Manager)
- [ ] Policy appears in the API instance's policy list
- [ ] Policy status shows as "Active"
- [ ] API requests are being evaluated against the policy rules
- [ ] Policy configuration matches your requirements

## What You've Built

Your API is now protected with:

✅ **Policy enforcement**
- Selected policy is active on your API instance
- All incoming traffic is evaluated against policy rules

✅ **Bound to Flex Gateway**
- API instance is created with deployment configuration targeting a self-managed Flex Gateway
- The Flex Gateway picks up the configuration automatically

✅ **Managed configuration**
- Policy settings are version-controlled in API Manager
- Configuration can be updated without redeploying the API

## Next Steps

1. **Test the policy**
   - Send test requests to verify the policy is enforcing correctly
   - Check that authorized requests pass and unauthorized ones are blocked

2. **Add more policies**
   - Run this skill again to layer additional policies (e.g., rate limiting + OAuth2)
   - Policy ordering matters — adjust priority in API Manager if needed

3. **Monitor policy activity**
   - Check API Manager analytics for policy enforcement metrics
   - Set up alerts for unusual rejection patterns

## Tips and Best Practices

### Policy Selection
- **Rate Limiting**: Use when you need to control traffic volume per client
- **OAuth 2.0**: Use for token-based authentication and authorization
- **IP Allowlist/Blocklist**: Use to restrict access by network origin
- **Client ID Enforcement**: Use to require registered client applications

### Policy Ordering
- **Authentication policies** should be applied first (lowest order number)
- **Rate limiting** should come after authentication
- **Transformation policies** should be last

### Gateway Compatibility
- Always use `getExchangePolicyTemplates` with `apiInstanceId` to get gateway-compatible templates
- Configuration property names and defaults vary by gateway type (Flex Gateway vs. Mule Gateway)
- The Exchange template version may differ from the generic template version

## Troubleshooting

### Policy Not Enforcing

**Symptoms:** Requests pass through without policy evaluation

**Possible causes:**
- API instance is not deployed or is in an error state
- Policy configuration has a permissive default that allows all traffic
- Policy is applied but not yet propagated (wait 1-2 minutes)

**Solutions:**
- Check API instance status in API Manager
- Review policy configuration for overly permissive settings
- Wait for propagation and retry

### Policy Blocks All Requests

**Symptoms:** All requests return 401 or 403, even legitimate ones

**Possible causes:**
- Policy configuration is too restrictive
- Required credentials are not being sent correctly
- Policy expects headers or parameters in a specific format

**Solutions:**
- Review the policy configuration schema for required fields
- Check that client applications are sending credentials in the expected format
- Temporarily disable the policy to isolate the issue

### 400 Error When Applying Policy

**Symptoms:** `"The policy to be created is missing at least one of the following properties related to the policy template: 'groupId', 'assetId', 'assetVersion'."`

**Possible causes:**
- Used the generic `listOrganizationsPolicytemplates` endpoint which does not return Exchange coordinates

**Solutions:**
- Use `getExchangePolicyTemplates` from `api-portal-xapi` instead — this returns the full Exchange coordinates needed by the apply endpoint

## Related Jobs

- **apply-policy-to-api-instance**: Apply a policy when you already have an API instance (simpler flow)
- **deploy-api-with-rate-limiting**: Deploy an API with pre-configured rate limiting tiers
