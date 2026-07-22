---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Cloudhub 2.0

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use these commands for deploying and managing applications in Cloudhub 2.0. For more information
about how to use these commands, refer to the [CloudHub documentation](../../cloudhub/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-application-delete">runtime-mgr:application:delete</a></p></div></div></td><td><div><div><p>Deletes an application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-describe">runtime-mgr:application:describe</a></p></div></div></td><td><div><div><p>Describes an application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-deploy">runtime-mgr:application:deploy</a></p></div></div></td><td><div><div><p>Deploys an application to a specified target using an Exchange application and runs the specified runtime version</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-download-logs">runtime-mgr:application:download:logs</a></p></div></div></td><td><div><div><p>Downloads logs of an application from a specification to a specified directory</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-list">runtime-mgr:application:list</a></p></div></div></td><td><div><div><p>Lists all applications in an organization</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-modify">runtime-mgr:application:modify</a></p></div></div></td><td><div><div><p>Modifies a deployed application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-start">runtime-mgr:application:start</a></p></div></div></td><td><div><div><p>Starts a stopped application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-stop">runtime-mgr:application:stop</a></p></div></div></td><td><div><div><p>Stops running an application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-application-logs">runtime-mgr:application:logs</a></p></div></div></td><td><div><div><p>Tails an application’s logs from a specification</p></div></div></td></tr></tbody></table>

## runtime-mgr:application:delete

> runtime-mgr:application:delete [flags] <appID>

Deletes the running application specified in `<appID>`. To get this ID, run the
`runtime-mgr application list` command.

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## runtime-mgr:application:describe

> runtime-mgr:application:describe [flags] <appID>

Displays information about the application specified in `<appID>`. To get this ID, run the
`runtime-mgr application list` command.

This command has the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:application:deploy

> runtime-mgr:application:deploy <appID> <deploymentTargetID> <runtimeVersion> <artifactID>
[flags]

Deploys the application specified in `<appID>` to the deployment target specified using the
following options:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Value</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--artifactId</code></p></div></div></td><td><div><div><p>Artifact ID of the application retrieved from Exchange.</p></div></div></td><td><div><div><p><code>--artifactId mule-test-plugin</code></p></div></div></td></tr><tr><td><div><div><p><code>--deploymentTargetId</code></p></div></div></td><td><div><div><p>ID of the deployment target.<br>You can get this ID directly from Runtime Manager.</p></div></div></td><td><div><div><p><code>--deploymentTargetId cloudhub-ap-northeast-1</code></p></div></div></td></tr><tr><td><div><div><p><code>--instanceType</code></p></div></div></td><td><div><div><p>Instance type<br>Only UBP organizations can use this flag. Non-UBP organizations use the <code>--replicaSize</code> flag</p></div></div></td><td><div><div><p><code>--instanceType mule.micro</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Name of the application to deploy.</p></div></div></td><td><div><div><p><code>--name testcloudhub2app</code></p></div></div></td></tr><tr><td><div><div><p><code>--replicaSize</code></p></div></div></td><td><div><div><p>Size of replicas in Vcores.<br>Default: <code>0.1</code></p></div></div></td><td><div><div><p><code>--replicaSize 0.5</code></p></div></div></td></tr><tr><td><div><div><p><code>--runtimeVersion</code></p></div></div></td><td><div><div><p>Runtime version of the deployment target.</p></div></div></td><td><div><div><p><code>--runtimeVersion 4.4.0</code></p></div></div></td></tr><tr><td><div><div><p><code>--secureProperty</code></p></div></div></td><td><div><div><p>Sets an encrypted property.</p></div></div></td><td><div><div><p><code>--secureProperty secureTestProperty:true</code></p></div></div></td></tr></tbody></table>

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--assetVersion</code></p></div></div></td><td><div><div><p>Version of the Exchange application to use.</p></div></div></td><td><div><div><p><code>--assetVersion 2.0.4</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]clustered</code></p></div></div></td><td><div><div><p>Enables clustered nodes, which requires at least two replicas.<br>Default:.<code>disabled</code></p></div></div></td><td><div><div><p><code>--no-clustered</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]disableAmLogForwarding</code></p></div></div></td><td><div><div><p>Disables forwarding applications logs to Anypoint Monitoring.<br>Default: <code>enabled</code></p></div></div></td><td><div><div><p><code>--disableAmLogForwarding</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]forwardSslSession</code></p></div></div></td><td><div><div><p>Enables SSL session forwarding.<br>Default: <code>disabled</code></p></div></div></td><td><div><div><p><code>--no-forwardSslSession</code></p></div></div></td></tr><tr><td><div><div><p><code>--groupId</code></p></div></div></td><td><div><div><p>Group ID of the asset to deploy.<br>Default: selected organization ID</p></div></div></td><td><div><div><p><code>--groupId org.mule.test</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]lastMileSecurity</code></p></div></div></td><td><div><div><p>Enables Last Mile Security.<br>Default: <code>disabled</code></p></div></div></td><td><div><div><p><code>--no-lastMileSecurity</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]objectStoreV2</code></p></div></div></td><td><div><div><p>Enables Object Store v2.<br>Default: <code>disabled</code></p></div></div></td><td><div><div><p><code>--no-objectStoreV2</code></p></div></div></td></tr><tr><td><div><div><p>--javaVersion</p></div></div></td><td><div><div><p>Set the name of the Java version to be used for the selected Mule version. Supported values are <code>8</code> and <code>17</code>. If you do not specify a value, CloudHub API imposes the default value. The default Java version for Mule 4.6 and earlier versions is '8'. If you don’t specify a Mule version, the default Mule version for the selected Java version is used. If the Java version you select is not available for the specified Mule version, you get an error.</p></div></div></td><td><div><div><p><code>--javaVersion 8</code></p></div></div></td></tr><tr><td><div><div><p><code>--pathRewrite</code></p></div></div></td><td><div><div><p>Supplies the base path expected by the HTTP listener in your application.<br>Format: must begin with <code>/</code></p></div></div></td><td><div><div><p><code>--pathRewrite /http://localhost:3000</code></p></div></div></td></tr><tr><td><div><div><p><code>--property</code></p></div></div></td><td><div><div><p>Sets a property.<br>Format: <code>name:value</code></p></div></div></td><td><div><div><p><code>--property testproperty:true</code></p></div></div></td></tr><tr><td><div><div><p><code>--propertiesFile</code></p></div></div></td><td><div><div><p>Replaces all properties with values from a selected file.<br>Format: one or more lines in <code>name: value</code> style</p></div></div></td><td><div><div><p><code>--propertiesFile /Users/mule/Documents/properties.txt</code></p></div></div></td></tr><tr><td><div><div><p><code>--publicEndpoints</code></p></div></div></td><td><div><div><p>Supplies endpoints to reach via the public internet.<br>Format: separated by commas, no spaces</p></div></div></td><td><div><div><p><code>--publicEndpoints my-superapp-example/status?limit=10</code></p></div></div></td></tr><tr><td><div><div><p>--releaseChannel</p></div></div></td><td><div><div><p>Set the name of the release channel to be used for the selected Mule version. Supported values are <code>NONE</code>, <code>EDGE</code>, and <code>LTS</code>. If you do not specify a value, CloudHub API imposes the default value. The default release channel is <code>EDGE</code>. If you don’t specify a Mule version, the default Mule version for the selected release channel is used. If the selected release channel doesn’t exist, you get an error.</p></div></div></td><td><div><div><p><code>--releaseChannel LTS</code></p></div></div></td></tr><tr><td><div><div><p><code>--replicas</code></p></div></div></td><td><div><div><p>Number of replicas. Must be above <code>0</code>.<br>Default: <code>1</code></p></div></div></td><td><div><div><p><code>--replicas 2</code></p></div></div></td></tr><tr><td><div><div><p><code>--replicaSize</code></p></div></div></td><td><div><div><p>Size of replicas in Vcores.<br>Default: <code>0.1</code></p></div></div></td><td><div><div><p><code>--replicaSize 0.5</code></p></div></div></td></tr><tr><td><div><div><p><code>--scopeLoggingConfig</code></p></div></div></td><td><div><div><p>Defines scope logging.<br>Format: <code>scopeName: logLevel</code>, separated by commas, no spaces</p></div></div></td><td><div><div><p><code>--scopeLoggingConfig testscope1:WARN,testscope2:DEBUG</code></p></div></div></td></tr><tr><td><div><div><p><code>--scopeLoggingConfigFile</code></p></div></div></td><td><div><div><p>Uploads a file to define scope logging.<br>Format: one tuple per line, style: <code>{scope: scopeName, logLevel: logLevelType}</code> enclosed with <code>{}</code> <code>()</code> or <code>[]</code></p></div></div></td><td><div><div><p><code>--scopeLoggingConfigFile /Users/mule/Documents/cert.txt</code></p></div></div></td></tr><tr><td><div><div><p><code>--updateStrategy</code></p></div></div></td><td><div><div><p>Updates the strategy used.<br>Default: <code>rolling</code></p></div></div></td><td><div><div><p><code>--updateStrategy recreate</code></p></div></div></td></tr></tbody></table>

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

