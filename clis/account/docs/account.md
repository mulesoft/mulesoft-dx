---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Anypoint Platform Accounts

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `account` commands to automate your Anypoint Plaform Account processes. For more information
about how to use these commands, refer to the
[Access Management documentation](../../access-management/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#account-business-group-describe">account:business-group:describe</a></p></div></div></td><td><div><div><p>Show details of a business group</p></div></div></td></tr><tr><td><div><div><p><a href="#account-business-group-list">account:business-group:list</a></p></div></div></td><td><div><div><p>Lists business groups</p></div></div></td></tr><tr><td><div><div><p><a href="#account-environment-create">account:environment:create</a></p></div></div></td><td><div><div><p>Create new environment</p></div></div></td></tr><tr><td><div><div><p><a href="#account-environment-delete">account:environment:delete</a></p></div></div></td><td><div><div><p>Delete an environment</p></div></div></td></tr><tr><td><div><div><p><a href="#account-environment-describe">account:environment:describe</a></p></div></div></td><td><div><div><p>Shows details of an environment</p></div></div></td></tr><tr><td><div><div><p><a href="#account-environment-list">account:environment:list</a></p></div></div></td><td><div><div><p>Lists environments</p></div></div></td></tr><tr><td><div><div><p><a href="#account-user-describe">account:user:describe</a></p></div></div></td><td><div><div><p>Show account details</p></div></div></td></tr></tbody></table>

## account:business-group:describe

> account:business-group:describe [flags] <identifier>

Displays information on the business group you pass in `<identifier>`  
If `<identifier>` is not specified, the command describes the business group on the current session.
Identifier searches for ID match first, then name.

> [!NOTE] If your business group or organization name contains spaces, enclose its name between `"`
> characters.
>
> > account:business-group:describe "QA Organization"

Returns the business group owner, type, subscription information, the entitlements of the group and
in which environment is running.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## account:business-group:list

> account:business-group:list [flags]

Displays all [business groups](../../access-management/business-groups). It returns the name of the
business group, the type ('Master' or 'Business unit'), and the ID.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## account:environment:create

> account:environment:create [flags] <name>

Creates a new environment using the name you set in `<name>`  
Use the `--type` flag to specify the environment type.  
Supported values for environment types are:

- `design`
- `production`
- `sandbox`

If no type is specified, the command creates a sandbox environment.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## account:environment:delete

> account:environment:delete [flags] <name>

Deletes the environment specified in `<name>`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## account:environment:describe

> account:environment:describe [flags] <name>

Returns information about the environment specified in `<name>`  
If no `<name>` is provided, this command returns information about the current session’s
environment.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## account:environment:list

> account:environment:list [flags]

Lists all your environments in Anypoint Platform. It returns your environment name, Id and whether
it’s sandboxed or not.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).

## account:user:describe

> account:user:describe [flags]

Returns your account information, including your username, your full name, your email address, and
the creation date of your account.

Use the `--output` flag to specify the response format. Supported values are `table` (default) and
`json`.

This command accepts the [default flags](./#default-options).
