# IAM permissions and trust

The scanner starts with an existing hub IAM user, assumes the hub role, then
assumes a spoke role in each target account with the configured External ID.
The scanner user needs `sts:AssumeRole` on the hub role ARN; the hub trust policy
allows that principal. The hub role allows `sts:AssumeRole` on the permitted spoke
role ARNs. Each spoke trust policy allows the hub role ARN with an
`sts:ExternalId` condition. This does not grant spokes permission to assume the hub.

Discovery additionally grants the hub `organizations:ListAccounts` on `*` and
requires management-account or delegated-administrator status in the organization.
The auto-enrollment hub policy restricts the wildcard-account spoke ARN to the
named role, External ID and `aws:ResourceOrgID`. Explicit mode uses listed role ARNs.
See [hub-role.json](../scripts/hub-role.json) for the full statements.

## Spoke permissions by scanner

The following grants come from [spoke-role.json](../scripts/spoke-role.json).
Only selected scanner policy families are attached. List/get actions use resource
`*`; invocation is scoped to the spoke's runtime ARNs. Review narrower resource
scopes where AWS supports them.

### Bedrock agents

- `bedrock:ListAgents`
- `bedrock:GetAgent`
- `bedrock:ListAgentVersions`
- `bedrock:GetAgentVersion`
- `bedrock:ListAgentAliases`
- `bedrock:GetAgentAlias`
- `bedrock:ListAgentActionGroups`
- `bedrock:GetAgentActionGroup`
- `bedrock:ListAgentKnowledgeBases`
- `bedrock:GetAgentKnowledgeBase`
- `bedrock:ListKnowledgeBases`
- `bedrock:GetKnowledgeBase`
- `bedrock:ListAgentCollaborators`
- `bedrock:GetAgentCollaborator`
- `bedrock:GetGuardrail`
- `bedrock:ListDataSources`
- `bedrock:GetDataSource`
- `bedrock:ListTagsForResource`

### AgentCore agents

- `bedrock-agentcore:ListAgentRuntimes`
- `bedrock-agentcore:GetAgentRuntime`
- `bedrock-agentcore:ListAgentRuntimeVersions`
- `bedrock-agentcore:ListAgentRuntimeEndpoints`
- `bedrock-agentcore:ListHarnesses`
- `bedrock-agentcore:GetHarness`
- `bedrock-agentcore:GetAgentCard`
- `bedrock-agentcore:InvokeAgentRuntime`

### AgentCore Runtime MCP

- `bedrock-agentcore:ListAgentRuntimes`
- `bedrock-agentcore:GetAgentRuntime`
- `bedrock-agentcore:ListAgentRuntimeVersions`
- `bedrock-agentcore:ListAgentRuntimeEndpoints`
- `bedrock-agentcore:InvokeAgentRuntime`

### API Gateway REST APIs

- `apigateway:GET`
- `route53:ListHealthChecks`
- `wafv2:GetWebACLForResource`

AgentCore invocation fetches native A2A cards or performs MCP initialization and
tool listing. It is not a read-only IAM operation. API Gateway's Route 53 and WAF
permissions support optional enrichment. The MCP scanner covers Runtime-hosted
servers, not AgentCore Gateway.

## Deployment identities

The runtime grants above do not authorize infrastructure deployment. An AWS
administrator needs permission to create/update/delete the relevant CloudFormation
stacks and IAM roles and inline policies, inspect events and operation results,
and acknowledge named-IAM creation. StackSet administrators also need the relevant
StackSet management operations. Self-managed deployment requires administration
and execution roles and permission to pass the administration role; use the
bundled [administration](../scripts/stackset-administration-role.json) and
[execution](../scripts/stackset-execution-role.json) templates. Service-managed
deployment requires Organizations trusted access and the appropriate management
or CloudFormation delegated-administrator account.

Required administrator policy scope depends on the chosen mode, existing roles,
service roles and organization controls; this is not a universal deployment IAM
policy. The scanner identity does not need deployment-administrator permissions.
Fixture creation and cleanup require additional permissions for those fixtures.