## runtime-mgr:application:download-logs

> runtime-mgr:application:download-logs [flags] <appID> <directory> <specID>

Downloads logs for the application specified in `<appID>` from the specification specified in
`<specID>` to the selected directory.

To get the `<appID>`, run the `runtime-mgr application list` command.

To get the `<specID>` run the `runtime-mgr application describe` command.

This command accepts the [default flags](./#default-options).

## runtime-mgr:application:list

> runtime-mgr:application:list [flags]

Lists all applications in your organization.

This command has the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:application:modify

> runtime-mgr:application:modify <appID> <certificateName> [flags]

Updates the settings of an existing application specified in `<appID>`. To get the `<appID>`, run
the `runtime-mgr application list` command.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--artifactId</code></p></div></div></td><td><div><div><p>ID of the application retrieved from Exchange.</p></div></div></td><td><div><div><p><code>--artifactId mule-maven-plugin</code></p></div></div></td></tr><tr><td><div><div><p><code>--assetVersion</code></p></div></div></td><td><div><div><p>Version of the Exchange application to use.</p></div></div></td><td><div><div><p><code>--assetVersion 2.0.4</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]clustered</code></p></div></div></td><td><div><div><p>Enables clustered nodes, which requires at least two replicas.<br>Default: <code>disabled</code></p></div></div></td><td><div><div><p><code>--no-clustered</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]disableAmLogForwarding</code></p></div></div></td><td><div><div><p>Disables forwarding applications logs to Anypoint Monitoring.<br>Default: <code>enabled</code></p></div></div></td><td><div><div><p><code>--disableAmLogForwarding</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]forwardSslSession</code></p></div></div></td><td><div><div><p>Enables SSL session forwarding.<br>Default: <code>disabled</code></p></div></div></td><td><div><div><p><code>--no-forwardSslSession</code></p></div></div></td></tr><tr><td><div><div><p><code>--groupId</code></p></div></div></td><td><div><div><p>Group ID of the asset to deploy.<br>Default: selected organization ID.</p></div></div></td><td><div><div><p><code>--groupId org.mule.testgroup</code></p></div></div></td></tr><tr><td><div><div><p><code>--instanceType</code></p></div></div></td><td><div><div><p>Instance type<br>Only UBP organizations can use this flag. Non-UBP organizations use the <code>--replicaSize</code> flag</p></div></div></td><td><div><div><p><code>--instanceType mule.nano</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]lastMileSecurity</code></p></div></div></td><td><div><div><p>Enables Last Mile Security.<br>Default: <code>disabled</code></p></div></div></td><td><div><div><p><code>--no-lastMileSecurity</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]objectStoreV2</code></p></div></div></td><td><div><div><p>Enables object store v2.<br>Default: <code>disabled</code></p></div></div></td><td><div><div><p><code>--no-objectStoreV2</code></p></div></div></td></tr><tr><td><div><div><p><code>--pathRewrite</code></p></div></div></td><td><div><div><p>Supplies the base path expected by the HTTP listener in your application.<br>Format: must begin with <code>/</code></p></div></div></td><td><div><div><p><code>--pathRewrite /http://localhost:3000</code>.</p></div></div></td></tr><tr><td><div><div><p><code>--property</code></p></div></div></td><td><div><div><p>Sets a property.<br>Format: <code>name:value</code></p></div></div></td><td><div><div><p><code>--property testproperty:true</code></p></div></div></td></tr><tr><td><div><div><p><code>--propertiesFile</code></p></div></div></td><td><div><div><p>Replaces all properties with values from a selected file.<br>Format: one or more lines in <code>name: value</code> style</p></div></div></td><td><div><div><p><code>--propertiesFile /Users/mule/Documents/properties.txt</code></p></div></div></td></tr><tr><td><div><div><p><code>--publicEndpoints</code></p></div></div></td><td><div><div><p>Supplies endpoints to reach via the public internet.<br>Format: separated by commas, no spaces</p></div></div></td><td><div><div><p><code>--publicEndpoints my-superapp-example/status?limit=10</code></p></div></div></td></tr><tr><td><div><div><p><code>--replicas</code></p></div></div></td><td><div><div><p>Number of replicas. Must be above <code>0</code>.<br>Default: <code>1</code></p></div></div></td><td><div><div><p><code>--replicas 2</code></p></div></div></td></tr><tr><td><div><div><p><code>--replicaSize</code></p></div></div></td><td><div><div><p>Size of replicas in Vcores.<br>Default: <code>0.1</code></p></div></div></td><td><div><div><p><code>--replicaSize 0.5</code></p></div></div></td></tr><tr><td><div><div><p><code>--runtimeVersion</code></p></div></div></td><td><div><div><p>Runtime version of the deployment target.</p></div></div></td><td><div><div><p><code>--runtimeVersion 4.4.0</code></p></div></div></td></tr><tr><td><div><div><p><code>--secureProperty</code></p></div></div></td><td><div><div><p>Sets an encripted property.</p></div></div></td><td><div><div><p><code>--secureProperty secureTestProperty:true</code></p></div></div></td></tr><tr><td><div><div><p><code>--scopeLoggingConfig</code></p></div></div></td><td><div><div><p>Defines scope logging.<br>Format: <code>scopeName: logLevel</code>, separated by commas, no spaces</p></div></div></td><td><div><div><p><code>--scopeLoggingConfig testscope1:WARN,testscope2:DEBUG</code></p></div></div></td></tr><tr><td><div><div><p><code>--scopeLoggingConfigFile</code></p></div></div></td><td><div><div><p>Uploads a file to define scope logging.<br>Format: 1 tuple per line, style: <code>{scope: scopeName, logLevel: logLevelType}</code> enclosed with <code>{}</code> <code>()</code> or <code>[]</code></p></div></div></td><td><div><div><p><code>--scopeLoggingConfigFile /Users/mule/Documents/cert.txt</code></p></div></div></td></tr><tr><td><div><div><p><code>--updateStrategy</code></p></div></div></td><td><div><div><p>Updates the strategy used.<br>Default: <code>rolling</code></p></div></div></td><td><div><div><p><code>--updateStrategy recreate</code></p></div></div></td></tr></tbody></table>

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

## runtime-mgr:application:start

> runtime-mgr:application:start [flags] <appid>

Starts running the application specified in `<appid>`. To get this ID, run the
`runtime-mgr application list` command.

This command accepts the [default flags](./#default-options).

## runtime-mgr:application:stop

> runtime-mgr:application:stop [flags] <appID>

Stops running the application specified in `<appID>`. To get this ID, run the
`runtime-mgr application list` command.

This command accepts the [default flags](./#default-options).

## runtime-mgr:application:logs

> runtime-mgr:application:logs [flags] <appID> <specID>

Tails application logs for the application specificied in `<appID>` from the specification specified
in `<specID>`.

To get the `<appID>`, run the `runtime-mgr application list` command.

To get the `<specID>`, run the `runtime-mgr application describe` command.

This command accepts the [default flags](./#default-options).
