---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for Exchange Assets

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `exchange` commands to automate your Exchange processes. For more information about how to
use these commands, refer to the [Exchange documentation](../../exchange/).

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#exchange-asset-copy">exchange:asset:copy</a></p></div></div></td><td><div><div><p>Copies an Exchange asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-delete">exchange:asset:delete</a></p></div></div></td><td><div><div><p>Deletes an asset from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-deprecate">exchange:asset:deprecate</a></p></div></div></td><td><div><div><p>Deprecates an asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-describe">exchange:asset:describe</a></p></div></div></td><td><div><div><p>Shows a given asset’s information</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-download">exchange:asset:download</a></p></div></div></td><td><div><div><p>Downloads an Exchange asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-list">exchange:asset:list</a></p></div></div></td><td><div><div><p>Lists all assets</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-modify">exchange:asset:modify</a></p></div></div></td><td><div><div><p>Modifies an Exchange asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-mutableDataUpload">exchange:asset:mutableDataUpload</a></p></div></div></td><td><div><div><p>Modifies mutable data of an existing Exchange asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-page-delete">exchange:asset:page:delete</a></p></div></div></td><td><div><div><p>Deletes an asset’s description page from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-page-download">exchange:asset:page:download</a></p></div></div></td><td><div><div><p>Downloads an asset’s description page from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-page-list">exchange:asset:page:list</a></p></div></div></td><td><div><div><p>List all pages for a given asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-page-modify">exchange:asset:page:modify</a></p></div></div></td><td><div><div><p>Changes an asset’s description page from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-page-update">exchange:asset:page:update</a></p></div></div></td><td><div><div><p>Updates an asset’s description page from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-page-upload">exchange:asset:page:upload</a></p></div></div></td><td><div><div><p>Uploads an asset’s description page from Exchange</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-resource-delete">exchange:asset:resource:delete</a></p></div></div></td><td><div><div><p>Deletes resource from the asset portal</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-resource-download">exchange:asset:resource:download</a></p></div></div></td><td><div><div><p>Downloads resource from the asset portal</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-resource-list">exchange:asset:resource:list</a></p></div></div></td><td><div><div><p>Lists published resources in the asset portal</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-resource-upload">exchange:asset:resource:upload</a></p></div></div></td><td><div><div><p>Uploads a resource to an asset portal</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-undeprecate">exchange:asset:undeprecate</a></p></div></div></td><td><div><div><p>Undeprecates an asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-updateStatus">exchange:asset:updateStatus</a></p></div></div></td><td><div><div><p>Modifies the status of an existing asset</p></div></div></td></tr><tr><td><div><div><p><a href="#exchange-asset-upload">exchange:asset:upload</a></p></div></div></td><td><div><div><p>Uploads an Exchange asset using Exchange Experience API</p></div></div></td></tr></tbody></table>

> [!NOTE] Exchange commands are currently not available for GovCloud.

## exchange:asset:copy

> exchange:asset:copy [flags] <source> <target>

