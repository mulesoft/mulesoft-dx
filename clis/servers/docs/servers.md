---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Local Servers

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `servers` commands to automate your Local Servers processes. For more information about how
to use these commands, refer to the [Runtime Manager documentation](../../runtime-manager/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-server-describe">runtime-mgr:server:describe</a></p></div></div></td><td><div><div><p>Describes server</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-server-delete">runtime-mgr:server:delete</a></p></div></div></td><td><div><div><p>Deletes server</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-server-list">runtime-mgr:server:list</a></p></div></div></td><td><div><div><p>Changes an standalone application artifact</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-server-modify">runtime-mgr:server:modify</a></p></div></div></td><td><div><div><p>Modifies server</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-server-token">runtime-mgr:server:token</a></p></div></div></td><td><div><div><p>Gets server registration token. This token needs to be used to register a new server</p></div></div></td></tr></tbody></table>

## runtime-mgr:server:describe

> runtime-mgr:server:describe [flags] <serverId>

Describes the server passed in `serverId`.

This command accepts the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:server:delete

> runtime-mgr:server:delete [flags] <serverId>

Deletes the server passed in `serverId`.

This command accepts the [default flags](./#default-options).

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

## runtime-mgr:server:list

> runtime-mgr:server:list [flags]

Lists all servers in your environment.

This command accepts the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:server:modify

> runtime-mgr:server:modify [flags] <serverId>

Modifies the server passed in `serverId`.

In order to update the id for the cluster, you need to pass the `--name` flag.

This command accepts the [default flags](./#default-options).

## runtime-mgr:server:token

> runtime-mgr:server:token [flags]

Gets server registration token. This token needs to be used to register a new server.

This command accepts the [default flags](./#default-options).
