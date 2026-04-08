Version agnostic properties apply to all versions of the asset. These properties are the asset’s `icon`, `name`, `description`, `contact_name`, `contact_email` and asset `status`.

The following examples show how to update these properties.

Before executing the examples, obtain a token with the instructions in the [`Anypoint Platform Token`](Anypoint Platform Token.md) section. In each example, replace `ANYPOINT_TOKEN` with your token.

In all examples, replace `:groupId` with the group ID of the asset to update, and replace `:assetId` with the asset ID of the asset to update.

You can send HTTP commands with cURL, Postman, or another application. These examples use cURL.

## Update an asset name

Replace `New name` with the new name for the asset.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId' \
  -X 'PATCH' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"name":"New name"}'
```


## Update an asset description

Replace `New description` with the new description for the asset.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId' \
  -X 'PATCH' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"description":"New description"}'
```


## Update an asset icon

Replace `/file-path/image.png` with the path of the image file, and replace `image/png` with the correct content type of the image file.


```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/icon' \
  -X 'PUT' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: image/png' \
  -T /file-path/image.png
```

## Update an asset contact name

Replace `New name` with the new contact name for the asset.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId' \
  -X 'PATCH' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"contactName":"New name"}'
```

## Update an asset contact email

Replace `new@email.com` with the new contact email for the asset.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId' \
  -X 'PATCH' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"contactEmail":"new@email.com"}'
```

# Last updated date

An asset's last updated date timestamp is saved when you:

* Create a new asset
* Create a new asset version
* Update any version agnostic property:
  * Name
  * Description
  * Icon
  * Contact name
  * Contact email
* Update the asset status

The `updatedDate` timestamp applies to all versions of the asset and is identified by the asset `:groupId` and asset `:assetId`.

When the last updated date feature was added, the last updated date of each `existent`, `not_deleted`, and `completed` asset was set to the most recent creation date of that asset's versions.
