---
name: apply-policy-to-api-instance
description: |
  Apply a policy to an existing API Manager instance. Use when the user wants to
  add a policy, enforce security, configure rate limiting, apply OAuth2, set up
  IP allowlisting, or protect an API with any policy template from the catalog.
---

# Apply Policy to an API Instance

## Overview

Applies a policy to an API Manager instance by walking through organization and environment selection, picking the target API, browsing the available policy template catalog, configuring the policy using its JSON schema, and finally enforcing it on the API. The workflow ensures you select only templates compatible with your API instance and that the configuration matches the template's schema before applying.

**What you'll build:** A fully configured policy enforced on your chosen API instance

## Prerequisites

Before starting this workflow, ensure you have:

1. **Authentication ready**
   - Valid Bearer token for Anypoint Platform
   - API Manager permissions: **View APIs Configuration** and **Manage Policies** scopes

2. **Organization access**
   - The target API instance is already deployed in API Manager

## Step 1: Get Current Organization

Retrieve the caller's profile to discover the root organization automatically. No parameters needed — the Bearer token identifies the user and returns their organization details, including any child Business Groups (sub-organizations).

**What you'll need:**
- A valid Bearer token (authentication header)

**Action:** Call the `/me` endpoint to get the current user's organization.

```yaml
api: urn:api:access-management
operationId: listMe
inputs: {}
outputs:
  - name: organizationId
    path: $.user.organization.id
    description: Root organization Business Group GUID
  - name: organizationName
    path: $.user.organization.name
    description: Organization display name
```

**What happens next:** You have the root organization ID derived from your credentials. If your account has sub-organizations (child Business Groups), use `getOrganizations` with this ID to list them and pick the right scope before continuing.

## Step 2: List Environments

List all environments in the organization so you can select the one where your target API instance lives (e.g., Production, Sandbox).

**What you'll need:**
- Organization ID from Step 1

**Action:** List available environments and select the target.

```yaml
api: urn:api:access-management
operationId: listEnvironments
inputs:
  organizationId:
    from:
      step: Get Current Organization
      input: organizationId
    description: Organization ID from Step 1
outputs:
  - name: environmentId
    path: $.data[*].id
    labels: $.data[*].name
    description: Selected environment ID
```

**What happens next:** Choose the environment that hosts the API instance you want to protect. The environment ID is required by API Manager in all remaining steps.

## Step 3: List API Instances

Retrieve all API instances in the selected environment. Each entry represents a managed API registered in API Manager — this is the target you will apply the policy to.

**What you'll need:**
- Organization ID from Step 1
- Environment ID from Step 2

**Action:** List API instances and let the user pick one.

```yaml
api: urn:api:api-manager
operationId: listOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      step: Get Current Organization
      input: organizationId
    description: Organization ID from Step 1
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
outputs:
  - name: environmentApiId
    path: $.assets[*].apis[*].id
    labels: $.assets[*].apis[*].instanceLabel
    description: The API instance ID to apply the policy to
```

**What happens next:** Present the API instances to the user. Each asset may contain multiple instances (e.g., different versions or labels). The user selects the specific `environmentApiId` to target.

**Tips:**
- Use the `query` parameter to filter by name if the list is large
- The `filters=active` parameter limits results to active instances only

## Step 4: Get Policy Templates with Configuration

Retrieve Exchange policy templates applicable to the selected API instance, including their configuration schemas. This single call replaces the need to list templates and then fetch each template's details separately — it returns everything needed to select a template and build its configuration.

**What you'll need:**
- Organization ID from Step 1
- Environment ID from Step 2
- The API instance ID from Step 3 (used as compatibility filter)

**Action:** Fetch policy templates from Exchange with configuration schemas included.

```yaml
api: urn:api:api-portal-xapi
operationId: getExchangePolicyTemplates
inputs:
  organizationId:
    from:
      step: Get Current Organization
      input: organizationId
    description: Organization ID from Step 1
  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2
  apiInstanceId:
    from:
      step: List API Instances
      output: environmentApiId
    description: Filters templates to those compatible with this API instance
  includeConfiguration:
    value: true
    description: Include configuration schema for each template
  latest:
    value: true
    description: Return only the latest version of each template
outputs:
  - name: policyGroupId
    path: $[*].groupId
    description: Exchange groupId of the selected policy template
  - name: policyAssetId
    path: $[*].assetId
    labels: $[*].name
    description: Exchange assetId of the selected policy template
  - name: policyAssetVersion
    path: $[*].assetVersion
    description: Version of the selected policy template
  - name: configurationSchema
    path: $[*].configuration
    description: Configuration schema defining the policy's configurable parameters
```

**What happens next:** Present the list of compatible policy templates to the user. Common templates include Rate Limiting, Client ID Enforcement, OAuth2 token enforcement, IP allowlist, header injection, and CORS. Once the user selects a template, parse its `configurationSchema` to understand what parameters are needed. Present each field with its type, description, default value, and constraints. Build the `configurationData` object from the user's answers.

**Important:** The configuration schema varies per policy. For example:
- **Rate Limiting** needs `rateLimits` (requests per time period)
- **Client ID Enforcement** needs `credentialsOrigin` and optional expressions
- **IP Allowlist** needs a list of allowed IP ranges
- **Header Injection** needs inbound/outbound header key-value pairs

