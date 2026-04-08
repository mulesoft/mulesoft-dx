Public portal provides a way to enable developers outside of an organization to access that organization’s REST, SOAP, HTTP APIs, and API Groups that have been shared with the public portal.

Exchange public portals replace what used to be known as developer portals.


# Customize the public portal
You can customize the appearance and the content of the portal by adding text and custom pages with content.

Following there are exposed some examples about how to customize the public portal

Before executing the examples, read the `Anypoint Platform Token` section to know how to obtain the token to be used in the examples. This should be replaced for the value `ANYPOINT_TOKEN` in each curl example.

The examples have been made by cURL, but optionally, instead of sending HTTP commands with cURL, you can use Postman or another application.

Consider for the examples that the URL parameter `:domain` is the domain of the public portal we are editing, and it should be replaced.

## How to obtain the domain given a master organization

To get the domain of a master organization, this request should be executed, replacing `:organizationId` by the id of the master organization

```
curl https://anypoint.mulesoft.com/accounts/api/organizations/:organizationId \
  -H 'Authorization: bearer ANYPOINT_TOKEN' | jq -r ".domain"
```

## How to create a new page into the public portal draft
To create a new page in the public portal draft for a particular domain `:domain` this example could be followed.

The page will be added as a draft until the public portal is published. In this case, the new page to be created is `newPage` as `pathPath` (it is indicated after the `-d` flag):

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/portals/:domain/draft/pages' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"pagePath":"newPage"}'
```


## How to upload content for a page
To override the markdown content of the page `:pageId` (`pagePath`) that has been created before for a particular domain `:domain` this example could be followed. The content will be added as a draft until the public portal is published.

The markdown content is specified after the `-d` flag. In this case, it is `This is the markdown content\n for this page`.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/portals/:domain/draft/pages/:pageId' \
    -X 'PUT' \
    -H 'accept: application/json' \
    -H 'authorization: bearer ANYPOINT_TOKEN' \
    -H 'content-type: text/markdown' \
    -d 'This is the markdown content\n for this page'
```

# How to upload resources to pages

In the Exchange API version 2, image resources can be added to the public portal documentation markdown pages.

In the following example, replace `/file-path/image.png` with the local path of the resource to be uploaded.
If the image type is not `png`, change the `content-type`.

```
curl https://anypoint.mulesoft.com/exchange/api/v2/portals/:domain/draft/resources \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -F "Content-Type=image/png" \
  -F "file=@/file-path/image.png"
```

The response is similar to this:

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


## How to customize the content of the public portal (draft mode)

This is the content can be customized for a public portal:
For the `home`:
`welcomeTitle`: The main title shown at the home page of the public portal.
`welcomeText`: The subtitle shown at the home page of the public portal.
`textColor`: The color of the `welcomeTitle` and `welcomeText`.
`heroImage`: The hero image. It is the path of an already uploaded resource. It is optional.

For the `navbar`:
`backgroundColor`: The background color of the navbar
`textColor`: The color of pages on the navbar
`textColorActive`: The color of the selected page on the navbar
`logoImage`: The logo image of the portal. It should be the path of an already uploaded resource. It is optional.
`favicon`: The favicon image. It should be the path of an already uploaded resource. It is optional.

For the `custom pages`:
`name`: The name of a page already created in the portal (as it has been explained before)
`path`: The path on the browser of the page that will be shown


Use this example to upload the content of the public portal in the draft mode. Remember that the final content will be available for the rest of the users when the public portal is published.

The described content can be edited after the `-d` flag.

```
curl https://anypoint.mulesoft.com/exchange/api/v2/portals/:domain/draft \
  -X 'PUT' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"customization":{"home":{"welcomeTitle":"New welcome title","welcomeText":"Welcome text","textColor":"#fffff0", "heroImage":"resources/exchange-hero-f7b371b4-366e-48d2-8fed-7f05a324bb74.png"},"navbar":{"backgroundColor":"#262128","textColor":"#fffff0","textColorActive":"#00a2dA", "logoImage":"resources/exchange-logo-1e5ccd55-07c5-4b04-b9b7-85f9232f6ea0.jpg","favicon":"resources/exchange-favicon-c814607e-d510-432a-91f9-73967249af9e.jpg"}},"pages":[{"name":"newPage","path":"newPage"}]}'
```

## How to publish the draft content of the public portal

Use this example to publish the content of the public portal that is in the draft mode. Once the portal is published, all the customization will be available for the rest of the users.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/portals/:domain' \
  -X 'PATCH' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN'
```


# Add an asset to the public portal

To show an asset in the public portal, share a major version of the asset to the public portal. This shares all the asset versions with the same major version. For example, if an asset has the versions `1.0.0`, `1.0.2`, `1.2.3`, `2.0.0`, and the major version `1` is shared to the public portal, then the versions `1.0.0`, `1.0.2`, and `1.2.3` are shared.


To make a major version public:

Get the asset’s versionGroups with a request like the following example. In all examples, replace `:groupId` with the asset’s group ID and replace `:assetId` with the asset’s asset ID.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/versionGroups' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN'
```

The response is similar to this. In this example the asset has two `versionGroup` values, each with one major version.

```
[{
  "groupId":":groupId",
  "assetId":":assetId",
  "versionGroup":"v1",
  "major":1,
  "isPublic":true
}, {
  "groupId":":groupId",
  "assetId":":assetId",
  "versionGroup":"v2",
  "major":2,
  "isPublic":true
}]
```

Add the major versions of the asset to the public portal with a request like the following example.

_IMPORTANT: Consider every one of the asset’s versionGroups. This action makes `public` the versionGroups that are specified in the body of the request after the `-d` flag, in this case `v1`, and marks as not public all the versionGroups that are not present in the body._

In the example, the versionGroup `v1` (the major version `1`) will be `public`, but the versionGroup `v2` (the major version `2`) will become `private`, because it is not sent.

```
curl 'https://anypoint.mulesoft.com/exchange/api/v2/assets/:groupId/:assetId/public' \
  -X 'PUT' \
  -H 'accept: application/json' \
  -H 'authorization: bearer ANYPOINT_TOKEN' \
  -H 'content-type: application/json' \
  -d '[{"versionGroup":"v1"}]'
```

# Vanity domain
A vanity domain is a domain name used with the purpose of representing the person who registered it. It is personalized to communicate who owns it.

In this case, a vanity domain can be used to refer to the organization that owns a public portal.

To see how a vanity domain can be configured, see the following article:

https://docs.mulesoft.com/exchange/portal-vanity-domain


For more information about portal customization, see:

https://docs.mulesoft.com/exchange/to-customize-portal