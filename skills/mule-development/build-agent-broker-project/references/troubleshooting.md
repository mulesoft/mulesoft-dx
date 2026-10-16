# Troubleshooting Agent Networks

Sources: `af-troubleshoot-agent-networks` and `af-troubleshoot-errors` (docs-code-builder `latest`, agent-network 2.0). The CLI error catalog reflects plugin v1.4.0.

**Triage order:**
1. Read the CLI `errorCode` and look it up in the *CLI error catalog* below.
2. If there's no code, match the symptom in *Runtime symptoms*.
3. Check `cause.response.status` against *Dependent services*.
4. If it's still unclear, turn on logging.

Source changes only take effect after the full pipeline **build → publish → deploy**. Deploy uses the last compiled `target/`.

## Runtime symptoms

| Symptom | Cause | Fix |
|---|---|---|
| Changes don't appear after redeploy | Deploy used the last compiled `target/` | Run a full build → publish → deploy after any source change. |
| Pod in **CrashLoopBackOff** / **Exit 139**, no clear error | Broker crashes on a bad upstream connection *before* config is parsed: expired API key, wrong MCP URL, MCP server returning JSON instead of SSE, missing A2A agent card | Probe every connection live first. *"Don't troubleshoot your agent network configuration until you confirm all upstream connections are healthy."* |
| Broker answers general questions but **fails on every downstream agent/MCP call** | Last-Mile Security on the egress Omni Gateway (egress uses port 8082, which bypasses the hop Last-Mile protects) | Runtime Manager → *Omni Gateways* → gateway → *Settings*: disable Last-Mile Security, or deploy to a separate egress gateway without it. This is new in 2.0; a gateway that worked under 1.0 with Last-Mile Security will fail. |
| *"Cannot complete task due to issue accessing reasoning engine"* | Generic LLM failure | Enable the message-logging policy (below) on the **LLM** connection and read the logs. |
| LLM answers from its own knowledge instead of calling the agent/tool | Instructions don't force delegation (common with Gemini on well-known topics) | In the broker's instructions add a hard directive (`MUST delegate IMMEDIATELY`, `NEVER answer yourself`) and map every intent to a named action. |
| *Maximum handoff/reasoning iterations exceeded*, *Maximum tool call count exceeded*, *State size limit exceeded* | Runtime system limits hit | Raise the runtime-system-limit variables under `exchange.json` → `metadata.variables` (see the YAML reference, *Runtime System Limits*). Check for loops first. |
| `HTTP error 404: Agent card not found at /.well-known/agent-card.json` | (a) Wrong card URL, or (b) agent isn't on A2A 1.0.0 | (a) The connection URL must **end with `/`**. Fetch `<url>.well-known/agent-card.json` to confirm. (b) MuleSoft-built agents: upgrade to the latest A2A Connector. External agents must speak A2A 1.0.0, or register them under `a2a_v03`. |
| `401 Unauthorized` when the broker calls an agent | Declared protocol version (`a2a` vs `a2a_v03`) doesn't match the agent's real one. The wrong Agent Card policy is applied, the card `url` isn't rewritten to the egress proxy, and the call skips credential injection | Fetch the agent card and check `protocolVersion`, fix the registry branch in `agent-network.yaml`, then rebuild, republish, redeploy. *"A protocol version mismatch surfaces as an authentication (401) error, not as a version error."* |
| Conversational memory doesn't work; `ListTasks` returns empty | No stable user identity: policy missing, or Client ID Enforcement ordered *after* User Context Propagation (no error is returned) | See *Conversational memory* in `gotchas.md`. Reorder the policies; the client must send `A2A-Version: 1.0`, `SendMessage`, `ROLE_USER`, and reuse `contextId`. |
| No traces in Anypoint Monitoring | Tracing not enabled end-to-end | Enable the tracing policy on all brokers and agents in API Manager. Enable Distributed Tracing for ingress and egress on the Managed Omni Gateways. |
| No deployment targets in ACB/CLI | No space/target or gateways set up | Set up the target and run `agent-network setup gateways` (see Step 9 in `gotchas.md`). |
| Redeploy to a different space/gateway fails with a Runtime Manager error | Switching target or gateway isn't supported | Delete the existing Runtime Manager application manually, then redeploy. |
| ACB deploy errors mentioning **CLI version** | Old ACB | Install ACB **1.24.1+**, then rebuild, republish, deploy. |
| ACB deploy errors about **invalid API metadata** | API instances created by an older ACB | Delete those API instances in API Manager, then rebuild, republish, deploy. |
| No agent network commands in ACB | Outdated Anypoint Extension Pack | Update the Anypoint Extension Pack, then restart VS Code. |
| Lint errors in `.agent` files in VS Code | Agentforce DX extension pack conflicts with ACB's built-in Agent Script extension | Uninstall the Agentforce DX extension pack and restart. |
| Publish fails with **2006** *Asset belongs to another project* | Asset name already owned by another project in the org | Rename the asset in `agent-network.yaml` (names are unique org-wide), or remove it from the other project if you own it. |

