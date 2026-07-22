---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# Locally Deployed Applications Managed by Runtime Manager

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use these commands to control applications deployed to your local Mule server and managed with
Runtime Manager. For more information about how to use these commands, refer to the
[Runtime Manager documentation](../../runtime-manager/).

> [!CAUTION] For the Anypoint Platform CLI to recognize your target servers, each server must be
> manually registered with the platform.

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-artifact">runtime-mgr:standalone-application:artifact</a></p></div></div></td><td><div><div><p>Downloads a standalone application artifact binary</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-copy">runtime-mgr:standalone-application:copy</a></p></div></div></td><td><div><div><p>Copies a standalone application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-delete">runtime-mgr:standalone-application:delete</a></p></div></div></td><td><div><div><p>Deletes a standalone application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-deploy">runtime-mgr:standalone-application:deploy</a></p></div></div></td><td><div><div><p>Deploys or redeploys an application to an on-premises server, server group, or cluster</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-describe">runtime.mgr:standalone-application:describe</a></p></div></div></td><td><div><div><p>Shows detailed information for a standalone application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-list">runtime-mgr:standalone-application:list</a></p></div></div></td><td><div><div><p>Lists all standalone applications in the environment</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-modify">runtime-mgr:standalone-application:modify</a></p></div></div></td><td><div><div><p>Changes a standalone application artifact</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-restart">runtime-mgr:standalone-application:restart</a></p></div></div></td><td><div><div><p>Restarts a standalone application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-start">runtime-mgr:standalone-application:start</a></p></div></div></td><td><div><div><p>Starts a standalone application</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-application-stop">runtime-mgr:standalone-application:stop</a></p></div></div></td><td><div><div><p>Stops a standalone application</p></div></div></td></tr></tbody></table>

## runtime-mgr:standalone-application:artifact

> runtime-mgr:standalone-application:artifact [flags] <identifier> <directory>

Downloads the application artifact of the `identifier` application, to the directory passed in
`directory`. The `identifier` flag can be either an application ID or name.

This command accepts the [default flags](./#default-options).

## runtime-mgr:standalone-application:copy

> runtime-mgr:standalone-application:copy [flags] <source> <target> <targetIdentifier>

Copies the standalone (on-premises) application passed in `source` to the target passed in `target`
and the server, server group or cluster ID or Name passed in `targetIdentifier`.

Both arguments `source` and `destination` are represented using the format:
`<organizationName>:<environmentName>/<appName>`, for example:

> runtime-mgr:standalone-application:copy Services:QA/application-1 Development:QA/application-2
123456

Copies the application named `application-1` from the QA environment of the _Services_ organization
to the QA environment of the `_Development_` organization in the server ID 123456.

If the Anypoint Platform CLI is using the QA environment in the Services organization, the command
can simply take the application name as a `source`:

> runtime-mgr:standalone-application:copy application-1 Development/QA/application-2 123456

> [!NOTE] Running this command requires for your user to have read/write access to the `/tmp`
> directory of the OS where the CLI is installed.

> [!WARNING] It isn’t possible to copy applications that have the same name but different targets
> within the same organization and environment. This can only be done through the UI.

This command accepts the [default flags](./#default-options).

## runtime-mgr:standalone-application:delete

> runtime-mgr:standalone-application:delete [flags] <identifier>

Deletes the standalone (on-premises) application passed in `identifier`.

This command accepts the [default flags](./#default-options).

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

## runtime-mgr:standalone-application:deploy

> runtime-mgr:standalone-application:deploy [flags] <targetIdentifier> <name> <zipfile>

Deploys or redeploys the application passed as a ZIP file in the path `zipfile` to the on-premises
target passed in `targetIdentifier`.

The `targetIdentifier` flag can be either a target ID or name.

A target can be either a server, server group, or cluster.

This command accepts the [default flags](./#default-options).

To redeploy an app and set a logging level or turn on Insight event tracking, see
[runtime-mgr:standalone-application:modify](#runtime-mgr-standalone-application-modify).

## runtime-mgr:standalone-application:describe

> runtime-mgr:standalone-application:describe [flags] <identifier>

Shows detailed information, such as status, creation date, and last update, for the standalone
(on-premises) application passed in `identifier`.

Use the flag `-o json` to get the raw JSON response of the application you specify in `<name>`.

This command accepts the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:standalone-application:list

> runtime-mgr:standalone-application:list [flags]

Lists all standalone (on-premises) applications.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--limit</code></p></div></div></td><td><div><div><p>Specifies the number of results to retrieve</p></div></div></td><td><div><div><p><code>--limit 50</code></p></div></div></td></tr><tr><td><div><div><p><code>--offset</code></p></div></div></td><td><div><div><p>Offsets the number of applications passed</p></div></div></td><td><div><div><p><code>--offset 20</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format.</p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## runtime-mgr:standalone-application:modify

> runtime-mgr:standalone-application:modify [flags] <identifier> <zipfile>

Modifies the standalone (on-premises) application passed in `identifier` with the ZIP file
application passed in `zipfile` as a path.

The `identifier` option specifies the application identifier. To retrieve the identifier, see
[runtime-mgr:standalone-application:list](#runtime-mgr-standalone-application-list).

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--insight</code></p></div></div></td><td><div><div><p>Stores message metadata of every Mule transaction.</p></div></div></td><td><div><div><p><code>--insight</code></p></div></div></td></tr><tr><td><div><div><p><code>--log [level:scope]</code></p></div></div></td><td><div><div><p>Sets the logging level and scope pair:</p></div><div><ul><li><p><code>level</code>: TRACE, DEBUG, INFO, WARN, ERROR, FATAL, or OFF</p></li><li><p><code>scope</code>: package name of the class, connector, or module to log, such as <code>org.mule.extension.ftp</code> for Anypoint Connector for FTP</p></li></ul></div><div><p>To set multiple logging levels, provide multiple <code>--log</code> flags.</p></div></div></td><td><div><div><p><code>--log INFO:org.apache --log WARN:org.mule</code></p></div></div></td></tr></tbody></table>

## runtime-mgr:standalone-application:restart

> runtime-mgr:standalone-application:restart [flags] <identifier>

Restarts the standalone (on-premises) application passed in `identifier`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:standalone-application:start

> runtime-mgr:standalone-application:start [flags] <identifier>

Starts the standalone (on-premises) application passed in `identifier`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:standalone-application:stop

> runtime-mgr:standalone-application:stop [flags] <identifier>

Stops the standalone (on-premises) application passed in `identifier`.

This command accepts the [default flags](./#default-options).
