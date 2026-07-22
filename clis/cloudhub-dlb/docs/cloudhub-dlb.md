---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for CloudHub Dedicated Load Balancers

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `cloudhub:load-balancer` commands to automate your CloudHub Dedicated Load Balancers
processes. For more information about how to use these commands, refer to the
[CloudHub documentation](../../cloudhub/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#cloudhub-load-balancer-allowlist-add">cloudhub:load-balancer:allowlist:add</a></p></div></div></td><td><div><div><p>Adds an IP or range of IPs to the load balancer allowlist</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-allowlist-remove">cloudhub:load-balancer:allowlist:remove</a></p></div></div></td><td><div><div><p>Removes an IP or range of IPs from the load balancer allowlist</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-create">cloudhub:load-balancer:create</a></p></div></div></td><td><div><div><p>Creates a load balancer</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-delete">cloudhub:load-balancer:delete</a></p></div></div></td><td><div><div><p>Deletes a load balancer</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-describe">cloudhub:load-balancer:describe</a></p></div></div></td><td><div><div><p>Shows load balancer details</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-dynamic-ips-disable">cloudhub:load-balancer:dynamic-ips:disable</a></p></div></div></td><td><div><div><p>Disables dynamic IPs</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-dynamic-ips-enable">cloudhub:load-balancer:dynamic-ips:enable</a></p></div></div></td><td><div><div><p>Enables dynamic IPs</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-list">cloudhub:load-balancer:list</a></p></div></div></td><td><div><div><p>Lists all load balancers in an organization</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-mappings-add">cloudhub:load-balancer:mappings:add</a></p></div></div></td><td><div><div><p>Adds a proxy mapping rule at the specified index</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-mappings-describe">cloudhub:load-balancer:mappings:describe</a></p></div></div></td><td><div><div><p>Lists the proxy mapping rules for a load balancer</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-mappings-remove">cloudhub:load-balancer:mappings:remove</a></p></div></div></td><td><div><div><p>Removes a proxy mapping rule</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-ssl-endpoint-add">cloudhub:load-balancer:ssl-endpoint:add</a></p></div></div></td><td><div><div><p>Adds an additional certificate to an existing load balancer</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-ssl-endpoint-describe">cloudhub:load-balancer:ssl-endpoint:describe</a></p></div></div></td><td><div><div><p>Shows the load balancer configuration for a particular certificate</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-ssl-endpoint-remove">cloudhub:load-balancer:ssl-endpoint:remove</a></p></div></div></td><td><div><div><p>Removes a certificate from a load balancer</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-ssl-endpoint-set-default">cloudhub:load-balancer:ssl-endpoint:set-default</a></p></div></div></td><td><div><div><p>Sets the default certificate that the load balancer will serve</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-start">cloudhub:load-balancer:start</a></p></div></div></td><td><div><div><p>Starts a load balancer</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-stop">cloudhub:load-balancer:stop</a></p></div></div></td><td><div><div><p>Stops a load balancer</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-whitelist-add">cloudhub:load-balancer:whitelist:add</a></p></div></div></td><td><div><div><p>Adds an IP or range of IPs to the load balancer allowlist</p></div></div></td></tr><tr><td><div><div><p><a href="#cloudhub-load-balancer-whitelist-remove">cloudhub:load-balancer:whitelist:remove</a></p></div></div></td><td><div><div><p>Removes an IP or range of IPs from the load balancer allowlist</p></div></div></td></tr></tbody></table>

## cloudhub:load-balancer:allowlist:add

> cloudhub:load-balancer:allowlist:add [flags] <name> <cidrBlock>

Adds a range of IP addresses specified in `<cidrBlock>` to the allowlist of the load balancer
specified in `<name>`

> [!NOTE] The allowlist works at the load balancer level, not at the CN certificate level. Make sure
> you only pass IP addresses formatted in
> [CIDR notation](https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing#IPv4_CIDR_blocks).

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:allowlist:remove

> cloudhub:load-balancer:allowlist:remove <name> <cidrBlock>

Removes an IP or range of IPs addresses specified in `<cidrBlock>` to the allowlist of the load
balancer specified in `<name>`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:create

> cloudhub:load-balancer:create [flags] <vpc> <name> <certificate> <privateKey>

Creates a load balancer using the specified values in the following variables:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Value</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><p><code>vpc</code></p></td><td><div><div><p>Name of the Anypoint VPC to which this load balancer is bound.<br>If your Anypoint VPC name contains spaces, you need to pass it between ´"´ characters.</p></div></div></td><td><div><div><p><code>vpc-demo</code></p></div></div></td></tr><tr><td><p><code>name</code></p></td><td><div><div><p>Name for the load balancer.</p></div></div></td><td><div><div><p><code>newtestloadbalancer</code></p></div></div></td></tr><tr><td><p><code>certificate</code></p></td><td><div><div><p>Absolute path to the <code>.pem</code> file of your server certificate in your local hard drive.<br>Your certificate files need to be PEM encoded and not encrypted.</p></div></div></td><td><div><div><p><code>/Users/mule/Documents/cert.pem</code></p></div></div></td></tr><tr><td><p><code>privateKey</code></p></td><td><div><div><p>Absolute path to the <code>.pem</code> file of your private key of the server certificate in your local hard drive.<br>Your private key file needs to be passphraseless.</p></div></div></td><td><div><div><p><code>/Users/mule/Documents/privateKey.pem</code></p></div></div></td></tr></tbody></table>

> [!CAUTION] The name for the load balancer that you pass in `<name>` must be unique.  
> By default, your load balancer listens external requests on HTTPS and communicates with your
> workers internally through HTTP.  
> If you configured your Mule application within the Anypoint VPC to listen on HTTPS, make sure you
> set `upstreamProtocol` to HTTPS when creating the mapping list using the
> [load-balancer mappings add](#cloudhub-load-balancer-mappings-add) command.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--clientCertificate</code></p></div></div></td><td><div><div><p>Client certificate file</p></div></div></td><td><div><div><p><code>--clientCertificate /Users/mule/Documents/CertificateFile.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--crl</code></p></div></div></td><td><div><div><p>Certificate revocation list file</p></div></div></td><td><div><div><p><code>--crl /Users/mule/Documents/crlFile.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--http</code></p></div></div></td><td><div><div><p>Specifies the Load balancer HTTP behavior. It can be set to <code>on</code> (accepts HTTP requests and forwards it to your configured default <code><em>sslendpoint</em></code>), <code>off</code> (refuses all HTTP requests), or <code>redirect</code> (redirects to HTTPS).</p></div></div></td><td><div><div><p><code>--http off</code></p></div></div></td></tr><tr><td><div><div><p><code>--transportDownstreamProtocols</code></p></div></div></td><td><div><div><p>TLS version used for communication between customer and DLB<br>Supported values: <code>TLSv1.2</code>, <code>TLSv1.3</code></p></div></div></td><td><div><div><p><code>--transportDownstreamProtocols=TLSv1.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--transportUpstreamProtocols</code></p></div></div></td><td><div><div><p>TLS version used for communication between DLB and Mule worker<br>Supported values: <code>TLSv1.2</code>, <code>TLSv1.3</code></p></div></div></td><td><div><div><p><code>--transportUpstreamProtocols=TLSv1.2</code></p></div></div></td></tr><tr><td><div><div><p><code>--[no-]dynamic-ips</code></p></div></div></td><td><div><div><p>Uses dynamic IPs, which are not persistent through restarts</p></div></div></td><td><div><div><p><code>--[no-]dynamic-ips</code></p></div></div></td></tr><tr><td><div><div><p><code>--verificationMode</code></p></div></div></td><td><div><div><p>Specifies the client verification mode. It can be set to <code>on</code> (verify always), <code>off</code> (don’t verify), or <code>optional</code> (verification optional).</p></div></div></td><td><div><div><p><code>--verificationMode optional</code></p></div></div></td></tr></tbody></table>

> [!NOTE] CloudHub does not implement the Online Certificate Status Protocol (OCSP). To keep your
> certification revocation list up to date, it’s recommended to use the
> [CloudHub API](https://anypoint.mulesoft.com/exchange/portals/anypoint-platform/f1e97bc6-315a-4490-82a7-23abe036327a.anypoint-platform/cloudhub-api/)
> to update your certificates programmatically.

For more configuration information, see
[Configure SSL Endpoints and Certificates](../../cloudhub/lb-ssl-endpoints).

## cloudhub:load-balancer:delete

> cloudhub:load-balancer:delete [flags] <name>

Deletes the load balancer specified in `<name>`.

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:describe

> cloudhub:load-balancer:describe [flags] <name>

Displays information about the load balancer that is specified in `<name>`  
Use the flag `-o json` to get the raw JSON response of the application you specify in `<name>`  
It displays load balancer’s name, domain, its state and the Anypoint VPC Id to which the load
balancer is bound.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:dynamic-ips:disable

> cloudhub:load-balancer:dynamic-ips:disable [flags] <name>

Disables dynamic IPs for the load balancer specified in `<name>`

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:dynamic-ips:enable

> cloudhub:load-balancer:dynamic-ips:enable [flags] <name>

Enables dynamic IPs for the load balancer specified in `<name>`

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:list

> cloudhub:load-balancer:list [flags]

Lists all load balancers in your Anypoint Platform  
It displays load balancer’s name, domain, its state, and the Anypoint VPC ID to which the load
balancer is bound.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:mappings:add

> cloudhub:load-balancer:mappings:add [flags] <name> <index> <inputUri> <appName> <appUri>
[certificateName]

Adds a proxy mapping rule to the load balancer specified in `<name>` in the CN passed under the
`certificateName` flag.  
If no `certificateName` is passed, Anypoint Platform CLI adds the mappings to the default SSL
endpoint.

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Value</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>name</code></p></div></div></td><td><div><div><p>Name of the load balancer to which this rule is applied.</p></div></div></td><td><div><div><p><code>testloadbalancer</code></p></div></div></td></tr><tr><td><div><div><p><code>inputUri</code></p></div></div></td><td><div><div><p>Name of the URI of your input URL</p></div></div></td><td><div><div><p><code>example.com</code></p></div></div></td></tr><tr><td><div><div><p><code>appName</code></p></div></div></td><td><div><div><p>Name of the app of your output URL to which the request is forwarded</p></div></div></td><td><div><div><p><code>{app}-example</code></p></div></div></td></tr><tr><td><div><div><p><code>appUri</code></p></div></div></td><td><div><div><p>URI of the app of your output URL to which the request is forwarded</p></div></div></td><td><div><div><p>/</p></div></div></td></tr></tbody></table>

For the values in the example above, for an input call to
`my-superapp.api.example.com/status?limit=10`, the endpoint `my-superapp-example: /status?limit=10`
will be called for the application.

If no upstream protocol is set, HTTP is used as default.

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p>`--certificateName `</p></div></div></td><td><div><div><p>Certificate name</p></div></div></td><td><div><div><p><code>--certificateName exampleName</code></p></div></div></td></tr><tr><td><div><div><p><code>--upstreamProtocol &lt;protocol&gt;</code></p></div></div></td><td><div><div><p>Set the protocol used by your application to communicate internally with your load balancer<br>Supported Values: <code>http</code>, <code>https</code></p></div></div></td><td><div><div><p><code>--upstreamProtocol http</code></p></div></div></td></tr></tbody></table>

## cloudhub:load-balancer:mappings:describe

> cloudhub:load-balancer:mappings:describe <name> [certificateName]

Lists the mapping rules for the load balancer specified in `<name>`  
If no `certificateName` is passed, Anypoint Platform CLI returns the mappings for the default SSL
endpoint.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:mappings:remove

> cloudhub:load-balancer:mappings:remove [flags] <name> <index> [certificateName]

Removes the proxy mapping rules from the load balancer specified in `<name>` at the priority index
specified in `<index>` and the CN specified as the `certificateName` flag  
If no `certificateName` is passed, Anypoint Platform CLI removes the mappings for the default SSL
endpoint.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:ssl-endpoint:add

> cloudhub:load-balancer:ssl-endpoint:add [flags] <name> <certificate> <privateKey>

Adds an SSL endpoint to the load balancer specified in `<name>`, using the certificate and private
key passed:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Value</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>name</code></p></div></div></td><td><div><div><p>Name for the load balancer.</p></div></div></td><td><div><div><p><code>newtestloadbalancer</code></p></div></div></td></tr><tr><td><div><div><p><code>certificate</code></p></div></div></td><td><div><div><p>Absolute path to the <code>.pem</code> file of your certificate in your local hard drive.<br>Your certificate files need to be PEM encoded and not encrypted.</p></div></div></td><td><div><div><p><code>/Users/mule/Documents/cert.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>privateKey</code></p></div></div></td><td><div><div><p>Absolute path to the <code>.pem</code> file of your private key in your local hard drive.<br>Your private key file needs to be passphraseless.</p></div></div></td><td><div><div><p><code>/Users/mule/Documents/privateKey.pem</code></p></div></div></td></tr></tbody></table>

> [!NOTE] CloudHub does not implement the Online Certificate Status Protocol (OCSP). To keep your
> certification revocation list up to date, it’s recommended to use the
> [CloudHub API](https://anypoint.mulesoft.com/exchange/portals/anypoint-platform/f1e97bc6-315a-4490-82a7-23abe036327a.anypoint-platform/cloudhub-api/)
> to update your certificates programmatically.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--clientCertificate</code></p></div></div></td><td><div><div><p>Client certificate file</p></div></div></td><td><div><div><p><code>--clientCertificate /Users/mule/Documents/CertificateFile.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--crl</code></p></div></div></td><td><div><div><p>Certificate Revocation List file</p></div></div></td><td><div><div><p><code>--clientCertificate /Users/mule/Documents/crlFile.pem</code></p></div></div></td></tr><tr><td><div><div><p><code>--verificationMode</code></p></div></div></td><td><div><div><p>Specifies the client verification mode. It can be set to <code>on</code> (verify always) <code>off</code> (don’t verify) or <code>optional</code> (Verification optional).</p></div></div></td><td><div><div><p><code>--verificationMode on</code></p></div></div></td></tr></tbody></table>

For more configuration information, see
[Configure SSL Endpoints and Certificates](../../cloudhub/lb-ssl-endpoints).

## cloudhub:load-balancer:ssl-endpoint:describe

> cloudhub:load-balancer:ssl-endpoint:set-describe [flags] <name> <certificateName>

Shows information about the configuration of the load balancer passed in `<name>` for the
certificate specified in `<certificateName>`

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:ssl-endpoint:remove

> cloudhub:load-balancer:ssl-endpoint:remove [flags] <name> <certificateName>

Removes the ssl certificate specified in `<certificateName>` from the load balancer specified in
`<name>`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:ssl-endpoint:set-default

> cloudhub:load-balancer:ssl-endpoint:set-default [flags] <name> <certificateName>

Sets the certificate specified in `<certificateName>` as the default certificate for the load
balancer passed in `<name>`

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--http</code></p></div></div></td><td><div><div><p>Specifies the Load balancer HTTP behavior<br>It can be set to <code>on</code> (accepts HTTP requests and forwards it to your configured default <code><em>sslendpoint</em></code>), <code>off</code> (refuses all HTTP requests), or <code>redirect</code> (redirects to HTTPS)</p></div></div></td><td><div><div><p><code>--http redirect</code></p></div></div></td></tr></tbody></table>

## cloudhub:load-balancer:start

> cloudhub:load-balancer:start [flags] <name>

Starts the load balancer specified in `<name>`

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:stop

> cloudhub:load-balancer:stop [flags] <name>

Stops the load balancer specified in `<name>`

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:whitelist:add

> cloudhub:load-balancer:whitelist:add [flags] <name> <cidrBlock>

Adds a range of IP addresses specified in `<cidrBlock>` to the allowlist of the load balancer
specified in `<name>`.

This command accepts the [default flags](./#default-options).

## cloudhub:load-balancer:whitelist:remove

> cloudhub:load-balancer:whitelist:remove [flags] <name> <cidrBlock>

Removes an IP or range of IPs specified in `<cidrBlock>` from the allowlist of the load balancer
specified in `<name>`.

This command accepts the [default flags](./#default-options).
