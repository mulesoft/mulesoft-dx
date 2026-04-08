---
name: deploy-api-with-flex-gateway-from-exchange
description: |
  Deploy an API instance to Flex Gateway by searching for assets in Exchange,
  discovering available gateway targets, and creating the API with deployed status.
  Use when deploying APIs to Flex Gateway, setting up API instances from Exchange,
  or connecting Exchange assets to standalone gateways.
---

# Deploy API with Flex Gateway from Exchange

## Overview

Deploys an API instance to a Flex Gateway by searching and selecting an asset from Exchange, discovering available Flex Gateway targets in your environment, and creating the API instance in API Manager with deployed status pointing to the selected asset and gateway target.

**What you'll build:** A fully deployed API instance connected to your Flex Gateway, ready to receive traffic

## Prerequisites

Before starting, ensure you have:

1. **Authentication**
   - Valid Bearer token for Anypoint Platform
   - Permissions in Exchange, API Manager, and Access Management

2. **Resources**
   - At least one API asset published in Exchange
   - Flex Gateway deployed and registered in standalone mode
   - Target environment configured (e.g., Production, Sandbox)

## Step 1: Search Assets in Exchange

Start by searching for available assets in Exchange to find the one you want to deploy.

**What you'll need:**
- Optional search criteria to filter assets
- Knowledge of the asset name or identifier

**Action:** Search Exchange assets to locate your API and select it.

```yaml
api: urn:api:exchange-experience
operationId: getAssetsSearch
inputs:
  search:
    userProvided: true
    description: Search term to filter assets (optional)
    example: customer-api
    required: false
  limit:
    userProvided: true
    description: Number of results to return
    example: '50'
    required: false
  types:
    value: rest-api
    description: Filter results to REST API assets only
  rootOrganizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id
    description: Organization ID of the logged-in user, used to scope the asset search
outputs:
- name: groupId
  path: $[*].groupId
  description: Exchange asset group ID (organization ID) for API creation
- name: assetId
  path: $[*].assetId
  description: Exchange asset ID for API creation
- name: version
  path: $[*].version
  description: Asset version for API creation
```

**What happens next:** The search returns a list of assets. You'll select the desired asset, and its groupId, assetId, and version will be used to create the API instance in Step 3.

**Common issues:**
- **No results returned**: Check your search term or omit it to see all available assets
- **Asset not found**: Verify the asset is published to Exchange and you have access permissions

## Step 2: List Flex Gateway Targets

Retrieve the list of available Flex Gateway targets in your environment.

**What you'll need:**
- Organization ID (automatically retrieved from Access Management)
- Environment ID for your target environment

**Action:** List all Flex Gateways available in the environment.

```yaml
api: urn:api:flex-gateway-manager
operationId: getOrganizationsByOrganizationidEnvironmentsByEnvironmentidGateways
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id
    description: Organization Business Group GUID
  environmentId:
    from:
      api: urn:api:access-management
      operation: listEnvironments
      field: $.data[*].id
    description: Target environment ID (e.g., Production, Sandbox)
outputs:
- name: targetId
  path: $.data[0].id
  description: Flex Gateway target ID for API deployment
```

**What happens next:** The gateway list is returned with available targets. The first gateway's ID is captured as the deployment target for Step 3.

**Common issues:**
- **No gateways found**: Ensure Flex Gateway is deployed and registered in standalone mode for this environment
- **Gateway offline**: Verify the gateway status is "Connected" before proceeding

## Step 3: Create API in API Manager

Create the API instance in API Manager pointing to the Exchange asset and Flex Gateway target, with deployed status.

**What you'll need:**
- Asset details from Step 1 (groupId, assetId, version)
- Gateway target ID from Step 2
- Backend implementation URI (where your API is actually running)
- Proxy URI (the endpoint that will be exposed to consumers)

**Action:** Create the API instance with deployed status.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      step: List Flex Gateway Targets
      input: organizationId
    description: Same organization ID from Step 2
  environmentId:
    from:
      step: List Flex Gateway Targets
      input: environmentId
    description: Same environment ID from Step 2
  spec.groupId:
    from:
      step: Search Assets in Exchange
      output: groupId
    description: Asset group ID from Step 1
  spec.assetId:
    from:
      step: Search Assets in Exchange
      output: assetId
    description: Asset ID from Step 1
  spec.version:
    from:
      step: Search Assets in Exchange
      output: version
    description: Asset version from Step 1
  endpoint.deploymentType:
    value: HY
    description: Deployment type for Flex Gateway (Hybrid)
  endpoint.type:
    value: http
    description: Endpoint type
  endpoint.uri:
    userProvided: true
    description: Backend implementation URI where the API is deployed
    example: http://backend.example.com/api
  endpoint.proxyUri:
    userProvided: true
    description: Proxy endpoint URI exposed to consumers
    example: http://proxy.example.com/api
  endpoint.mTLS.enabled:
    value: false
    description: Mutual TLS not enabled by default
  endpoint.targetId:
    from:
      step: List Flex Gateway Targets
      output: targetId
    description: Flex Gateway target ID from Step 2
  deployment.expectedStatus:
    value: deployed
    description: Set expected status to deployed
