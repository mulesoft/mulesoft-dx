# V2 Example: customer-onboarding-v2 (GA)

This is the canonical V2 (GA, A2A v1.0) output for the V1 input shown in `v1-example.md`. Mirror this style and structure when generating V2 projects.

V1 was A2A v0.3-based, so V1 agents convert into the `metadata.interfaces.a2a_v03` branch (the GA back-compat path). The broker itself is A2A v1.0 (`brokers.<id>.interfaces.a2a`). If the user later migrates an external agent to v1.0, switch that agent to the `a2a` branch.

## Folder structure

```
customer-onboarding-v2/
├── agent-network.yaml
├── exchange.json
└── brokers/
    └── customer-onboarding.agent
```

## agent-network.yaml

```yaml
agentNetwork: 2.0.0
info:
  label: "Customer Onboarding Agent Network"
  version: 1.0.0
  description: |
    Customer onboarding network (2.0). Coordinates onboarding of a new customer
    across Workday, Salesforce, Zendesk, Badging, License Procurement, and IT
    systems using Gemini, with status updates posted via Slack.
  tags:
    - customer-onboarding
    - multi-agent
    - gemini

registry:
  agents:
    workdayAgent:
      info:
        label: Workday Agent
        description: Creates the new-hire / customer record in Workday.
      metadata:
        platform: Workday
        interfaces:
          a2a_v03:
            card:
              name: Workday Agent
              description: Creates the new-hire / customer record in Workday.
              url: ${workdayAgent.url}
              protocolVersion: 0.3.0
              version: 1.0.0
              capabilities:
                pushNotifications: false
              defaultInputModes:
                - application/json
                - text/plain
              defaultOutputModes:
                - application/json
                - text/plain
              skills:
                - id: workday-create-record
                  name: Create Workday Record
                  description: Creates the new-hire / customer record in Workday.
                  tags:
                    - workday
                    - onboarding
                  inputModes:
                    - application/json
                    - text/plain
                  outputModes:
                    - application/json
                    - text/plain
    salesforceAgent:
      info:
        label: Salesforce Agent
        description: Creates the customer's CRM profile in Salesforce.
      metadata:
        platform: Salesforce
        interfaces:
          a2a_v03:
            card:
              name: Salesforce Agent
              description: Creates the customer's CRM profile in Salesforce.
              url: ${salesforceAgent.url}
              protocolVersion: 0.3.0
              version: 1.0.0
              capabilities:
                pushNotifications: false
              defaultInputModes:
                - application/json
                - text/plain
              defaultOutputModes:
                - application/json
                - text/plain
              skills:
                - id: salesforce-create-profile
                  name: Create Salesforce CRM Profile
                  description: Creates the customer's CRM profile in Salesforce.
                  tags:
                    - salesforce
                    - crm
                  inputModes:
                    - application/json
                    - text/plain
                  outputModes:
                    - application/json
                    - text/plain
    zendeskAgent:
      info:
        label: Zendesk Agent
        description: Submits laptop and IT requests in Zendesk.
      metadata:
        platform: Zendesk
        interfaces:
          a2a_v03:
            card:
              name: Zendesk Agent
              description: Submits laptop and IT requests in Zendesk.
              url: ${zendeskAgent.url}
              protocolVersion: 0.3.0
              version: 1.0.0
              capabilities:
                pushNotifications: false
              defaultInputModes:
                - application/json
                - text/plain
              defaultOutputModes:
                - application/json
                - text/plain
              skills:
                - id: zendesk-laptop-request
                  name: Zendesk Laptop Request
                  description: Submits a laptop request ticket in Zendesk.
                  tags:
                    - zendesk
                    - laptop
                  inputModes:
                    - application/json
                    - text/plain
                  outputModes:
                    - application/json
                    - text/plain
    badgingAgent:
      info:
        label: Badging Agent
        description: Initiates the customer badge request.
      metadata:
        platform: Badging
        interfaces:
          a2a_v03:
            card:
              name: Badging Agent
              description: Initiates the customer badge request.
              url: ${badgingAgent.url}
              protocolVersion: 0.3.0
              version: 1.0.0
              capabilities:
                pushNotifications: false
              defaultInputModes:
                - application/json
                - text/plain
              defaultOutputModes:
                - application/json
                - text/plain
              skills:
                - id: badge-request
                  name: Badge Request
                  description: Initiates a customer badge request.
                  tags:
                    - badging
                  inputModes:
                    - application/json
                    - text/plain
                  outputModes:
                    - application/json
                    - text/plain
    itAgent:
      info:
        label: IT Agent
        description: Provisions the PingID system for the customer.
      metadata:
        platform: IT
        interfaces:
          a2a_v03:
            card:
              name: IT Agent
              description: Provisions PingID and IT system access for the customer.
              url: ${itAgent.url}
              protocolVersion: 0.3.0
              version: 1.0.0
              capabilities:
                pushNotifications: false
              defaultInputModes:
                - application/json
                - text/plain
              defaultOutputModes:
                - application/json
                - text/plain
              skills:
                - id: it-pingid-provision
                  name: PingID Provisioning
                  description: Provisions the PingID system for the customer.
                  tags:
                    - it
                    - pingid
                  inputModes:
                    - application/json
                    - text/plain
                  outputModes:
                    - application/json
                    - text/plain
    licenseProcurementAgent:
      info:
        label: License Procurement Agent
        description: Procures software licenses for the new customer.
      metadata:
        platform: License
        interfaces:
          a2a_v03:
            card:
              name: License Procurement Agent
              description: Procures software licenses for the new customer.
              url: ${licenseProcurementAgent.url}
              protocolVersion: 0.3.0
              version: 1.0.0
              capabilities:
                pushNotifications: false
              defaultInputModes:
                - application/json
                - text/plain
              defaultOutputModes:
                - application/json
                - text/plain
              skills:
                - id: license-procure
                  name: License Procurement
                  description: Procures software licenses for the new customer.
                  tags:
                    - licensing
                    - procurement
                  inputModes:
                    - application/json
                    - text/plain
                  outputModes:
                    - application/json
                    - text/plain
  mcps:
    talentPoolMcp:
      info:
        label: Customer Talent Pool MCP Server
        description: Talent pool MCP server for matching emails to customer addresses.
      metadata:
        transport:
          kind: streamableHttp
          path: /mcp
    slackMcp:
      info:
        label: Customer Slack MCP Server
        description: Slack MCP server for sending status updates during onboarding.
      metadata:
        transport:
          kind: streamableHttp
          path: /mcp
  llms:
    gemini:
      info:
        label: Customer Gemini 2.5 Flash
        description: Google Gemini provider for orchestration and generation.
      metadata:
        platform: Gemini

context:
  connections:
    workdayAgentConnection:
      kind: a2a
      ref:
        name: workdayAgent
      url: ${workdayAgent.url}
    salesforceAgentConnection:
      kind: a2a
      ref:
        name: salesforceAgent
      url: ${salesforceAgent.url}
    zendeskAgentConnection:
      kind: a2a
      ref:
        name: zendeskAgent
      url: ${zendeskAgent.url}
    badgingAgentConnection:
      kind: a2a
      ref:
        name: badgingAgent
      url: ${badgingAgent.url}
    itAgentConnection:
      kind: a2a
      ref:
        name: itAgent
      url: ${itAgent.url}
    licenseProcurementAgentConnection:
      kind: a2a
      ref:
        name: licenseProcurementAgent
      url: ${licenseProcurementAgent.url}
    talentPoolMcpConnection:
      kind: mcp
      ref:
        name: talentPoolMcp
      url: ${talentPoolMcp.url}
    slackMcpConnection:
      kind: mcp
      ref:
        name: slackMcp
      url: ${slackMcp.url}
    geminiConnection:
      kind: llm
      ref:
        name: gemini
      url: https://generativelanguage.googleapis.com
      authentication:
        kind: apiKey
        apiKey: ${gemini.apiKey}

brokers:
  customer-onboarding:
    kind: AgentScript
    implementation: ./brokers/customer-onboarding.agent
    interfaces:
      a2a:
        card:
          name: Customer Onboarding Assistant
          description: Coordinates customer onboarding across Workday, Salesforce, Zendesk, Badging, License Procurement, and IT systems using Gemini.
          version: 1.0.0
          capabilities:
            streaming: false
            pushNotifications: true
          defaultInputModes:
            - application/json
            - text/plain
          defaultOutputModes:
            - application/json
            - text/plain
          skills:
            - id: customer-onboarding
              name: Customer Onboarding
              description: Orchestrates customer onboarding across multiple systems using Gemini.
              tags:
                - onboarding
                - gemini
              examples:
                - Onboard a new customer named Alex Smith with email alex.smith@example.com
              inputModes:
                - application/json
                - text/plain
              outputModes:
                - application/json
                - text/plain
```

