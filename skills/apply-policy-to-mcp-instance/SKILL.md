---
name: apply-policy-to-mcp-instance
description: |
  Apply a policy to an existing MCP server instance in API Manager. Use when the
  user already has an MCP server registered in API Manager and wants to add a
  security or traffic management policy — such as rate limiting, OAuth2, IP
  allowlisting, or client ID enforcement. Assumes the user is already
  authenticated with a valid Bearer token.
---

# Apply Policy to an MCP Server Instance

## Overview

Applies a policy to an existing MCP server instance in API Manager. Walks through environment selection, locating the MCP server instance, browsing the compatible policy catalog, and applying the chosen policy with its configuration. The MCP server instance in API Manager uses the same instance model as any API — the `environmentApiId` is the identifier you need.

**What you'll build:** A fully configured policy enforced on your MCP server instance

## Prerequisites

Before starting, ensure you have:

1. **Authenticated session**
   - Valid Bearer token for Anypoint Platform. If you only have username/password, call `createLogin` (`POST /accounts/login`) from the `urn:api:access-management` API with body `{"username":"...","password":"..."}` to obtain a Bearer token first.
   - Call `listMe` (`GET /accounts/api/me`) from `urn:api:access-management` to get your organization ID from `$.user.organization.id`
   - API Manager permissions: **View APIs Configuration** and **Manage Policies** scopes

2. **MCP server instance exists**
   - The MCP server is already registered as an API instance in API Manager
   - You know which environment it lives in (or will select it in Step 1)

## Step 1: List Environments

List all environments in the organization so you can select the one where your MCP server instance lives.

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

**What happens next:** Choose the environment that hosts the MCP server instance you want to protect.

## Step 2: List API Instances

Retrieve all API instances in the selected environment. MCP server instances appear alongside other API instances in API Manager — look for the one matching your MCP server by its instance label or asset name.

**Action:** List API instances and select the MCP server.

```yaml
api: urn:api:api-manager
operationId: listOrganizationsEnvironmentsApis
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: listMe
      field: $.user.organization.id
    description: Organization ID
  environmentId:
    from:
      variable: environmentId
    description: Environment ID from Step 1
outputs:
  - name: environmentApiId
    path: $.assets[*].apis[*].id
    labels: $.assets[*].apis[*].instanceLabel
    description: The MCP server instance ID to apply the policy to
```

**What happens next:** Present the API instances to the user and let them select the MCP server instance. Each asset may contain multiple instances (e.g., different versions or labels).

**Tips:**
- Use the `query` parameter to filter by name if the list is large
- The `filters=active` parameter limits results to active instances only

## Step 3: Get Policy Templates

Retrieve Exchange policy templates compatible with the MCP server instance, including their configuration schemas. This returns everything needed to select a template and build its configuration.

**Action:** Fetch policy templates from Exchange with configuration schemas included.

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
  environmentId:
    from:
      variable: environmentId
    description: Environment ID from Step 1
  apiInstanceId:
    from:
      variable: environmentApiId
    description: MCP server instance ID from Step 2 (filters for compatible templates)
  includeConfiguration:
    value: "true"
    description: Include configuration schema for each template
  latest:
    value: "true"
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

## Step 4: Apply the Policy

Apply the configured policy to the MCP server instance. This creates a new policy enforcement — incoming requests will be evaluated against this policy immediately.

**Action:** Create the policy on the MCP server instance. Build the `configurationData` object using the property names from Step 3's configuration schema. For each configuration property, present the user with the property name, its description, and the default value, then ask if they want to keep the default or provide a custom value.

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
      variable: environmentId
    description: Environment ID from Step 1
  environmentApiId:
    from:
      variable: environmentApiId
    description: MCP server instance ID from Step 2
  groupId:
    from:
      variable: policyGroupId
    description: Policy Exchange group ID from Step 3
  assetId:
    from:
      variable: policyAssetId
    description: Policy Exchange asset ID from Step 3
  assetVersion:
    from:
      variable: policyAssetVersion
    description: Policy Exchange version from Step 3
