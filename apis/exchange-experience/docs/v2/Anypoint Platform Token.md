# Anypoint Platform Token

Before executing any of the example requests, get an access token for an Anypoint Platform
user.

You can send HTTP commands with cURL, Postman, or another application. This example uses cURL.

Replace `ANYPOINT_USERNAME` with your Anypoint Platform user account name. Replace `ANYPOINT_PASSWORD` with your password.

```
curl --location --request POST 'https://anypoint.mulesoft.com/accounts/login' \
     --header 'Content-Type: application/json' \
     --header 'Accept: application/json' \
     --data-raw '{
        "username":"ANYPOINT_USERNAME",
        "password":"ANYPOINT_PASSWORD"
     }' | jq -r ".access_token"
```

Use this token in your API calls. In each cURL example, replace `ANYPOINT_TOKEN` with the token.


## Connected Application Authentication

Connected application authentication allows access to Exchange using the client application credentials of client ID and client secret, so you can execute Exchange requests without sending a token.

To create a new connected application:

1. Log in to Anypoint.
2. Go to **Access Management** > **Connected Apps** > **Create App**.
3. Choose "App acts on its own behalf (client credentials)".
4. To provide read and write access, ensure the application has either the scope **Exchange Administrator** or the scope **Exchange Contributor**. To provide read-only access, ensure the application has the scope **Exchange Viewer**.
5. Click **Save** and copy the client ID and client secret of the connected application.

To use connected application authentication, provide basic authentication and define the username as `~~~Client~~~` and the password as `clientId~?~clientSecret`. Replace `clientId` with the client ID. Replace `clientSecret` with the client secret.
