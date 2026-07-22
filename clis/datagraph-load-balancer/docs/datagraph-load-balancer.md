---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for DataGraph Load Balancers

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `datagraph` commands to automate your DataGraph Load Balancers processes. For more
information about how to use these commands, refer to the
[DataGraph documentation](../../datagraph/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#datagraph-load-balancer-config-add">datagraph:load-balancer-config:add</a></p></div></div></td><td><div><div><p>Adds a dedicated load balancer configuration to Anypoint DataGraph</p></div></div></td></tr><tr><td><div><div><p><a href="#datagraph-load-balancer-config-describe">datagraph:load-balancer-config:describe</a></p></div></div></td><td><div><div><p>Displays a dedicated load balancer configuration for Anypoint DataGraph</p></div></div></td></tr><tr><td><div><div><p><a href="#datagraph-load-balancer-config-remove">datagraph:load-balancer-config:remove</a></p></div></div></td><td><div><div><p>Removes a dedicated load balancer configuration from Anypoint DataGraph</p></div></div></td></tr></tbody></table>

## datagraph:load-balancer-config:add

```copy
> datagraph:load-balancer-config:add <dlbUrl>
```

Adds a dedicated load balancer configuration specified by `<dlbUrl>` to Anypoint DataGraph  
The `dlbUrl` is a valid URL that includes the DLB domain and the mapping rule `inputUri`.

This command accepts the [default flags](./#default-options).

## datagraph:load-balancer-config:describe

```copy
> datagraph:load-balancer-config:describe [flags]
```

Displays a dedicated load balancer URL for Anypoint DataGraph

This command accepts the [default flags](./#default-options).

## datagraph:load-balancer-config:remove

```copy
> datagraph:load-balancer-config:remove [flags]
```

Removes a dedicated load balancer configuration from Anypoint DataGraph.

This command accepts the [default flags](./#default-options).
