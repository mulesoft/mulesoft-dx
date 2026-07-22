---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for DX Mule Plugin

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use these commands to manage Mule Runtimes, scaffold Mule projects, and introspect connector
metadata from the command line.

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#dx-mule-runtime-list">dx:mule:runtime:list</a></p></div></div></td><td><div><div><p>Lists all available Mule runtime versions from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#dx-mule-runtime-download">dx:mule:runtime:download</a></p></div></div></td><td><div><div><p>Downloads a Mule runtime to the local machine</p></div></div></td></tr><tr><td><div><div><p><a href="#dx-mule-runtime-path">dx:mule:runtime:path</a></p></div></div></td><td><div><div><p>Shows or sets the path to the local Mule runtime installation</p></div></div></td></tr><tr><td><div><div><p><a href="#dx-mule-project-create">dx:mule:project:create</a></p></div></div></td><td><div><div><p>Scaffolds a new Mule project with Maven structure and connector dependencies</p></div></div></td></tr><tr><td><div><div><p><a href="#dx-mule-describe-connector">dx:mule:describe-connector</a></p></div></div></td><td><div><div><p>Introspects a connector’s operations, sources, configs, and connection providers</p></div></div></td></tr></tbody></table>

## dx:mule:runtime:list

> anypoint-cli-v4 dx:mule:runtime:list [flags]

Lists all available Mule runtime versions from Exchange.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command requires Anypoint credentials (username/password, client ID/secret, or bearer token).

This command accepts the [default flags](./#default-options).

## dx:mule:runtime:download

> anypoint-cli-v4 dx:mule:runtime:download [flags]

Downloads a Mule runtime to the local machine. If `--version` is omitted, the latest available
version is downloaded.

This command requires Anypoint credentials (username/password, client ID/secret, or bearer token).

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--version &lt;value&gt;</code></p></div></div></td><td><div><div><p>Mule runtime version to download. If omitted, downloads the latest available version.</p></div></div></td><td><div><div><p><code>--version 4.6.0</code></p></div></div></td></tr></tbody></table>

## dx:mule:runtime:path

> anypoint-cli-v4 dx:mule:runtime:path [flags]

Shows the path to the local Mule runtime installation. Use `--set` to point the CLI to a specific
runtime directory.

No Anypoint credentials are required for this command.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--set &lt;value&gt;</code></p></div></div></td><td><div><div><p>Sets the path to the local Mule runtime installation</p></div></div></td><td><div><div><p><code>--set ~/mule-enterprise-standalone-4.11.2</code></p></div></div></td></tr></tbody></table>

## dx:mule:project:create

> anypoint-cli-v4 dx:mule:project:create <PROJECTNAME> --group-id <value> [flags]

Scaffolds a new Mule project with a standard Maven structure and the specified connector
dependencies.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--group-id &lt;value&gt;</code> <strong>(required)</strong></p></div></div></td><td><div><div><p>Maven group ID for the project</p></div></div></td><td><div><div><p><code>--group-id com.example</code></p></div></div></td></tr><tr><td><div><div><p><code>--dependencies &lt;value&gt;</code></p></div></div></td><td><div><div><p>Comma-separated list of connector dependencies in <code>groupId:artifactId:version</code> (GAV) format</p></div></div></td><td><div><div><p><code>--dependencies "com.mulesoft.connectors:mule-salesforce-connector:10.20.0"</code></p></div></div></td></tr><tr><td><div><div><p><code>--mule-version &lt;value&gt;</code></p></div></div></td><td><div><div><p>Mule runtime version for the project. Default: <code>4.4.0</code></p></div></div></td><td><div><div><p><code>--mule-version 4.6.0</code></p></div></div></td></tr></tbody></table>

### Example

$ anypoint-cli-v4 dx:mule:project:create my-integration \\ --group-id com.example \\ --dependencies
"com.mulesoft.connectors:mule-salesforce-connector:10.20.0" \\ --mule-version 4.6.0

## dx:mule:describe-connector

> anypoint-cli-v4 dx:mule:describe-connector --connector <groupId:artifactId:version> [flags]

Introspects a connector and returns details about its operations, event sources, configurations, and
connection providers. Use `--type` to drill into a specific component.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--connector &lt;value&gt;</code> <strong>(required)</strong></p></div></div></td><td><div><div><p>Connector GAV coordinates in <code>groupId:artifactId:version</code> format</p></div></div></td><td><div><div><p><code>--connector com.mulesoft.connectors:mule-salesforce-connector:10.20.0</code></p></div></div></td></tr><tr><td><div><div><p><code>--type &lt;value&gt;</code></p></div></div></td><td><div><div><p>Detail type to return. If omitted, returns a high-level overview (namespace, operations, sources, configs).<br>Supported values: <code>operation</code>, <code>source</code>, <code>connection-provider</code></p></div></div></td><td><div><div><p><code>--type operation</code></p></div></div></td></tr><tr><td><div><div><p><code>--name &lt;value&gt;</code></p></div></div></td><td><div><div><p>Name of the component to inspect. Required when <code>--type</code> is set.</p></div></div></td><td><div><div><p><code>--name query</code></p></div></div></td></tr><tr><td><div><div><p><code>--config-name &lt;value&gt;</code></p></div></div></td><td><div><div><p>Configuration name. Required when <code>--type</code> is <code>connection-provider</code>.</p></div></div></td><td><div><div><p><code>--config-name sfdc-config</code></p></div></div></td></tr><tr><td><div><div><p><code>--output &lt;value&gt;</code></p></div></div></td><td><div><div><p>Output format. Supported values: <code>table</code> (default), <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

### Examples

Get a high-level overview of a connector

$ anypoint-cli-v4 dx:mule:describe-connector \\ --connector
com.mulesoft.connectors:mule-salesforce-connector:10.20.0 \\ --output json

Get details for a specific operation

$ anypoint-cli-v4 dx:mule:describe-connector \\ --connector
com.mulesoft.connectors:mule-salesforce-connector:10.20.0 \\ --type operation --name query --output
json

Get details for a specific event source

$ anypoint-cli-v4 dx:mule:describe-connector \\ --connector
com.mulesoft.connectors:mule-salesforce-connector:10.20.0 \\ --type source --name on-new-object
--output json

Get details for a connection provider

$ anypoint-cli-v4 dx:mule:describe-connector \\ --connector
com.mulesoft.connectors:mule-salesforce-connector:10.20.0 \\ --type connection-provider --name
basic-connection --config-name sfdc-config --output json
