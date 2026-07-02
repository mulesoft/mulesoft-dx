# V1 Example: customer-onboarding-v1

This is the canonical V1 input that the V2 example was translated from. Use this together with `v2-example.md` to understand the exact field-by-field mapping.

## Folder structure

```
customer-onboarding-v1/
├── agent-network.yaml
└── exchange.json
```

(IDE folders like `.mvn`, `.vscode`, `.cursor`, `target/` are ignored during conversion — they are not part of the project spec.)

## agent-network.yaml

```yaml
schemaVersion: 1.0.0
label: Customer Onboarding Network Test

brokers:
  CustomerOnboardingBrokerTest:
    card:
      protocolVersion: 0.3.0
      name: Customer Onboarding Assistant Test
      description: A simplified test broker for customer onboarding coordinating Workday, Salesforce, Zendesk, Badging, License Procurement, and IT systems.
      url: ${ingressgw.url}/CustomerOnboardingBrokerTest
      capabilities:
        pushNotifications: true
      version: 1.0.0
      securitySchemes: {}
      defaultInputModes:
        - application/json
        - text/plain
      defaultOutputModes:
        - application/json
        - text/plain
      skills:
        - id: OnboardingSkillTest
          name: Customer Onboarding Test
          description: This agent orchestrates customer onboarding across multiple systems using Gemini 2.5 Flash.
          examples:
            - Onboard a new customer named Alex Smith with email alex.smith@example.com
          inputModes:
            - application/json
            - text/plain
          outputModes:
            - application/json
            - text/plain
          tags: ['onboarding', 'test', 'gemini']
    spec:
      llm:
        ref:
          name: CustomerGeminiLlmTest
        configuration:
          model: gemini-3-flash-preview

      instructions:
        - |
          You are the Customer Onboarding Orchestrator. Coordinate onboarding of a new customer across the systems needed for day-to-day work.
            ## The process for onboarding an customer is:
          - Onboard in Workday: Create the new-hire record. Fetch the address using available tools and do not ask for it unless you are not sure how to get it.
          - Onboard in Salesforce: create the customer's CRM profile in Salesforce.
          - Since this a long running task send a slack update using tool SlackMcpServer.send_status_update to update the status of actions taken so far. It should be a human readable summary something like {
          {
          "message": "Workday and Salesforce onboarding completed and working on next steps....",
          "contextId": "<fetch-the-context-id-from-input>"
          }
          - Request customer laptop: submit a laptop request in Zendesk.
          - Request customer badge: initiate the customer badge request.
          - Procure software licenses: request necessary software licenses for the new customer using the License Procurement Agent.
          - send a slack update using tool SlackMcpServer.send_status_update to update the status of actions taken so far. It should be a human readable summary something like {
          {
          "message": "Zendesk, Badge, and License procurement completed and working on next steps....",
          "contextId": "<fetch-the-context-id-from-input>"
          }
          - IT system setup: provision the ping id system for the customer.
          ## Final Response
          - Return a plain-text human readable summary of the actions taken representing all the steps not just the final step. Format it using bullet points. DO NOT include any tool name in the summary

      links:
        - agent:
            ref:
              name: WorkdayAgentTest
        - agent:
            ref:
              name: SalesforceAgentTest
        - agent:
            ref:
              name: ZendeskAgentTest
        - agent:
            ref:
              name: BadgingAgentTest
        - agent:
            ref:
              name: ItAgentTest
        - agent:
            ref:
              name: LicenseProcurementAgent

      tools:
        - mcp:
            ref:
              name: CustomerTalentPoolMcp
            allowed:
              - TalentPoolMcpServer.match_email_to_address
        - mcp:
            ref:
              name: CustomerSlackMcp
            allowed:
              - SlackMcpServer.send_status_update

agents:
  WorkdayAgentTest:
    label: Workday Agent Test
    metadata:
      protocol: a2a
      platform: Workday
  SalesforceAgentTest:
    label: Salesforce Agent Test
    metadata:
      protocol: a2a
      platform: Salesforce
  ZendeskAgentTest:
    label: Zendesk Agent Test
    metadata:
      protocol: a2a
      platform: Zendesk
  BadgingAgentTest:
    label: Badging Agent Test
    metadata:
      protocol: a2a
      platform: badging
  ItAgentTest:
    label: IT Agent Test
    metadata:
      protocol: a2a
      platform: IT
  LicenseProcurementAgent:
    label: License Procurement Agent
    metadata:
      protocol: a2a
      platform: License

mcpServers:
  CustomerTalentPoolMcp:
    label: Customer Talent Pool MCP Server
    metadata:
      transport:
        kind: streamableHttp
        path: /mcp
  CustomerSlackMcp:
    label: Customer Slack MCP Server
    metadata:
      transport:
        kind: streamableHttp
        path: /mcp

llmProviders:
  CustomerGeminiLlmTest:
    label: Customer Gemini 2.5 Flash Test
    description: Google Gemini 2.5 Flash Provider for Testing
    metadata:
      platform: Gemini

connections:
  WorkdayAgentTestConnection:
    kind: agent
    ref:
      name: WorkdayAgentTest
    spec:
      url: https://example.com/workday-agent/
  SalesforceAgentTestConnection:
    kind: agent
    ref:
      name: SalesforceAgentTest
    spec:
      url: https://example.com/salesforce-agent/
  ZendeskAgentTestConnection:
    kind: agent
    ref:
      name: ZendeskAgentTest
    spec:
      url: https://example.com/zendesk-agent/
  BadgingAgentTestConnection:
    kind: agent
    ref:
      name: BadgingAgentTest
    spec:
      url: https://example.com/badging-agent/
  ItAgentTestConnection:
    kind: agent
    ref:
      name: ItAgentTest
    spec:
      url: https://example.com/it-agent/
  LicenseProcurementAgentConnection:
    kind: agent
    ref:
      name: LicenseProcurementAgent
    spec:
      url: https://example.com/license-procurement-agent/
  CustomerGeminiLlmTestConnection:
    kind: llm
    ref:
      name: CustomerGeminiLlmTest
    spec:
      url: https://generativelanguage.googleapis.com
      configuration:
        apiKey: ${gemini.apiKey}
        timeout: 600000
  CustomerTalentPoolMcpConnection:
    kind: mcp
    ref:
      name: CustomerTalentPoolMcp
    spec:
      url: https://example.com/talent-pool-mcp/
  CustomerSlackMcpConnection:
    kind: mcp
    ref:
      name: CustomerSlackMcp
    spec:
      url: https://example.com/slack-mcp/
```

