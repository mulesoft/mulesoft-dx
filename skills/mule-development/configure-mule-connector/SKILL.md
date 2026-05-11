---
name: configure-mule-connector
description: Generate a connector configuration block (XML + config.yaml) for an existing Mule project. Call this skill when the user asks to "add Salesforce config", "configure a connector", "set up Slack connection", "add DB config", or any request to wire a connector's connection into a Mule app. Resolves the connector from Exchange using bash scripts (NOT MCP tools), describes its metadata via CLI, selects the connection provider, and emits correct XML + property placeholders — all driven by live metadata, never hardcoded. NEVER use MCP server tools (search_asset, get_asset, etc.) — use only the bash scripts provided.
license: Apache-2.0
compatibility: Requires Anypoint CLI v4 with the `@mulesoft/anypoint-cli-dx-mule-plugin` DX plugin, Java 11+, Mule Runtime (for `dx mule describe-connector` metadata commands)
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
  cli: anypoint-cli-v4
  theme: professional
allowed-tools: Bash Read Write Edit AskUserQuestion
---

# Configure Mule Connector

> **⛔ CRITICAL: Do NOT use any MCP server tools in this skill.** Do NOT call `search_asset`, `get_asset`, or any tool from "MuleSoft MCP Server" or any other MCP server. ALL Exchange searches and connector operations MUST use ONLY the bash scripts (`get_latest_connector.sh`, `describe_connector.sh`, etc.) via the `Bash` tool. If you find yourself about to call an MCP tool, STOP and use the bash script instead.

Generate a complete connector configuration block — global `<config>` XML element, connection provider, and `config.yaml` property placeholders — for an existing Mule project. All output is driven by live connector metadata from `dx mule describe-connector`; nothing is hardcoded.

## When to Use This Skill

**Use this skill when users request:**

- "Add Salesforce config to my project"
- "Configure the Slack connector"
- "Set up database connection"
- "Add HTTP listener config"
- "Wire up the ServiceNow connector"
- "I need an S3 config block"

**Trigger keywords:** configure, config, connection, set up, wire up, add connector · salesforce, slack, http, db, database, s3, servicenow, jira, netsuite · connection provider, auth, oauth, basic auth, credentials.

**Do NOT use this skill when:** the user wants to create a full integration from scratch (use `build-mule-integration` instead) or when the user wants to add an operation/source to a flow (this skill only handles the `<config>` block).

---

## Prerequisites

```bash
anypoint-cli-v4 --version
anypoint-cli-v4 dx --help
echo $JAVA_HOME && java -version   # Java 11+
anypoint-cli-v4 conf
```

If tools are missing:

```bash
npm install -g @mulesoft/anypoint-cli-v4
npm install -g @mulesoft/anypoint-cli-dx-mule-plugin
anypoint-cli-v4 conf username <username>
anypoint-cli-v4 conf password <password>
```

---

## Shared Scripts

This skill uses shell scripts from the shared scripts directory at `/Users/agoyan/mule-app-cli-testing/.a4drules/skills/build-mule-integration/scripts/`. Invoke them with the `Bash` tool — do not inline their contents. The scripts persist output to disk so later steps can consume it mechanically:

| Script | Purpose | Output location |
| --- | --- | --- |
| `get_latest_connector.sh <search> [nickname]` | Step 1 — search Exchange and print ranked connector candidates (one GAV per line) | stdout only |
| `pick_connector.sh <nickname> <gav>` | Step 1 — record the chosen GAV as a draft | `tmp/connector-choices/<nickname>.json` |
| `describe_connector.sh <nickname>` | Step 2 — run `dx mule describe-connector`, save full JSON, echo digest to stdout | `tmp/connector-metadata/<nickname>.json` + digest on stdout |
| `build_gav.sh <json>` | Turn a saved connector JSON into its `groupId:assetId:version` string | stdout |

The scripts directory path is: `/Users/agoyan/mule-app-cli-testing/.a4drules/skills/build-mule-integration/scripts/`. Invoke by absolute path — do **not** construct relative paths, as the working directory may shift across turns. Throughout this skill, `scripts/` is shorthand for that absolute path.

---

## References

This skill uses reference files from `/Users/agoyan/mule-app-cli-testing/.a4drules/skills/build-mule-integration/references/` for connector identity and driver lookup:

| File | Purpose |
| --- | --- |
| `connector-catalog.md` | Identifies which connector asset to search for a given system. Use for connector identity only — **not** as a version source (versions drift; always use `get_latest_connector.sh` for live versions). |
| `jdbc-drivers.md` | Canonical JDBC driver GAVs and driver classes per database. Consult when the connector is `mule-db-connector` and you need to resolve the shared library dependency. |