outputs:
  - name: policyId
    path: $.id
    description: The ID of the applied policy instance
```

**What happens next:** The policy is now enforced on the MCP server instance. Incoming requests will be evaluated against this policy.

**Common issues:**
- **400 Bad Request — missing groupId/assetId/assetVersion**: The apply endpoint requires full Exchange coordinates. Make sure you used `getExchangePolicyTemplates` (Step 3) to get these values.
- **400 Bad Request — invalid configurationData**: Use the property names from Step 3's `configurationSchema`, not from the generic template endpoint. Property names differ between gateway types.
- **409 Conflict**: This policy type may already be applied. List existing policies first, or add `?allowDuplicated=true` to apply a second instance.
- **403 Forbidden**: You need **Manage Policies** permission in the target environment.

## Completion Checklist

After completing all steps, verify:

- [ ] Environment selected and MCP server instance identified
- [ ] Policy template chosen from the compatible catalog
- [ ] Configuration built from the template's schema
- [ ] Policy applied successfully (201 response with policy ID)
- [ ] Policy appears in the instance's policy list

## What You've Built

Your MCP server instance is now protected with the selected policy. Incoming traffic is evaluated against the policy rules, and the configuration can be updated without removing and reapplying the policy.

## Next Steps

1. **Verify the policy** — List applied policies with `listOrganizationsEnvironmentsApisPolicies` to confirm it's active and correctly configured.

2. **Test the enforcement** — Send requests to the MCP server and verify the policy behaves as expected (e.g., unauthorized requests are rejected, rate limits are enforced).

3. **Adjust configuration** — Use `patchOrganizationsEnvironmentsApisPolicy` to update configuration without removing the policy.

4. **Apply additional policies** — Repeat this workflow to layer multiple policies (e.g., add rate limiting on top of OAuth2).

## Tips and Best Practices

### Policy Selection
- **Rate Limiting**: Control traffic volume per client
- **OAuth 2.0**: Token-based authentication and authorization
- **IP Allowlist/Blocklist**: Restrict access by network origin
- **Client ID Enforcement**: Require registered client applications

### Policy Ordering
- **Authentication policies** should be applied first (lowest order number)
- **Rate limiting** should come after authentication
- **Transformation policies** should be last

### Configuration
- Always use the configuration property names from `getExchangePolicyTemplates` — they are gateway-specific
- Present each configuration field to the user with its description and default value before applying

## Troubleshooting

### Policy Not Enforcing After Apply

**Symptoms:** Requests pass through without policy evaluation

**Possible causes:**
- Gateway hasn't picked up the new configuration yet
- Policy is applied but disabled
- Pointcut data excludes the endpoints you're testing

**Solutions:**
- Wait a few seconds for gateway sync
- Verify the policy is not disabled via `getOrganizationsEnvironmentsApisPolicies`
- Omit `pointcutData` to apply to all endpoints

### Configuration Schema Mismatch

**Symptoms:** 400 error when applying the policy

**Possible causes:**
- Required fields missing in `configurationData`
- Wrong data types (e.g., string instead of integer)
- Unknown fields not in the schema

**Solutions:**
- Re-read the template's `configuration` from Step 3
- Match field types exactly (numbers, booleans, arrays)
- Only include fields defined in the schema

### Policy Template Not Found

**Symptoms:** Empty results in Step 3

**Possible causes:**
- The instance's gateway type doesn't support that template
- Custom policy template hasn't been published to this organization

**Solutions:**
- Remove the `apiInstanceId` filter to see all templates, then check compatibility manually
- For custom policies, verify the template is published via `listOrganizationsCustompolicytemplates`

## Related Jobs

- **protect-mcp-server-with-policies**: Full workflow from finding/publishing an MCP server to deploying and applying policies
- **protect-api-with-policies**: The equivalent full workflow for standard APIs
- **apply-policy-to-api-instance**: The equivalent skill for standard API instances
