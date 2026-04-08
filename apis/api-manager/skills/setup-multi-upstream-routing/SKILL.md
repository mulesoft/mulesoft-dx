---
name: setup-multi-upstream-routing
description: |
  Configures traffic routing across multiple backend services with weighted load
  balancing using Flex Gateway. Enables blue-green deployments, canary releases,
  and high availability. Use when implementing canary deployments, A/B testing,
  traffic splitting, or multi-region routing.
---

# Setup Multi-Upstream Routing

## Overview

Configures traffic routing across multiple backend services (upstreams) with weighted load balancing. This enables advanced deployment patterns like blue-green deployments, canary releases, and high availability architectures using Flex Gateway.

**What you'll build:** An API with intelligent traffic distribution across multiple backend services

## Prerequisites

Before starting, ensure you have:

1. **Authentication and Permissions**
   - Valid Bearer token for Anypoint Platform
   - API Manager permissions
   - Flex Gateway admin permissions

2. **Multiple Backend Services**
   - At least two backend service URLs available
   - Services are accessible from Flex Gateway
   - Services implement the same API contract

3. **Flex Gateway Deployed**
   - Flex Gateway is installed and running
   - Gateway is connected to your environment
   - Gateway can reach all backend services

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

**What happens next:** The search returns a list of assets. You'll select the desired asset, and its groupId, assetId, and version will be used to create the API instance in Step 2.

**Common issues:**
- **No results returned**: Check your search term or omit it to see all available assets
- **Asset not found**: Verify the asset is published to Exchange and you have access permissions

## Step 2: Create API Instance Without Endpoint

Creates an API instance with a null endpoint URI. This is required for multi-upstream routing as it allows manual upstream configuration instead of a single endpoint.

**What you'll need:**
- Organization and environment IDs
- API asset details from Step 1
- Decision to leave endpoint null

**Action:** Create API instance configured for manual upstream routing

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id
    description: Your organization's Business Group GUID

  environmentId:
    from:
      api: urn:api:access-management
      operation: listEnvironments
      field: $.data[*].id
    description: Target environment ID

  spec.groupId:
    from:
      step: Search Assets in Exchange
      output: groupId
    description: Exchange asset group ID from Step 1

  spec.assetId:
    from:
      step: Search Assets in Exchange
      output: assetId
    description: Exchange asset ID from Step 1

  spec.version:
    from:
      step: Search Assets in Exchange
      output: version
    description: Asset version from Step 1

  endpoint.uri:
    value: null
    description: Leave null for manual upstream configuration

  endpoint.proxyUri:
    value: null
    description: Leave null for manual upstream configuration

  endpoint.isCloudHub:
    value: false
    description: Not a CloudHub deployment (using Flex Gateway)

outputs:
  - name: environmentApiId
    path: $.id
    description: API instance ID for upstream configuration
```

**What happens next:** The API instance is created without a specific endpoint, ready for you to configure multiple upstreams. This is the foundation for traffic routing.

**Common issues:**
- **400 Bad Request**: Some configurations don't support null endpoint - verify Flex Gateway is enabled
- **Asset not found**: Ensure asset exists in Exchange and is accessible

## Step 3: Create First Upstream

Adds the first backend service as an upstream. This typically represents your primary or current production service.

**What you'll need:**
- API instance ID from Step 2
- Production backend service URL
- Label to identify this upstream

**Action:** Register the production backend service

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisUpstreams
inputs:
  organizationId:
    from:
      step: Create API Instance Without Endpoint
      input: organizationId
    description: Same organizationId as Step 2

  environmentId:
    from:
      step: Create API Instance Without Endpoint
      input: environmentId
    description: Same environmentId as Step 2

  environmentApiId:
    from:
      step: Create API Instance Without Endpoint
      output: environmentApiId
    description: API instance ID from Step 2

  label:
    value: "Production Service"
    description: Label for the production upstream

  uri:
    userProvided: true
    description: Production backend service URL
    example: "https://api-prod.example.com"
    pattern: "^https?://.+"

outputs:
  - name: upstreamId1
    path: $.id
    description: First upstream ID for routing configuration
```

**What happens next:** The production backend is registered as an upstream. You receive an upstream ID that will be used in the routing configuration.

## Step 4: Create Second Upstream

Adds a second backend service. This could be a canary deployment, new version, failover service, or alternative region.

**What you'll need:**
- API instance ID from Step 2
- Canary/alternative backend service URL
- Label to identify this upstream

**Action:** Register the canary backend service

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisUpstreams
inputs:
  organizationId:
    from:
      step: Create API Instance Without Endpoint
      input: organizationId
    description: Same organizationId as Step 2

  environmentId:
    from:
      step: Create API Instance Without Endpoint
      input: environmentId
    description: Same environmentId as Step 2

  environmentApiId:
    from:
      step: Create API Instance Without Endpoint
      output: environmentApiId
    description: API instance ID from Step 2

  label:
    value: "Canary Service"
    description: Label for the canary upstream

  uri:
    userProvided: true
    description: Canary backend service URL
    example: "https://api-canary.example.com"
    pattern: "^https?://.+"

outputs:
  - name: upstreamId2
    path: $.id
    description: Second upstream ID for routing configuration
