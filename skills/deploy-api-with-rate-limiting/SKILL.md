---
name: deploy-api-with-rate-limiting
description: |
  Guides through deploying a production-ready API instance with multi-tier rate
  limiting (Bronze/Silver/Gold) and OAuth2 security policies. Use when the user
  wants to deploy an API with rate limits, set up SLA tiers, configure API
  policies, or establish production-ready API security.
---

# Deploy API with Rate Limiting

## Overview

Creates a production-ready API with three rate-limiting tiers and OAuth2 security enforcement. You'll set up Bronze (100 req/min), Silver (500 req/min), and Gold (2000 req/min) tiers, then apply OAuth2 protection to ensure only authenticated requests reach your API.

**What you'll build:** A secured, rate-limited API ready for client registration

## Prerequisites

Before starting this workflow, ensure you have:

1. **Authentication ready**
   - Valid Bearer token for Anypoint Platform
   - API Manager permissions in your organization

2. **Organization access configured**
   - Organization ID (get from `access-management` getOrganizations operation)
   - Environment ID for target deployment (Production, Sandbox, etc.)
   - Run these first if you don't have them yet

3. **API asset published in Exchange**
   - Asset exists with known `groupId`, `assetId`, and `version`
   - Asset is accessible in your organization

4. **Backend service ready**
   - Your API implementation is deployed and accessible
   - You have the endpoint URL (e.g., https://api.example.com)

## Step 1: Create API Instance

Start by creating a new API instance from your Exchange asset. This registers the API with API Manager and gives you an instance ID to configure in subsequent steps.

**What you'll need:**
- Organization ID from access-management
- Target environment ID (where to deploy)
- Your Exchange asset details (groupId, assetId, version)
- Backend implementation URL

**Action:** Call the API Manager to create a new API instance.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id
      name: currentOrganization
    description: Your organization's Business Group GUID
    alternatives:
      - field: $.subOrganizationIds
        description: Or use a sub-organization ID for child business groups

  environmentId:
    from:
      api: urn:api:access-management
      operation: listEnvironments
      field: $.data[*].id
    description: Target environment ID (e.g., Production, Sandbox)

  asset.groupId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id
    description: Organization ID (same as organizationId)

  asset.assetId:
    userProvided: true
    description: Your API asset ID from Exchange
    example: "my-api-v1"

  asset.version:
    userProvided: true
    description: API version from Exchange
    example: "1.0.0"

  endpoint.uri:
    userProvided: true
    description: Your API implementation URL
    example: "https://api.example.com"
    pattern: "^https?://.+"

  endpoint.type:
    value: "rest"
    description: API type (typically "rest")

outputs:
  - name: environmentApiId
    path: $.id
    description: The API instance ID, used in all subsequent steps
```

**What happens next:** You receive an `environmentApiId` that identifies this API instance. Use this ID in all subsequent steps to configure tiers and policies.

**Common issues:**
- **400 Bad Request**: Asset doesn't exist in Exchange or you don't have access
- **403 Forbidden**: Missing API Manager permissions in this environment
- **Invalid endpoint.uri**: Must be a valid HTTP/HTTPS URL

## Step 2: Create Bronze Tier

Create the Bronze tier for free or low-volume consumers. This tier limits requests to 100 per minute, making it suitable for basic access, testing, or free tier customers.

**What you'll need:**
- The organizationId, environmentId, and environmentApiId from Step 1
- Optionally, a description for the tier (user-provided)

**Action:** Create a Bronze tier with 100 requests per minute limit.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisTiers
inputs:
  organizationId:
    from:
      step: Create API Instance
      input: organizationId
    description: Same organizationId as Step 1

  environmentId:
    from:
      step: Create API Instance
      input: environmentId
    description: Same environmentId as Step 1

  environmentApiId:
    from:
      step: Create API Instance
      output: environmentApiId
    description: The API instance ID from Step 1

  name:
    value: "Bronze"
    description: Name for the Bronze tier

  limits[0].maximumRequests:
    value: 100
    description: Maximum requests per time period

  limits[0].timePeriodInMilliseconds:
    value: 60000
    description: Time period in milliseconds (60 seconds = 1 minute)

  description:
    userProvided: true
    required: false
    description: Optional description for the Bronze tier
    example: "Basic tier for free users"

outputs:
  - name: bronzeTierId
    path: $.id
    description: Bronze tier ID for reference
```

**What happens next:** The Bronze tier is created. You can assign client applications to this tier when approving contracts.

**Tips:**
- Test this tier first before creating others to verify rate limiting works
- You can adjust the limit values based on your API's capacity
- Add a clear description to help users understand tier differences

## Step 3: Create Silver Tier

Create the Silver tier for paid subscribers or moderate-volume consumers. This tier allows 500 requests per minute—5x more than Bronze.

**Action:** Create a Silver tier with 500 requests per minute limit.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisTiers
inputs:
  organizationId:
    from:
      step: Create API Instance
      input: organizationId
    description: Same organizationId as Step 1

  environmentId:
    from:
      step: Create API Instance
      input: environmentId
    description: Same environmentId as Step 1

  environmentApiId:
    from:
      step: Create API Instance
      output: environmentApiId
    description: The API instance ID from Step 1

  name:
    value: "Silver"
    description: Name for the Silver tier

  limits[0].maximumRequests:
    value: 500
    description: Maximum requests per time period

  limits[0].timePeriodInMilliseconds:
    value: 60000
    description: Time period in milliseconds (60 seconds = 1 minute)

  description:
    userProvided: true
    required: false
    description: Optional description for the Silver tier
    example: "Standard tier for paid subscribers"

outputs:
  - name: silverTierId
    path: $.id
    description: Silver tier ID
```

**What happens next:** The Silver tier is available for assignment. This is a good default tier for paying customers.

## Step 4: Create Gold Tier

Create the Gold tier for premium or high-volume consumers. This tier allows 2000 requests per minute—20x more than Bronze—suitable for enterprise customers.

**Action:** Create a Gold tier with 2000 requests per minute limit.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisTiers
inputs:
  organizationId:
    from:
      step: Create API Instance
      input: organizationId
    description: Same organizationId as Step 1

  environmentId:
    from:
      step: Create API Instance
      input: environmentId
    description: Same environmentId as Step 1

  environmentApiId:
    from:
      step: Create API Instance
      output: environmentApiId
    description: The API instance ID from Step 1

  name:
    value: "Gold"
    description: Name for the Gold tier

  limits[0].maximumRequests:
    value: 2000
    description: Maximum requests per time period

  limits[0].timePeriodInMilliseconds:
    value: 60000
    description: Time period in milliseconds (60 seconds = 1 minute)

  description:
    userProvided: true
    required: false
    description: Optional description for the Gold tier
    example: "Premium tier for enterprise customers"

outputs:
  - name: goldTierId
    path: $.id
    description: Gold tier ID
```

**What happens next:** All three tiers are now configured. Your API has a complete tier structure for different customer segments.

**Customization ideas:**
- Add a Platinum tier for very high-volume customers (5000+ req/min)
- Create time-based limits (hourly or daily instead of per-minute)
- Set different limits for different API operations (not shown here)

## Step 5: Apply OAuth2 Security Policy

Apply OAuth2 token enforcement to secure your API. Only requests with valid OAuth2 access tokens will be allowed through. Requests without tokens or with invalid tokens will be rejected with 401 Unauthorized.

**What you'll need:**
- The organizationId, environmentId, and environmentApiId from Step 1
- Understanding of OAuth2 scopes your API should enforce

**Action:** Apply the OAuth2 access token enforcement policy.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisPolicies
inputs:
  organizationId:
    from:
      step: Create API Instance
      input: organizationId
    description: Same organizationId as Step 1

  environmentId:
    from:
      step: Create API Instance
      input: environmentId
    description: Same environmentId as Step 1

  environmentApiId:
    from:
      step: Create API Instance
      output: environmentApiId
    description: The API instance ID from Step 1

  policyTemplateId:
    value: "oauth2-access-token-enforcement"
    description: OAuth2 policy template identifier

  configurationData.scopes:
    value: "read write"
    description: OAuth2 scopes to enforce

  configurationData.exposeHeaders:
    value: true
    description: Expose OAuth2 headers in responses

outputs:
  - name: policyId
    path: $.id
    description: Applied policy ID
```

**What happens next:** Your API is now protected by OAuth2. Clients must provide valid access tokens in the Authorization header.

**Security notes:**
- Adjust scopes based on your API's operations (e.g., "read" for read-only endpoints)
- Consider adding IP allowlisting as an additional security layer
- Monitor failed authentication attempts for security insights

## Completion Checklist

After completing all steps, verify your API is properly configured:

- [ ] API instance created and visible in API Manager
- [ ] Bronze tier (100/min) is available
- [ ] Silver tier (500/min) is available
- [ ] Gold tier (2000/min) is available
- [ ] OAuth2 policy is active and enforcing tokens
- [ ] Test with valid token succeeds (200 OK)
- [ ] Test without token fails (401 Unauthorized)
- [ ] Test exceeding rate limit returns 429 Too Many Requests

## What You've Built

Your API now has:

✅ **Three-tier rate limiting structure**
- Bronze: 100 requests/minute (free tier)
- Silver: 500 requests/minute (standard tier)
- Gold: 2000 requests/minute (premium tier)

✅ **OAuth2 security enforcement**
- Only authenticated requests are allowed
- Invalid or missing tokens are rejected
- Scopes control access to operations

✅ **Production-ready configuration**
- Ready for client application registration
- Prepared for contract management
- Monitoring and analytics enabled

## Next Steps

Now that your API is deployed with rate limiting and security:

1. **Register client applications**
   - Use the `manage-consumer-contracts` workflow
   - Approve applications for specific tiers
   - Issue credentials to customers

2. **Configure monitoring**
   - Set up alerts for rate limit breaches
   - Monitor tier usage patterns
   - Track authentication failures

3. **Test the complete flow**
   - Register a test application
   - Obtain OAuth2 tokens
   - Make requests and verify rate limits
   - Test tier upgrades

4. **Document for consumers**
   - Publish tier details and pricing
   - Explain how to obtain tokens
   - Provide example requests

## Tips and Best Practices

### Rate Limit Design
- **Start conservative**: It's easier to increase limits than decrease them
- **Monitor usage**: Track which tiers customers actually need
- **Consider bursting**: Allow short bursts above the limit for better UX
- **Document clearly**: Make tier differences obvious to customers

### Security Best Practices
- **Test OAuth2 thoroughly**: Verify both valid and invalid tokens
- **Add IP allowlisting**: For known partners or internal APIs
- **Rotate credentials**: Implement token expiration and refresh
- **Log security events**: Track authentication failures and anomalies

### Operational Tips
- **Version your API**: Use semantic versioning in Exchange
- **Plan for deprecation**: Have a strategy for retiring old versions
- **Monitor performance**: Rate limiting shouldn't degrade response times
- **Automate tier assignment**: Use contracts API for self-service

## Troubleshooting

### API Creation Fails (400 Bad Request)

**Symptoms:** Step 1 returns 400 error

**Possible causes:**
- Asset doesn't exist in Exchange with the specified groupId/assetId/version
- You don't have access to the asset
- Endpoint URI format is invalid

**Solutions:**
- Verify asset exists: Check Exchange for your organization
- Check access: Ensure you have read permissions on the asset
- Validate URL: Ensure endpoint.uri starts with http:// or https://

### Tier Creation Fails

**Symptoms:** Steps 2-4 return errors

**Possible causes:**
- environmentApiId is incorrect or doesn't exist
- You don't have permissions to create tiers
- Tier name conflicts with existing tier

**Solutions:**
- Verify Step 1 completed successfully
- Check API Manager permissions in your role
- Use unique tier names or delete existing tiers first

### OAuth2 Policy Not Enforcing

**Symptoms:** Requests without tokens are succeeding

**Possible causes:**
- Policy is created but not active
- Policy order is incorrect (OAuth2 should be early)
- Scopes are too permissive

**Solutions:**
- Check policy status in API Manager UI
- Review policy execution order (use updateOrganizationsEnvironmentsApisPolicies)
- Tighten scope requirements

### Rate Limiting Not Working

**Symptoms:** Requests exceed tier limits without 429 errors

**Possible causes:**
- No client contract is assigned to the tier
- Client credentials aren't being sent
- Rate limiting is enforced per-client, not per-API

**Solutions:**
- Create and approve a client contract for the tier
- Verify client_id and client_secret are in requests
- Check that SLA-based policies are applied

## Related Jobs

- **promote-api-between-environments**: Move this API configuration to another environment (Sandbox → Production)
- **manage-consumer-contracts**: Assign clients to tiers and manage access
- **apply-policy-stack**: Add additional security policies (IP allowlist, threat protection)
- **setup-multi-upstream-routing**: Configure advanced traffic routing with multiple backends

## Additional Resources

- **API Manager Documentation**: https://docs.mulesoft.com/api-manager/
- **OAuth2 Policy Guide**: https://docs.mulesoft.com/api-manager/2.x/oauth-2.0-policy
- **Rate Limiting Best Practices**: https://docs.mulesoft.com/api-manager/2.x/rate-limiting-sla-policy

---

**Need help?** If you encounter issues not covered in troubleshooting, check API Manager logs for detailed error messages or consult the MuleSoft support team.
