---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Managed Omni Gateways

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-gateways-managed-create">runtime-mgr:gateways:managed:create</a></p></div></div></td><td><div><div><p>Create a Managed Omni Gateway</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-gateways-managed-delete">runtime-mgr:gateways:managed:delete</a></p></div></div></td><td><div><div><p>Delete a Managed Omni Gateway</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-gateways-managed-describe">runtime-mgr:gateways:managed:describe</a></p></div></div></td><td><div><div><p>Describe a specific Managed Omni Gateway</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-gateways-managed-edit">runtime-mgr:gateways:managed:edit</a></p></div></div></td><td><div><div><p>Edit a Managed Omni Gateway</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-gateways-managed-list">runtime-mgr:gateways:managed:list</a></p></div></div></td><td><div><div><p>Lists all Managed Omni Gateways in the environment</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-gateways-managed-start">runtime-mgr:gateways:managed:start</a></p></div></div></td><td><div><div><p>Start a Managed Omni Gateway</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-gateways-managed-stop">runtime-mgr:gateways:managed:stop</a></p></div></div></td><td><div><div><p>Stop a Managed Omni Gateway</p></div></div></td></tr></tbody></table>

## runtime-mgr:gateways:managed:create

> runtime-mgr:gateways:managed:create <name> <targetId> <size> [flags]

Creates a new Managed Omni Gateway with the specified configuration  
The gateway will be deployed to the specified `targetId`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--releaseChannel</code></p></div></div></td><td><div><div><p>Release channel (required). Supported values: <code>edge</code>, <code>lts</code></p></div></div></td><td><div><div><p><code>--releaseChannel edge</code></p></div></div></td></tr><tr><td><div><div><p><code>--version</code></p></div></div></td><td><div><div><p>Runtime version. Use <code>latest</code> for the most recent version available for the configured release channel.<br>Default: <code>latest</code></p></div></div></td><td><div><div><p><code>--version 1.10.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--publicUrl</code></p></div></div></td><td><div><div><p>Public URL(s). For multiple URLs, separate them with commas</p></div></div></td><td><div><div><p><code>--publicUrl <a href="https://my-gateway.example.com/">https://my-gateway.example.com/</a></code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]lastMileSecurity</code></p></div></div></td><td><div><div><p>Enable or disable ingress last mile security.<br>Default: <code>false</code></p></div></div></td><td><div><div><p><code>--lastMileSecurity</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]forwardSslSession</code></p></div></div></td><td><div><div><p>Enable or disable ingress forward SSL session.<br>Default: <code>false</code></p></div></div></td><td><div><div><p><code>--forwardSslSession</code></p></div></div></td></tr><tr><td><div><div><p><code>--upstreamResponseTimeout</code></p></div></div></td><td><div><div><p>Upstream response timeout in seconds.<br>Default: <code>15</code></p></div></div></td><td><div><div><p><code>--upstreamResponseTimeout 30</code></p></div></div></td></tr><tr><td><div><div><p><code>--connectionIdleTimeout</code></p></div></div></td><td><div><div><p>Connection idle timeout in seconds.<br>Default: <code>60</code></p></div></div></td><td><div><div><p><code>--connectionIdleTimeout 120</code></p></div></div></td></tr><tr><td><div><div><p><code>--loggingLevel</code></p></div></div></td><td><div><div><p>Logging level. Supported values: <code>debug</code>, <code>info</code>, <code>warn</code>, <code>error</code>, <code>fatal</code>.<br>Default: <code>info</code></p></div></div></td><td><div><div><p><code>--loggingLevel debug</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]forwardLogs</code></p></div></div></td><td><div><div><p>Enable or disable log forwarding.<br>Default: <code>true</code></p></div></div></td><td><div><div><p><code>--no-forwardLogs</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]tracingEnabled</code></p></div></div></td><td><div><div><p>Enable or disable tracing.<br>Default: <code>false</code></p></div></div></td><td><div><div><p><code>--tracingEnabled</code></p></div></div></td></tr><tr><td><div><div><p><code>--tracingSampling</code></p></div></div></td><td><div><div><p>Tracing sampling percentage (1-100). Note: High values may impact performance.<br>Default: <code>1</code></p></div></div></td><td><div><div><p><code>--tracingSampling 50</code></p></div></div></td></tr><tr><td><div><div><p><code>--tracingLabels</code></p></div></div></td><td><div><div><p>Tracing labels attributes as JSON string</p></div></div></td><td><div><div><p><code>--tracingLabels '[{"type":"environment","name":"prod","keyName":"env","defaultValue":"production"}]'</code></p></div></div></td></tr></tbody></table>