## exchange.json

```json
{
  "main": "agent-network.yaml",
  "name": "prod-customerOnboardGemini",
  "classifier": "agent-network",
  "organizationId": "00000000-0000-0000-0000-000000000000",
  "descriptorVersion": "1.0.0",
  "tags": [],
  "metadata": {
    "variables": {
      "gemini": {
        "apiKey": {
          "description": "Customer Gemini API key",
          "default": "REPLACE_WITH_YOUR_GEMINI_API_KEY"
        },
        "modelName": {
          "description": "Customer Gemini LLM Model Name",
          "default": "gemini-3-flash-preview",
          "secret": false
        }
      }
    }
  },
  "dependencies": [],
  "groupId": "00000000-0000-0000-0000-000000000000",
  "assetId": "prod-customeronboardgemini",
  "version": "1.0.1"
}
```

## Key V1 markers

These are the things that uniquely identify a V1 project:

- `schemaVersion: 1.0.0` at the top of `agent-network.yaml`
- `"classifier": "agent-network"` in `exchange.json` (V2 changes this to `"agentic-network"`)
- The orchestrator's prompt lives in `brokers.<id>.spec.instructions` (a YAML list of strings)
- Connection URLs live under `spec.url` (V2 promotes them to top-level `url`)
- Connection `kind: agent` for A2A connections (V2 uses `kind: a2a`)
- Top-level sections: `schemaVersion`, `label`, `brokers`, `agents`, `mcpServers`, `llmProviders`, `connections`
