---
name: setup-agent-scanner
description: |
  Creates a scanner configuration to discover AI agents from external platforms like AWS Bedrock, Microsoft Copilot, or Google Vertex AI. Use when setting up agent discovery, configuring a new scanner, connecting to cloud AI platforms, or importing agents into Anypoint Exchange.
---

# Set Up an Agent Scanner

## Overview

Creates a complete scanner configuration that can discover and import AI agents from external platforms into Anypoint Exchange. This involves selecting a target system, creating a connection with credentials, and configuring the scanner.

**What you'll build:** A fully configured scanner that can discover AI agents from your chosen cloud platform (AWS Bedrock, Microsoft Copilot, Google Vertex AI, etc.)

## Prerequisites

Before starting, ensure you have:

1. **Anypoint Platform Access**
   - Valid Anypoint Platform account with appropriate permissions
   - Organization ID for your Business Group

2. **Cloud Platform Credentials**
   - Credentials for the external platform you want to scan (e.g., AWS access keys, Azure credentials, Google service account)
   - Network access to the target platform's APIs

3. **Permissions**
   - Permission to create scanner configurations in your organization
   - Permission to store credentials securely

## Step 1: Get Available Target Systems

First, retrieve the list of available target systems to see which platforms you can scan.

**What you'll need:**
- Your organization ID

**Action:** Call the Agent Scanner Configuration API to list available target systems for your organization.

```yaml
api: urn:api:agent-scanner-configuration-service
operationId: getTargetSystems
inputs:
  organizationId:
    from:
      api: urn:api:access-management
      operation: getOrganizations
      field: $.id
      name: currentOrganization
    description: Your organization's Business Group GUID
outputs:
  - name: targetSystemId
    path: $[*].id
    labels: $[*].name
    description: The target system ID to use when creating a connection
  - name: targetSystemType
    path: $[*].type
    description: The target system type (e.g., bedrock, mscopilot, vertex)
```

**What happens next:** You receive a list of available target systems with their IDs, names, and supported authentication schemes. Choose the one matching your cloud platform.

**Common issues:**
- **401 Unauthorized**: Verify your authorization token is valid
- **Empty list**: Your organization may not have access to certain target systems

## Step 2: Create a Connection

Create a connection with credentials to access your chosen target system.

**What you'll need:**
- Target system ID from Step 1
- Authentication credentials for the platform (varies by target system)
- A name for your connection

**Action:** Create a connection with your platform credentials.

```yaml
api: urn:api:agent-scanner-configuration-service
operationId: createConnection
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Same organization ID as Step 1
  requestBody:
    userProvided: true
    description: |
      Connection details including:
      - name: Display name for the connection
      - targetSystemId: ID from Step 1
      - authScheme: Authentication scheme (e.g., "accessKey", "oauth2")
      - authParameters: JSON with credentials (varies by platform)
    example: |
      {
        "name": "My AWS Bedrock Connection",
        "targetSystemId": "uuid-from-step-1",
        "authScheme": "accessKey",
        "authParameters": "{\"accessKeyId\":\"...\",\"secretAccessKey\":\"...\",\"region\":\"us-east-1\"}"
      }
outputs:
  - name: connectionId
    path: $
    description: The UUID of the created connection
```

**What happens next:** The connection is created and stored securely. You'll receive a connection ID to use in the scanner configuration.

**Common issues:**
- **400 Bad Request**: Check that authParameters JSON is valid and contains required fields
- **404 Not Found**: Verify the targetSystemId exists

## Step 3: Create Scanner Configuration

Create the scanner configuration that will use your connection to discover agents.

**What you'll need:**
- Connection ID from Step 2
- A name and schedule for the scanner

**Action:** Create the scanner configuration.

```yaml
api: urn:api:agent-scanner-configuration-service
operationId: createScanConfigurations
inputs:
  organizationId:
    from:
      variable: organizationId
    description: Same organization ID as previous steps
  requestBody:
    userProvided: true
    description: |
      Scanner configuration including:
      - name: Display name for the scanner
      - schedule: JSON schedule configuration
      - runPolicy: JSON run policy (can be empty object)
      - connection: Object with connection details
      - notificationEnabled: Whether to send email notifications
    example: |
      {
        "name": "My Bedrock Agent Scanner",
        "description": "Scans AWS Bedrock for AI agents",
        "schedule": "{\"frequency\":\"daily\",\"time\":\"02:00\"}",
        "runPolicy": "{}",
        "connection": {
          "id": "connection-uuid-from-step-2",
          "targetSystemId": "target-system-uuid-from-step-1"
        },
        "notificationEnabled": false
      }
outputs:
  - name: scannerConfigurationId
    path: $.id
    description: The UUID of the created scanner configuration
  - name: scannerState
    path: $.state
    description: The current state of the scanner (e.g., SCHEDULED, STOPPED)
```

**What happens next:** The scanner configuration is created. Depending on the schedule, it will automatically run at the configured times, or you can trigger it manually.

## Completion Checklist

After completing all steps, verify:

- [ ] Target system was selected from available options
- [ ] Connection was created with valid credentials
- [ ] Scanner configuration was created successfully
- [ ] Scanner state shows as SCHEDULED or STOPPED (ready to run)

## What You've Built

Your scanner configuration now has:

**Connection to External Platform**
- Secure credential storage
- Connection to your chosen cloud platform

**Configured Scanner**
- Named scanner configuration
- Scheduled or manual execution
- Ready to discover AI agents

## Next Steps

Now that your scanner is configured:

1. **Run the scanner manually**
   - Use the "Run Agent Scan and View Results" skill to execute immediately

2. **Monitor scheduled runs**
   - Check the scanner run history for automated executions

3. **Review discovered agents**
   - View staging assets to see discovered AI agents before publication

## Tips and Best Practices

### Security
- **Rotate credentials regularly**: Update connection credentials periodically
- **Use least-privilege access**: Only grant the minimum permissions needed for scanning

### Scheduling
- **Off-peak hours**: Schedule scans during low-traffic periods
- **Frequency**: Daily scans are typically sufficient for most use cases

## Troubleshooting

### Connection Test Fails

**Symptoms:** Connection created but test shows FAILED status

**Possible causes:**
- Invalid credentials
- Network connectivity issues
- Insufficient permissions on the target platform

**Solutions:**
- Verify credentials are correct and not expired
- Check network/firewall rules allow access to the platform APIs
- Ensure the credentials have read access to list agents

### Scanner Configuration Creation Fails

**Symptoms:** 400 Bad Request when creating scanner configuration

**Possible causes:**
- Invalid schedule JSON format
- Missing required fields
- Connection ID doesn't exist

**Solutions:**
- Validate schedule JSON syntax
- Ensure all required fields (name, schedule, runPolicy) are provided
- Verify connection ID from Step 2

## Related Jobs

- **run-agent-scan-and-view-results**: Execute a scan and view discovered agents