Copies the Exchange asset from `<source>` to `<target>`  
Arguments `<source>` and `<target>` should be formatted as follows:
`([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--targetOrganizationId</code></p></div></div></td><td><div><div><p>Organization ID to copy asset into</p></div></div></td><td><div><div><p><code>--targetOrganizationId organization_id source_group_id/source_asset_id/source_version target_group_id/target_asset_id/target_version</code></p></div></div></td></tr></tbody></table>

## exchange:asset:delete

> exchange:asset:delete [flags] <assetIdentifier>

Deletes the Exchange asset passed in `<assetIdentifier>`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the default flag `--help`.

## exchange:asset:deprecate

> exchange:asset:deprecate <assetIdentifier>

Deprecates the asset passed in `<assetIdentifier>`

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the [default flags](./#default-options).

## exchange:asset:describe

> exchange:asset:describe <assetIdentifier>

Describes the asset passed in `<assetIdentifier>`

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

> [!NOTE] When using `--output json`, the `versions` property in the response includes information
> about all available versions of the asset, not only the version specified in `<assetIdentifier>`.

This command accepts the [default flags](./#default-options).

## exchange:asset:download

> exchange:asset:download [flags] <assetIdentifier> <directory>

Downloads the Exchange asset identified with `<assetIdentifier>` to the directory passed in
`<directory>`  
Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the [default flags](./#default-options).

## exchange:asset:list

> exchange:asset:list [flags] [searchText]

Lists all assets in Exchange

> [!TIP] You can specify keywords in searchText to limit results to APIs containing those specific
> keywords.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--limit</code></p></div></div></td><td><div><div><p>Number of results to retrieve</p></div></div></td><td><div><div><p><code>--limit 2</code></p></div></div></td></tr><tr><td><div><div><p><code>--offset</code></p></div></div></td><td><div><div><p>Offsets the number of APIs passed</p></div></div></td><td><div><div><p><code>--offset 3</code></p></div></div></td></tr><tr><td><div><div><p><code>--organizationId</code></p></div></div></td><td><div><div><p>Filters by organization id</p></div></div></td><td><div><div><p><code>--organizationId a12b3c45-de6f-789g-hi01-j2klm3nop4q5</code></p></div></div></td></tr><tr><td><div><div><p><code>--output</code></p></div></div></td><td><div><div><p>Specifies the response format.</p></div></div></td><td><div><div><p><code>--output json</code></p></div></div></td></tr></tbody></table>

## exchange:asset:modify

> exchange:asset:modify [flags] <assetIdentifier>

Modifies the Exchange asset identified with `<assetIdentifier>`  
Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>New asset name</p></div></div></td><td><div><div><p><code>--name newName</code></p></div></div></td></tr><tr><td><div><div><p><code>--tags</code></p></div></div></td><td><div><div><p>Comma-separated tags for the asset</p></div></div></td><td><div><div><p><code>--tags tag1,tag2</code></p></div></div></td></tr></tbody></table>

## exchange:asset:mutableDataUpload

> exchange:asset:mutableDataUpload [flags] <assetIdentifier>

Modifies the mutable data of an already created asset, including tags, categories, fields, and
documentation

Argument `assetIdentifier` should be formatted as follows: `[_<groupID>_]/_<assetID>_/_<version>_`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--docs</code></p></div></div></td><td><div><div><p>Documentation file (Should specify the "zip" file path)</p></div></div></td><td><div><div><p><code>--docs /Users/llucas/Desktop/examples/docs.zip</code></p></div></div></td></tr><tr><td><div><div><p><code>--categories</code></p></div></div></td><td><div><div><p>Categories</p></div></div></td><td><div><div><p><code>--categories='{"someKey":"value", "anotherKey":"anotherValue"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--fields</code></p></div></div></td><td><div><div><p>Fields</p></div></div></td><td><div><div><p><code>--fields='{"someKey":"value", "anotherKey":"anotherValue"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--tags</code></p></div></div></td><td><div><div><p>Tags (comma-separated)</p></div></div></td><td><div><div><p><code>--tags api,tag1,tag2</code></p></div></div></td></tr></tbody></table>

## exchange:asset:page:delete

> exchange:asset:page:delete [flags] <assetIdentifier> <pageName>

Deletes the description page specified in `<pageName>`, for the asset identified with
`<assetIdentifier>`

> [!WARNING] This command does not prompt twice before deleting. If you send a delete instruction,
> it does not ask for confirmation.

> [!NOTE] This command only supports published pages.

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the [default flags](./#default-options).

## exchange:asset:page:download

> exchange:asset:page:download [flags] <assetIdentifier> <directory> [pageName]

Downloads the description page specified in `<pageName>` for the Exchange asset identified with
`<assetIdentifier>` to the directory passed in `<directory>`  
If [pageName] is not specified, this command downloads all pages.

> [!NOTE] This command only supports published pages.

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID  
The description page is downloaded in Markdown format.

This command accepts the [default flags](./#default-options).

## exchange:asset:page:list

> exchange:asset:page:list <assetIdentifier>

Lists all pages for the asset passed in `<assetIdentifier>`  
Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

> [!NOTE] This command only supports published pages.

This command accepts the `--output` flag to specify the response format. Supported values are
`table` (default) and `json`.

This command accepts the [default flags](./#default-options).

## exchange:asset:page:modify

> exchange:asset:page:modify [flags] <assetIdentifier> <pageName>

Modifies the description page specified in `<pageName>`, for the Exchange asset identified with
`<assetIdentifier>`

> [!NOTE] This command only supports published pages.

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the `--name` flag to set a new asset page name.

This command accepts the [default flags](./#default-options).

## exchange:asset:page:update

> exchange:asset:page:update [flags] <assetIdentifier> <pageName> <mdPath>

Updates the content of an asset description page from the path passed in `<mdPath>` using the name
specified in `<pageName>` to the Exchange asset identified with `<assetIdentifier>`  
Naming the page "home" makes the updated page the main description page for the Exchange asset.

> [!CAUTION] This command publishes all active drafts as part of the operation.

Argument `assetIdentifier` should be formatted as follows: `[group_id]/<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the [default flags](./#default-options).

## exchange:asset:page:upload

> exchange:asset:page:upload [flags] <assetIdentifier> <pageName> <mdPath>

Uploads an asset description page from the path passed in `<mdPath>` using the name specified in
`<pageName>` to the Exchange asset identified with `<assetIdentifier>`  
Naming the page "home" makes the uploaded page the main description page for the Exchange asset.

> [!CAUTION] This command publishes all active drafts as part of the operation.

Argument `assetIdentifier` should be formatted as follows: `[group_id]/<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the [default flags](./#default-options).

## exchange:asset:resource:delete

> exchange:asset:resource:delete [flags] <assetIdentifier> <resourcePath>

Deletes the resource specified in `<resourcePath>` from the asset portal of the asset specified in
`<assetIdentifier>` by publishing a new portal in which `resourcePath` has been deleted.

Argument `<assetIdentifier>` should be formatted as follows: `[group_id]/<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

Argument `<resourcePath>` must be a published resource  
You can list all published resources using the [asset resource list](#exchange-asset-resource-list)
command.

> [!CAUTION] This command publishes all active drafts as part of the operation.

This command accepts the [default flags](./#default-options).

## exchange:asset:resource:download

> exchange:asset:resource:download [flags] <assetIdentifier> <resourcePath> <filePath>

Downloads the published resource specified in `<resourcePath>` from the asset portal of the asset
specified in `<assetIdentifier>` to the file specified in `<filePath>`

Argument `assetIdentifier` should be formatted as follows: `[group_id]/<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

Argument `<resourcePath>` must be a published resource  
You can list all published resources using the [asset resource list](#exchange-asset-resource-list)
command.

> [!NOTE] This command only supports published resources.

This command accepts the [default flags](./#default-options).

## exchange:asset:resource:list

> exchange:asset:resource:list [flags] <assetIdentifier>

Lists the resources in the asset portal of the asset specified in `<assetIdentifier>`

Argument `assetIdentifier` should be formatted as follows: `[group_id]/<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

> [!NOTE] This command lists published resources by default.

This command accepts the `--draft` flag to list non-published resources in the asset portal.

Prompt the `--output` flag to specify the response format. Supported values are `table` (default)
and `json`.

This command accepts the [default flags](./#default-options).

## exchange:asset:resource:upload

> exchange:asset:resource:upload [flags] <assetIdentifier> <filepath>

Uploads the resource specified in `<filepath>` to a page in the asset portal described in
`<assetIdentifier>`

You can use this command for any page of your `<assetIdentifier>` asset  
Supported file extensions for `<filepath>` are: `jpeg`, `jpg`, `jpe`, `gif`, `bmp`, `png`, `webp`,
`ico`, `svg`, `tiff`, `tif`

The argument `assetIdentifier` should be formatted as follows: `[group_id]/<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

The successful output command will be a markdown codesnippet.

This command accepts the [default flags](./#default-options).

## exchange:asset:undeprecate

> exchange:asset:undeprecate <assetIdentifier>

Undeprecates the asset passed in `<assetIdentifier>`

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

This command accepts the [default flags](./#default-options).

## exchange:asset:updateStatus

> exchange:asset:updateStatus [flags] <assetIdentifier>

Modifies the status of an already created asset

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--status</code></p></div></div></td><td><div><div><p>Asset status</p></div><div><p>Supported Values:</p></div><div><ul><li><p><code>published</code></p></li><li><p><code>deprecated</code></p></li></ul></div></div></td><td><div><div><p><code>--status deprecated</code></p></div></div></td></tr></tbody></table>

Valid transitions are:

<table><colgroup><col> <col></colgroup><thead><tr><th>From</th><th>To</th></tr></thead><tbody><tr><td><div><div><p><code>development</code></p></div></div></td><td><div><div><p><code>published</code></p></div></div></td></tr><tr><td><div><div><p><code>published</code></p></div></div></td><td><div><div><p><code>deprecated</code></p></div></div></td></tr><tr><td><div><div><p><code>deprecated</code></p></div></div></td><td><div><div><p><code>published</code></p></div></div></td></tr></tbody></table>

> [!NOTE] the `published` state corresponds to the `stable` state

## exchange:asset:upload

> exchange:asset:upload [flags] <assetIdentifier>

Uploads a rest-api, soap-api, http-api, raml-fragment, custom, app, template, example, policy,
extension, external-library, connector asset, or ruleset using the ID passed in `<assetIdentifier>`

Argument `assetIdentifier` should be formatted as follows: `([group_id]/)<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th><th>Example</th></tr></thead><tbody><tr><td><div><div><p><code>--categories</code></p></div></div></td><td><div><div><p>Categories (value should be a string in JSON format)</p></div></div></td><td><div><div><p><code>--categories '{"Department": "IT"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--dependencies</code></p></div></div></td><td><div><div><p>Asset dependencies (comma-separated)</p></div></div></td><td><div><div><p><code>--dependencies groupID:assetID:version,groupID2:assetID:version</code></p></div></div></td></tr><tr><td><div><div><p><code>--description</code></p></div></div></td><td><div><div><p>Asset description</p></div></div></td><td><div><div><p><code>--description "RAML"</code></p></div></div></td></tr><tr><td><div><div><p><code>--files</code></p></div></div></td><td><div><div><p>Asset file, identified as <code>classifier.packaging</code> or <code>packaging</code> and its file path<br>To send multiple files, you can use the same flag multiple times.<br>An exception to this is when you upload ruleset documentation with a ruleset. Both sets of classifiers and packaging options must be entered in a single <code>--files</code> flag</p></div></div></td><td><div><div><p>To upload a POM file and a RAML specification:</p></div><div><p><code>--files'{"pom.xml": "directory/pom-file.xml"}' --files='{"raml.raml": "./my-api.raml"}'</code></p></div><div><p>To upload a ruleset and its documentation:</p></div><div><p><code>anypoint-cli-v4 exchange asset upload my-auth-best-practices/1.0.0 --name "My Best Practices Ruleset" --description "This ruleset enforces my best practices for APIs." --files='{"ruleset.yaml":"/myRulesetFolder/mynewruleset.yaml","docs.zip":"/myRulesetFolder/ruleset.doc.zip"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--fields</code></p></div></div></td><td><div><div><p>Fields (value should be a string in JSON format)</p></div></div></td><td><div><div><p><code>--fields '{"releaseDate": "2020-01-01T20:00:00.000Z"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--keywords</code></p></div></div></td><td><div><div><p>Keywords (comma-separated)</p></div></div></td><td><div><div><p><code>--keywords raml,rest-api,someKeyword</code></p></div></div></td></tr><tr><td><div><div><p><code>--name</code></p></div></div></td><td><div><div><p>Asset name (required if no pom file is specified)</p></div></div></td><td><div><div><p><code>--name "Raml Asset"</code></p></div></div></td></tr><tr><td><div><div><p><code>--properties</code></p></div></div></td><td><div><div><p>Asset properties<br>The file of the specified "mainFile" property must be in the uploaded zip file on the root path. The file cannot be in a subfolder.</p></div></div></td><td><div><div><p><code>--properties='{"apiVersion":"v1", "mainFile":"api.raml", "contactName":"contact", "contactEmail":"<a href="mailto:example@mulesoft.com">example@mulesoft.com</a>"}'</code></p></div></div></td></tr><tr><td><div><div><p><code>--status</code></p></div></div></td><td><div><div><p>Asset status<br>Supported Values:</p></div><div><ul><li><p><code>development</code></p></li><li><p><code>published</code> (default)</p></li></ul></div></div></td><td><div><div><p><code>--status development</code></p></div></div></td></tr><tr><td><div><div><p><code>--tags</code></p></div></div></td><td><div><div><p>Tags (comma-separated)</p></div></div></td><td><div><div><p><code>-- tags api,tag1,tag2</code></p></div></div></td></tr><tr><td><div><div><p><code>--type</code></p></div></div></td><td><div><div><p>Asset type</p></div><div><p>Required if no file is specified.</p></div><div><p>Supported Values:</p></div><div><ul><li><p><code>rest-api</code></p></li><li><p><code>soap-api</code></p></li><li><p><code>http-api</code></p></li><li><p><code>raml-fragment</code></p></li><li><p><code>custom</code></p></li><li><p><code>connector</code></p></li><li><p><code>template</code></p></li><li><p><code>example</code></p></li><li><p><code>policy</code></p></li><li><p><code>app</code></p></li><li><p><code>extension</code></p></li><li><p><code>external-library</code></p></li><li><p><code>ruleset</code></p></li></ul></div><div><p>If it is uploaded, the type is inferred from the classifier of the file</p></div><div><p>Depending on the type of asset, some possible classifier values are:</p></div><div><ul><li><p>REST API</p><div><ul><li><p><code>oas</code> (with <code>zip</code>, <code>yaml</code>, or <code>json</code> as packaging)</p></li><li><p><code>raml</code> (with <code>zip</code> or <code>raml</code> as packaging)</p></li></ul></div></li><li><p>RAML Fragment</p><div><ul><li><p><code>raml-fragment</code> (with <code>zip</code> or <code>raml</code> as packaging)</p></li></ul></div></li><li><p>SOAP API</p><div><ul><li><p><code>wsdl</code> (with <code>zip</code>, <code>wsld</code>, or <code>xml</code> as packaging)</p></li></ul></div></li><li><p>Custom</p><div><ul><li><p><code>custom</code></p></li><li><p><code>docs</code> (with <code>doc.zip</code> as packaging)</p></li></ul></div></li><li><p>Application</p><div><ul><li><p><code>mule-application</code> (with <code>jar</code> as packaging)</p></li></ul></div></li><li><p>Policy</p><div><ul><li><p><code>mule-policy</code> (with <code>jar</code> as packaging) + <code>policy-definition</code> (with <code>yaml</code> as packaging)</p></li></ul></div></li><li><p>Example</p><div><ul><li><p><code>mule-application-example</code> (with <code>jar</code> as packaging)</p></li></ul></div></li><li><p>Template</p><div><ul><li><p><code>mule-application-template</code> (with <code>jar</code> as packaging)</p></li></ul></div></li><li><p>Extension</p><div><ul><li><p><code>mule-plugin</code> (with <code>jar</code> as packaging)</p></li></ul></div></li><li><p>Connector</p><div><ul><li><p><code>studio-plugin</code> (with <code>zip</code> as packaging) + file with no classifier and packaging <code>jar</code></p></li></ul></div></li><li><p>External Library</p><div><ul><li><p><code>external-library</code> (with <code>jar</code> as packaging)</p></li></ul></div></li><li><p>Ruleset</p><div><ul><li><p><code>ruleset</code> (with <code>zip</code> or <code>yaml</code> as packaging)</p></li></ul></div></li></ul></div></div></td><td><div><div><p><code>--type rest-api</code></p></div></div></td></tr></tbody></table>

## See Also

- [Autocataloging APIs Using API Catalog CLI](../../exchange/apicat-about-api-catalog-cli)
