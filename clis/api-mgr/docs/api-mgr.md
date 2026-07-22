---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for API Manager

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `api-mgr` commands to automate your API Manager processes. For more information about how to
use these commands, refer to the [API Manager documentation](../../api-manager/latest/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#api-mgr-alert-add">api-mgr:alert:add</a></p></div></div></td><td><div><div><p>Creates an API instance alert</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-alert-list">api-mgr:alert:list</a></p></div></div></td><td><div><div><p>Lists alerts for an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-autodiscovery">api-mgr:api:autodiscovery</a></p></div></div></td><td><div><div><p>Lists the autodiscovery properties</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-change-specification">api-mgr:api:change-specification</a></p></div></div></td><td><div><div><p>Changes the asset version for an API instance by choosing a new version from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-classify">api-mgr:api:classify</a></p></div></div></td><td><div><div><p>Classifies an API instance in a given environment</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-delete">api-mgr:api:delete</a></p></div></div></td><td><div><div><p>Deletes an API</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-deploy">api-mgr:api:deploy</a></p></div></div></td><td><div><div><p>Deploys an API to CloudHub, CloudHub2, Hybrid Server, or Runtime Fabric</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-deprecate">api-mgr:api:deprecate</a></p></div></div></td><td><div><div><p>Deprecates an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-describe">api-mgr:api:describe</a></p></div></div></td><td><div><div><p>Shows details of an API</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-download-proxy">api-mgr:api:download-proxy</a></p></div></div></td><td><div><div><p>Downloads the API proxy ZIP file to a local directory</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-edit">api-mgr:api:edit</a></p></div></div></td><td><div><div><p>Edits an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-list">api-mgr:api:list</a></p></div></div></td><td><div><div><p>Lists all APIs in API Manager 2.x</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-manage">api-mgr:api:manage</a></p></div></div></td><td><div><div><p>Manages a new API, API version, or new API instance with an asset from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-promote">api-mgr:api:promote</a></p></div></div></td><td><div><div><p>Promotes an API instance from source environment</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-redeploy">api-mgr:api:redeploy</a></p></div></div></td><td><div><div><p>Redeploys an API to CloudHub, CloudHub2, Hybrid Server, or Runtime Fabric</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-api-undeprecate">api-mgr:api:undeprecate</a></p></div></div></td><td><div><div><p>Undeprecates an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-application-add-owner">api-mgr:application:add-owner</a></p></div></div></td><td><div><div><p>Adds an owner to a client application</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-application-import">api-mgr:application:import</a></p></div></div></td><td><div><div><p>Imports a client application from an external client identity provider</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-application-possible-owners-list">api-mgr:application:possible-owners-list</a></p></div></div></td><td><div><div><p>Lists possible owners for a client application in the current organization</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-client-provider-list-importable">api-mgr:client-provider:list-importable</a></p></div></div></td><td><div><div><p>Lists client identity providers with import enabled in the current organization</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-contract-delete">api-mgr:contract:delete</a></p></div></div></td><td><div><div><p>Deletes a given API contract</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-contract-list">api-mgr:contract:list</a></p></div></div></td><td><div><div><p>Lists all contracts to a given API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-policy-apply">api-mgr:policy:apply</a></p></div></div></td><td><div><div><p>Applies a policy to a given API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-policy-describe">api-mgr:policy:describe</a></p></div></div></td><td><div><div><p>Shows the description and available configuration properties of a given policy template</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-policy-disable">api-mgr:policy:disable</a></p></div></div></td><td><div><div><p>Disables policy from a given API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-policy-edit">api-mgr:policy:edit</a></p></div></div></td><td><div><div><p>Edits the policy configuration of a given API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-policy-enable">api-mgr:policy:enable</a></p></div></div></td><td><div><div><p>Enables a policy on a given API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-policy-list">api-mgr:policy:list</a></p></div></div></td><td><div><div><p>Lists policies</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-policy-remove">api-mgr:policy:remove</a></p></div></div></td><td><div><div><p>Removes a policy from a given API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-tier-add">api-mgr:tier:add</a></p></div></div></td><td><div><div><p>Creates an SLA tier</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-tier-copy">api-mgr:tier:copy</a></p></div></div></td><td><div><div><p>Copies an SLA tier from source to a target API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-tier-delete">api-mgr:tier:delete</a></p></div></div></td><td><div><div><p>Deletes an SLA tier from an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-tier-list">api-mgr:tier:list</a></p></div></div></td><td><div><div><p>Lists the SLA tiers of an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-upstream-add">api-mgr:upstream:add</a></p></div></div></td><td><div><div><p>Creates an upstream for an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-upstream-bulk-edit">api-mgr:upstream:bulk-edit</a></p></div></div></td><td><div><div><p>Bulk edits the TLS context for all upstreams of an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-upstream-delete">api-mgr:upstream:delete</a></p></div></div></td><td><div><div><p>Deletes an upstream from an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-upstream-edit">api-mgr:upstream:edit</a></p></div></div></td><td><div><div><p>Edits an upstream of an API instance</p></div></div></td></tr><tr><td><div><div><p><a href="#api-mgr-upstream-list">api-mgr:upstream:list</a></p></div></div></td><td><div><div><p>Lists all upstreams for an API instance</p></div></div></td></tr></tbody></table>

## api-mgr:alert:add

> api-mgr:alert:add <apiInstanceId> <name> [flags]

Creates an API instance alert with the name passed in `name` for the API instance ID passed in
`<apiInstanceId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--duration</code></p></div></div></td><td><div><div><p>Condition occurrence period duration.</p></div></div></td><td><div><div><p><code>--duration 60</code></p></div></div></td></tr><tr><td><div><div><p><code>--durationUnit</code></p></div></div></td><td><div><div><p>Condition occurrence period duration unit.<br>Supported values: <code>days</code>, <code>hours</code>, and <code>minutes</code>.</p></div></div></td><td><div><div><p><code>--durationUnit minutes</code></p></div></div></td></tr><tr><td><div><div><p><code>--email</code></p></div></div></td><td><div><div><p>Email to send alert notification to.<br>Pass this flag multiple times to specify multiple emails.</p></div></div></td><td><div><div><p><code>--email <a href="mailto:example@mulesoft.com">example@mulesoft.com</a></code></p></div></div></td></tr><tr><td><div><div><p><code>--enabled</code></p></div></div></td><td><div><div><p>Sets whether the alert is enabled. Include the flag to enable the alert.</p></div></div></td><td><div><div><p><code>--enabled</code></p></div></div></td></tr><tr><td><div><div><p><code>--operator</code></p></div></div></td><td><div><div><p>Condition operator that explains values in relation to threshold.<br>Supported values: <code>gt</code>, <code>lt</code>, <code>eq</code>.</p></div></div></td><td><div><div><p><code>--operator gt</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--periods</code></p></div></div></td><td><div><div><p>Number of consecutive periods condition should occur for.</p></div></div></td><td><div><div><p><code>--periods 34</code></p></div></div></td></tr><tr><td><div><div><p><code>--policyId</code></p></div></div></td><td><div><div><p>ID of a policy applied to the API instance that triggers a <code>policy-violation</code> alert type.</p></div></div></td><td><div><div><p><code>--policyId http-basic-authentication</code></p></div></div></td></tr><tr><td><div><div><p><code>--recipient</code></p></div></div></td><td><div><div><p>Username to send alert notification to.<br>Pass this flag multiple times to specify multiple usernames.</p></div></div></td><td><div><div><p><code>--recipient mulesoftuser</code></p></div></div></td></tr><tr><td><div><div><p><code>--responseCode</code></p></div></div></td><td><div><div><p>Response codes to trigger <code>response-code</code> alert type.<br>Pass this flag multiple times to specify multiple codes.</p></div></div></td><td><div><div><p><code>--responseCode 400</code></p></div></div></td></tr><tr><td><div><div><p><code>--responseTime</code></p></div></div></td><td><div><div><p>Response time to trigger <code>response-time</code> alert type.</p></div></div></td><td><div><div><p><code>--responseTime 60</code></p></div></div></td></tr><tr><td><div><div><p><code>--severity</code></p></div></div></td><td><div><div><p>Alert severity.<br>Supported values: <code>Info</code>, <code>Warning</code>, <code>Critical</code>.</p></div></div></td><td><div><div><p><code>--severity Critical</code></p></div></div></td></tr><tr><td><div><div><p><code>--threshold</code></p></div></div></td><td><div><div><p>Condition occurrences threshold number.</p></div></div></td><td><div><div><p><code>--threshold 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Alert type/condition.<br>Supported values: <code>request-count</code>, <code>response-code</code>, <code>policy-violation</code>, <code>response-time</code></p></div></div></td><td><div><div><p><code>--type response-code</code></p></div></div></td></tr></tbody></table>

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

## api-mgr:alert:list

> api-mgr:alert:list [flags] <apiInstanceId>

Lists alerts for the API instance passed in `<apiInstanceId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--limit</code></p></div></div></td><td><div><div><p>Number of results to retrieve, default is 10 results</p></div></div></td><td><div><div><p><code>--limit 5</code></p></div></div></td></tr><tr><td><div><div><p><code>--offset</code></p></div></div></td><td><div><div><p>Offsets the amount of APIs passed</p></div></div></td><td><div><div><p><code>--offset 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format<br>Supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--sort</code></p></div></div></td><td><div><div><p>Sorts the results in the field name passed<br>Supported values are: <code>id</code>, <code>name</code>, <code>createdDate</code>, and <code>updatedDate</code></p></div></div></td><td><div><div><p><code>--sort name</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:autodiscovery

> api-mgr:api:autodiscovery [flags] <apiInstanceId> <name>

This command lists the autodiscovery properties required for a gateway to track the API Instance Id
passed in `<apiInstanceId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--gatewayVersion</code></p></div></div></td><td><div><div><p>Specifies the gateway version to download</p></div></div></td><td><div><div><p><code>--gatewayVersion 4.0.1 643404 /tmp/</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format<br>Supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output table</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:change-specification

> api-mgr:api:change-specification [flags] <apiInstanceId> <assetVersion>

Changes the asset version for the API instance passed in `<apiInstanceId>` by choosing a new version
from Exchange passed in `<assetVersion>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:api:classify

> api-mgr:api:classify [flags] <destEnvName> <apiInstanceId>

Classifies the API instance passed in `<apiInstanceId>` in the environment passed in
`<destEnvName>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:api:delete

> api-mgr:api:delete [flags] <apiInstanceId>

Deletes the API instance passed in `<apiInstanceId>`. If the API instance is deployed, this command
undeploys the API instance before deleting it.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:api:deploy

> api-mgr:api:deploy [flags] <apiInstanceId>

Deploys the API instance passed in '<apiInstanceId>' to the deployment target specified using the
flags described next. Deploy any undeployed API using this command regardless of whether it was
created using the API Manager CLI or API Manager UI.

> [!NOTE] This command is only supported for endpoints with proxy.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--applicationName</code></p></div></div></td><td><div><div><p>Application name</p></div></div></td><td><div><div><p><code>--applicationName myMuleApp 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--environmentName</code></p></div></div></td><td><div><div><p>Target environment name, only for when deploying API instances from unclassified environments</p></div></div></td><td><div><div><p><code>--environmentName TestEnv 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--gatewayVersion</code></p></div></div></td><td><div><div><p>The CloudHub Gateway version</p></div></div></td><td><div><div><p><code>--gatewayVersion: 9.9.9.9 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--javaVersion</code></p></div></div></td><td><div><div><p>Gateway Java version<br>This flag only works if the target flag was set as <code>RTF</code>, <code>CH</code>, or <code>CH2</code></p></div></div></td><td><div><div><p><code>--javaVersion 17 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--releaseChannel</code></p></div></div></td><td><div><div><p>Set the name of the release channel to be used for the selected Mule version. + Supported values are <code>NONE</code>, <code>EDGE</code>, and <code>LTS</code><br>This flag only works if the target flag was set as <code>RTF</code>, <code>CH</code>, or <code>CH2</code></p></div></div></td><td><div><div><p><code>--releaseChannel EDGE 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--overwrite</code></p></div></div></td><td><div><div><p>Update application if it exists<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--overwrite</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--target</code></p></div></div></td><td><div><div><p>Hybrid, RTF, CH, or CH2 deployment target ID</p></div></div></td><td><div><div><p><code>--target 1598794 643404</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:deprecate

> api-mgr:api:deprecate [flags] <apiInstanceId>

Deprecates the API instance passed in `<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:api:describe

> api-mgr:api:describe [flags] <apiInstanceId>

Shows details of the API instance passed in `<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:api:download-proxy

> api-mgr:api:download-proxy [flags] <apiInstanceId> <targetPath>

This command downloads the API proxy ZIP file of the API instance passed in `<apiInstanceId>` to a
local directory specified in `<targetPath>`. You cannot download the API proxy of an Omni Gateway
API instance.

This command accepts the `--gatewayVersion` flag to specify the gateway version to download. For
example: `api-mgr:api:download-proxy --gatewayVersion: 4.0.1 643404 /tmp/` This command also accepts
the `--output` flag to specify the response format  
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:api:edit

> api-mgr:api:edit [flag] <apiInstanceId>

Edits the API instance passed in `<apiInstanceId>`. Editing a deployed Omni Gateway API instance
redeploys the instance.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>-f, --isFlex</code></p></div></div></td><td><div><div><p>Indicates whether this is an Omni Gateway API instance.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--isFlex</code></p></div></div></td></tr><tr><td><div><div><p><code>-m, --muleVersion4OrAbove</code></p></div></div></td><td><div><div><p>Indicates whether this is a Mule 4 API instance.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--muleVersionOrAbove</code></p></div></div></td></tr><tr><td><div><div><p><code>-p, --withProxy</code></p></div></div></td><td><div><div><p>Indicates whether the endpoint should use a proxy.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--withProxy</code></p></div></div></td></tr><tr><td><div><div><p><code>-r, --referencesUserDomain</code></p></div></div></td><td><div><div><p>Indicates whether a proxy should reference a user domain.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--referencesUserDomain</code></p></div></div></td></tr><tr><td><div><div><p><code>--apiInstanceLabel</code></p></div></div></td><td><div><div><p>API instance label</p></div></div></td><td><div><div><p><code>--apiInstanceLabel exampleLabel</code></p></div></div></td></tr><tr><td><div><div><p><code>--deploymentType</code></p></div></div></td><td><div><div><p>Deployment type<br>Options: <code>cloudhub</code>, <code>hybrid</code>, <code>rtf</code> (required)</p></div></div></td><td><div><div><p><code>--deploymentType cloudhub</code></p></div></div></td></tr><tr><td><div><div><p><code>--endpointUri</code></p></div></div></td><td><div><div><p>Consumer endpoint URI (required)</p></div></div></td><td><div><div><p><code>--endpointUri /udp://localhost:65432</code></p></div></div></td></tr><tr><td><div><div><p><code>--inboundSecretGroupId</code></p></div></div></td><td><div><div><p>Inbound secret group ID</p></div></div></td><td><div><div><p><code>--inboundSecretGroupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--inboundTlsContextId</code></p></div></div></td><td><div><div><p>Outbound TLS context ID<br>Supply the <code>--inboundSecretGroupId</code> of the TLS context’s secret group. To remove a TLS context, apply the flag with the following value: <code>--inboundTlsContextId "null"</code>.</p></div></div></td><td><div><div><p><code>--inboundTlsContextId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--outboundSecretGroupId</code></p></div></div></td><td><div><div><p>Outbound secret group ID.</p></div></div></td><td><div><div><p><code>--outboundSecretGroupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--outboundTlsContextId</code></p></div></div></td><td><div><div><p>Outbound TLS context ID.<br>Supply the <code>--outboundSecretGroupId</code> of the TLS context’s secret group. To remove a TLS context, apply the flag with the following value: <code>--outboundTlsContextId "null"</code>.</p></div></div></td><td><div><div><p><code>--outboundTlsContextId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--path</code></p></div></div></td><td><div><div><p>Proxy path (required)</p></div></div></td><td><div><div><p><code>--path /http://localhost:3000</code></p></div></div></td></tr><tr><td><div><div><p><code>--port</code></p></div></div></td><td><div><div><p>Proxy port (required)</p></div></div></td><td><div><div><p><code>--port 8080</code></p></div></div></td></tr><tr><td><div><div><p><code>--providerId</code></p></div></div></td><td><div><div><p>Client Identity Provider Id that the API is associated with<br>Default is Anypoint Platform Client Provider</p></div></div></td><td><div><div><p><code>--providerId 1787c36ab544466698e380131040faad</code></p></div></div></td></tr><tr><td><div><div><p><code>--responseTimeout</code></p></div></div></td><td><div><div><p>Maximum response timeout(required)</p></div></div></td><td><div><div><p><code>--responseTimeout 10</code></p></div></div></td></tr><tr><td><div><div><p><code>--routing</code></p></div></div></td><td><div><div><p>API instance routes as a JSON array. Each route defines a label, routing rules, and upstream references with weights.</p></div></div></td><td><div><div><p><code>--routing '[{"label":"Rule 1","rules":{"path":"/path"},"upstreams":[{"id":"upstream-id","weight":100}]}]'</code></p></div></div></td></tr><tr><td><div><div><p><code>--scheme</code></p></div></div></td><td><div><div><p>Proxy scheme (required)<br>Supported values: <code>http</code>, <code>https</code>.</p></div></div></td><td><div><div><p><code>--scheme http</code></p></div></div></td></tr><tr><td><div><div><p><code>--serviceName</code></p></div></div></td><td><div><div><p>WSDL service name<br>Omni Gateway does not support this flag</p></div></div></td><td><div><div><p><code>--serviceName ExampleServerName</code></p></div></div></td></tr><tr><td><div><div><p><code>--serviceNamespace</code></p></div></div></td><td><div><div><p>WSDL service namespace. Omni Gateway does not support this flag.</p></div></div></td><td><div><div><p><code>--serviceNamespace exampleServiceName</code></p></div></div></td></tr><tr><td><div><div><p><code>--servicePort</code></p></div></div></td><td><div><div><p>WSDL service port<br>Omni Gateway does not support this flag</p></div></div></td><td><div><div><p><code>--servicePort 443</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Endpoint type<br>Supported options: <code>http</code>, <code>raml</code>, <code>wsdl</code>, <code>mcp</code>, <code>a2a</code>, <code>llm</code>, <code>grpc</code></p></div></div></td><td><div><div><p><code>--type http</code></p></div></div></td></tr><tr><td><div><div><p><code>--updateApisInSamePort</code></p></div></div></td><td><div><div><p>Updates the TLS context of API instances sharing the port of this API.</p></div></div></td><td><div><div><p><code>--updateApisInSamePort</code></p></div></div></td></tr><tr><td><div><div><p><code>--uri</code></p></div></div></td><td><div><div><p>Implementation URI.</p></div></div></td><td><div><div><p><code>--uri /udp://localhost:65432</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:list

> api-mgr:api:list [flags]

Lists all APIs in API Manager 2.x.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--apiVersion</code></p></div></div></td><td><div><div><p>API version that filters results</p></div></div></td><td><div><div><p><code>--apiVersion 1.0.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--assetId</code></p></div></div></td><td><div><div><p>Asset ID that filters results</p></div></div></td><td><div><div><p><code>--assetId ([group_id]/)&lt;asset_id&gt;/&lt;version&gt;</code></p></div></div></td></tr><tr><td><div><div><p><code>--instanceLabel</code></p></div></div></td><td><div><div><p>API instance label that filters results</p></div></div></td><td><div><div><p><code>--instanceLabel exampleLabel</code></p></div></div></td></tr><tr><td><div><div><p><code>--limit</code></p></div></div></td><td><div><div><p>Number of results to retrieve</p></div></div></td><td><div><div><p><code>--limit 50</code></p></div></div></td></tr><tr><td><div><div><p><code>--offset</code></p></div></div></td><td><div><div><p>Offsets the amount of APIs passed</p></div></div></td><td><div><div><p><code>--offset 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--sort</code></p></div></div></td><td><div><div><p>Sorts the results in the field name passed<br>Supported values are: <code>id</code>, <code>name</code>, <code>createdDate</code>, and <code>updatedDate</code></p></div></div></td><td><div><div><p><code>--sort updatedDate</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:manage

> api-mgr:api:manage [flags] <assetId> <assetVersion>

Manages a new API, API version, or new API instance with the Exchange asset passed in `<assetId>`,
and the version passed in `<assetVersion>`.

> [!NOTE] Omni Gateway API instances created with Anypoint CLI do not support multiple upstream
> services. To create Omni Gateway API instances with multiple upstream services, see:
>
> - [Add an API in Connected Mode](../../api-manager/latest/create-instance-task-flex)
> - [Add an API in Local Mode](../../gateway/latest/flex-local-publish-api-multiple-services).

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>-f, --isFlex</code></p></div></div></td><td><div><div><p>Indicates whether this is an Omni Gateway API instance.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--isFlex</code></p></div></div></td></tr><tr><td><div><div><p><code>-m, --muleVersion4OrAbove</code></p></div></div></td><td><div><div><p>Indicates whether this is a Mule 4 API instance.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--muleVersionOrAbove</code></p></div></div></td></tr><tr><td><div><div><p><code>-p, --withProxy</code></p></div></div></td><td><div><div><p>Indicates whether the endpoint should use a proxy.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--withProxy</code></p></div></div></td></tr><tr><td><div><div><p><code>-r, --referencesUserDomain</code></p></div></div></td><td><div><div><p>Indicates whether a proxy should reference a user domain.<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--referencesUserDomain</code></p></div></div></td></tr><tr><td><div><div><p>`--apiInstanceLabel `</p></div></div></td><td><div><div><p>API instance label</p></div></div></td><td><div><div><p><code>--apiInstanceLabel exampleLabel</code></p></div></div></td></tr><tr><td><div><div><p><code>--deploymentType</code></p></div></div></td><td><div><div><p>Deployment type<br>Options: <code>cloudhub2</code>, <code>cloudhub</code>, <code>hybrid</code>, <code>rtf</code> (required)</p></div></div></td><td><div><div><p><code>--deploymentType hybrid</code></p></div></div></td></tr><tr><td><div><div><p><code>--endpointUri</code></p></div></div></td><td><div><div><p>Consumer endpoint URI (required)</p></div></div></td><td><div><div><p><code>--endpointUri /udp://localhost:65432</code></p></div></div></td></tr><tr><td><div><div><p><code>--inboundSecretGroupId</code></p></div></div></td><td><div><div><p>Inbound secret group ID</p></div></div></td><td><div><div><p><code>--inboundSecretGroupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--inboundTlsContextId</code></p></div></div></td><td><div><div><p>Outbound TLS Context ID<br>Supply the <code>--inboundSecretGroupId</code> of the TLS Context’s secret group. To remove a TLS Context, apply the flag with the following value: <code>--inboundTlsContextId "null"</code>.</p></div></div></td><td><div><div><p><code>--inboundTlsContextId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--outboundSecretGroupId</code></p></div></div></td><td><div><div><p>Outbound secret group ID.</p></div></div></td><td><div><div><p><code>--outboundSecretGroupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--outboundTlsContextId</code></p></div></div></td><td><div><div><p>Outbound TLS context ID.<br>Supply the <code>--outboundSecretGroupId</code> of the TLS context’s secret group. To remove a TLS context, apply the flag with the following value: <code>--outboundTlsContextId "null"</code>.</p></div></div></td><td><div><div><p><code>--outboundTlsContextId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--path</code></p></div></div></td><td><div><div><p>Proxy path (required)</p></div></div></td><td><div><div><p><code>--path /http://localhost:3000</code></p></div></div></td></tr><tr><td><div><div><p><code>--port</code></p></div></div></td><td><div><div><p>Proxy port (required)</p></div></div></td><td><div><div><p><code>--port 8080</code></p></div></div></td></tr><tr><td><div><div><p><code>--providerId</code></p></div></div></td><td><div><div><p>Client Identity Provider Id that the API is associated with<br>Default is Anypoint Platform Client Provider</p></div></div></td><td><div><div><p><code>--providerId 1787c36ab544466698e380131040faad</code></p></div></div></td></tr><tr><td><div><div><p><code>--responseTimeout</code></p></div></div></td><td><div><div><p>Maximum response timeout(required)</p></div></div></td><td><div><div><p><code>--responseTimeout 10</code></p></div></div></td></tr><tr><td><div><div><p><code>--scheme</code></p></div></div></td><td><div><div><p>Proxy scheme (required)<br>Supported values: <code>http</code>, <code>https</code>.</p></div></div></td><td><div><div><p><code>--scheme http</code></p></div></div></td></tr><tr><td><div><div><p><code>--serviceName</code></p></div></div></td><td><div><div><p>WSDL service name<br>Omni Gateway does not support this flag</p></div></div></td><td><div><div><p><code>--serviceName ExampleServerName</code></p></div></div></td></tr><tr><td><div><div><p><code>--serviceNamespace</code></p></div></div></td><td><div><div><p>WSDL service namespace. Omni Gateway does not support this flag.</p></div></div></td><td><div><div><p><code>--serviceNamespace exampleServiceName</code></p></div></div></td></tr><tr><td><div><div><p><code>--servicePort</code></p></div></div></td><td><div><div><p>WSDL service port<br>Omni Gateway does not support this flag</p></div></div></td><td><div><div><p><code>--servicePort 443</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Endpoint type<br>Supported options: <code>http</code>, <code>raml</code>, <code>wsdl</code>, <code>mcp</code>, <code>a2a</code>, <code>llm</code>, <code>grpc</code></p></div></div></td><td><div><div><p><code>--type http</code></p></div></div></td></tr><tr><td><div><div><p><code>--uri</code></p></div></div></td><td><div><div><p>Implementation URI</p></div></div></td><td><div><div><p><code>--uri /udp://localhost:65432</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:promote

> api-mgr:api:promote [flags] <apiInstanceId> <sourceEnvId>

Promotes the API instance passed in `<apiInstanceId>` from the source environment in
`<sourceEnvId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>-a, --copyAlerts</code></p></div></div></td><td><div><div><p>Indicates whether to copy alerts<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--copyAlerts</code></p></div></div></td></tr><tr><td><div><div><p><code>-p, --copyPolicies</code></p></div></div></td><td><div><div><p>Indicates whether to copy policies<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--copyPolicies</code></p></div></div></td></tr><tr><td><div><div><p><code>-t, --copyTiers</code></p></div></div></td><td><div><div><p>Indicates whether to copy tiers<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--copyTiers</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--providerId</code></p></div></div></td><td><div><div><p>Indicates the provider’s ID associated with the API.</p></div></div></td><td><div><div><p><code>--providerId 1787c36ab544466698e380131040faad</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:redeploy

> api-mgr:api:redeploy [flags] <apiInstanceId>

Redeploys the API instance passed in `<apiInstanceId>` to the deployment target set up in the flags
described below.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--applicationName</code></p></div></div></td><td><div><div><p>Application name</p></div></div></td><td><div><div><p><code>--applicationName Muleapp 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--environmentName</code></p></div></div></td><td><div><div><p>Target environment name<br>Include to redeploy APIs from unclassified environments</p></div></div></td><td><div><div><p><code>--environmentName mulesoftEnvironment 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--gatewayVersion</code></p></div></div></td><td><div><div><p>CloudHub Gateway version</p></div></div></td><td><div><div><p><code>--gatewayVersion 9.9.9 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--javaVersion</code></p></div></div></td><td><div><div><p>Gateway Java version<br>This flag only works if the target flag was set as <code>RTF</code>, <code>CH</code>, or <code>CH2</code></p></div></div></td><td><div><div><p><code>--javaVersion 17 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--overwrite</code></p></div></div></td><td><div><div><p>Update application if it exists<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--overwrite</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--releaseChannel</code></p></div></div></td><td><div><div><p>Set the name of the release channel to be used for the selected Mule version. + Supported values are <code>NONE</code>, <code>EDGE</code>, and <code>LTS</code><br>This flag only works if the target flag was set as <code>RTF</code>, <code>CH</code>, or <code>CH2</code></p></div></div></td><td><div><div><p><code>--releaseChannel EDGE 643404</code></p></div></div></td></tr><tr><td><div><div><p><code>--target</code></p></div></div></td><td><div><div><p>Hybrid, RTF, CH, or CH2 deployment target ID</p></div></div></td><td><div><div><p><code>--target 1598794 643404</code></p></div></div></td></tr></tbody></table>

## api-mgr:api:undeprecate

> api-mgr:api:undeprecate [flags] <apiInstanceId>

Undeprecates the API instance passed in `<apiInstanceId>`.

This commands accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:application:add-owner

> api-mgr:application:add-owner [flags] <applicationId> <id> <entityType>

Adds the owner passed in `<id>` with the entity type passed in `<entityType>` to the client
application passed in `<applicationId>`.

This command accepts the [default flags](./#default-options).

## api-mgr:application:import

> api-mgr:application:import [flags] <providerId> <clientId>

Imports the client application passed in `<clientId>` from the external client identity provider
passed in `<providerId>`. The client identity provider must have the import feature enabled.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--description</code></p></div></div></td><td><div><div><p>Description of the client application to import.</p></div></div></td><td><div><div><p><code>--description "Example application description"</code></p></div></div></td></tr><tr><td><div><div><p><code>--url</code></p></div></div></td><td><div><div><p>URL of the client application to import.</p></div></div></td><td><div><div><p><code>--url <a href="https://example.com">https://example.com</a></code></p></div></div></td></tr></tbody></table>

## api-mgr:application:possible-owners-list

> api-mgr:application:possible-owners-list [flags]

Lists the possible owners for a client application in the current organization.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--search</code></p></div></div></td><td><div><div><p>Search string to filter results.</p></div></div></td><td><div><div><p><code>--search example</code></p></div></div></td></tr><tr><td><div><div><p><code>--limit</code></p></div></div></td><td><div><div><p>Number of results to retrieve.</p></div></div></td><td><div><div><p><code>--limit 10</code></p></div></div></td></tr><tr><td><div><div><p><code>--offset</code></p></div></div></td><td><div><div><p>Number of results to skip.</p></div></div></td><td><div><div><p><code>--offset 10</code></p></div></div></td></tr></tbody></table>

## api-mgr:client-provider:list-importable

> api-mgr:client-provider:list-importable [flags]

Lists the client identity providers that have the import feature enabled in the current
organization.

This command accepts the [default flags](./#default-options).

## api-mgr:contract:delete

> api-mgr:contract:delete [flags] <apiInstanceId> <clientId>

This command deletes the contract between the API instance passed in `<apiInstanceId>`, and the
client passed in `<clientId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:contract:list

> api-mgr:contract:list [flags] <apiInstanceId> [searchText]

Lists all contracts of the API passed in `<apiInstanceId>`.

> [!TIP] You can specify keywords in searchText to limit results of APIs containing those specific
> keywords.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--limit</code></p></div></div></td><td><div><div><p>Number of results to retrieve</p></div></div></td><td><div><div><p><code>--limit 2</code></p></div></div></td></tr><tr><td><div><div><p><code>--offset</code></p></div></div></td><td><div><div><p>Offsets the amount of APIs passed</p></div></div></td><td><div><div><p><code>--offset 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--sort</code></p></div></div></td><td><div><div><p>Sorts the contracts by the criteria associated with their client applications<br>Supported values are: <code>id</code>, <code>name</code>, <code>createdDate</code>, and <code>updatedDate</code></p></div></div></td><td><div><div><p><code>--sort id</code></p></div></div></td></tr></tbody></table>

## api-mgr:policy:apply

> api-mgr:policy:apply [flags] <apiInstanceId> <policyId>

Applies the policy passed in `<policyId>` to the API instance passed in `<apiInstanceId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>-c, --config</code></p></div></div></td><td><div><div><p>Pass the configuration data as a JSON string</p></div></div></td><td><div><div><p><code>--config '{\"username\":\"user\",\"password\":\"teste\"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--configFile</code></p></div></div></td><td><div><div><p>Pass the configuration data as a file</p></div></div></td><td><div><div><p><code>--configFile ./config.json</code></p></div></div></td></tr><tr><td><div><div><p><code>--groupId</code></p></div></div></td><td><div><div><p>Mule 4 policy group ID<br>This value defaults to the MuleSoft group ID.</p></div></div></td><td><div><div><p><code>--groupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>-p, --pointcut [dataJSON]</code></p></div></div></td><td><div><div><p>Pass pointcut data as JSON strings</p></div></div></td><td><div><div><p><code>--pointcut '[{"methodRegex":"GET|PUT","uriTemplateRegex":"/users*"}]'</code></p></div></div></td></tr><tr><td><div><div><p><code>--policyVersion</code></p></div></div></td><td><div><div><p>Mule 4 policy version.</p></div></div></td><td><div><div><p><code>--policyVersion 1.0.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--upstreamId</code></p></div></div></td><td><div><div><p>Configure upstream</p></div></div></td><td><div><div><p><code>--upstreamId 550e8400-e29b-41d4-a716-446655440000</code></p></div></div></td></tr></tbody></table>

The following example defines a rate limit of one request every ten seconds:

{ "rateLimits": [{ "maximumRequests": 1, "timePeriodInMilliseconds": 10000 }], "clusterizable":
true, "exposeHeaders": false }

> [!NOTE] Even if you plan to use the default values, you must configure all required policy
> parameters when applying a policy with Anypoint CLI,

## api-mgr:policy:describe

> api-mgr:policy:describe [flags] <policyId>

Shows the description and available base configuration properties of the policy name passed in
`<policyId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--groupId</code></p></div></div></td><td><div><div><p>Mule 4 policy group ID</p></div><div><p>+ Defaults to the MuleSoft group ID.</p></div></div></td><td><div><div><p><code>--groupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--policyVersion</code></p></div></div></td><td><div><div><p>Mule 4 policy version</p></div></div></td><td><div><div><p><code>--policyVersion 1.0.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format<br>Supported values are <code>table</code> (default) and <code>json</code>.</p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## api-mgr:policy:disable

> api-mgr:policy:disable [flags] <apiInstanceId> <policyInstanceId>

Disables the policy passed in `<policyInstanceId>` from the API instance passed in
`<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:policy:edit

> api-mgr:policy:edit [flags] <apiInstanceId> <policyInstanceId>

Edits the policy configuration passed in `<policyInstanceId>` for the API instance passed in
`<apiInstanceId>`.

> [!NOTE] If you are udpating an included Mule Gateway policy, you can include only the changed
> values in the configuration. However, if you are updating a custom policy, you must send the full
> configuration each time a custom policy is edited.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>-c</code>, <code>--config</code></p></div></div></td><td><div><div><p>Pass the configuration data as a JSON string</p></div></div></td><td><div><div><p><code>--config '{\"username\":\"user\",\"password\":\"teste\"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--configFile</code></p></div></div></td><td><div><div><p>Pass the configuration data as a file</p></div></div></td><td><div><div><p><code>--configFile ./config.json</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>-p, --pointcut</code></p></div></div></td><td><div><div><p>Pass pointcut data as JSON strings</p></div></div></td><td><div><div><p><code>-p '[{"methodRegex":"GET|PUT","uriTemplateRegex":"/users*"}]'</code></p></div></div></td></tr></tbody></table>

## api-mgr:policy:enable

> api-mgr:policy:enable [flags] <apiInstanceId> <policyInstanceId>

Enables the policy passed in `<policyInstanceId>` for the API instance passed in `<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:policy:list

> api-mgr:policy:list [flags] [apiInstanceId]

Lists all policies for all APIs in API Manager 2.x.  
Specify the `--apiInstanceId` flag to list the policies applied to that API instance. Without the
`--apiInstanceId` flag, the command lists all policies for all APIs.

This command accepts the `-m, --muleVersion4OrAbove` flag.

This command accepts the [default flags](./#default-options).

## api-mgr:policy:remove

> api-mgr:policy:remove [flags] <apiInstanceId> <policyInstanceId>

This command removes the policy specified in `<policyInstanceId>` from the API instance passed in
`<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:tier:add

> api-mgr:tier:add [flags] <apiInstanceId>

This command creates an SLA tier for the API instance passed in `<apiInstanceId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>-a, --autoApprove</code></p></div></div></td><td><div><div><p>Indicates whether the SAL tier should be auto-approved<br>Include the flag to enable it</p></div></div></td><td><div><div><p><code>--autoApprove</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Tier name</p></div></div></td><td><div><div><p><code>--name muleSLAtier</code></p></div></div></td></tr><tr><td><div><div><p><code>--description</code></p></div></div></td><td><div><div><p>Tier description</p></div></div></td><td><div><div><p><code>--description tier example description</code></p></div></div></td></tr><tr><td><div><div><p><code>-l, --limit</code></p></div></div></td><td><div><div><p>Single instance of an SLA tier limit in the form <code>--limit A,B,C</code> where:</p></div><div><ul><li><p><code>A</code> is a boolean indicating whether this limit is visible to the user.</p></li><li><p><code>B</code> is a number of requests per "C" time period.</p></li><li><p><code>C</code> is the time period unit. Time period options are:</p><div><ul><li><p><code>ms</code>(millisecond)</p></li><li><p><code>sec</code>(second)</p></li><li><p><code>min</code>(minute)</p></li><li><p><code>hr</code>(hour)</p></li><li><p><code>d</code>(day)</p></li><li><p><code>wk</code>(week)</p></li><li><p><code>mo</code>(month)</p></li><li><p><code>yr</code>(year)</p></li></ul></div></li></ul></div></div></td><td><div><div><p><code>--limit true,100,min</code><br></p></div><div><div data-type="TIP">To create multiple limits, you can provide multiple <code>--limit</code> options.<br>For example: <code>-l true,100,sec -l false,20,min</code>.</div></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## api-mgr:tier:copy

> api-mgr:tier:copy [flags] <sourceAPIInstanceId> <targetAPIInstanceId>

Copies the SLA tier from the API instance passed in `<sourceAPIInstanceId>` to the API instance Id
passed in `<targetAPIInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:tier:delete

> api-mgr:tier:delete [flags] <apiInstanceId> <tierId>

This command deletes the SLA tier passed in `<tierId>` from API instance passed in
`<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:tier:list

> api-mgr:tier:list [flags] <apiInstanceId> [searchText]

This command lists the SLA tiers of the API instance passed in `<apiInstanceId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--limit</code></p></div></div></td><td><div><div><p>Number of results to retrieve</p></div></div></td><td><div><div><p><code>--limit 2</code></p></div></div></td></tr><tr><td><div><div><p><code>--offset</code></p></div></div></td><td><div><div><p>Offsets the amount of APIs passed</p></div></div></td><td><div><div><p><code>--offset 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--sort</code></p></div></div></td><td><div><div><p>Sorts the results in the field name passed<br>Supported values are: <code>id</code>, <code>name</code>, <code>createdDate</code>, and <code>updatedDate</code></p></div></div></td><td><div><div><p><code>--sort id</code></p></div></div></td></tr></tbody></table>

## api-mgr:upstream:add

> api-mgr:upstream:add [flags] <apiInstanceId> <uri>

Creates an upstream for the API instance passed in `<apiInstanceId>` with the URI passed in `<uri>`.

In addition to the [default flags](./#default-options), this command accepts these flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--label</code></p></div></div></td><td><div><div><p>Label for the upstream</p></div></div></td><td><div><div><p><code>--label my-upstream</code></p></div></div></td></tr><tr><td><div><div><p><code>--tlsContextId</code></p></div></div></td><td><div><div><p>TLS context ID to set on the upstream</p></div></div></td><td><div><div><p><code>--tlsContextId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--tlsContextSecretGroupId</code></p></div></div></td><td><div><div><p>Secret group ID for the TLS context specified in <code>--tlsContextId</code></p></div></div></td><td><div><div><p><code>--tlsContextSecretGroupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Format for the response, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## api-mgr:upstream:bulk-edit

> api-mgr:upstream:bulk-edit [flags] <apiInstanceId>

Bulk edits the TLS context for all upstreams of the API instance passed in `<apiInstanceId>` using a
single API update.

In addition to the [default flags](./#default-options), this command accepts these flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--tlsContextId</code> <strong>(required)</strong></p></div></div></td><td><div><div><p>TLS context ID to set on all upstreams. Pass <code>null</code> to remove the TLS context from all upstreams.</p></div></div></td><td><div><div><p><code>--tlsContextId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--tlsContextSecretGroupId</code></p></div></div></td><td><div><div><p>Secret group ID for the TLS context specified in <code>--tlsContextId</code></p></div></div></td><td><div><div><p><code>--tlsContextSecretGroupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Format for the response, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## api-mgr:upstream:delete

> api-mgr:upstream:delete [flags] <apiInstanceId> <upstreamId>

Deletes the upstream passed in `<upstreamId>` from the API instance passed in `<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## api-mgr:upstream:edit

> api-mgr:upstream:edit [flags] <apiInstanceId> <upstreamId>

Edits the upstream passed in `<upstreamId>` for the API instance passed in `<apiInstanceId>`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--uri</code></p></div></div></td><td><div><div><p>Upstream URI</p></div></div></td><td><div><div><p><code>--uri <a href="https://backend.example.com">https://backend.example.com</a></code></p></div></div></td></tr><tr><td><div><div><p><code>--label</code></p></div></div></td><td><div><div><p>Label for the upstream</p></div></div></td><td><div><div><p><code>--label my-upstream</code></p></div></div></td></tr><tr><td><div><div><p><code>--tlsContextId</code></p></div></div></td><td><div><div><p>TLS context ID to set on the upstream. Pass <code>null</code> to remove the TLS context.</p></div></div></td><td><div><div><p><code>--tlsContextId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--tlsContextSecretGroupId</code></p></div></div></td><td><div><div><p>Secret group ID for the TLS context specified in <code>--tlsContextId</code></p></div></div></td><td><div><div><p><code>--tlsContextSecretGroupId 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Format for the response, supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## api-mgr:upstream:list

> api-mgr:upstream:list [flags] <apiInstanceId>

Lists all upstreams for the API instance passed in `<apiInstanceId>`.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).