The references path is: `/Users/agoyan/mule-app-cli-testing/.a4drules/skills/build-mule-integration/references/`. Read files with the `Read` tool when needed.

---

## Workflow-Wide Rules

- **Do NOT use MCP server tools.** All Exchange searches, connector lookups, and metadata retrieval MUST use the bash scripts listed above (`get_latest_connector.sh`, `describe_connector.sh`, etc.) and the `anypoint-cli-v4` CLI via the `Bash` tool. Never call MCP tools (e.g., `mulesoft-mcp-server`, `exchange` MCP tools, or any other MCP-based Exchange/connector tools). The bash scripts are the only authorized mechanism for Exchange interaction in this skill.
- **Connector versions come ONLY from `get_latest_connector.sh`.** Never paste a version from training-time memory or from extrapolation. The only acceptable source is a live Exchange search recorded via `pick_connector.sh`.
- **Configuration structure comes ONLY from `describe-connector` metadata.** Never hardcode attributes, child elements, or provider names. The metadata is the source of truth.
- **Flag semantics for `describe-connector`:** `--name` carries the **connection provider** name, `--config-name` carries the **config** name. Easy to confuse — check every invocation.

---

## Step 1: Resolve Connector from Exchange

**If the user has not specified which connector to configure**, ask them first via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>Which connector would you like to configure? (e.g., Salesforce, Slack, Database, HTTP, ServiceNow, S3)</question>
</ask_followup_question>
```

Once the connector is known, search Exchange for it:

```bash
bash scripts/get_latest_connector.sh salesforce sfdc
```

If the search returns multiple rows representing real variants of the same family (e.g., `mule4-slack-connector` vs `mule-slack-connector`), ask the user via `AskUserQuestion`. If there is exactly one match, pick it directly:

```bash
bash scripts/pick_connector.sh sfdc com.mulesoft.connectors:mule-salesforce-connector:10.20.0
```

**If the connector is already in the project's `pom.xml`:** extract the GAV from the existing dependency and write the draft directly with `pick_connector.sh`. No Exchange search needed — the version on disk is authoritative for an existing project.

---

## Step 2: Describe Connector

Retrieve the connector's full metadata using the wrapper script:

```bash
bash scripts/describe_connector.sh sfdc
```

This writes `tmp/connector-metadata/sfdc.json` and echoes a digest:

```json
{
  "namespace_prefix": "salesforce",
  "sources": ["on-new-object", "on-modified-object", "replay-topic-listener"],
  "configs": [
    { "name": "sfdc-config", "providers": ["basic-connection", "oauth-user-pass", "oauth-jwt-connection"] }
  ],
  "operations_count": 48,
  "operations_sample": ["query", "create", "update", "delete", "..."]
}
```

**Read the `configs[]` array.** Each config has a list of `providers` — these are the authentication methods the connector supports.

---

## Step 3: Ask Configuration Name

Ask the user via `AskUserQuestion` for the **configuration name** — the `name` attribute on the config element in `global-configs.xml`. Suggest a default based on the connector namespace (e.g., `salesforceConfig`, `slackConfig`) but let the user override:

```xml
<ask_followup_question>
<question>What name would you like for this connector configuration?</question>
<options>
  "salesforceConfig (default)"
  "Let me provide a custom name"
</options>
</ask_followup_question>
```

This name is used **only** when writing to `global-configs.xml` — as the `name` attribute on the config element and as the `config-ref` value in any operations that reference it. It is **not** the same as the connector's internal config name from metadata (e.g., `sfdc-config`) which is used in CLI `--config-name` flags.

---

## Step 4: Select Connection Provider

Examine the `configs[]` from Step 2. If there is only one provider, use it without prompting. If there are multiple providers, **ask the user to select one** via `AskUserQuestion`:

```xml
<ask_followup_question>
<question>Which connection provider would you like to use for Salesforce?</question>
<options>
  "basic-connection"
  "oauth-user-pass"
  "oauth-jwt-connection"
</options>
</ask_followup_question>
```

**Do not ask** if there is only one provider available — use it directly.

---

## Step 5: Get Connection Provider Detail

Retrieve the full metadata for the selected provider.

**Important:** The `--config-name` flag takes the **connector's internal config name from the metadata** (from Step 2's `configs[].name`, e.g., `sfdc-config`), NOT the user-provided configuration name from Step 3. The user's config name (e.g., `SF_Config1`) is only used later when writing to `global-configs.xml` as the `name` attribute on the config element.

```bash
anypoint-cli-v4 dx mule describe-connector \
  --connector "$(bash scripts/build_gav.sh tmp/connector-choices/sfdc.json)" \
  --type connection-provider \
  --name basic-connection \
  --config-name sfdc-config \
  --output json > tmp/connector-metadata/sfdc-config.json
