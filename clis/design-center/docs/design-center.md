---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Design Center Projects

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `designcenter` commands for managing APIs from Design Center. For more information about how
to use these commands, refer to the [Design Center documentation](../../design-center/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#designcenter-project-create">designcenter:project:create</a></p></div></div></td><td><div><div><p>Creates a new Design Center project</p></div></div></td></tr><tr><td><div><div><p><a href="#designcenter-project-delete">designcenter:project:delete</a></p></div></div></td><td><div><div><p>Deletes a Design Center project</p></div></div></td></tr><tr><td><div><div><p><a href="#designcenter-project-download">designcenter:project:download</a></p></div></div></td><td><div><div><p>Downloads the content of a Design Center project</p></div></div></td></tr><tr><td><div><div><p><a href="#designcenter-project-list">designcenter:project:list</a></p></div></div></td><td><div><div><p>Lists all Design Center projects</p></div></div></td></tr><tr><td><div><div><p><a href="#designcenter-project-publish">designcenter:project:publish</a></p></div></div></td><td><div><div><p>Publishes a Design Center project to Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#designcenter-project-upload">designcenter:project:upload</a></p></div></div></td><td><div><div><p>Uploads the content of a project to Design Center</p></div></div></td></tr></tbody></table>

## designcenter:project:create

> designcenter:project:create [flags] <name>

Creates a new Design Center project with the name specified in `<name>`

> [!IMPORTANT] This command does not support Mule application types.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--type (required)</code></p></div></div></td><td><div><div><p>The project type.<br>This field is required.</p></div><div><p>Supported values are:</p></div><div><ul><li><p><code>raml</code></p></li><li><p><code>raml-fragment</code></p></li><li><p><code>OAS</code></p></li></ul></div></div></td><td><div><div><p><code>--type raml</code></p></div></div></td></tr><tr><td><div><div><p><code>--fragmentType</code></p></div></div></td><td><div><div><p>The fragment type<br>Always use with <code>--type raml-fragment</code>, even for OAS 3.0 and JSON schema fragments.</p></div><div><p>This field is required if the type flag was set as <code>raml-fragment</code></p></div><div><p>Supported fragments type are:</p></div><div><ul><li><p><code>trait</code></p></li><li><p><code>resource-type</code></p></li><li><p><code>library</code></p></li><li><p><code>type</code></p></li><li><p><code>user-documentation</code></p></li><li><p><code>oas-components</code></p></li><li><p><code>json-schema</code></p></li></ul></div></div></td><td><div><div><p><code>--type raml-fragment --fragmentType user-documentation</code></p></div></div></td></tr><tr><td><div><div><p><code>--version</code></p></div></div></td><td><div><div><p>This flag is only available for OAS APIs.<br>Supported values: <code>2.0</code>, <code>3.0</code></p></div></div></td><td><div><div><p><code>--version 2.0</code></p></div></div></td></tr><tr><td><div><div><p><code>--format</code></p></div></div></td><td><div><div><p>This flag is only available for OAS APIs.<br>Supported values: <code>YAML</code>, <code>JSON</code></p></div></div></td><td><div><div><p><code>--format YAML</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specify the response format</p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## designcenter:project:delete

> designcenter:project:delete [flags] <name>

Deletes the Design Center project specified in `name`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

This command accepts the [default flags](./#default-options).

## designcenter:project:download

> designcenter:project:download [flags] <name> <targetDir>

Downloads the Design Center project passed in `name` to your local directory specified in
`targetDir`  
Use the `--resolveDependenciesTimeout=X` flag to specify the duration, in minutes, for the commands
to wait for the resolution of dependencies before downloading a project. If the specified time
passes, your project downloads without the missing dependencies.

This command accepts the [default flags](./#default-options).

## designcenter:project:list

> designcenter:project:list [flags] [searchText]

Lists all your Design Center projects

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--pageIndex</code></p></div></div></td><td><div><div><p>Number of page to retrieve</p></div></div></td><td><div><div><p><code>--pageIndex 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--pageSize</code></p></div></div></td><td><div><div><p>Number of results to retrieve per page</p></div></div></td><td><div><div><p><code>--pageSize 5</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specify the response format.</p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## designcenter:project:publish

> designcenter:project:publish [flags] <projectName>

Publishes the Design Center project passed in `projectName` to Exchange

In addition to the [default flags](./#default-options), this command accepts the following flags:

> [!TIP] Flags that are not specified are extracted from exchange.json

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--apiVersion</code></p></div></div></td><td><div><div><p>The API version if your project is an API specification project</p></div></div></td><td><div><div><p><code>--main sample.raml --apiVersion 1.0</code></p></div></div></td></tr><tr><td><div><div><p><code>--assetId</code></p></div></div></td><td><div><div><p>The asset assetId</p></div></div></td><td><div><div><p><code>designcenter:project:publish --assetId project</code></p></div></div></td></tr><tr><td><div><div><p><code>--groupId</code></p></div></div></td><td><div><div><p>The asset groupId</p></div></div></td><td><div><div><p><code>designcenter:project:publish --groupId com.mulesoft.com</code></p></div></div></td></tr><tr><td><div><div><p><code>--main</code></p></div></div></td><td><div><div><p>The name of the main file name</p></div></div></td><td><div><div><p><code>--main sample.xml</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>The name for the asset</p></div></div></td><td><div><div><p><code>--name sampleProject</code></p></div></div></td></tr><tr><td><div><div><p><code>--status</code></p></div></div></td><td><div><div><p>The asset status<br>Supported values are: <code>development</code> and <code>published</code> (default)</p></div></div></td><td><div><div><p><code>designcenter:project:publish --version 1.0</code></p></div></div></td></tr><tr><td><div><div><p><code>--tags</code></p></div></div></td><td><div><div><p>Comma separated list of tags</p></div></div></td><td><div><div><p><code>--tags test,sample,integration</code></p></div></div></td></tr><tr><td><div><div><p><code>--version</code></p></div></div></td><td><div><div><p>The asset version</p></div></div></td><td><div><div><p><code>designcenter:project:publish --version 1.0</code></p></div></div></td></tr></tbody></table>

## designcenter:project:upload

> designcenter:project:upload [flags] <name> <projDir>

Uploads content from a Design Center project from your local directory passed in `projDir` into an
already existing Design Center project identified with `name`.

By default, this command ignores all hidden files and directories. To include hidden files and
directories, use the `--include-dot-files` flag. When the `--include-dot-files` flag is used, the
command uploads hidden files and folders from your specified directory.

This command accepts the [default flags](./#default-options).
