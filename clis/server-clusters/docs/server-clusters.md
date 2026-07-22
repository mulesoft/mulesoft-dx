---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Local Server Clusters

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `cluster` commands to automate your Local Server Clusters processes. For more information
about how to use these commands, refer to the
[Runtime Manager documentation](../../runtime-manager/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#runtime-mgr-cluster-add-server">runtime-mgr:cluster:add:server</a></p></div></div></td><td><div><div><p>Adds server to cluster</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cluster-create">runtime-mgr:cluster:create</a></p></div></div></td><td><div><div><p>Creates new cluster</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cluster-describe">runtime-mgr:cluster:describe</a></p></div></div></td><td><div><div><p>Describes server cluster</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cluster-delete">runtime-mgr:cluster:delete</a></p></div></div></td><td><div><div><p>Deletes cluster</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cluster-modify">runtime-mgr:cluster:modify</a></p></div></div></td><td><div><div><p>Modifies cluster</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cluster-list">runtime-mgr:cluster:list</a></p></div></div></td><td><div><div><p>Lists all clusters in the environment</p></div></div></td></tr><tr><td><div><div><p><a href="#runtime-mgr-cluster-remove-server">runtime-mgr:cluster:remove:server</a></p></div></div></td><td><div><div><p>Removes server from a cluster</p></div></div></td></tr></tbody></table>

## runtime-mgr:cluster:add:server

> runtime-mgr:cluster:add:server [flags] <clusterId> <serverId>

Adds the cluster in `clusterId` to the server passed in `serverId`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cluster:create

> runtime-mgr:cluster:create <name> [flags]

This command creates a cluster using the id passed in `name`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--multicast</code></p></div></div></td><td><div><div><p>Whether cluster should be multicast</p></div></div></td><td><div><div><p><code>--multicast</code></p></div></div></td></tr><tr><td><div><div><p><code>--server</code></p></div></div></td><td><div><div><p>Pair of server ID and IP address<br>IP address is optional for multicast cluster<br>Provide multiple values to add multiple servers</p></div></div></td><td><div><div><p><code>--server 903083:192.168.0.1</code></p></div></div></td></tr></tbody></table>

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use a `-- ` (two dashes followed by a space) before the
> parameter.

## runtime-mgr:cluster:describe

> runtime-mgr:cluster:describe [flags] <clusterId>

Describes the cluster passed in `clusterId`.

This command accepts the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cluster:delete

> runtime-mgr:cluster:delete [flags] <clusterId>

Deletes the cluster passed in `clusterId`.

This command accepts the [default flags](./#default-options).

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

## runtime-mgr:cluster:list

> runtime-mgr:cluster:list [flags]

Lists all clusters in the environment.

This command has the `--output` flag. Use the `--output` flag to specify the response format.
Supported values are `table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cluster:modify

> runtime-mgr:cluster:modify [flags] <clusterId>

Modifies the cluster passed in `clusterId`.  
In order to update the id for the cluster, you need to pass the `--name` flag.

This command accepts the [default flags](./#default-options).

## runtime-mgr:cluster:remove:server

> runtime-mgr:cluster:remove:server [flags] <clusterId> <serverId>

Removes the server passed in `serverId` from the cluster passed in `clusterId`.

This command accepts the [default flags](./#default-options).