## Step 5: Apply the Policy

Apply the configured policy to the API instance. This creates a new policy enforcement on the API — incoming requests will be evaluated against this policy immediately (or after the next deployment, depending on gateway type).

**What you'll need:**
- Organization ID, Environment ID, and API instance ID from previous steps
- Policy Exchange coordinates (groupId, assetId, version) from Step 4
- Configuration data built from the schema in Step 4

**Action:** Create the policy on the API instance.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisPolicies
inputs:
  organizationId:
    from:
      step: Get Current Organization
      input: organizationId
    description: Organization ID from Step 1

  environmentId:
    from:
      step: List Environments
      output: environmentId
    description: Environment ID from Step 2

  environmentApiId:
    from:
      step: List API Instances
      output: environmentApiId
    description: API instance ID from Step 3

  groupId:
    from:
      step: Get Policy Templates with Configuration
      output: policyGroupId
    description: Exchange groupId of the policy asset

  assetId:
    from:
      step: Get Policy Templates with Configuration
      output: policyAssetId
    description: Exchange assetId of the policy asset

  assetVersion:
    from:
      step: Get Policy Templates with Configuration
      output: policyAssetVersion
    description: Version of the policy asset

  configurationData:
    userProvided: true
    description: Policy configuration object built from the template's configuration schema (Step 4)
    example:
      rateLimits:
        - maximumRequests: 100
          timePeriodInMilliseconds: 60000

  pointcutData:
    userProvided: true
    required: false
    description: Optional array of method/URI regex filters to restrict which endpoints the policy applies to
    example:
      - methodRegex: "GET|POST"
        uriTemplateRegex: "/api/v1/.*"

outputs:
  - name: policyId
    path: $.id
    description: The ID of the newly applied policy
```

**What happens next:** The policy is now enforced on the API instance. Incoming requests will be evaluated against this policy. You can verify by listing the API's applied policies or testing a request.

**Common issues:**
- **400 Bad Request**: `configurationData` doesn't match the template's schema — re-check required fields and types
- **403 Forbidden**: Missing **Manage Policies** permission in this environment
- **409 Conflict**: This policy template is already applied to the API — update the existing policy instead

## Completion Checklist

After completing all steps, verify the policy is properly applied:

- [ ] Organization and environment selected
- [ ] Target API instance identified
- [ ] Policy template chosen from compatible catalog
- [ ] Configuration built from the template's JSON schema
- [ ] Policy applied successfully (201 response with policy ID)
- [ ] Verify policy appears in the API's policy list

## What You've Built

✅ **Policy Enforcement** — The selected policy template is now active on your API instance, configured with the parameters you provided. Incoming traffic is evaluated against this policy.

## Next Steps

1. **Verify the policy** — List applied policies with `listOrganizationsEnvironmentsApisPolicies` to confirm it's active and correctly configured.

2. **Test the enforcement** — Send requests to the API and verify the policy behaves as expected (e.g., unauthorized requests are rejected, rate limits are enforced).

3. **Adjust configuration** — Use `patchOrganizationsEnvironmentsApisPolicy` to update configuration without removing the policy.

4. **Apply additional policies** — Repeat this workflow to layer multiple policies (e.g., add rate limiting on top of OAuth2). Use `updateOrganizationsEnvironmentsApisPoliciesBulk` to control execution order.

5. **Consider automated policies** — If you want this policy applied to all APIs in the organization automatically, explore `createOrganizationsAutomatedpolicies`.

## Troubleshooting

### Policy Not Enforcing After Apply

**Symptoms:** Requests pass through without policy evaluation

**Possible causes:**
- Gateway hasn't picked up the new configuration yet
- Policy is applied but disabled
- Pointcut data excludes the endpoints you're testing

**Solutions:**
- Wait a few seconds for gateway sync, or redeploy the API
- Verify the policy is not disabled via `getOrganizationsEnvironmentsApisPolicies`
- Check `pointcutData` — omit it to apply to all endpoints

### Configuration Schema Mismatch

**Symptoms:** 400 error when applying the policy

**Possible causes:**
- Required fields missing in `configurationData`
- Wrong data types (e.g., string instead of integer)
- Unknown fields not in the schema

**Solutions:**
- Re-read the template's `configuration` from Step 4
- Match field types exactly (numbers, booleans, arrays)
- Only include fields defined in the schema

### Policy Template Not Found

**Symptoms:** Empty results in Step 4

**Possible causes:**
- The API instance's gateway type doesn't support that template
- Custom policy template hasn't been published to this organization
- Version filter is too restrictive

**Solutions:**
- Remove the `apiInstanceId` filter to see all templates, then check compatibility manually
- For custom policies, verify the template is published via `listOrganizationsCustompolicytemplates`
- Try without the `version` parameter

## Related Jobs

- **deploy-api-with-rate-limiting** — Full workflow including API creation and tiered rate limiting with OAuth2
- **list-organization-api-instances** — Discover existing API instances across environments
- **manage-consumer-contracts** — Manage client application access after policies are applied