## exchange.json

```json
{
  "main": "agent-network.yaml",
  "name": "prod-customerOnboardGemini-v2",
  "classifier": "agentic-network",
  "organizationId": "00000000-0000-0000-0000-000000000000",
  "descriptorVersion": "1.0.0",
  "tags": [],
  "groupId": "00000000-0000-0000-0000-000000000000",
  "assetId": "prod-customeronboardgemini-v2",
  "version": "1.0.0",
  "description": "Customer onboarding agent network (2.0). Coordinates onboarding across Workday, Salesforce, Zendesk, Badging, License Procurement, and IT systems using Gemini.",
  "dependencies": [],
  "metadata": {
    "variables": {
      "workdayAgent": {
        "url": {
          "description": "Workday Agent URL",
          "default": "https://example.com/workday-agent/",
          "secret": false
        }
      },
      "salesforceAgent": {
        "url": {
          "description": "Salesforce Agent URL",
          "default": "https://example.com/salesforce-agent/",
          "secret": false
        }
      },
      "zendeskAgent": {
        "url": {
          "description": "Zendesk Agent URL",
          "default": "https://example.com/zendesk-agent/",
          "secret": false
        }
      },
      "badgingAgent": {
        "url": {
          "description": "Badging Agent URL",
          "default": "https://example.com/badging-agent/",
          "secret": false
        }
      },
      "itAgent": {
        "url": {
          "description": "IT Agent URL",
          "default": "https://example.com/it-agent/",
          "secret": false
        }
      },
      "licenseProcurementAgent": {
        "url": {
          "description": "License Procurement Agent URL",
          "default": "https://example.com/license-procurement-agent/",
          "secret": false
        }
      },
      "talentPoolMcp": {
        "url": {
          "description": "Customer Talent Pool MCP Server URL",
          "default": "https://example.com/talent-pool-mcp/",
          "secret": false
        }
      },
      "slackMcp": {
        "url": {
          "description": "Customer Slack MCP Server URL",
          "default": "https://example.com/slack-mcp/",
          "secret": false
        }
      },
      "gemini": {
        "apiKey": {
          "description": "Customer Gemini API key",
          "default": "REPLACE_WITH_YOUR_GEMINI_API_KEY",
          "secret": true
        }
      }
    }
  }
}
```