```

**Response shape:**

```json
{
  "name": "sfdc-config",
  "prefix": "salesforce",
  "elementName": "sfdc-config",
  "attributes": [ { "attributeName": "name", "required": true } ],
  "childElements": [
    { "paramName": "expirationPolicy", "prefix": "salesforce", "elementName": "expiration-policy" }
  ],
  "connectionProviders": [
    {
      "name": "basic-connection",
      "prefix": "salesforce",
      "elementName": "basic-connection",
      "attributes": [
        { "attributeName": "username", "required": true },
        { "attributeName": "password", "required": true },
        { "attributeName": "securityToken", "required": true }
      ],
      "childElements": [
        { "paramName": "reconnection", "prefix": "mule", "elementName": "reconnection" }
      ]
    }
  ]
}
```

**Check for `oauthCallbackConfig` child element** — if present, the connector requires HTTP listener for OAuth callbacks. Note this for Step 7.

```bash
jq '.connectionProviders[0].childElements[] | select(.paramName == "oauthCallbackConfig")' tmp/connector-metadata/sfdc-config.json
```

---

## Step 6: Ask User for Mandatory Field Values

Before generating XML, ask the user via `AskUserQuestion` for **values of all `required: true` attributes** from the connection provider metadata (Step 5). List each mandatory field and ask the user to provide the actual value or confirm they want a property placeholder (`${namespace.fieldName}`):

```xml
<ask_followup_question>
<question>Please provide values for the required fields of the connection provider:

1. username:
2. password:
3. securityToken:

You can provide actual values or type "placeholder" to use ${property} references in config.yaml.</question>
<options>
  "Use placeholders for all fields (I'll fill config.yaml later)"
  "Let me provide the values now"
</options>
</ask_followup_question>
```

- If the user chooses **placeholders**: use `${namespace.attributeName}` pattern and generate corresponding `config.yaml` entries in Step 8.
- If the user provides **actual values**: use them directly in the XML attributes (no config.yaml entry needed for those fields).

---

## Step 7: Generate Configuration XML

Using ONLY the metadata from Step 5 and the user's answers from Steps 3 and 6, generate the configuration block. Connection providers use one of two patterns:

### Pattern 1: Attributes (e.g., Salesforce basic-connection)

If the provider's `attributes[]` has items, use XML attributes:

```xml
<salesforce:sfdc-config name="salesforceConfig" doc:name="Salesforce Config">
    <salesforce:basic-connection
        username="${salesforce.username}"
        password="${salesforce.password}"
        securityToken="${salesforce.securityToken}" />
</salesforce:sfdc-config>
```

### Pattern 2: Child Elements (e.g., Slack OAuth)

If `attributes[]` is empty but `childElements[]` has items, use nested elements:

```xml
<slack:config name="slackConfig" doc:name="Slack Config">
    <slack:slack-auth-connection>
        <slack:oauth-authorization-code
            consumerKey="${slack.consumerKey}"
            consumerSecret="${slack.consumerSecret}" />
        <slack:oauth-callback-config
            listenerConfig="HTTP_Listener_config"
            callbackPath="/slack/callback"
            authorizePath="/slack/authorize" />
    </slack:slack-auth-connection>
</slack:config>
```

**Rules:**
- Every `required: true` attribute or child element MUST appear in the output
- Use `${namespace.attributeName}` property placeholders for credential values
- Include `name` attribute on the config element (user-friendly name like `salesforceConfig`)
- If `oauthCallbackConfig` child element exists, add an `<http:listener-config>` block too

### OAuth connectors need HTTP listener

If the provider metadata includes an `oauthCallbackConfig` child element, also generate:

```xml
<http:listener-config name="HTTP_Listener_config" doc:name="HTTP Listener config">
    <http:listener-connection host="0.0.0.0" port="8081" />
</http:listener-config>
```

And ensure `mule-http-connector` is in `pom.xml`.

---

## Step 8: Generate config.yaml Placeholders

**Only generate `config.yaml` entries for fields where the user chose placeholders in Step 6.** If the user provided actual values that were placed directly in the XML, those fields do not need config.yaml entries.

Extract the placeholder fields from the connection provider metadata and emit a `config.yaml` section:

```yaml
salesforce:
  username: "user@example.com"
  password: "changeme"
  securityToken: "your-security-token"
```

For OAuth providers:

```yaml
slack:
  consumerKey: "your-consumer-key"
  consumerSecret: "your-consumer-secret"