```

**What happens next:** The canary backend is registered. Both upstreams are now available, ready for traffic routing configuration.

## Step 5: Configure Routing Rules

Configures the routing rules to distribute traffic between upstreams. This example uses weighted distribution (90% to production, 10% to canary).

**What you'll need:**
- API instance ID from Step 2
- Upstream IDs from Steps 3 and 4
- Traffic distribution weights

**Action:** Set up weighted traffic distribution rules

```yaml
api: urn:api:api-manager
operationId: updateOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      step: Create API Instance Without Endpoint
      input: organizationId
    description: Same organizationId as Step 2

  environmentId:
    from:
      step: Create API Instance Without Endpoint
      input: environmentId
    description: Same environmentId as Step 2

  environmentApiId:
    from:
      step: Create API Instance Without Endpoint
      output: environmentApiId
    description: API instance ID from Step 2

  routing[0].upstream.id:
    from:
      step: Create First Upstream
      output: upstreamId1
    description: Production upstream ID from Step 3

  routing[0].upstream.weight:
    value: 90
    description: Route 90% of traffic to production

  routing[1].upstream.id:
    from:
      step: Create Second Upstream
      output: upstreamId2
    description: Canary upstream ID from Step 4

  routing[1].upstream.weight:
    value: 10
    description: Route 10% of traffic to canary
```

**What happens next:** Traffic is now distributed according to the weights. 90% of requests go to production, 10% to canary. This enables safe testing of the canary version.

**Common issues:**
- **Weights don't add to 100**: Ensure total weight equals 100
- **Routing not taking effect**: May take a few seconds to propagate

## Completion Checklist

After completing all steps, verify:

- [ ] Asset found and selected in Exchange
- [ ] API instance created with null endpoint
- [ ] Production upstream registered successfully
- [ ] Canary upstream registered successfully
- [ ] Routing rules configured with correct weights
- [ ] Test requests reach both upstreams proportionally
- [ ] Monitor traffic distribution metrics
- [ ] Both backends responding correctly

## What You've Built

Your API now has:

✅ **Multi-Upstream Configuration**
- Two backend services registered
- Production service (90% traffic)
- Canary service (10% traffic)

✅ **Intelligent Traffic Routing**
- Weighted load balancing active
- Traffic distributed automatically
- Real-time routing decisions

✅ **Deployment Flexibility**
- Can adjust weights without downtime
- Can add more upstreams as needed
- Foundation for advanced patterns

## Next Steps

Now that multi-upstream routing is configured:

1. **Monitor Traffic Distribution**
   - Check metrics to verify 90/10 split
   - Monitor error rates on both upstreams
   - Track response times separately

2. **Adjust Weights for Canary Progression**
   - Start with 5-10% to canary
   - Gradually increase if stable
   - Roll back to 0% if issues detected
   - Eventually reach 100% for full cutover

3. **Test Failover Scenarios**
   - Simulate production upstream failure
   - Verify traffic shifts to canary
   - Test health check configurations
   - Practice emergency weight adjustments

4. **Add More Advanced Routing** (optional)
   - Path-based routing (route /v2/* differently)
   - Header-based routing (beta users to canary)
   - Geographic routing (route by region)
   - A/B testing with session stickiness

## Tips and Best Practices

### Canary Deployment Strategy
- **Start small**: Begin with 5-10% traffic to canary
- **Monitor closely**: Watch error rates and latency
- **Increase gradually**: Bump in 10-25% increments
- **Have rollback ready**: Can quickly set canary weight to 0

### Traffic Distribution
- **Weights must total 100**: Ensure routing percentages add up correctly
- **Consider session stickiness**: Use consistent routing for user sessions
- **Account for caching**: Client/CDN caching affects actual distribution
- **Monitor both upstreams**: Track metrics separately

### Health Checks
- **Configure health checks**: Automatically remove unhealthy upstreams
- **Set appropriate timeouts**: Balance responsiveness vs false positives
- **Define health criteria**: HTTP 200, response time, custom checks
- **Test failure scenarios**: Verify failover works as expected

## Troubleshooting

### Traffic Not Distributing Correctly

**Symptoms:** All traffic going to one upstream

**Possible causes:**
- Routing rules not applied correctly
- Weights don't add to 100
- One upstream is failing health checks

**Solutions:**
- Verify routing configuration with GET API call
- Check weights sum to 100
- Review health check status for both upstreams
- Check Flex Gateway logs for routing decisions

### Canary Upstream Getting No Traffic

**Symptoms:** Canary weight is 10% but no requests reaching it

**Possible causes:**
- Canary upstream failing health checks
- Canary URI not accessible from Flex Gateway
- Routing rules not saved correctly

**Solutions:**
- Test canary URI accessibility from Flex Gateway
- Check upstream health status
- Verify routing configuration was saved
- Review Flex Gateway connectivity

### Uneven Distribution Despite Equal Weights

**Symptoms:** Traffic not splitting 50/50 with equal weights

**Possible causes:**
- Not enough requests to see even distribution
- Caching affecting distribution
- Long-lived connections to one upstream

**Solutions:**
- Increase test volume for statistical significance
- Clear caches at various levels
- Use connection pooling with shorter timeouts
- Monitor over longer time period

## Related Jobs

- **deploy-api-with-rate-limiting**: Add rate limiting to your multi-upstream API
- **apply-policy-stack**: Apply security policies to the routed API
- **promote-api-between-environments**: Promote routing configuration to production
