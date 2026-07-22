---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Hybrid Application Alerts

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use these commands to control alerts for apps that are deployed to your local Mule server and
managed with Runtime Manager. For more information about how to use these commands, refer to the
[Runtime Manager documentation](../../runtime-manager/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-standalone-alert-create">runtime-mgr:standalone-alert:create</a></p></div></div></td><td><div><div><p>Creates new alert for standalone runtime</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-alert-describe">runtime-mgr:standalone-alert:describe</a></p></div></div></td><td><div><div><p>Describes an alert</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-alert-list">runtime-mgr:standalone-alert:list</a></p></div></div></td><td><div><div><p>Lists all alerts for standalone runtimes in the environment</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-standalone-alert-modify">runtime-mgr:standalone-alert:modify</a></p></div></div></td><td><div><div><p>Modifies alert for standalone runtime</p></div></div></td></tr></tbody></table>

## runtime-mgr:standalone-alert:create

> runtime-mgr:standalone-alert:create <name> [flags]

Creates a new alert for a standalone runtime with the ID passed in `name`. The alert `name` is
limited to 256 characters.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><p><code>--condition</code></p></td><td><p>Alert trigger condition</p></td><td><p><code>--condition cluster-up</code></p></td></tr><tr><td><p><code>--content &lt;string&gt;</code></p></td><td><p>Alert notification email body</p></td><td><p><code>--content Email Body</code></p></td></tr><tr><td><p><code>--email</code></p></td><td><p>Email address to send alert notification to<br>Can be used multiple times to specify up to 20 email addresses</p></td><td><p><code>--email <a href="mailto:user@mulesoft.com">user@mulesoft.com</a></code></p></td></tr><tr><td><p><code>--operator</code></p></td><td><p>Condition operator explaining values relation to threshold.</p></td><td><p><code>--operator gt</code></p></td></tr><tr><td><p><code>--period</code></p></td><td><p>Condition duration in minutes</p></td><td><p><code>--period 15</code></p></td></tr><tr><td><p><code>--recipient</code></p></td><td><p>Username to send alert notification to<br>Can be used multiple times to specify up to 20 platform user IDs</p></td><td><p><code>--recipient 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></td></tr><tr><td><p><code>--resource</code></p></td><td><p>Alert resource ID. If not provided alert triggers for all resources. Depending on <code>resourceType</code>, the resource id can be of an application, server, server-group or cluster.</p></td><td><p><code>--resource 12343</code></p></td></tr><tr><td><p><code>--resourceType</code></p></td><td><p>Alert resource type</p></td><td><p><code>--resourceType server</code></p></td></tr><tr><td><p><code>--severity</code></p></td><td><p>Alert severity</p></td><td><p><code>--severity 3</code></p></td></tr><tr><td><p><code>--subject &lt;string&gt;</code></p></td><td><p>Alert notification email subject</p></td><td><p><code>--subject Email Subject</code></p></td></tr><tr><td><p><code>--threshold</code></p></td><td><p>Condition threshold number</p></td><td><p><code>--threshold 10</code></p></td></tr></tbody></table>

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

## runtime-mgr:standalone-alert:describe

> runtime-mgr:standalone-alert:describe [flags] <alertId>

Describes the alert passed in `alertId`.

This command accepts the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:standalone-alert:list

> runtime-mgr:standalone-alert:list [flags]

Lists all alerts for standalone Mules in the current environment.

This command accepts the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:standalone-alert:modify

> runtime-mgr:standalone-alert:modify <alertId> [flags]

Modifies the alert passed in `alertId`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><p><code>--condition</code></p></td><td><p>Alert trigger condition</p></td><td><p><code>--condition server-load-average</code></p></td></tr><tr><td><p><code>--content &lt;string&gt;</code></p></td><td><p>Alert notification email body</p></td><td><p><code>--content Email Body</code></p></td></tr><tr><td><p><code>--email</code></p></td><td><p>Email address to send alert notification to<br>Can be used multiple times to specify up to 20 email addresses</p></td><td><p><code>--email <a href="mailto:user@mulesoft.com">user@mulesoft.com</a></code></p></td></tr><tr><td><p><code>--name</code></p></td><td><p>Alert name</p></td><td><p><code>--name testAlert</code></p></td></tr><tr><td><p><code>--operator</code></p></td><td><p>Condition operator explaining values relation to threshold.</p></td><td><p><code>--operator lt-</code></p></td></tr><tr><td><p><code>--period</code></p></td><td><p>Condition duration in minutes</p></td><td><p><code>--period 15</code></p></td></tr><tr><td><p><code>--recipient</code></p></td><td><p>Username to send alert notification to<br>Can be used multiple times to specify up to 20 platform user IDs</p></td><td><p><code>--recipient 1fec0a49-1551-4199-bfcc-cf0352d0f29d</code></p></td></tr><tr><td><p><code>--resource</code></p></td><td><p>Alert resource ID. If not provided alert triggers for all resources. Depending on <code>resourceType</code>, the resource id can be of an application, server, server-group or cluster.</p></td><td><p><code>--resource 12343</code></p></td></tr><tr><td><p><code>--resourceType</code></p></td><td><p>Alert resource type</p></td><td><p><code>--resourceType server</code></p></td></tr><tr><td><p><code>--severity</code></p></td><td><p>Alert severity</p></td><td><p><code>--severity 3</code></p></td></tr><tr><td><p><code>--subject &lt;string&gt;</code></p></td><td><p>Alert notification email subject</p></td><td><p><code>--subject Email Subject</code></p></td></tr><tr><td><p><code>--threshold</code></p></td><td><p>Condition threshold number</p></td><td><p><code>--threshold 10</code></p></td></tr></tbody></table>

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.