## brokers/customer-onboarding.agent

```text
# @dialect: AGENTFABRIC=0.1

system:
  instructions: "You are the Customer Onboarding Orchestrator. You coordinate onboarding of a new customer across Workday, Salesforce, Zendesk, Badging, License Procurement, and IT systems."

config:
  agent_name: "customer-onboarding"
  label: "Customer Onboarding Agent"
  description: "An agent that orchestrates customer onboarding across multiple systems using Gemini."
  default_llm: @llm.gemini_flash


# -- LLM ----------------------------------------------------------------------

llm:
  gemini_flash:
    target: "llm://geminiConnection"
    kind: "Gemini"
    model: "gemini-2.5-flash"


# -- ACTION DEFINITIONS -------------------------------------------------------

actions:
  workday_agent:
    target: "a2a://workdayAgentConnection"
    kind: "a2a:send_message"

  salesforce_agent:
    target: "a2a://salesforceAgentConnection"
    kind: "a2a:send_message"

  zendesk_agent:
    target: "a2a://zendeskAgentConnection"
    kind: "a2a:send_message"

  badging_agent:
    target: "a2a://badgingAgentConnection"
    kind: "a2a:send_message"

  it_agent:
    target: "a2a://itAgentConnection"
    kind: "a2a:send_message"

  license_procurement_agent:
    target: "a2a://licenseProcurementAgentConnection"
    kind: "a2a:send_message"

  match_email_to_address:
    target: "mcp://talentPoolMcpConnection"
    kind: "mcp:tool"
    tool_name: "TalentPoolMcpServer.match_email_to_address"

  send_slack_status_update:
    target: "mcp://slackMcpConnection"
    kind: "mcp:tool"
    tool_name: "SlackMcpServer.send_status_update"


# -- TRIGGER ------------------------------------------------------------------

trigger customerOnboardingTrigger:
  kind: "a2a"
  target: "brokers://customer-onboarding/a2a"
  on_message: ->
    transition to @orchestrator.onboardCustomer


# -- CUSTOMER ONBOARDING ORCHESTRATION ---------------------------------------

orchestrator onboardCustomer:
  description: "Coordinates customer onboarding across Workday, Salesforce, Zendesk, Badging, License Procurement, and IT systems."
  label: "Onboard Customer"
  system:
    instructions: |
      You are the Customer Onboarding Orchestrator. Coordinate onboarding of a
      new customer across the systems needed for day-to-day work.

      ## The process for onboarding a customer is:
      - Onboard in Workday: Create the new-hire record. Fetch the address using
        the available match_email_to_address tool and do not ask for it unless
        you are not sure how to get it.
      - Onboard in Salesforce: create the customer's CRM profile in Salesforce.
      - Since this is a long running task, send a Slack update using the
        send_slack_status_update tool to update the status of actions taken so
        far. It must be a human readable summary, for example:
          message: "Workday and Salesforce onboarding completed and working on next steps...."
          contextId: "<fetch-the-context-id-from-input>"
      - Request customer laptop: submit a laptop request in Zendesk.
      - Request customer badge: initiate the customer badge request.
      - Procure software licenses: request necessary software licenses for the
        new customer using the License Procurement Agent.
      - Send a second Slack update using send_slack_status_update with a human
        readable summary, for example:
          message: "Zendesk, Badge, and License procurement completed and working on next steps...."
          contextId: "<fetch-the-context-id-from-input>"
      - IT system setup: provision the PingID system for the customer.

      ## Output
      - Produce a plain-text human readable summary of the actions taken
        representing all the steps, not just the final step. Format it using
        bullet points. Do not include any tool name in the summary.
  reasoning:
    instructions: ->
      | {!@request.payload.message.parts[0].text}
    actions:
      workday: @actions.workday_agent
      salesforce: @actions.salesforce_agent
      zendesk: @actions.zendesk_agent
      badging: @actions.badging_agent
      license_procurement: @actions.license_procurement_agent
      it_system: @actions.it_agent
      match_address: @actions.match_email_to_address
      slack_update: @actions.send_slack_status_update
    outputs:
      properties:
        summary:
          type: "string"
          description: "Plain-text bullet-point summary of all onboarding actions taken."
    max_number_of_loops: 25
  on_exit: ->
    transition to @echo.onboardingResponse


# -- RESPONSE -----------------------------------------------------------------

echo onboardingResponse:
  kind: "a2a:status_update_event"
  state: "TASK_STATE_COMPLETED"
  message: a2a.message({
    messageId: uuid(),
    parts: [
      a2a.textPart(@orchestrator.onboardCustomer.output.summary)
    ]
  })
```

