---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Local Server Groups

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `serverGroup` commands to automate your Local Server Groups processes. For more information
about how to use these commands, refer to the
[Runtime Manager documentation](../../runtime-manager/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-servergroup-add-server">runtime-mgr:serverGroup:add:server</a></p></div></div></td><td><div><div><p>Adds server to a server group</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-servergroup-create">runtime-mgr:serverGroup:create</a></p></div></div></td><td><div><div><p>Creates server group from servers</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-servergroup-describe">runtime-mgr:serverGroup:describe</a></p></div></div></td><td><div><div><p>Describes server group</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-servergroup-delete">runtime-mgr:serverGroup:delete</a></p></div></div></td><td><div><div><p>Deletes server group</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-servergroup-list">runtime-mgr:serverGroup:list</a></p></div></div></td><td><div><div><p>Lists all server groups in the environment</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-servergroup-modify">runtime-mgr:serverGroup:modify</a></p></div></div></td><td><div><div><p>Modifies server group</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-servergroup-remove-server">runtime-mgr:serverGroup:remove:server</a></p></div></div></td><td><div><div><p>Removes server from a server group</p></div></div></td></tr></tbody></table>

## runtime-mgr:serverGroup:add:server

> runtime-mgr:serverGroup:add:server [flags] <serverGroupId> <serverId>

Adds the server passed in `serverId` to the server group passed in `serverGroupId`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:serverGroup:create

> runtime-mgr:serverGroup:create [flags] <name> [serverIds...]

Creates a server group with the name passed in `name` using the server Id(s) passed as argument(s)
thereafter.

This command accepts the [default flags](./#default-options).

## runtime-mgr:serverGroup:describe

> runtime-mgr:serverGroup:describe [flags] <serverGroupId>

Describes the server group passed in `serverGroupId`.

This command accepts the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:serverGroup:delete

> runtime-mgr:serverGroup:delete [flags] <serverGroupId>

Deletes the server groups passed in `serverGroupId`.

This command accepts the [default flags](./#default-options).

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

## runtime-mgr:serverGroup:list

> runtime-mgr:serverGroup:list [flags]

Lists all server groups in the environment.

This command has the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:serverGroup:modify

> runtime-mgr:serverGroup:modify [flags] <serverGroupId>

Modifies the server group passed in `serverGroupId`.

In order to update the id for the cluster, you need to pass the `--name` flag.

This command accepts the [default flags](./#default-options).

## runtime-mgr:serverGroup:remove:server

> runtime-mgr:serverGroup:remove:server [flags] <serverGroupId> <serverId>

Removes the server passed in `serverId` from the server group passed in `serverGroupId`.

This command accepts the [default flags](./#default-options).