## Logging

Set log levels on the broker's application in Runtime Manager (CloudHub 2.0 or Runtime Fabric).
- **`INFO`:** node transitions, MCP tool discovery, agent card retrieval.
- **`DEBUG` on the `INSECURE-LOGGING` category:** LLM reasoning, LLM input/output, tools invoked, all external calls.
  > `INSECURE-LOGGING` content *"is very likely to contain personally identifiable information (PII). Disable `INSECURE-LOGGING` after you finish troubleshooting."*

### Message-logging policy (agents, MCP servers, LLMs)

This uses the Omni Gateway Message Logging policy. Declare it once in `context.policies`, then bind it on the **connection** you want to log (the agent, MCP server, or LLM connection):

```yaml
context:
  connections:
    jira_mcp_connection:
      # ...kind/ref/url/authentication...
      policies:
        outbound:
          - ref:
              name: message-logging-binding
  policies:
    message-logging-binding:
      ref:
        name: message-logging
        namespace: business_group_UUID   # your business group ID; can differ on non-US control planes
      configuration:
        loggingConfiguration:
          - itemName: "Payload"
            itemData:
              message: "#[payload]"
              firstSection: true
              secondSection: true
              level: "INFO"
          - itemName: "Headers"
            itemData:
              message: "#[attributes]"
              firstSection: true
              secondSection: true
              level: "INFO"
```

> **Shape warning:** the troubleshoot page's snippet places `- ref: … configuration: …` directly under `policies:` as a flat list. That doesn't match the YAML reference, which defines `policies` as an object with `inbound`/`outbound` arrays, and the GA schema rejects it. Use the form above. Validated with ajv against the V2 schema; the inline form `outbound: [ { policy: { ref: …, configuration: … } } ]` validates too.

On non-US control planes, check the business group of the *API Gateway Message Logging Policy Template* in Exchange for the correct `namespace`.

## CLI error catalog

Error codes are grouped by area:

| Area | Codes |
|---|---|
| Build | 1000–1999 |
| Publish / unpublish | 2000–2999 |
| Deploy / undeploy | 3000–3999 |
| Gateway setup | 4000–4999 |
| Entitlement / org access | 5000–5999 |
| Dependency manager | 6000–6999 |
| `create` | 7000–7999 |
| Policy validation | 8001–8004 |
| Access management | 10001 |
| Gateway flags / CLI args | 11001–11006 |