## Notable conversion choices

These are the specific decisions reflected in the V2 example, encoded so the conversion is reproducible:

1. **Identifier renaming**: V1's PascalCase agent ids (`WorkdayAgentTest`) became camelCase (`workdayAgent`). The `Test` suffix was dropped because the V2 example treats this as the canonical project.
2. **Connection rename**: V1 `WorkdayAgentTestConnection` → V2 `workdayAgentConnection`. Connection refs match their underlying registry id.
3. **`kind: agent` → `kind: a2a`**: V1's `agent` connection kind is V2's `a2a`.
4. **Registry agent shape — `a2a_v03` branch**: V1 agents were A2A v0.3-based, so they convert into `metadata.interfaces.a2a_v03.card` (the GA back-compat path) preserving `protocolVersion: 0.3.0` and `url`. The Beta `metadata.protocol: a2a` + flat `metadata.card.a2a` shape is removed. Move an agent to `metadata.interfaces.a2a` only after the agent owner upgrades it to A2A v1.0.
5. **Broker card uses `interfaces.a2a` (v1.0)**: the broker emits A2A v1.0 (the GA default). Backward compatibility is on the *consuming* side — clients on v0.3 still work because the runtime translates.
6. **URLs parameterized**: every external URL becomes `${<refName>.url}` in YAML and lives in `exchange.json` `metadata.variables`.
7. **Auth on connections**: the Gemini API key auth that V1 stuffed in `spec.configuration.apiKey` is now `context.connections.geminiConnection.authentication.{kind: apiKey, apiKey: ${gemini.apiKey}}`. Authentication is required on `kind: llm` connections in GA.
8. **Broker id**: `CustomerOnboardingBrokerTest` → `customer-onboarding` (kebab-case, used as both the broker id and the `.agent` filename stem).
9. **MCP tool actions**: each tool listed in V1 `brokers.tools[*].mcp.allowed` got its own action in the `.agent` file. Action ids are descriptive (`match_email_to_address`, `send_slack_status_update`) but the `tool_name` is preserved exactly. **No `inputs:` block** — V1 doesn't declare tool input schemas, and the V2 runtime auto-discovers arguments from the MCP server.
10. **Reasoning action aliases**: inside `orchestrator.reasoning.actions`, short readable aliases (e.g. `workday`, `slack_update`) point at the longer action ids.
11. **Prompt preservation**: the V1 `spec.instructions` were copied into the orchestrator's `system.instructions` with only minor cleanup (e.g. fixing "this a long running task" → "this is a long running task", and replacing the dotted MCP tool name with the new alias). Bullets and ordering were preserved.
12. **One orchestrator only**: even though V1's prompt has multiple steps, the V2 conversion keeps everything in a single `orchestrator` node. No router/executor/generator was introduced.
13. **Echo node (GA)**: response uses `kind: "a2a:status_update_event"` with `state: "TASK_STATE_COMPLETED"` and a `message` built via `a2a.message(...)`. The Beta `kind: "a2a:response"` wrapping `task: a2a.task({...})` is gone.
14. **Dialect line**: `# @dialect: AGENTFABRIC=0.1` pins to GA dialect 0.1.
