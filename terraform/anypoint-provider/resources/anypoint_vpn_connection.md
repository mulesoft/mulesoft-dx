---
page_title: "anypoint_vpn_connection Resource - terraform-provider-anypoint"
subcategory: "CloudHub 2.0"
description: |-
  Creates a VPN connection in a CloudHub 2.0 private space.
---

# anypoint_vpn_connection (Resource)

Creates a VPN connection in a CloudHub 2.0 private space.

## Example Usage

```terraform
resource "anypoint_vpn_connection" "example" {
  private_space_id = anypoint_private_space.example.id
  name             = "my-vpn-connection"

  vpns = [
    {
      local_asn         = "64512"
      remote_asn        = "65534"
      remote_ip_address = "203.0.113.1"
      static_routes     = []

      vpn_tunnels = [
        {
          psk            = "my-pre-shared-key-1"
          ptp_cidr       = "169.254.10.0/30"
          startup_action = "start"
        },
        {
          psk            = "my-pre-shared-key-2"
          ptp_cidr       = "169.254.11.0/30"
          startup_action = "start"
        }
      ]
    }
  ]
}
```

## Schema

### Required

- `private_space_id` (String) The ID of the private space.
- `name` (String) The name of the VPN connection.
- `vpns` (Block List) List of VPN configurations. See [below for nested schema](#nestedschema--vpns).

### Optional

- `organization_id` (String) The organization ID where the private space is located. If not provided, the organization ID will be inferred from the connected app credentials.

### Read-Only

- `id` (String) The unique identifier for the VPN connection.

<a id="nestedschema--vpns"></a>
### Nested Schema for `vpns`

Required:

- `local_asn` (String) Local ASN for the VPN.
- `remote_asn` (String) Remote ASN for the VPN.
- `remote_ip_address` (String) Remote IP address for the VPN.
- `vpn_tunnels` (Block List) List of VPN tunnel configurations. See [below for nested schema](#nestedschema--vpns--vpn_tunnels).

Optional:

- `name` (String) The name of the VPN.
- `static_routes` (List of String) List of static routes.

Read-Only:

- `connection_name` (String) The connection name of the VPN.
- `vpn_connection_status` (String) The status of the VPN connection.
- `vpn_id` (String) The ID of the VPN.
- `connection_id` (String) The connection ID of the VPN.

<a id="nestedschema--vpns--vpn_tunnels"></a>
### Nested Schema for `vpns.vpn_tunnels`

Required:

- `psk` (String) Pre-shared key for the VPN tunnel.
- `startup_action` (String) Startup action for the VPN tunnel.

Optional:

- `ptp_cidr` (String) Point-to-point CIDR for the VPN tunnel.

Read-Only:

- `is_logs_enabled` (Boolean) Whether logs are enabled for the VPN tunnel.

## Import

Import is supported using the following syntax:

```shell
terraform import anypoint_vpn_connection.example <private_space_id>/<connection_id>
```
