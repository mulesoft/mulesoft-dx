---
name: manage-consumer-contracts
description: |
  Creates and manages SLA tiers with rate limits, approves client application
  contracts, and upgrades consumers. Demonstrates API monetization and consumer
  lifecycle management. Use when onboarding clients, managing API access, setting
  up SLA tiers, or implementing API monetization strategies.
---

# Manage Consumer Contracts and SLA Tiers

## Overview

Creates SLA tiers with different rate limits, approves client application contracts for specific tiers, and manages the consumer lifecycle including upgrades. This demonstrates API monetization, consumer management, and tiered access control.

**What you'll build:** A complete consumer contract management system with tiered access

## Prerequisites

Before starting, ensure you have:

1. **Authentication and Permissions**
   - Valid Bearer token for Anypoint Platform
   - Manage Contracts permission in API Manager

2. **API with SLA Tiers**
   - API instance already deployed
   - SLA tiers configured (Bronze, Silver, Gold, etc.)
   - Know the API instance ID

3. **Client Application Ready**
   - Client application registered in Exchange or imported
   - Have the application ID
   - Application owner accepts terms of service

## Step 1: List Existing Tiers

Retrieves the list of available SLA tiers for the API. This shows consumers their options and allows you to select the appropriate tier when creating contracts.

**What you'll need:**
- Organization and environment IDs
- API instance ID with configured tiers

**Action:** Retrieve all available SLA tiers

```yaml
api: urn:api:api-manager
operationId: listOrganizationsEnvironmentsApisTiers
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

  environmentApiId:
    userProvided: true
    description: Your API instance ID (with configured tiers)
    example: "12345"

outputs:
  - name: tiers
    path: $.tiers
    description: Available tier IDs and names
```

**What happens next:** You receive a list of all configured SLA tiers with their IDs, names, and rate limit configurations. These tier IDs will be used when creating contracts.

**Common issues:**
- **No tiers found**: API doesn't have any SLA tiers configured - create them first
- **404 Not Found**: API instance ID is incorrect

## Step 2: Create Contract for Bronze Tier

Approves a client application's request to access the API at the Bronze tier level. This creates a binding between the application and the tier, enforcing the tier's rate limits.

**What you'll need:**
- IDs from Step 1
- Client application ID from Exchange
- Bronze tier ID from Step 1

**Action:** Create and approve contract for Bronze tier

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisContracts
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Same organizationId as Step 1

  environmentId:
    from:
      variable: environmentId
    description: Same environmentId as Step 1

  environmentApiId:
    from:
      variable: environmentApiId
    description: Same API instance as Step 1

  applicationId:
    userProvided: true
    description: Client application ID from Exchange
    example: "550e8400-e29b-41d4-a716-446655440000"

  acceptedTerms:
    value: true
    description: Accept API terms and conditions

  requestedTierId:
    from:
      variable: tiers
      field: $[0].id
    description: Bronze tier ID from Step 1 (select appropriate tier from list)

outputs:
  - name: contractId
    path: $.id
    description: Contract ID for this application-tier binding
```

**What happens next:** The contract is created and approved. The client application can now access the API with Bronze tier rate limits enforced.

**Common issues:**
- **Application not found**: Verify application ID exists in Exchange
- **Contract already exists**: Each app can only have one active contract per API
- **Terms not accepted**: Ensure acceptedTerms is set to true

## Step 3: List Active Contracts

Retrieves all active contracts for the API. This allows you to monitor consumer access levels, track contract usage, and identify upgrade opportunities.

**What you'll need:**
- IDs from Step 1

**Action:** Retrieve all active consumer contracts

```yaml
api: urn:api:api-manager
operationId: listOrganizationsEnvironmentsApisContracts
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Same organizationId as Step 1

  environmentId:
    from:
      variable: environmentId
    description: Same environmentId as Step 1

  environmentApiId:
    from:
      variable: environmentApiId
    description: Same API instance as Step 1

outputs:
  - name: activeContracts
    path: $.contracts
    description: List of all active consumer contracts
```

**What happens next:** You receive a complete list of all active contracts, including which applications have access and at what tier level.

## Step 4: Upgrade Contract to Silver Tier

Upgrades an existing contract from Bronze to Silver tier. This increases the consumer's rate limits, typically in response to increased usage needs or upgraded subscription.

**What you'll need:**
- IDs from Step 1
- Contract ID from Step 2
- Silver tier ID from Step 1

**Action:** Upgrade contract to higher tier

```yaml
api: urn:api:api-manager
operationId: updateOrganizationsEnvironmentsApisContracts
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Same organizationId as Step 1

  environmentId:
    from:
      variable: environmentId
    description: Same environmentId as Step 1

  environmentApiId:
    from:
      variable: environmentApiId
    description: Same API instance as Step 1

  contractId:
    from:
      variable: contractId
    description: Contract ID from Step 2

  requestedTierId:
    from:
      variable: tiers
      field: $[1].id
    description: Silver tier ID from Step 1 (select appropriate tier from list)