## runtime-mgr:gateways:managed:delete

> runtime-mgr:gateways:managed:delete <managedGatewayId> [flags]

Deletes a Managed Omni Gateway  
If the gateway has associated APIs, the command will display a list of those APIs and prevent
deletion until they are removed.

This command accepts the [default flags](./#default-options).

## runtime-mgr:gateways:managed:describe

> runtime-mgr:gateways:managed:describe <managedGatewayId> [flags]

Displays detailed information about a specific Managed Omni Gateway

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:gateways:managed:edit

> runtime-mgr:gateways:managed:edit <managedGatewayId> [flags]

Edits the configuration of an existing Managed Omni Gateway. You must specify at least one flag to
modify. Only the specified flags will be updated; all other settings will remain unchanged.

> [!IMPORTANT] If you specify `--tracingLabels` or `--tracingSampling` without enabling tracing, the
> command will return an error.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--releaseChannel</code></p></div></div></td><td><div><div><p>Release channel. Supported values: <code>edge</code>, <code>lts</code></p></div></div></td><td><div><div><p><code>--releaseChannel lts</code></p></div></div></td></tr><tr><td><div><div><p><code>--version</code></p></div></div></td><td><div><div><p>Runtime version. Use <code>latest</code> for the most recent version</p></div></div></td><td><div><div><p><code>--version 1.10.3</code></p></div></div></td></tr><tr><td><div><div><p><code>--publicUrl</code></p></div></div></td><td><div><div><p>Public URL(s). For multiple URLs, separate them with commas</p></div></div></td><td><div><div><p><code>--publicUrl <a href="https://new-gateway.example.com/">https://new-gateway.example.com/</a></code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]lastMileSecurity</code></p></div></div></td><td><div><div><p>Enable or disable ingress last mile security</p></div></div></td><td><div><div><p><code>--no-lastMileSecurity</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]forwardSslSession</code></p></div></div></td><td><div><div><p>Enable or disable ingress forward SSL session</p></div></div></td><td><div><div><p><code>--forwardSslSession</code></p></div></div></td></tr><tr><td><div><div><p><code>--upstreamResponseTimeout</code></p></div></div></td><td><div><div><p>Upstream response timeout in seconds</p></div></div></td><td><div><div><p><code>--upstreamResponseTimeout 45</code></p></div></div></td></tr><tr><td><div><div><p><code>--connectionIdleTimeout</code></p></div></div></td><td><div><div><p>Connection idle timeout in seconds</p></div></div></td><td><div><div><p><code>--connectionIdleTimeout 180</code></p></div></div></td></tr><tr><td><div><div><p><code>--loggingLevel</code></p></div></div></td><td><div><div><p>Logging level. Supported values: <code>debug</code>, <code>info</code>, <code>warn</code>, <code>error</code>, <code>fatal</code></p></div></div></td><td><div><div><p><code>--loggingLevel error</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]forwardLogs</code></p></div></div></td><td><div><div><p>Enable or disable log forwarding</p></div></div></td><td><div><div><p><code>--no-forwardLogs</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]tracingEnabled</code></p></div></div></td><td><div><div><p>Enable or disable tracing</p></div></div></td><td><div><div><p><code>--tracingEnabled</code></p></div></div></td></tr><tr><td><div><div><p><code>--tracingSampling</code></p></div></div></td><td><div><div><p>Tracing sampling percentage (1-100)</p></div></div></td><td><div><div><p><code>--tracingSampling 75</code></p></div></div></td></tr><tr><td><div><div><p><code>--tracingLabels</code></p></div></div></td><td><div><div><p>Tracing labels attributes as JSON string</p></div></div></td><td><div><div><p><code>--tracingLabels '[{"type":"custom","name":"region","keyName":"region","defaultValue":"us-east"}]'</code></p></div></div></td></tr></tbody></table>

## runtime-mgr:gateways:managed:list

> runtime-mgr:gateways:managed:list [flags]

Lists all Managed Omni Gateways in the current environment  
The list includes gateway IDs, names, statuses, runtime versions, and target information.

This command accepts the [default flags](./#default-options).

## runtime-mgr:gateways:managed:start

> runtime-mgr:gateways:managed:start <managedGatewayId> [flags]

Starts a stopped Managed Omni Gateway

This command accepts the [default flags](./#default-options).

## runtime-mgr:gateways:managed:stop

> runtime-mgr:gateways:managed:stop <managedGatewayId> [flags]

Stops a running Managed Omni Gateway

This command accepts the [default flags](./#default-options).
