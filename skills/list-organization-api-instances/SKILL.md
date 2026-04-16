---
description: List all API Manager instances in an organization environment. Use when
  viewing deployed APIs, checking API status, inventorying API instances, or exploring
  API configurations.
name: list-organization-api-instances
---

# List Organization API Instances

## Overview

Retrieves organization details, lists available environments, and displays all API Manager instances in a selected environment. This workflow provides a complete view of your API inventory.

**What you'll build:** A complete inventory of API instances in your organization environment

## Prerequisites

Before starting, ensure you have:

1. **Authentication** - Valid Anypoint Platform credentials and an active session. Log in to obtain a bearer token:


2. **Permissions** - Read access to API Manager and organization resources

## Step 1: Get Current Organization

Retrieve your current organization details including the organization ID needed for environment and API operations.

**What you'll need:**
- Organization ID (can be obtained from your Anypoint Platform profile)

**Action:** Retrieve your current organization details including the organization ID needed for environment and API operations.

```yaml
api: urn:api:access-management
operationId: getOrganizations
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id
    description: Your organization Business Group GUID
outputs:
- name: organizationId
  path: $.id
  description: Organization ID for use in subsequent steps
```

**What happens next:** The organization ID is captured and will be used to list environments and APIs in the next steps.

## Step 2: List Environments

List all environments in your organization to select the target environment for viewing API instances.

**What you'll need:**
- Organization ID from Step 1

**Action:** List all environments in your organization to select the target environment for viewing API instances.

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
- name: environmentName
  path: $.data[*].name
  description: Selected environment name
```

**What happens next:** You receive a list of environments. Select one to view its API Manager instances in the next step.

## Step 3: List API Manager Instances

Retrieve all API Manager instances deployed in the selected environment.

**What you'll need:**
- Organization ID from Step 1
- Environment ID from Step 2

**Action:** Retrieve all API Manager instances deployed in the selected environment.

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
- name: apiInstances
  path: $.assets
  description: List of API instances in the environment
```

**What happens next:** You receive a complete list of all API instances with their configurations, policies, and status.

## Completion Checklist

- [ ] Retrieved organization details
- [ ] Listed available environments
- [ ] Retrieved all API instances in selected environment

## What You've Built

✅ **API Inventory View** - Complete list of API instances with configurations and status

## Next Steps

1. **Inspect API Details** - Use getOrganizationsEnvironmentsApis to view detailed configuration
2. **Check API Policies** - Use listOrganizationsEnvironmentsApisPolicies to see applied policies
3. **Review API Analytics** - Use API Analytics endpoints to view usage metrics
