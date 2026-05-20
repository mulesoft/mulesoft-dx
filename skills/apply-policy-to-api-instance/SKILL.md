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
      variable: organizationId
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
      variable: organizationId
    description: Organization ID from Step 1
  environmentId:
    from:
      variable: environmentId
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

## Step 4: Browse Exchange Policy Catalog

List all available policy templates from Exchange for your organization. This endpoint returns the full Exchange coordinates (`groupId`, `assetId`, `version`) and gateway-compatible configuration for each template — these are required when applying a policy.

**Important:** Use the `api-portal-xapi` endpoint (`getExchangePolicyTemplates`) instead of the generic `listOrganizationsPolicytemplates` endpoint. The generic endpoint does not return Exchange coordinates or gateway-specific configuration property names, which are required for the apply step.

**What you'll need:**
- Organization ID from Step 1
- Environment ID from Step 2
- The API instance ID from Step 3 (to filter for compatible templates)

**Action:** List Exchange policy templates and select the one to apply. Pass `apiInstanceId` and `environmentId` to filter for templates compatible with your API's gateway type (e.g., Omni Gateway, Mule Gateway).

```yaml
api: urn:api:api-portal-xapi
operationId: getExchangePolicyTemplates
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Organization ID from Step 1
  environmentId:
    from:
      variable: environmentId
    description: Environment ID from Step 2
  apiInstanceId:
    from:
      variable: environmentApiId
    description: API instance ID from Step 3 (filters for compatible templates)
  includeConfiguration:
    value: "true"
    description: Include the configuration schema for each template
  latest:
    value: "true"
    description: Return only the latest version of each template
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

**What happens next:** You have the policy template's Exchange coordinates and its configuration schema with the correct property names for your gateway type. Review the `policyConfiguration` output to understand what settings the policy accepts before applying it. For each configuration property, present the user with the property name, its description, and the default value, then ask if they want to keep the default or provide a custom value. If a property has no default, always ask the user for a value.

**Common issues:**
- **Empty list**: Pass `apiInstanceId` and `environmentId` to get templates compatible with your gateway type. Without these filters, some templates may not appear.
- **Wrong config property names**: Always use the configuration from this endpoint — the generic `listOrganizationsPolicytemplates` endpoint may return different (non-gateway-compatible) property names and defaults. For example, Omni Gateway uses `credentialsOriginHasHttpBasicAuthenticationHeader` while the generic template uses `credentialsOrigin`.

## Step 5: Apply Policy to API Instance

Apply the selected policy to your API instance with the appropriate configuration. Use the Exchange coordinates and configuration property names from Step 4.

**What you'll need:**
- Organization ID, Environment ID, and API instance ID from previous steps
- Policy Exchange coordinates (groupId, assetId, assetVersion) from Step 4
- Policy configuration based on the schema from Step 4's `policyConfiguration` output

**Action:** Apply the policy to your API instance. Build the `configurationData` object using the property names from Step 4's configuration schema. For each configuration property, present the user with the property name, its description, and the default value, then ask if they want to keep the default or provide a custom value. If a property has no default, always ask the user for a value.

```yaml
api: urn:api:api-manager
operationId: createOrganizationsEnvironmentsApisPolicies
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Organization ID from Step 1
  environmentId:
    from:
      variable: environmentId
    description: Environment ID from Step 2
  environmentApiId:
    from:
      variable: environmentApiId
    description: API instance ID from Step 3
  groupId:
    from:
      variable: policyGroupId
    description: Policy Exchange group ID from Step 4
  assetId:
    from:
      variable: policyAssetId
    description: Policy Exchange asset ID from Step 4
  assetVersion:
    from:
      variable: policyAssetVersion
    description: Policy Exchange version from Step 4
outputs:
  - name: policyId
    path: $.id
    description: The ID of the applied policy instance
```

**What happens next:** Your API is now protected with the selected policy. Incoming requests will be evaluated against the policy rules. You can verify by listing the API's applied policies or testing a request.

**Common issues:**
- **400 Bad Request — missing groupId/assetId/assetVersion**: The apply endpoint requires full Exchange coordinates, not just a template ID. Make sure you used `getExchangePolicyTemplates` (Step 4) to get these values.
- **400 Bad Request — invalid configurationData**: The configuration property names differ between gateway types. Use the property names from Step 4's `policyConfiguration` output, not from the generic template endpoint. For example, Omni Gateway uses `credentialsOriginHasHttpBasicAuthenticationHeader` while the generic template uses `credentialsOrigin`.
- **403 Forbidden**: Missing **Manage Policies** permission in this environment.
- **409 Conflict**: A policy of this type may already be applied to the API instance. List existing policies first to check, or add `?allowDuplicated=true` to the request URL to apply a second instance of the same policy type.

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
- API instance is not deployed or is in an error state
- Gateway hasn't picked up the new configuration yet (wait 1-2 minutes)
- Policy configuration has a permissive default that allows all traffic
- Pointcut data excludes the endpoints you're testing

**Solutions:**
- Check API instance status in API Manager
- Wait for propagation and retry
- Review policy configuration for overly permissive settings
- Check `pointcutData` — omit it to apply to all endpoints

### 400 Error When Applying Policy

**Symptoms:** `"The policy to be created is missing at least one of the following properties related to the policy template: 'groupId', 'assetId', 'assetVersion'."`

**Possible causes:**
- Used the generic `listOrganizationsPolicytemplates` endpoint which does not return Exchange coordinates

**Solutions:**
- Use `getExchangePolicyTemplates` from `api-portal-xapi` instead — this returns the full Exchange coordinates needed by the apply endpoint

### Configuration Property Name Mismatch

**Symptoms:** 400 error with invalid `configurationData`

**Possible causes:**
- Used property names from the generic template endpoint instead of the gateway-compatible ones
- Required fields missing in `configurationData`
- Wrong data types (e.g., string instead of integer)

**Solutions:**
- Always use the `configuration` output from `getExchangePolicyTemplates` (Step 4) — it returns gateway-specific property names
- For example, Omni Gateway uses `credentialsOriginHasHttpBasicAuthenticationHeader` while the generic template uses `credentialsOrigin`
- Match field types exactly (numbers, booleans, arrays)
- Only include fields defined in the schema

### Policy Template Not Found

**Symptoms:** Empty results in Step 4

**Possible causes:**
- The API instance's gateway type doesn't support that template
- Missing `apiInstanceId` or `environmentId` filters
- Custom policy template hasn't been published to this organization

**Solutions:**
- Pass both `apiInstanceId` and `environmentId` to filter for compatible templates
- Remove filters to see all templates, then check compatibility manually
- For custom policies, verify the template is published via `listOrganizationsCustompolicytemplates`

## Related Jobs

- **deploy-api-with-rate-limiting** — Full workflow including API creation and tiered rate limiting with OAuth2
- **list-organization-api-instances** — Discover existing API instances across environments
- **manage-consumer-contracts** — Manage client application access after policies are applied
