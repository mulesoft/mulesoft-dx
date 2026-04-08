The asset documentation is a way to document the release for an asset version. And also can be used to describe the overview of the asset and whatever more the owner wants to add.

The documentation of an asset can have pages and for each page content that describes each section. The default page is the `home`.

The content that is added to a page is added as `markdown format`.


## Steps to add asset documentation

The steps to add the documentation are the following:

 1. Create pages in the documentation `draft` (these pages only will be visible in `draft mode`, that means, only users with contributor or admin permissions can see the content inside the draft mode, and it won’t be visible for the rest of the users until the documentation is published)

2. Add content to the pages in the documentation `draft`

3. Publish the documentation `draft` (now the asset documentation is visible)

Following, there are some examples of how to edit the content of an asset documentation and publish it.

Before executing the examples, read the `Anypoint Platform Token` section to know how to obtain the token to be used in the examples. This should be replaced for the value `ANYPOINT_TOKEN` in each curl example.

The examples have been made by cURL, but optionally, instead of sending HTTP commands with cURL, you can use Postman or another application.

Consider that the URL parameters that have to be replaced:
  `:groupId`: Group ID of the asset to be edited
  `:assetId`: Asset ID of the asset to be edited
  `:version`: Version of the asset to be edited


## How to create a new page in the asset documentation
To create a new page in the asset documentation draft for an asset, this example could be followed.

The page will be added as a draft until the public portal is published. In this case, the new page to be created is `newPage` (it is indicated after the `-d` flag as `pagePath`):


```
curl https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/:version/portal/draft/pages \
  -X POST \
  -H 'Authorization: bearer ANYPOINT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "pagePath": "newPage" }'
```

_Note:_ There exists an especial `pagePath` for API assets that is used to add `Terms & Conditions`. To add this page, a new page with pagePath `.terms` should be created.


## How to upload content for a page
To override the markdown content of the page `:pageId` that has been created before for a particular asset, this example could be followed. The content will be added as a draft until the asset documentation is published.

The markdown content is specified after the `-d` flag. In this example, it is `markdown *content* for this page`.

```
curl https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/:version/portal/draft/pages/:pageId \
  -X PUT \
  -H 'Authorization: bearer ANYPOINT_TOKEN' \
  -H 'Content-Type: text/markdown' \
  -d 'markdown *content* for this page'
```

## How to upload resources to pages

In the Exchange API v2, image resources can be added to the asset documentation markdown pages.

An example of how to create a resource can be followed here:

Replace `/file-path/image.png` with the local path of the resource image to be uploaded.

```
curl https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/:version/portal/draft/resources \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H "Content-Type=multipart/form-data" \
  -F "data=@/file-path/image.png"
```

The response will look like this:

```
{
  "commitId":"0f317c3e8ec7cc3981e6240f49cd6a09fe026ecc",
  "path":"resources/download-7c128f6d-78d4-4207-bd46-6cf9759af671.png"
}
```

After you upload the resource, you can add it to the markdown. In this example, replace `resources/download-7c128f6d-78d4-4207-bd46-6cf9759af671.png` with the `path` from the response.

```
![resources/download-7c128f6d-78d4-4207-bd46-6cf9759af671.png](resources/download-7c128f6d-78d4-4207-bd46-6cf9759af671.png)
```

## How to publish the draft asset documentation

Use this example to publish the content of the asset documentation that is in the draft mode. Once it is published, all the asset documentation will be available.

```
curl https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/:version/portal \
  -X PATCH  \
  -H 'Authorization: bearer ANYPOINT_TOKEN'
```
