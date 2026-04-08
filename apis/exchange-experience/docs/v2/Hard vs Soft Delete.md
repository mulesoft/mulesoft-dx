In this article, there are some request examples that can be executed.

Before executing the examples, read the `Anypoint Platform Token` section to know how to obtain the token to be used in the examples. This should be replaced for the value `ANYPOINT_TOKEN` in each curl example.

The examples have been made by cURL, but optionally, instead of sending HTTP commands with cURL, you can use Postman or another application.

# Configure asset deletion setting

There are two ways of deleting an asset: soft deletion and hard deletion.

A hard delete allows reusing the deleted asset's GAV (group ID, asset ID, and version).

A soft delete, just like a hard delete, erases all information of the asset, its files, metadata, and its categorizations. However, unlike with a hard delete, the exact same GAV (group ID, asset ID, and version) can not be reused.

You can configure your organization to allow or block the execution of hard deletions by using the following cURL (note that soft deletions are always allowed).

```
curl --location --request PATCH 'https://anypoint.mulesoft.com/exchange/api/v2/organizations/:organizationId/settings' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer ANYPOINT_TOKEN' \
--data '{
    "deletionSettings": {
        "hardDeletionEnabled": true
    }
}'
```
By default, `deletionSettings.hardDeletionEnabled` is `true`. To know the state of this setting:

```
curl --location 'https://www.anypoint.mulesoft.com/exchange/api/v2/organizations/:organizationId/settings?settings=deletionSettings' \
--header 'Authorization: Bearer ANYPOINT_TOKEN'
```

# How to delete an asset

The URL parameters that have to be replaced are the following:
`:organizationId`: Organization of the asset
`:groupId`: Group ID of the asset
`:assetId`: Asset ID of the asset
`:version`: Version of the asset

How to execute a soft-delete:

```
curl https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/:version \
  -X DELETE \
  -H 'Authorization: Bearer ANYPOINT_TOKEN' \
  -H 'x-delete-type: soft-delete'
```

How to execute a hard-delete:

```
curl https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/:version \
  -X DELETE \
  -H 'Authorization: Bearer ANYPOINT_TOKEN' \
  -H 'Authorization: Bearer ANYPOINT_TOKEN' \
  -H 'x-delete-type: hard-delete'
```

For more information about deleting an asset https://docs.mulesoft.com/exchange/to-delete-asset


# Retrieve soft deleted assets

In order to list which assets have been soft deleted in an organization you can make the following request:
```
curl https://anypoint.mulesoft.com/exchange/api/v2/organizations/:organizationId/softDeleted?limit=40&offset=0 \
  -H 'Authorization: Bearer ANYPOINT_TOKEN' 
```
_Note: limit and offset query parameters are optional. By default, the limit value is 20, and the offset one is 0._


You can hard delete a soft deleted asset as long as the hard deletion setting is turned on for the organization.
