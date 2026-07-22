---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for CloudHub Applications

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `cloudhub` commands to automate your CloudHub Applications processes. For more information
about how to use these commands, refer to the [CloudHub documentation](../../cloudhub/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-alert-history-describe">runtime-mgr:cloudhub-alert-history:describe</a></p></div></div></td><td><div><div><p>Describes the history of the alarm</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-alert-list">runtime-mgr:cloudhub-alert:list</a></p></div></div></td><td><div><div><p>Lists all alerts in the environment</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-copy">runtime-mgr:cloudhub-application:copy</a></p></div></div></td><td><div><div><p>Copies a CloudHub application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-delete">runtime-mgr:cloudhub:application:delete</a></p></div></div></td><td><div><div><p>Deletes an application</p></div></div></td></tr><tr><td><div><div><p><a href="#deploy-to-cloudhub">runtime-mgr:cloudhub-application:deploy</a></p></div></div></td><td><div><div><p>Deploys a new application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-describe">runtime-mgr:cloudhub-application:describe</a></p></div></div></td><td><div><div><p>Shows application details</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-download-logs">runtime-mgr:cloudhub-application:download:logs</a></p></div></div></td><td><div><div><p>Download application logs to specified directory</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-list">runtime-mgr:cloudhub:application:list</a></p></div></div></td><td><div><div><p>Lists all applications in the environment</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-modify">runtime-mgr:cloudhub-application:modify</a></p></div></div></td><td><div><div><p>Modifies an existing application, optionally updating the ZIP file</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-restart">runtime-mgr:cloudhub-application:restart</a></p></div></div></td><td><div><div><p>Restarts a running application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-start">runtime-mgr:cloudhub-application:start</a></p></div></div></td><td><div><div><p>Starts an application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-stop">runtime-mgr:cloudhub-application:stop</a></p></div></div></td><td><div><div><p>Stops a running application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cloudhub-application-tail-logs">runtime-mgr:cloudhub-application:tail:logs</a></p></div></div></td><td><div><div><p>Tail application logs</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-region-list">cloudhub:region:list</a></p></div></div></td><td><div><div><p>Lists all supported regions</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-runtime-list">cloudhub:runtime:list</a></p></div></div></td><td><div><div><p>Lists all available runtimes</p></div></div></td></tr></tbody></table>

## runtime-mgr:cloudhub-alert-history:describe

> runtime-mgr:cloudhub-alert-history:describe [flags] <name>

Describes the history of the alarm passed in `<name>`

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-alert:list

> runtime-mgr:cloudhub-alert:list [flags]

Lists all alerts associated with your current environment

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:copy

> runtime-mgr:cloudhub-application:copy <source> <target> [flags]

Copies the CloudHub application passed in `source` to the target passed in `target`  
Arguments `source` and `target` should be formatted as follows: `([group_id]/)<asset_id>/<version>`
If `group_id` is not specified, it defaults to the currently selected Organization ID

For example:

> runtime-mgr:cloudhub-application:copy Services:QA/application-1 Development:QA/application-2

Copies the application named `application-1` from the QA environment of the Services organization to
the QA environment of the Development organization.  
If the Anypoint Platform CLI is using the QA environment in the Services organization, the command
can simply take the application name as a `source`:

> runtime-mgr:cloudhub-application:copy application-1 Development/QA/application-2

> [!NOTE] Running this command requires your user to have read/write access to the `/tmp` directory
> of the OS where CLI is installed.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--property</code></p></div></div></td><td><div><div><p>Set a property (<code>name:value</code>).</p></div></div></td><td><div><div><p><code>--property "salesforce.password:qa\=34534"</code></p></div></div></td></tr></tbody></table>

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

> [!NOTE] When copying an application containing safely hidden application properties, pass the
> properties in the `copy` command using the `--property` flag. For information about safely hidden
> application properties, see
> [Safely Hide Application Properties](../../cloudhub/secure-application-properties).

## runtime-mgr:cloudhub-application:delete

> runtime-mgr:cloudhub-application:delete [flags] <name>

Deletes the running application you specify in `<name>`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:deploy

> runtime-mgr:cloudhub-application:deploy <name> <zipfile> [flags]

Deploys the Mule deployable archive ZIP file that you specify in `<zipfile>` using the name you set
in `<name>`  
You will have to provide the absolute or relative path to the deployable ZIP file in your local hard
drive and the name you give to your application has to be unique.

> [!NOTE] If successful, this command’s output includes the deployment status of `UNDEPLOYED`, which
> indicates that CloudHub uploaded the application successfully.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--runtime</code></p></div></div></td><td><div><div><p>Name and version of the runtime environment.<br>Use this flag to specify the name and version of the runtime you want to deploy<br>If you don’t specify a runtime version, CloudHub API deploys the latest version available considering the values you select for <code>--javaVersion</code> and <code>--releaseChannel</code>.</p></div></div></td><td><div><div><p><code>--runtime 2.1.1-API-Gateway</code>, <code>--runtime 4.6-e-java8</code> (Edge), <code>--runtime 4.6-e-java17</code> (Edge), <code>--runtime 4.6-java8</code> (LTS), <code>--runtime 4.6-java17</code> (LTS)</p></div></div></td></tr><tr><td><div><div><p><code>--releaseChannel</code></p></div></div></td><td><div><div><p>Set the name of the release channel to be used for the selected Mule version<br>Supported values are <code>NONE</code>, <code>EDGE</code>, and <code>LTS</code><br>If you don’t specify a value, CloudHub API imposes the default value. The default release channel is <code>EDGE</code><br>If you don’t specify a Mule version, the default Mule version for the selected release channel is used. If the selected release channel doesn’t exist, you get an error.</p></div></div></td><td><div><div><p><code>--releaseChannel EDGE</code></p></div></div></td></tr><tr><td><div><div><p><code>--javaVersion</code></p></div></div></td><td><div><div><p>Set the name of the Java version to be used for the selected Mule version<br>Supported values are <code>8</code> and <code>17</code><br>If you don’t specify a value, CloudHub API imposes the default value. The default Java version for Mule 4.6 and earlier versions is '8'.<br>If you don’t specify a Mule version, the default Mule version for the selected Java version is used. If the Java version you select is not available for the specified Mule version, you get an error.</p></div></div></td><td><div><div><p><code>--javaVersion 8</code></p></div></div></td></tr><tr><td><div><div><p><code>--workers</code></p></div></div></td><td><div><div><p>Number of workers<br>Default value is '1'</p></div></div></td><td><div><div><p><code>--workers 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--workerSize</code></p></div></div></td><td><div><div><p>Size of the workers in vCores<br>(Default value is '1'</p></div></div></td><td><div><div><p><code>--workerSize 2</code></p></div></div></td></tr><tr><td><div><div><p><code>--region</code></p></div></div></td><td><div><div><p>Name of the region to deploy to</p></div></div></td><td><div><div><p><code>--region Canada</code></p></div></div></td></tr><tr><td><div><div><p><code>--property</code></p></div></div></td><td><div><div><p>Set a property (<code>name:value</code>)<br>Character <code>:</code> is not supported for the property’s name</p></div></div></td><td><div><div><p><code>--property "salesforce.password:qa\=34534"</code></p></div></div></td></tr><tr><td><div><div><p>`--propertiesFile</p></div></div></td><td><div><div><p>Overwrite all properties with values from this file<br>The file format is 1 or more lines in <code>name:value</code> format<br>Set the absolute path of the properties file in your local hard drive</p></div></div></td><td><div><div><p><code>--propertiesFile exampleFile.JSON</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]persistentQueues</code></p></div></div></td><td><div><div><p>Enable or disable persistent queues<br>Default value is <code>disabled</code></p></div></div></td><td><div><div><p><code>--[no-]persistentQueues</code></p></div></div></td></tr><tr><td><div><div><p>`--[no-]persistentQueuesEncrypted `</p></div></div></td><td><div><div><p>Enable or disable persistent queue encryption<br>Default value is <code>disabled</code></p></div></div></td><td><div><div><p><code>--[no-]persistentQueuesEncrypted</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]staticIPsEnabled</code></p></div></div></td><td><div><div><p>Enable or disable static IPs<br>Default value is <code>disabled</code></p></div></div></td><td><div><div><p><code>--[no-]staticIPsEnabled</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]objectStoreV1</code></p></div></div></td><td><div><div><p>Enable or disable Object Store V<br><code>objectStoreV2</code> can’t also be provided when using <code>objectStoreV1</code> flag</p></div></div></td><td><div><div><p><code>--[no-]objectStoreV1</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]objectStoreV2</code></p></div></div></td><td><div><div><p>Enable or disable Object Store V2<br><code>objectStoreV1</code> can’t also be provided when using <code>objectStoreV2</code> flag</p></div></div></td><td><div><div><p><code>--[no-]objectStoreV2</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]autoRestart</code></p></div></div></td><td><div><div><p>Automatically restart app when not responding<br>Default value is <code>enabled</code></p></div></div></td><td><div><div><p><code>--[no-]autoRestart</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specify the response format<br>Supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--timeout</code></p></div></div></td><td><div><div><p>Set the timeout value in miliseconds<br>Can take values between <code>60000</code> and <code>300000</code></p></div></div></td><td><div><div><p><code>--timeout 90000</code></p></div></div></td></tr></tbody></table>

> [!NOTE] You won’t be able to allocate static IPs Anypoint Platform CLI. You can simply enable and
> disable them.

> [!IMPORTANT] If you deploy without using any flags, your application deploys using all your
> default values.

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

## runtime-mgr:cloudhub-application:describe

> runtime-mgr:cloudhub-application:describe [flags] <name>

Displays information on the application you pass in `<name>`  
Use the flag `-o json` to get the raw JSON response of the application you specify in `<name>`.  
The command returns data such as the application’s domain, its status, the last time it was updated,
the Mule version, the ZIP file name, the region, monitoring, and workers; as well as `TRUE` or
`FALSE` information for persistent queues and static IPs enablement.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:download-logs

> runtime-mgr:cloudhub-application:download-logs [flags] <name> <directory>

Downloads logs the for application specified in `<name>` to the specified directory

Contrarily to what you see in the UI, the logs you download from the CLI won’t separate system logs
from worker logs.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:list

> runtime-mgr:cloudhub-application:list [flags]

Lists all applications available in your Anypoint Platform CLI  
It returns your application name, its status, the number of vCores assigned and the last time it was
updated.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:modify

> runtime-mgr:cloudhub-application:modify <name> [zipfile] [flags]

Updates the settings of an existing application  
Optionally, you can update it by uploading a new ZIP file. This command can take all the same flags
as the `deploy` command.

> [!NOTE] This command’s output includes `Status`, which is the application’s previous deployment
> status state.

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--runtime</code></p></div></div></td><td><div><div><p>Name and version of the runtime environment.<br>Use this flag to specify the name and version of the runtime you want to deploy<br>If you don’t specify a runtime version, CloudHub API deploys the latest version available considering the values you select for <code>--javaVersion</code> and <code>--releaseChannel</code>.</p></div></div></td><td><div><div><p><code>--runtime 2.1.1-API-Gateway</code>, <code>--runtime 4.6-e-java8</code> (Edge), <code>--runtime 4.6-e-java17</code> (Edge), <code>--runtime 4.6-java8</code> (LTS), <code>--runtime 4.6-java17</code> (LTS)</p></div></div></td></tr><tr><td><div><div><p><code>--releaseChannel</code></p></div></div></td><td><div><div><p>Set the name of the release channel to be used for the selected Mule version<br>Supported values are <code>NONE</code>, <code>EDGE</code>, and <code>LTS</code><br>If you don’t specify a value, CloudHub API imposes the default value. The default release channel is <code>EDGE</code><br>If you don’t specify a Mule version, the default Mule version for the selected release channel is used. If the selected release channel doesn’t exist, you get an error.</p></div></div></td><td><div><div><p><code>--releaseChannel EDGE</code></p></div></div></td></tr><tr><td><div><div><p><code>--javaVersion</code></p></div></div></td><td><div><div><p>Set the name of the Java version to be used for the selected Mule version<br>Supported values are <code>8</code> and <code>17</code><br>If you don’t specify a value, CloudHub API imposes the default value. The default Java version for Mule 4.6 and earlier versions is '8'.<br>If you don’t specify a Mule version, the default Mule version for the selected Java version is used. If the Java version you select is not available for the specified Mule version, you get an error.</p></div></div></td><td><div><div><p><code>--javaVersion 8</code></p></div></div></td></tr><tr><td><div><div><p><code>--workers</code></p></div></div></td><td><div><div><p>Number of workers<br>Default value is '1'</p></div></div></td><td><div><div><p><code>--workers 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--workerSize</code></p></div></div></td><td><div><div><p>Size of the workers in vCores<br>(Default value is '1'</p></div></div></td><td><div><div><p><code>--workerSize 2</code></p></div></div></td></tr><tr><td><div><div><p><code>--region</code></p></div></div></td><td><div><div><p>Name of the region to deploy to</p></div></div></td><td><div><div><p><code>--region Canada</code></p></div></div></td></tr><tr><td><div><div><p><code>--property</code></p></div></div></td><td><div><div><p>Set a property (<code>name:value</code>)<br>Character <code>:</code> is not supported for the property’s name</p></div></div></td><td><div><div><p><code>--property "salesforce.password:qa\=34534"</code></p></div></div></td></tr><tr><td><div><div><p>`--propertiesFile</p></div></div></td><td><div><div><p>Overwrite all properties with values from this file<br>The file format is 1 or more lines in <code>name:value</code> format<br>Set the absolute path of the properties file in your local hard drive</p></div></div></td><td><div><div><p><code>--propertiesFile exampleFile.JSON</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]persistentQueues</code></p></div></div></td><td><div><div><p>Enable or disable persistent queues<br>Default value is <code>disabled</code></p></div></div></td><td><div><div><p><code>--[no-]persistentQueues</code></p></div></div></td></tr><tr><td><div><div><p>`--[no-]persistentQueuesEncrypted `</p></div></div></td><td><div><div><p>Enable or disable persistent queue encryption<br>Default value is <code>disabled</code></p></div></div></td><td><div><div><p><code>--[no-]persistentQueuesEncrypted</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]staticIPsEnabled</code></p></div></div></td><td><div><div><p>Enable or disable static IPs<br>Default value is <code>disabled</code></p></div></div></td><td><div><div><p><code>--[no-]staticIPsEnabled</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]objectStoreV1</code></p></div></div></td><td><div><div><p>Enable or disable Object Store V<br><code>objectStoreV2</code> can’t also be provided when using <code>objectStoreV1</code> flag</p></div></div></td><td><div><div><p><code>--[no-]objectStoreV1</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]objectStoreV2</code></p></div></div></td><td><div><div><p>Enable or disable Object Store V2<br><code>objectStoreV1</code> can’t also be provided when using <code>objectStoreV2</code> flag</p></div></div></td><td><div><div><p><code>--[no-]objectStoreV2</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]autoRestart</code></p></div></div></td><td><div><div><p>Automatically restart app when not responding<br>Default value is <code>enabled</code></p></div></div></td><td><div><div><p><code>--[no-]autoRestart</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specify the response format<br>Supported values are <code>table</code> (default) and <code>json</code></p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr><tr><td><div><div><p><code>--timeout</code></p></div></div></td><td><div><div><p>Set the timeout value in miliseconds<br>Can take values between <code>60000</code> and <code>300000</code></p></div></div></td><td><div><div><p><code>--timeout 90000</code></p></div></div></td></tr></tbody></table>

## runtime-mgr:cloudhub-application:restart

> runtime-mgr:cloudhub-application:restart [flags] <name>

Restarts the running application you specify in `<name>`

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:start

> runtime-mgr:cloudhub-application:start [flags] <name>

Starts the running application you specify in `<name>`

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:stop

> runtime-mgr:cloudhub-application:stop [flags] <name>

Stops the running application you specify in `<name>`

This command accepts the [default flags](./#default-options).

## runtime-mgr:cloudhub-application:tail-logs

> runtime-mgr:cloudhub-application:tail-logs [flags] <name>

Tails application logs

This command accepts the [default flags](./#default-options).

## cloudhub:region:list

> cloudhub:region:list [flags]

Lists all supported regions

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:runtime:list

> cloudhub:runtime:list [flags]

Lists all supported runtimes

This command accepts the [default flags](./#default-options).