outputs:
- name: environmentApiId
  path: $.id
  description: Created API instance ID
- name: autodiscoveryInstanceName
  path: $.autodiscoveryInstanceName
  description: Autodiscovery instance name for Mule applications
```

**What happens next:** Your API is now created in API Manager with deployed status, connected to the Flex Gateway, and ready to route traffic from the proxy URI to your backend implementation.

**Common issues:**
- **400 Bad Request - Asset not found**: Verify the groupId, assetId, and version match an existing Exchange asset
- **404 - Target not found**: Ensure the targetId is valid and the gateway is still registered
- **Validation error - Invalid URI**: Check that both endpoint.uri and endpoint.proxyUri are valid HTTP/HTTPS URLs

## Completion Checklist

- [ ] Asset found and selected in Exchange
- [ ] Flex Gateway target identified in environment
- [ ] API instance created in API Manager
- [ ] API status shows as "Deployed"
- [ ] Proxy URI is accessible

## What You've Built

✅ **API Deployment**
- Connected Exchange asset to API Manager
- Configured Flex Gateway as the deployment target
- Set expected status to deployed for automatic traffic routing
- API is ready to receive traffic through the proxy URI

## Next Steps

1. **Test the API**
   - Send a test request to the proxy URI
   - Verify the request routes through the Flex Gateway to your backend
   - Check API Manager analytics for request logs

2. **Apply Security Policies**
   - Add OAuth 2.0 or JWT validation for authentication
   - Configure rate limiting to protect your backend
   - Set up IP allowlisting if needed

3. **Configure SLA Tiers** (Optional)
   - Create tiered access levels (Bronze, Silver, Gold)
   - Set different rate limits per tier
   - Enable API contracts for consumer management

## Tips and Best Practices

### Gateway Selection
- **High Availability**: Deploy multiple Flex Gateways and use a load balancer for the proxy URI
- **Environment Isolation**: Use separate gateways for production and non-production environments
- **Version Strategy**: Consider using different gateway targets for API versions

### Endpoint Configuration
- **Backend URI**: Should point to your actual API implementation (can be on-premises or cloud)
- **Proxy URI**: Should be the public-facing URL that consumers use
- **mTLS**: Enable mutual TLS (mTLS) for enhanced security on sensitive APIs

### Deployment Status
- **deployed**: API is active and routing traffic
- **undeployed**: API is created but not accepting traffic
- **deploying**: Transitional state during deployment

## Troubleshooting

### Gateway Not Showing in List

**Symptoms:** Step 2 returns empty array or gateway not visible

**Possible causes:**
- Gateway not registered in the selected environment
- Gateway running in Connected mode instead of standalone
- Insufficient permissions to view gateways

**Solutions:**
- Verify gateway registration: Check Flex Gateway Manager UI
- Confirm gateway mode: Ensure it's running in standalone mode
- Check permissions: Verify you have "API Manager Environment Administrator" role

### API Creation Fails with Asset Error

**Symptoms:** Step 3 returns 400 Bad Request with "Asset not found"

**Possible causes:**
- Asset is not published or has been deleted
- Incorrect groupId, assetId, or version
- Asset is in a different organization

**Solutions:**
- Verify asset exists in Exchange UI
- Double-check the asset details from Step 1 output
- Ensure you're using the correct organization context

### Deployed Status Not Updating

**Symptoms:** API created but status remains "undeployed"

**Possible causes:**
- Flex Gateway is offline or disconnected
- Gateway target configuration mismatch
- Network connectivity issues between gateway and API Manager

**Solutions:**
- Check gateway connection status in Flex Gateway Manager
- Verify targetId matches an active, connected gateway
- Review gateway logs for connectivity errors

## Related Jobs

- **apply-policy-stack**: Add security policies to your deployed API
- **setup-multi-upstream-routing**: Configure multiple backend targets for load balancing
- **manage-consumer-contracts**: Set up SLA tiers and consumer access controls
