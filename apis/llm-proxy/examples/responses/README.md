# LLM Proxy — example responses

Captured response payloads (with secrets redacted) used as `example` /
`examples` references in `../api.yaml`, plus a small set of supplementary
references the skill files cite when describing related-API responses.

## Referenced from this API's `api.yaml`

| File | Operation |
|---|---|
| `llmRouteConfigurations.json` | `listLlmRouteConfigurations` |
| `environmentLlmProxies.json` | `listEnvironmentLlmProxies` |
| `environmentLlmProxy.json` | `createEnvironmentLlmProxy` (201) |
| `gatewayTargetApis.json` | `getGatewayTargetApisByPortAndPath` — *available* case |
| `gatewayTargetApisOccupied.json` | `getGatewayTargetApisByPortAndPath` — *conflict* case |
| `semanticServiceConfigs.json` | `listSemanticServiceConfigs` |
| `semanticServiceConfig.json` | `getSemanticServiceConfig` and `createSemanticServiceConfig` (201) |
| `globalPromptTopics.json` | `listGlobalPromptTopicsBySsc` |
| `globalPromptTopic.json` | `createGlobalPromptTopic` (201) |
| `promptTopic.json` | `createPromptTopic` (201) — basic-mode topic with inline embedding blob (truncated for readability) |

## Supplementary references (cited by skills, not by `api.yaml`)

These two files document responses from related operations that live in
**other** API specs. They are kept here alongside the LLM-proxy artifacts
because the skill flows reference them in prose, and a concrete shape is
useful for reviewers and for skill authors building on this work.

| File | Documented operation | Lives in |
|---|---|---|
| `upstream.json` | GET single upstream — `metadata.llmConfigs` shape after a proxy create | `urn:api:api-manager` (`getOrganizationsEnvironmentsApisUpstreams`) |
| `llmTokenRateLimitPolicy.json` | The `llm-token-rate-limit` Exchange policy template, including its `configuration` JSON-Schema | `urn:api:api-portal-xapi` (`getExchangePolicyTemplates`) |
