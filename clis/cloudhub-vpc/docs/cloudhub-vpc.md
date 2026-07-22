---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Anypoint Virtual Private Cloud

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `cloudhub-vpc` commands to automate your Anypoint Virtual Private CLoud processes. For more
information about how to use these commands, refer to the [CloudHub documentation](../../cloudhub/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#cloudhub-vpc-business-groups-add">cloudhub:vpc:business-groups:add</a></p></div></div></td><td><div><div><p>Shares an Anypoint VPC with a list of Business Groups</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-business-groups-remove">cloudhub:vpc:business-groups:remove</a></p></div></div></td><td><div><div><p>Shares an Anypoint VPC with a list of Business Groups</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-create">cloudhub:vpc:create</a></p></div></div></td><td><div><div><p>Creates a new Anypoint VPC</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-delete">cloudhub:vpc:delete</a></p></div></div></td><td><div><div><p>Deletes an existing Anypoint VPC</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-describe">cloudhub:vpc:describe</a></p></div></div></td><td><div><div><p>Show Anypoint VPC details</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-dns-servers-set">cloudhub:vpc:dns-servers:set</a></p></div></div></td><td><div><div><p>Sets the domain names that are resolved using your internal DNS servers</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-dns-servers-unset">cloudhub:vpc:dns-servers:unset</a></p></div></div></td><td><div><div><p>Clears the list domain names that are resolved using your internal DNS servers</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-environments-add">cloudhub:vpc:environments:add</a></p></div></div></td><td><div><div><p>Modifies the Anypoint VPC association to Runtime Manager environments</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-environments-remove">cloudhub:vpc:environments:remove</a></p></div></div></td><td><div><div><p>Modifies the Anypoint VPC association to Runtime Manager environments</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-firewall-rules-add">cloudhub:vpc:firewall-rules:add</a></p></div></div></td><td><div><div><p>Adds a firewall rule for Mule applications in this Anypoint VPC</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-firewall-rules-describe">cloudhub:vpc:firewall-rules:describe</a></p></div></div></td><td><div><div><p>Shows firewall rule for Mule applications in this Anypoint VPC</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-firewall-rules-remove">cloudhub:vpc:firewall-rules:remove</a></p></div></div></td><td><div><div><p>Removes a firewall rule for Mule applications in this Anypoint VPC</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-vpc-list">cloudhub:vpc:list</a></p></div></div></td><td><div><div><p>Lists all Anypoint VPCs</p></div></div></td></tr></tbody></table>

## cloudhub:vpc:business-groups:add

> cloudhub:vpc:business-groups:add [flags] <vpc> <businessGroups...>

Assigns the Anypoint VPC defined in `<vpc>` to the business group(s) passed as argument(s)
thereafter

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:business-groups:remove

> cloudhub:vpc:business-groups:remove [flags] <vpc> <businessGroups...>

Removes the Anypoint VPC defined in `<vpc>` from the business group(s) passed as argument(s)
thereafter

> [!WARNING] This command does not prompt twice before removing the Anypoint VPC from the specified
> resource. If you send a remove instruction, it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:create

> cloudhub:vpc:create [flags] <name> <region> <cidrBlock> [environments...]

Creates an Anypoint VPC using the name in `<name>`, in the region specified in `<region>`, with the
[size](../../cloudhub/vpc-provisioning-concept#faq_how_to_size_vpc) passed in `<cidrBlock>` in the
form of a Classless Inter-Domain Routing (CIDR) block, using
[CIDR notation](https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing#IPv4_CIDR_blocks) and
associates it to the [environments](../../access-management/environments) passed as argument(s)
thereafter.

> [!NOTE] An Anypoint VPC needs to be bound to a business group within your organization. When
> creating an Anypoint VPC, make sure to assign it a business group using the
> [business-groups add](#cloudhub-vpc-business-groups-add) command.

This command accepts the `--default` flag. When passed, the Anypoint VPC is created as the default
Anypoint VPC for the selected environment.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:delete

> cloudhub:vpc:delete <name>

Deletes the Anypoint VPC specified in `<name>`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:describe

> cloudhub:vpc:describe [flags] <name>

Displays information about the Anypoint VPC that is specified in `<name>`

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:dns-servers:set

> cloudhub:vpc:dns-servers:set [flags] <vpc>

Sets a list of local host names (internal domain names) to be resolved using your DNS servers for
which you need to provide their IP addresses (whether private or public addresses).  
Whenever those private domains are provided, your worker resolves them using your private DNS, so
you can still use the internal host names of your private network.

> [!NOTE] This feature is supported by workers running Mule versions 3.5.x, 3.6.x, 3.7.4, 3.8.0-HF1,
> 3.8.1 and 3.8.2.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--domain</code></p></div></div></td><td><div><div><p>A domain to resolve on the special DNS server list<br>Can be specified multiple times</p></div></div></td><td><div><div><p><code>--domain example.com</code></p></div></div></td></tr><tr><td><div><div><p><code>--server</code></p></div></div></td><td><div><div><p>IP address for a DNS server to resolve special domains on<br>Can be specified up to 3 times</p></div></div></td><td><div><div><p><code>--server 192.168.1.10</code></p></div></div></td></tr></tbody></table>

Every time you run this command, you overwrite your previous DNS set command.  
To remove a DNS set, you need to use the [vpc dns-servers unset](#cloudhub-vpc-dns-servers-unset)
command.

## cloudhub:vpc:dns-servers:unset

> cloudhub:vpc:dns-servers:unset [flags] <vpc>

Clears the list of local host names (internal domain names) to be resolved using your DNS servers
from the Anypoint VPC passed in `<vpc>`

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:environments:add

> cloudhub:vpc:environments:add [flags] <vpc> [environments...]

Assigns the Anypoint VPC defined in `<vpc>` to the environment(s) passed as argument(s) thereafter
The `--default` flag allows setting an Anypoint VPC as the default for the organization, which
applies to all environments which don’t have an Anypoint VPC explicitly associated.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:environments:remove

> cloudhub:vpc:environments:remove [flag] <vpc> [environments...]

Removes the Anypoint VPC defined in `<vpc>` from the environment(s) passed as argument(s) thereafter

This command accepts the `--default` flag, that removes this Anypoint VPC as the default Anypoint
VPC for the environment.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:firewall-rules:add

> cloudhub:vpc:firewall-rules:add [flags] <vpc> <cidrBlock> <protocol> <fromPort> [toPort]

Adds a firewall rule to the Anypoint VPC defined in `<vpc>` using the values set in the variables:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Value</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>vpc</code></p></div></div></td><td><div><div><p>Name of the Anypoint VPC to which this load balancer is bound<br>If your Anypoint VPC name contains spaces, you need to pass it between ´"´ characters</p></div></div></td><td><div><div><p><code>vpc-demo</code></p></div></div></td></tr><tr><td><div><div><p><code>cidrBlock</code></p></div></div></td><td><div><div><p>IP address in CIDR notation for the firewall to allow</p></div></div></td><td><div><div><p><code>192.0.1.0/27</code></p></div></div></td></tr><tr><td><div><div><p><code>protocol</code></p></div></div></td><td><div><div><p>The protocol to use in the rules. It can be <code>tcp</code> or <code>udp</code></p></div></div></td><td><div><div><p><code>tcp</code></p></div></div></td></tr><tr><td><div><div><p><code>fromPort</code></p></div></div></td><td><div><div><p>The port from which the firewall will allow requests. It can go from 0 to 65535</p></div></div></td><td><div><div><p><code>8888</code></p></div></div></td></tr><tr><td><div><div><p><code>toPort</code></p></div></div></td><td><div><div><p><strong>optional</strong> In case a port range is needed, the <code>fromPort</code> and <code>toPort</code> variables define such range</p></div></div></td><td><div><div><p><code>8090</code></p></div></div></td></tr></tbody></table>

> [!CAUTION] When creating an Anypoint VPC, make sure to allow your outbound address.  
> By default, all IP addresses are blocked, and you need to authorize IP addresses or range of
> addresses to your Anypoint VPC firewall rule.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:firewall-rules:describe

> cloudhub:vpc:firewall-rules:describe <vpc>

Describes all the firewall rules for the Anypoint VPC defined in `<vpc>`

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:firewall-rules:remove

> cloudhub:vpc:firewall-rules:remove <vpc> <index>

Removes the firewall rule from the workers inside the Anypoint VPC specified in `<vpc>` at the index
passed in the `<index>`

This command accepts the [default flags](./#default-options).

## cloudhub:vpc:list

> cloudhub:vpc:list [flags]

Lists all available Anypoint VPCs  
It returns ID, region, and environment of the network and whether it is the default Anypoint VPC or
not.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).