(8500–8534 belong to local-run commands that aren't part of the public CLI and are omitted here.)

> **Code collision (1020–1024), a known defect.** Each of these codes is assigned to *two* errors: a broker-interface error and an MCP-introspection (`server.json` / MCP YAML) error. Rows marked *see note* are affected. *"Match the message instead of the number alone."*

### Build Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 1001 | `projectDescriptorNotFound` | `exchange.json` is missing for the project. | Run the command from the project root and confirm that `exchange.json` exists. |
| 1002 | `invalidAgentNetworkProject` | The project failed validation. | Check the validation output printed before the error. Fix the reported issue and rebuild. |
| 1003 | `buildAssetsError` | An asset failed to build. | Read the nested `cause`. The cause is usually a malformed asset file in the assets directory. |
| 1004 | `variableNotFound` | A `${placeholder}` has no matching variable. | Declare the variable under `metadata.variables` in `exchange.json`. |
| 1005 | `validatingAgentNetworkError` | Project validation exited with a non-zero status. | Review the validator output for the specific failure. |
| 1006 | `buildingAgentNetworkError` | The build process exited with a non-zero status. | Check the build logs printed before the error. |
| 1007 | `wrapperNotFoundError` | The Maven wrapper (`mvnw`/`mvnw.cmd`) is missing. | Confirm that the project is a Maven project and that the wrapper is present and executable. |
| 1008 | `buildBrokersAppError` | The Brokers App failed to build. | Check the logs. The cause is usually an AgentScript compile error. |
| 1009 | `variablesNotFound` | Multiple `${placeholder}`s are unresolved. | Declare each listed variable under `metadata.variables` in `exchange.json`. |
| 1010 | `invalidVariablePath` | A variable resolves to an invalid nested path. | Correct the variable path in `exchange.json`. |
| 1011 | `invalidPath` | A file or YAML path is invalid. | Verify the referenced path exists and is well-formed. |
| 1012 | `invalidOrNotBuiltAgentNetworkProject` | A downstream command ran before the project was built. | Run `agent-network project build` first. |
| 1013 | `unsupportedSchemaVersion` | The `schemaVersion` isn't supported by this CLI. | Use a supported version listed in the message or upgrade the CLI. |
| 1014 | `validationConnectionsError` | A connection references an undefined target or has the wrong kind. | Fix the connection references in `agent-network.yaml` to match defined entities and kinds. |
| 1015 | `noBrokerForImplementation` | An AgentScript implementation has no matching broker entry. | Add a broker for the implementation or remove the orphaned file. |
| 1016 | `unsupportedToolType` | An entity declares an unknown tool type. | Use a supported tool type (listed in the message). |
| 1017 | `invalidAgentScriptPath` | An AgentScript path is invalid or its content is unsafe. | Use a path inside the project and remove unsafe content. |
| 1018 | `errorParsingAgentFile` | An AgentScript file failed to parse. | Fix the syntax error reported in the nested `cause`. |
| 1019 | `policyBindingNotFound` | A referenced policy binding doesn't exist. | Define the binding or correct the reference name. |
| 1020 | `brokerKindMismatch` *see note* | A broker's kind doesn't support the requested interface kind. | Align the broker's kind with the interface or use a compatible broker. |
| 1021 | `brokerIdMismatch` *see note* | The broker id in AgentScript doesn't match the YAML. | Make the broker id consistent between AgentScript and `agent-network.yaml`. |
| 1022 | `invalidAgentNetworkProjectDescriptor` *see note* | `exchange.json` descriptor is malformed. | Fix the descriptor per the details in the message. |
| 1023 | `brokerSupportedInterfacesUrlMismatch` *see note* | A broker's A2A supported interfaces use different base URLs. | Use the same scheme, host, and port for all supported interfaces. Use different paths only. |
| 1024 | `brokerUnsupportedProtocolBinding` *see note* | A broker's `protocolBinding` isn't supported. | Use a supported `protocolBinding` value (listed in the message). |
| 1020 | `mcpMainYamlNotFound` *see note* | MCP introspection can't find the main YAML. | Set the `main` field in `exchange.json` to the correct file. |
| 1021 | `mcpYamlParseError` *see note* | The MCP YAML failed to parse. | Fix the YAML syntax error in the reported file. |
| 1022 | `mcpServerJsonNotFound` *see note* | `server.json` couldn't be read. | Confirm `server.json` exists and is readable. |
| 1023 | `mcpServerJsonInvalidJson` *see note* | `server.json` isn't valid JSON. | Fix the JSON syntax. |
| 1024 | `mcpServerJsonSchemaValidation` *see note* | `server.json` failed schema validation. | Correct the fields listed in the message. |
| 1025 | `mcpServerJsonNoRemotes` | `server.json` defines no remotes. | Add a remote entry. Only remote MCP servers are supported. |
| 1026 | `mcpServerJsonMultipleRemotes` | `server.json` defines multiple remotes. | Pass `--transport` to select one (an MCP-introspection flag; not in the public CLI README). |
| 1027 | `mcpServerJsonRemoteNotFound` | The requested transport isn't in `server.json`. | Use one of the available transports listed in the message. |
| 1028 | `mcpInvalidRemoteProtocol` | The remote URL uses an unsupported scheme. | Use `http:` or `https:`. |
| 1029 | `mcpInvalidRemoteUrl` | The remote URL failed to parse. | Correct the URL in `server.json`. |
| 1030 | `mcpInvalidRegistryKey` | A registry key contains invalid characters. | Use only lowercase letters, digits, and hyphens. |
| 1031 | `mcpCannotDeriveRegistryKey` | A registry key couldn't be derived. | Declare an explicit registry key. |
| 1032 | `assetIdTooLongForDeployment` | The project asset id exceeds the deployment-name length limit. | Shorten the asset id and rebuild. |
| 1033 | `invalidExchangeJson` | `exchange.json` isn't valid JSON. | Fix the JSON syntax. |
| 1034 | `invalidExchangeJsonField` | An `exchange.json` field has the wrong type. | Set the reported field to the expected type (a string). |

### Publish Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 2001 | `organizationAccessError` | You lack access to the project's `groupId`. | Switch to an org that owns the `groupId` or request access. |
| 2002 | `projectNotBuiltError` | Publish ran before build. | Run `agent-network project build` first. |
| 2003 | `publishError` | An asset failed to publish. | Read the nested `cause`. See *Dependent services → Exchange* below. |
| 2004 | `assetNotFoundError` | An Exchange asset lookup failed. | Verify the GAV, confirm that the asset exists, and check org access. |
| 2005 | `assetTypeMismatchError` | An asset already exists in Exchange with a different type. | Use a new asset id or version, or reconcile the existing asset's type. |
| 2006 | `ownershipConflictsError` | The asset id is already owned by another project. | Choose a different asset id or publish from the owning project. |
| 2007 | `deployedResourcesExistOnUnpublish` | Unpublish is blocked because deployed resources still reference the assets. | Run `agent-network project undeploy` first, then retry unpublish. |
| 2010 | `unpublishError` | Reports a failure that occurred during the unpublish stage. | Read the nested `cause` for the specific reason. See *Dependent services → Exchange* below for the known 403 issue. |
| 2011 | `incompatibleTargetVersionPublish` | The `target/` artifact was built with an incompatible CLI version. | Rebuild with the current CLI version, then publish. |
| 2012 | `projectNotBuiltPublish` | No build artifact was found at publish time. | Run `agent-network project build` first. |
| 2013 | `publicationAggregateFailure` | One or more publish tasks failed. This error consolidates the failures. | Read the logs for each sub-failure. Each sub-failure maps to an error-code or dependent-service entry on this page. |
| 2014 | `unrecognizedComponentKindForPublicationOrder` | *Internal:* a component kind wasn't recognized when ordering publication. | Rebuild the project. If the error persists, then report it with the `requestId`. |
| 2015 | `metadataPatchParseFailed` | *Internal:* a serialized metadata file couldn't be parsed for version patching. | Rebuild the project. If the error persists, then report it with the `requestId`. |

### Deploy Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 3001 | `createApiError` | Creating an API instance in API Manager failed. | A 409 often means that an instance with this name already exists. See *Dependent services → API Manager* below. |
| 3004 | `deployError` | Deploying an API into a gateway failed. | Read the nested `cause`. See *Dependent services → Runtime Fabric / AMC* below. |
| 3005 | `connectionNotFoundError` | A connection couldn't be resolved. | Verify the connection is published and its name matches the reference. |
| 3006 | `gettingEgressConnectionError` | Fetching the egress connection failed. | Check the egress gateway and target. See *Dependent services → Gateway Manager* below. |
| 3007 | `deployAPIError` | A generic API deploy failure. | Read the nested `cause`. |
| 3008 | `brokerGroupDeploymentError` | Broker group (Agent Graph) deployment failed. | Check the logs. See *Dependent services → Runtime Fabric / AMC* below. |
| 3009 | `unableToResolve` | A GAV couldn't be resolved at deploy time. | Build and publish the project before deploying. |
| 3010 | `createPatchApiError` | Updating an existing API instance failed. | Read the nested `cause`. See *Dependent services → API Manager* below. |
| 3012 | `noTranscodingFoundFor` | An expected transcoding policy is missing. | Verify that the transcoding policy is published and referenced correctly. |
| 3015 | `gatewayTargetSpaceError` | The ingress and egress gateways don't match the runtime target space. | Choose gateways whose target space matches your runtime target. |
| 3016 | `createApiSpecNotFound` | The API spec asset isn't in Exchange. | Publish the Agent Network before deploying. |
| 3017 | `requestTimeout` | A single HTTP request timed out. | Retry the request. If the error persists, then increase `--request-timeout`. See *Dependent services → retry engine* below. |
| 3018 | `commandTimeout` | The overall command exceeded its timeout budget. | Review org resource limits and increase `--process-timeout`. Check `steps` for the command's progress. |
| 3019 | `findingAssetsError` | Discovering assets to deploy failed. | Retry the request. If the error persists, then read the nested `cause`. |
| 3020 | `nonPublishedAssetsFoundError` | One or more assets aren't published in Exchange. | Publish the listed assets, then deploy. |
| 3021 | `noGatewayFoundForInstance` | No gateway resolvable for an API instance. | Verify that a gateway is configured for the instance's protection direction. |
| 3022 | `assetNotFoundForInstance` | An API instance's backing asset is missing from Exchange. | Publish the asset before deploying. |
| 3023 | `assetNotFoundForConnection` | A connection's backing asset is missing from Exchange. | Publish the asset before deploying. |
| 3024 | `missingRequiredUpstreamUrl` | A required upstream URL wasn't resolved. | Provide the upstream URL variable at deploy time (`--property`). |
| 3025 | `dependencyFailure` | A stage was skipped because a dependency's stage failed. | Fix the upstream failure reported elsewhere in the output. |
| 3026 | `apiBelongsToAnotherProject` | An instance name collides with another project's instance. | Choose a different name or reuse the existing instance. |
| 3027 | `invalidSourceValue` | An invalid `source` value was supplied. | Set `source` to a supported value (listed in the message). |
| 3028 | `agentGraphDeploymentError` | Agent Graph provisioning failed. | Check the logs. See *Dependent services → Runtime Fabric / AMC* below. |
| 3029 | `connectionRefNotFoundError` | A `connection.ref.name` didn't resolve. | Verify the connection is published and the ref name matches. |
| 3030 | `undeployError` | Reports a failure that occurred during the undeploy stage (fail-closed). | Read the nested `cause` for the specific reason. See *Dependent services* below. |
| 3031 | `invalidPolicy` | A policy metadata response was empty or invalid. | Verify the policy GAV (`groupId:assetId:version` coordinate) and retry the request. The error can be transient. See *Dependent services → API Manager* below. |
| 3032 | `missingGatewayForSharedSpace` | A shared-space deploy needs a gateway but none was given. | Provide a gateway with `--gateway`. |
| 3033 | `invalidGAVFormat` | A GAV argument couldn't be parsed. | Use `groupId:assetId:version`. |
| 3034 | `parentAssetNotFound` | A parent asset lookup failed. | Verify the parent asset exists in Exchange. |
| 3036 | `invalidAgentProtocol` | Agent metadata declares no protocol for a connection. | Declare a protocol for the connection in agent metadata. |
| 3037 | `unsupportedAgentProtocol` | An agent exposes a non-A2A protocol only. | Connect only A2A (Agent2Agent) agents that use `a2a` or `a2a_v1`. |
| 3045 | `incompatibleTargetVersionDeploy` | The `target/` artifact was built with an incompatible CLI version. | Rebuild with the current CLI, republish, then deploy. |
| 3046 | `projectNotBuiltDeploy` | Deploy ran before build. | Run `agent-network project build` first. |
| 3047 | `bulkApplyPolicyError` | Applying policies in API Manager failed. | Check policy GAV resolution and org entitlements. See *Dependent services → API Manager* below. |
| 3048 | `brokerAuthorizationPolicyConflict` | An explicit `user-context-propagation` policy conflicts with the broker's `authorization` section. | Align or remove the conflicting policy field, per the message. |
| 3049 | `deploymentSettingsFlagsMutuallyExclusive` | `--deployment-properties-file` and `--deployment-property` were both passed. | Use one or the other, not both. |
| 3050 | `deploymentFileReadError` | The deployment settings file couldn't be read. | Verify the file path and permissions. |
| 3051 | `deploymentSettingsMalformedEntry` | A `--deployment-property` entry is malformed. | Use `<scope>:<name>:<value>` (for example `brokers:vCores:0.1`). |
| 3052 | `deploymentSettingsInvalid` | Deployment settings failed semantic validation. | Fix the reported setting. |
| 3053 | `runtimeVersionNotFound` | The requested runtime version isn't available. | Use one of the available versions listed in the message. |
| 3054 | `mixedRuntimeTypesInDeploy` | The deploy set mixes Mule apps and Agent Graphs. | Split into separate deploys. |
| 3055 | `deploymentAggregateFailure` | One or more deploy tasks failed. This error consolidates the failures. | Read the logs for each sub-failure. Each sub-failure maps to an error-code or dependent-service entry on this page. |
| 3056 | `runtimeVersionNotResolved` | *Internal:* runtime version wasn't resolved before deployment. | Rebuild and redeploy. If the error persists, then report it with the `requestId`. |
| 3057 | `undeployEnvironmentIdRequired` | `--gav` undeploy is missing the environment id. | Pass `--environment`. |
| 3058 | `undeployEnvironmentRequired` | No environment was selected for undeploy. | Pass `--environment`. |
| 3059 | `publicationBeforeDeploymentFailed` | The auto-publish step before deploy failed, so deploy aborted. | Fix the publish failure. See the embedded cause and Publish Errors above. |

### Gateway Setup Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 4001 | `noDomainsFound` | No private-network domains for the target space. | Create a private network in the target space first. |
| 4002 | `setupIngressGatewayError` | Ingress gateway setup threw. | Read the nested `cause`. See *Dependent services → Gateway Manager* below. |
| 4003 | `setupIngressGatewayFail` | Ingress gateway setup returned a non-success status. | Check the `status` and response in the message. See *Dependent services → Gateway Manager* below. |
| 4004 | `setupEgressGatewayError` | Egress gateway setup threw. | Read the nested `cause`. See *Dependent services → Gateway Manager* below. |
| 4005 | `setupEgressGatewayFail` | Egress gateway setup returned a non-success status. | Check the `status` and response. See *Dependent services → Gateway Manager* below. |
| 4006 | `gatewayNotFoundError` | A named gateway isn't in the environment. | Use one of the available gateways listed in the message. |
| 4007 | `runtimeTargetNotFoundError` | A named runtime target space isn't in the environment. | Use an available space or create one (https://docs.mulesoft.com/cloudhub-2/ps-create-configure[CloudHub 2 docs]). |
| 4008 | `unableToRetrieveTargetSpaceMetadata` | Fetching target space metadata failed. | Retry the request. See *Dependent services → Gateway Manager* below. |
| 4009 | `unableToRetrieveGateways` | Fetching the gateway list failed. | Retry the request and check org and environment access. |
| 4010 | `unableToRetrieveGatewayVersions` | Fetching gateway versions failed. | Retry the request. See *Dependent services → Gateway Manager* below. |
| 4011 | `gatewayChannelNotFoundError` | The requested update channel doesn't exist. | Use one of the available channels listed in the message. |
| 4012 | `noGatewayVersionsFoundError` | The channel has no versions. | Choose a different channel. |
| 4013 | `gatewayAlreadyExists` | A gateway with this name already exists in the environment. | Choose a different name because gateway names are unique per environment. |
| 4014 | `setupGatewayInsufficientResourcesError` | The org's gateway quota is exhausted. | Delete an unused gateway or increase your org limits. |
| 4015 | `missingDomainsResponse` | Domains are required for a non-shared target but none were returned. | Confirm a private network exists for the target. |
| 4016 | `gatewayUpdateFailedError` | Updating the gateway runtime version failed. | Check the `status` in the message and retry the request. |
| 4017 | `gatewayUpdateTimedOutError` | The gateway update didn't finish within the timeout. | Check the gateway status in Runtime Manager. Retry when the gateway is stable. |

### Entitlement and Org Access Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 5001 | `noEntitlementForOrganization` | Retrieving org entitlements failed. | Check the `status` in the message and verify org access. See *Dependent services → Access Management* below. |
| 5002 | `organizationAccessDenied` | You lack access to the org. | Switch orgs or request access. |
| 5003 | `selectedOrganizationMismatch` | The `groupId` doesn't match the selected org. | Switch to the org that owns the assets. |

### Dependency Manager Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 6001 | `downloadFileError` | A dependency download failed. | Check network access and retry the request. |
| 6002 | `couldNotFindVersion` | No resolvable version in `maven-metadata.xml`. | Confirm the dependency exists in the repository and that you have network access to it. |
| 6003 | `invalidStrategyVersion` | A dependency strategy or version config is invalid. | Correct the strategy or version in the descriptor. |
| 6004 | `invalidMetadataFile` | A dependency metadata file is invalid. | Rerun setup to refresh the cached dependency. |
| 6005 | `runtimeDependenciesFileNotFound` | The runtime dependency manifest is missing. | Docs say run `agent-network setup dependencies` (that command is not in the public CLI README; if you hit this, contact MuleSoft Support). |
| 6006 | `invalidDependencyVersion` | A dependency version isn't valid SemVer. | Use SemVer (for example `2.1.3`). |

### Create Command Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 7001 | `projectAlreadyExists` | The target project or directory already exists. | Use a new name or directory. |
| 7002 | `invalidAssetVersion` | The asset version isn't valid SemVer. | Use SemVer (for example `0.0.0`). |
| 7003 | `invalidGroupId` | The `group-id` wasn't found. | Use a `group-id` for an org that you belong to, as listed in the message. |
| 7004 | `invalidProjectName` | The project name has no alphanumeric character. | Include at least one alphanumeric character. |
| 7005 | `invalidAssetId` | The asset id has invalid characters. | Use only `A-Z`, `a-z`, `0-9`, `_`, `-`. |
| 7006 | `missingAssetIdWithInvalidProjectName` | The project name has no alphanumerics and no asset id was given. | Provide an explicit asset id. |
| 7007 | `brokerAlreadyExists` | A broker with this name already exists. | Choose a different broker name. |
| 7008 | `invalidBrokerTemplate` | The broker scaffold template is missing. | Reinstall the plugin. The installation can be corrupted. |
| 7009 | `unsupportedAgentNetworkVersion` | The command requires a V2 project. | Use a V2 Agent Network project. |
| 7010 | `invalidAgentNetworkYaml` | `agent-network.yaml` failed to parse. | Fix the YAML syntax error reported in the message. |
| 7011 | `invalidEmptyBrokerName` | The broker name has no alphanumeric character. | Include at least one alphanumeric character. |
| 7012 | `invalidBrokerName` | The broker id violates the naming pattern. | Start and end with a letter or digit. In the middle, use only letters, digits, `_`, `.`, or `-`. |
| 7013 | `invalidBrokersSection` | The `brokers` YAML section isn't a mapping. | Make `brokers:` a mapping of names to definitions. |
| 7014 | `brokerNameTooLong` | The broker id exceeds the deployment-name length limit. | Shorten the name of the broker. |

### Policy Validation Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 8001 | `policyVersionError` | Looking up a policy version failed. | Verify the policy GAV. See *Dependent services → Exchange* below. |
| 8002 | `policyValidationFailed` | One or more policy bindings failed validation. | Fix the validation errors listed in the nested `cause`. |
| 8003 | `schemaNotFoundForAsset` | A policy config schema file is missing. | Verify the policy asset includes its schema. |
| 8004 | `dependencyVersionNotFound` | A dependency version is absent from the descriptor. | Add the dependency version to `exchange.json`. |

### Access Management Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 10001 | `credentialsValidationsError` | Credential validation failed. | Reauthenticate and verify your credentials. See *Dependent services → Access Management* below. |

### Gateway Flag and CLI-Argument Errors

| Code | Name | Meaning | Fix |
|---|---|---|---|
| 11001 | `gatewayFlagsMutuallyExclusive` | `--gateway` was combined with `--ingress-gw`/`--egress-gw`. | Use `--gateway` alone, or `--ingress-gw [--egress-gw]`. |
| 11002 | `egressGwRequiresIngress` | `--egress-gw` was passed without `--ingress-gw`. | Pass both, or use `--gateway`. |
| 11003 | `gatewayFlagRequired` | No gateway flag was supplied. | Pass `--gateway` or `--ingress-gw [--egress-gw]`. |
| 11004 | `separateGatewayModeNotSupportedInSharedSpace` | Separate-gateway mode was used with a Shared Space. | Use `--gateway`, or pass a Private Space to `--target-space`. |
| 11005 | `singleGatewayTargetSpaceMismatch` | `--target-space` conflicts with the gateway's target space. | Omit `--target-space`, or make it match the gateway. |
| 11006 | `forceFlagRequiredWithJson` | `--json` was used without `--force`. | Add `--force` to skip interactive prompts. (In plugin v1.4.0 this applies to `undeploy`/`unpublish`, where `--force` exists but is hidden from CLI help. It skips the confirmation prompt, so run `--dry-run` first.) |

## Dependent services

When a platform service returns an HTTP error, the status appears in `cause.response.status`.

### Retry and timeout engine (already built in)

- **Retried:** every `429` and `5xx`, plus network errors (`ECONNRESET`, `ETIMEDOUT`, `ENETUNREACH`, `EAI_AGAIN`).
- **Attempts:** up to two, with a 30 s backoff. `Retry-After` is honored but capped at 30 s.
- **Deletes:** a `404` on retry counts as success.
- **Non-idempotent writes:** `POST`/`PUT`/`PATCH` are also retried after `5xx`/`429`. *A retry can create a duplicate resource*, so check for duplicates after a flaky deploy.
- **Timeouts:** `--request-timeout` (default 60 s per request) and `--process-timeout` (default 15 min per command).
- If it still fails after retries, treat it as **deterministic**, not transient.

| Service | Symptom / code | Likely cause | Fix |
|---|---|---|---|
| Exchange | `409` on publish | Asset id exists with a different type/owner | See 2005/2006. Use a new id/version or reconcile ownership. |
| Exchange | `403` on delete during unpublish/undeploy (**2010**) | Known Exchange platform issue | Retry later. If it persists, open a support case with the `requestId`. |
| Exchange | `5xx`/`429` fetching policy/asset | Transient load | CLI retries; retry later. |
| API Manager | `409` creating instance/connection (**3001**) | Orphaned instance from a partial deploy, or a name collision | Find the instance in API Manager, delete or reuse it, redeploy. |
| API Manager | Patch non-2xx (**3010**) | Instance changed or removed | Read `cause`; confirm the instance exists. |
| API Manager | Apply policies failed (**3047**) | Policy GAV or entitlement | Verify the policy GAV and the org entitlement. |
| API Manager | Policy metadata empty/invalid (**3031**) | Transient or bad GAV | Retry, then verify the GAV. |
| RTF / AMC | *"Deployment status request returned status N"* | Non-retryable error or retries exhausted | Check the deployment in Runtime Manager. |
| RTF / AMC | Request timeout (**3017**) | Exceeded `--request-timeout` | Retry with a larger `--request-timeout`. |
| RTF / AMC | Command timeout (**3018**) | Insufficient org resources or a slow deploy | Check resource allocation; raise `--process-timeout`; check `steps` for progress. |
| RTF / AMC | Broker group / Agent Graph deploy failure (**3008**, **3028**) | Underlying AMC error | Read the logs and nested `cause`. |
| Gateway Manager | Name collision (**4013**) | A gateway with that name exists | Use a different name. |
| Gateway Manager | Insufficient resources (**4014**) | Gateway quota exhausted | Delete an unused gateway or raise limits. |
| Gateway Manager | No domains (**4001**, **4015**) | No private network in the target space | Create the private network first. |
| Gateway Manager | Ingress/egress setup non-success (**4003**, **4005**) | Downstream gateway/API Manager error | Read `status`, then retry. |
| Gateway Manager | List gateways/versions/metadata non-2xx (**4008–4010**) | Transient or access issue | Retry; verify org/env access. |
| Access Mgmt | Entitlements non-2xx (**5001**) | Transient error or missing entitlement | Retry; confirm the org is entitled to Agent Fabric. |
| Access Mgmt | Org access denied (**5002**) | No access to the org that owns `groupId` | Switch orgs or request access. |
| Access Mgmt | Selected org mismatch (**5003**) | `groupId` ≠ selected org/business group | Switch to the owning org (check every auth source; see *CLI auth* in `gotchas.md`). |
| Access Mgmt | Credential validation failed (**10001**) | Expired or invalid credentials | Reauthenticate. |

**Platform vs. plugin:** 2010 (Exchange 403) is a known platform issue. 3001 (409) is environment state, usually an orphan. API Manager/AMC `5xx`/`429`/timeouts are transient load the CLI already retries. Gateway codes 4003–4010 relay the downstream status as-is.