outputs:
  - name: upgradedContract
    path: $.id
    description: Updated contract with new tier
```

**What happens next:** The contract is updated to Silver tier. The application immediately receives the higher rate limits associated with Silver tier.

**Common issues:**
- **Contract not found**: Verify contract ID is correct
- **Downgrade not allowed**: Some configurations prevent tier downgrades
- **Tier not available**: Ensure target tier exists and is active

## Completion Checklist

After completing all steps, verify:

- [ ] All available tiers listed successfully
- [ ] Contract created for Bronze tier
- [ ] Contract appears in active contracts list
- [ ] Contract upgraded to Silver tier
- [ ] Application can access API with new limits
- [ ] Rate limiting enforces tier correctly
- [ ] Monitor contract usage and billing

## What You've Built

Your consumer management system now has:

✅ **SLA Tier Discovery**
- Complete list of available tiers
- Tier details including rate limits
- Foundation for consumer choice

✅ **Contract Lifecycle Management**
- Created initial Bronze tier contract
- Approved consumer access
- Established application-tier binding

✅ **Contract Monitoring**
- Visibility into all active contracts
- Consumer access levels tracked
- Usage patterns observable

✅ **Tier Upgrade Capability**
- Seamless tier transitions
- Upgraded from Bronze to Silver
- Immediate rate limit changes

## Next Steps

Now that consumer contracts are managed:

1. **Monitor Usage Patterns**
   - Track request volumes per contract
   - Identify consumers approaching limits
   - Detect upgrade opportunities
   - Monitor tier distribution

2. **Implement Automated Upgrades**
   - Set usage thresholds for automatic upgrades
   - Notify consumers before hitting limits
   - Offer upgrade options proactively
   - Create self-service portal

3. **Manage Contract Lifecycle**
   - Review contracts periodically
   - Handle downgrades or cancellations
   - Renew expiring contracts
   - Update tier limits as needed

4. **Integrate with Billing**
   - Connect contract tier to pricing
   - Generate usage-based invoices
   - Track monetization metrics
   - Implement metering and billing

## Tips and Best Practices

### Contract Management
- **Require terms acceptance**: Always set acceptedTerms to true explicitly
- **Document tier differences**: Make tier benefits clear to consumers
- **Provide upgrade path**: Make it easy for consumers to upgrade
- **Track contract metadata**: Store additional context about why tier was chosen

### Tier Design
- **Start with Bronze**: Give new consumers a low-risk entry point
- **Make differences significant**: Ensure tier upgrades provide clear value
- **Price appropriately**: Balance value with rate limit increases
- **Leave room to grow**: Plan for Platinum/Enterprise tiers

### Upgrade Strategy
- **Monitor usage**: Identify consumers approaching their limits
- **Proactive outreach**: Contact consumers before they hit limits
- **Automate where possible**: Implement usage-based automatic upgrades
- **Test tier changes**: Verify new limits work before upgrading production consumers

## Troubleshooting

### Contract Creation Fails

**Symptoms:** Step 2 returns error

**Possible causes:**
- Application ID doesn't exist
- Contract already exists for this application
- Tier ID is invalid
- Terms not accepted

**Solutions:**
- Verify application exists in Exchange
- Check for existing contracts (delete old one first)
- Confirm tier ID from Step 1 is correct
- Ensure acceptedTerms is set to true

### Upgrade Not Taking Effect

**Symptoms:** Contract upgraded but rate limits unchanged

**Possible causes:**
- Policy changes haven't propagated
- Wrong tier ID used
- Contract update didn't save
- Cache invalidation needed

**Solutions:**
- Wait 30-60 seconds for propagation
- Verify tier ID is correct in update
- Check contract status via GET operation
- Clear any API gateway caches

### Consumer Hitting Limits Despite Upgrade

**Symptoms:** 429 errors continue after upgrade

**Possible causes:**
- Using cached credentials
- Multiple applications sharing limits
- Tier configuration incorrect
- Rate limiting not using contract tier

**Solutions:**
- Have consumer obtain fresh credentials
- Verify each app has separate contract
- Check tier rate limit configuration
- Ensure SLA-based rate limiting policy is applied

## Related Jobs

- **deploy-api-with-rate-limiting**: Create the initial tiers
- **apply-policy-stack**: Apply SLA-based rate limiting policies
- **list-organization-apis**: Discover which APIs have contracts