```

---

## Step 9: Apply to Project

All connector configurations go in `src/main/mule/global-configs.xml` — **not** in the flow XML file. This separates global configs from flow logic, which is standard Mule best practice.

1. **Create `src/main/mule/global-configs.xml`** if it does not already exist. Use this skeleton:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <mule xmlns="http://www.mulesoft.org/schema/mule/core"
         xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="
           http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd">

       <configuration-properties file="config.yaml" doc:name="Configuration properties" />

   </mule>
   ```

   If `global-configs.xml` already exists, add the new configuration to it (do not overwrite existing configs).

2. **Add the connector config XML block** inside `global-configs.xml` (after `<configuration-properties>`, before `</mule>`).

3. **Add namespace declarations** to the `<mule>` root element of `global-configs.xml` if not already present:

   ```xml
   xmlns:salesforce="http://www.mulesoft.org/schema/mule/salesforce"
   ```

   The namespace URI follows the pattern: `http://www.mulesoft.org/schema/mule/<namespace_prefix>`

4. **Add schema location** to the `xsi:schemaLocation` in `global-configs.xml`:

   ```
   http://www.mulesoft.org/schema/mule/salesforce http://www.mulesoft.org/schema/mule/salesforce/current/mule-salesforce.xsd
   ```

5. **Create or update `src/main/resources/config.yaml`** with the property placeholders from Step 6.

6. **Verify connector dependency in `pom.xml`** — if not present, add it:

   ```xml
   <dependency>
       <groupId>com.mulesoft.connectors</groupId>
       <artifactId>mule-salesforce-connector</artifactId>
       <version>10.20.0</version>
       <classifier>mule-plugin</classifier>
   </dependency>
   ```

   Always use the version from `tmp/connector-choices/<nickname>.json`.

---

## Step 10: Validate

Run a build to confirm the configuration is valid:

```bash
cd <project-dir> && mvn clean package -DskipTests
```

If the build fails:
- **Missing namespace:** add the namespace declaration to `<mule>` root
- **Missing dependency:** add the connector to `pom.xml` with `mule-plugin` classifier
- **"Content not complete" error:** a required child element is missing from the config — re-check Step 4 metadata
- **"Cannot resolve" schema error:** the HTTP connector is missing but OAuth callback requires it

Fix and re-run. Only declare success after `BUILD SUCCESS`.

---

## Complete Example: Salesforce Basic Connection

Given: "Add Salesforce config with basic auth to my project"

### Generated `src/main/mule/global-configs.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:salesforce="http://www.mulesoft.org/schema/mule/salesforce"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/salesforce http://www.mulesoft.org/schema/mule/salesforce/current/mule-salesforce.xsd">

    <configuration-properties file="config.yaml" doc:name="Configuration properties" />

    <salesforce:sfdc-config name="salesforceConfig" doc:name="Salesforce Config">
        <salesforce:basic-connection
            username="${salesforce.username}"
            password="${salesforce.password}"
            securityToken="${salesforce.securityToken}" />
    </salesforce:sfdc-config>

</mule>
```

### Generated config.yaml:

```yaml
salesforce:
  username: "user@example.com"
  password: "changeme"
  securityToken: "your-security-token"
```

### pom.xml dependency (if missing):

```xml
<dependency>
    <groupId>com.mulesoft.connectors</groupId>
    <artifactId>mule-salesforce-connector</artifactId>
    <version>10.20.0</version>
    <classifier>mule-plugin</classifier>
</dependency>
```

---

## Complete Example: Slack OAuth Connection

Given: "Configure Slack connector with OAuth"

### Generated `src/main/mule/global-configs.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:http="http://www.mulesoft.org/schema/mule/http"
      xmlns:slack="http://www.mulesoft.org/schema/mule/slack"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd
        http://www.mulesoft.org/schema/mule/slack http://www.mulesoft.org/schema/mule/slack/current/mule-slack.xsd">

    <configuration-properties file="config.yaml" doc:name="Configuration properties" />

    <http:listener-config name="HTTP_Listener_config" doc:name="HTTP Listener config">
        <http:listener-connection host="0.0.0.0" port="8081" />
    </http:listener-config>

    <slack:config name="slackConfig" doc:name="Slack Config">
        <slack:slack-auth-connection>
            <slack:oauth-authorization-code
                consumerKey="${slack.consumerKey}"
                consumerSecret="${slack.consumerSecret}" />
            <slack:oauth-callback-config
                listenerConfig="HTTP_Listener_config"
                callbackPath="/slack/callback"
                authorizePath="/slack/authorize" />
        </slack:slack-auth-connection>
    </slack:config>

</mule>
```

### Generated config.yaml:

```yaml
slack:
  consumerKey: "your-consumer-key"
  consumerSecret: "your-consumer-secret"
```
