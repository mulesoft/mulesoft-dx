> exchange:asset:resource:list [flags] <assetIdentifier>

Lists the resources in the asset portal of the asset specified in `<assetIdentifier>`

Argument `assetIdentifier` should be formatted as follows: `[group_id]/<asset_id>/<version>`  
If `group_id` is not specified, it defaults to the currently selected Organization ID

> [!NOTE] This command lists published resources by default.

This command accepts the `--draft` flag to list non-published resources in the asset portal.

Prompt the `--output` flag to specify the response format. Supported values are `table` (default)
and `json`.

This command accepts the [default flags](./#default-options).
