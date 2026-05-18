---
name: configure-mule-global-element
description: Create, get, edit, or delete TLS Context, Object Store, Caching Strategy, Global Error Handler, API AutoDiscovery, and Import Project Reference configurations in Mule projects. Use this when the user asks to create, add, list, show, edit, update, delete, or remove a TLS Context, Object Store, Caching Strategy, Global Error Handler, API AutoDiscovery, or Import Project Reference in their Mule project. Covers all non-connector, non-properties global elements.
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Mule Global Elements — TLS, Object Store, Caching, Error Handler, AutoDiscovery & Import

## Rules

This is a **multi-turn interactive skill**. At every "STOP" marker: print only questions as plain text, end your response, and wait. **No tools until all questions are answered** (PHASE 2). Never use TaskCreate. Never output raw XML to chat — always write to file.

Activate when user asks to manage TLS Context, Object Store, Caching Strategy, Global Error Handler, API AutoDiscovery, or Import Project Reference configurations.

---

## Operation Routing

### Step 1: Determine Element Type

| Keywords | Element Type |
|----------|-------------|
| TLS, SSL, trust store, key store, certificate, mutual TLS, mTLS | → **TLS Context** |
| object store, key-value store, persistent store, os:config, os:object-store | → **Object Store** |
| caching, cache strategy, cache scope config | → **Caching Strategy** |
| error handler, global error, default error handler, on-error-continue, on-error-propagate | → **Global Error Handler** |
| autodiscovery, API gateway, API ID, API Manager, flowRef | → **API AutoDiscovery** |
| import project, reference project, shared library, JAR import, shared flows | → **Import Project Reference** |

### Step 2: Determine Operation

| Intent | Operation |
|--------|-----------|
| Create / add / set up / configure (new) | → **CREATE** |
| Get / list / show / view | → **GET** |
| Edit / update / modify / change | → **EDIT** |
| Delete / remove / drop | → **DELETE** |

If the element type or operation is unclear, ask:

> What type of global element would you like to work with?
> - **TLS Context** — SSL/TLS security configuration
> - **Object Store** — key-value storage with TTL and persistence
> - **Caching Strategy** — cache scope configuration
> - **Global Error Handler** — centralized exception handling
> - **API AutoDiscovery** — API Manager registration
> - **Import Project Reference** — shared Mule project JAR
>
> And what would you like to do — **create**, **view**, **edit**, or **delete**?

**STOP.**

---

## GET — View Global Elements (applies to all types)

### Step 1: Locate the Mule Project

Use Glob to search for `**/pom.xml`. If multiple projects found, ask the user which one.

### Step 2: Scan for Global Elements

Read all Mule XML files under `{project-root}/src/main/mule/`. Search for:
- `<tls:context ...>` — TLS Context
- `<os:config ...>` — Object Store Config
- `<os:object-store ...>` — Object Store
- `<ee:object-store-caching-strategy ...>` — Caching Strategy
- `<error-handler name="...">` — Global Error Handlers (outside flows)
- `<configuration defaultErrorHandler-ref="...">` — Default error handler reference
- `<api-gateway:autodiscovery ...>` — API AutoDiscovery
- `<import file="...">` — Import Project References

### Step 3: Display Full Details

For each element found, display all attributes and child elements grouped by type. If none found for a requested type, inform the user.

---

## EDIT — Modify Global Elements (applies to all types)

### Step 1: List Existing Elements

Follow GET flow to list relevant elements.

### Step 2: Ask Which to Edit

> **Which configuration would you like to edit?** (provide the name)

**STOP.**

### Step 3: Show Current Values

Display all current attributes. **Cannot change:** `name` attribute. **Can change:** all other fields.

**STOP.**

### Step 4: Apply Changes

1. Read the XML file.
2. Use Edit to update only the specified attributes/elements.
3. Update `config.yaml` if property placeholders are affected.

### Step 5: Confirm

Report: which config was updated, which fields changed. Keep to 2-3 sentences.

---

## DELETE — Remove Global Elements (applies to all types)

### Step 1: Identify the Target

List existing elements of the relevant type. Ask which to delete if not specified.

### Step 2: Find All Usages

Search ALL Mule XML files for references:

| Element Type | Reference Patterns to Search |
|-------------|------------------------------|
| TLS Context | `tlsContext="{name}"` in HTTP listener/requester configs |
| Object Store (`os:object-store`) | `objectStore="{name}"` in caching strategies |
| Object Store Config (`os:config`) | `config-ref="{name}"` in `os:object-store` elements |
| Caching Strategy | `cachingStrategy-ref="{name}"` in `<ee:cache>` scopes |
| Global Error Handler | `defaultErrorHandler-ref="{name}"`, `errorHandler-ref="{name}"` |
| API AutoDiscovery | `flowRef="{flow}"` (check if flow still exists) |
| Import Project Reference | `defaultErrorHandler-ref`, `config-ref`, `<flow-ref name="...">` referencing imported resources |

Present findings:

> The configuration `{name}` is referenced in:
>
> | File | Line | Usage |
> |------|------|-------|
> | ... | ... | ... |
>
> **Deleting this will break these references.** Proceed?

**Wait for explicit user confirmation before deleting.**

### Step 3: Delete

1. Remove the entire element and its children.
2. Remove unused namespace declarations if applicable.
3. If file becomes empty skeleton, ask user whether to delete it.

### Step 4: Confirm

Report: what was deleted, from which file, namespace cleanup. Remind about broken references.

---

## TLS Context

### CREATE

#### Question 1 — Name & Store Selection

> I'll create a TLS Context. I need a couple of details:
>
> **What name would you like for the TLS Context?** (e.g., `TLS_Context`)
>
> **Which stores do you need** — Trust Store only, Key Store only, or both for mutual TLS?

**STOP.**

#### Question 2 — Store Credentials + Optional Settings

Based on the user's store selection, ask for mandatory store credentials AND show optional settings.

**If Trust Store is included, ask (mandatory):**
> **Trust Store details:**
>
> **What is the Trust Store path?** (e.g., `certs/truststore.jks`)
>
> **What is the Trust Store password?** (e.g., `${truststore.password}`)

**If Key Store is included, ask (mandatory):**
> **Key Store details:**
>
> **What is the Key Store path?** (e.g., `certs/keystore.jks`)
>
> **What is the Key Store password?** (e.g., `${keystore.password}`)

**Then show optional settings:**
> Here are the default settings. Let me know if you'd like to change any:
>
> | Setting | Default |
> |---------|---------|
> | Protocols | TLSv1.2,TLSv1.3 |
> | Cipher Suites | JVM defaults |
> | Description | _(none)_ |
>
> | Trust Store Setting | Default |
> |---------------------|---------|
> | Type | jks _(options: jks, jceks, pkcs12)_ |
> | Algorithm | SunX509 |
> | Insecure | false _(WARNING: true disables validation — never use in production)_ |
>
> | Key Store Setting | Default |
> |-------------------|---------|
> | Type | jks |
> | Alias | _(none)_ |
> | Key Password | _(none)_ |
> | Algorithm | SunX509 |
>
> | Revocation Check | Default |
> |------------------|---------|
> | Revocation Check | none _(options: standard-revocation-check, custom-ocsp-responder, crl-file)_ |
> | Only End Entities _(for standard)_ | true |
> | OCSP Responder URL _(for custom-ocsp)_ | _(none)_ |
> | OCSP Cert Alias _(for custom-ocsp)_ | _(none)_ |
> | CRL File Path _(for crl-file)_ | _(none)_ |

**STOP. → Execution after reply.**

#### Execution

1. Locate Mule project and `global-config.xml`.
2. Write TLS Context XML (omit attributes for unset optional fields).
3. Add `tls` namespace if not present.
4. TLS Context does NOT require additional pom.xml dependencies.

---

## Object Store

### CREATE

#### Question 1 (OPTIONAL) — os:config

> I'll create an Object Store global configuration. Let's start with the **Object Store Config (os:config)**.
>
> **Do you need to create a new `os:config`, or do you already have one?**

**STOP.**

**If creating new os:config, ask:**
> **What name for the os:config?** (e.g., `ObjectStore_Config`)
>
> Optional settings (change any or accept defaults):
>
> | Setting | Default |
> |---------|---------|
> | Fail deployment on connection failure | false |
> | Reconnection strategy | standard reconnect _(options: reconnect with frequency/count, reconnect-forever)_ |
> | Reconnect frequency (ms) | _(none)_ |
> | Reconnect count | _(none)_ |
> | Lock Timeout | _(none)_ |
> | Lock Timeout Unit | SECONDS |

**STOP.**

#### Question 2 — os:object-store

> Now let's configure the **Object Store (os:object-store)**:
>
> **What name?** (e.g., `Order_Cache`)
>
> **Which `os:config` should it reference?** _(optional — defaults to runtime's ObjectStoreManager)_
>
> Optional settings:
>
> | Setting | Default |
> |---------|---------|
> | Persistent | true |
> | Max Entries | no limit |
> | Entry TTL | no expiration |
> | Entry TTL Unit | SECONDS |
> | Expiration Interval | 1 |
> | Expiration Interval Unit | MINUTES |

**STOP. → Execution after reply.**

#### Execution

1. Locate project, check `global-config.xml`.
2. Ensure `mule-objectstore-connector` dependency in `pom.xml`. Use `search_asset` MCP tool (fallback: `org.mule.connectors:mule-objectstore-connector:1.2.5`).
3. Write XML — `os:config` MUST appear BEFORE `os:object-store`.
4. Add `os` namespace if not present.

---

## Caching Strategy

### CREATE

#### Question 1 — Name & Object Store Reference

> I'll create a Caching Strategy.
>
> **What name?** (e.g., `Caching_Strategy`)
>
> **Which Object Store should it use?** Reference an existing `os:object-store` by name, or say "inline" for a private object store.

**STOP.**

#### Question 2 — Key Generation & Settings

**If inline Object Store:**
> **Inline Object Store details:**
> - **Alias?** (e.g., `CachingStrategy_ObjectStore`)
> - **os:config reference?**
> - Optional: Max Entries, Entry TTL, Expiration Interval

**Then ask (for all caching strategies):**
> **How should the cache key be generated** — default, DataWeave expression (e.g., `#[vars.requestId]`), or key generator class reference?
>
> Optional settings:
>
> | Setting | Default |
> |---------|---------|
> | Event Copy Strategy | simple _(simple = immutable, serializable = mutable)_ |
> | Synchronized | true |
> | Response Generator ref | _(none)_ |

**STOP. → Execution after reply.**

#### Execution

1. Locate project, check `global-config.xml`.
2. Caching Strategy uses `ee` namespace — no pom.xml dependency needed (Mule EE runtime).
3. If inline `os:private-object-store` or referencing `os:object-store`, ensure Object Store connector dependency.
4. Write XML. If referencing `os:object-store`, that store MUST appear BEFORE the caching strategy.
5. Add `ee` and `os` namespaces if not present.

---

## Global Error Handler

### CREATE

#### Question 1 — Name & Strategies

> I'll create a Global Error Handler.
>
> **What name?** (e.g., `global-error-handler`)
>
> **What error handling strategies do you need?**
> - `on-error-continue` — handles error, continues (message not re-thrown)
> - `on-error-propagate` — handles error, re-throws to parent
>
> **For each strategy, what error type should it match?** (e.g., `ANY`, `HTTP:UNAUTHORIZED`, `CONNECTIVITY`, `EXPRESSION`)

**STOP.**

#### Question 2 — Handler Content & Default

> **What should each error strategy do?** Common actions:
> - Log the error (`<logger>`)
> - Set a response payload (JSON error response)
> - Set HTTP status code
>
> Example: "Log the error and return a 500 JSON response with error details"
>
> **Should this be the default error handler for the entire application?** (yes/no)

**STOP.**

#### Execution

1. Locate `global-config.xml`.
2. Generate error handler XML:

```xml
<error-handler name="global-error-handler" doc:name="Global Error Handler">
    <on-error-continue type="ANY" enableNotifications="true" logException="true"
                       doc:name="On Error Continue">
        <logger level="ERROR" message="Error: #[error.description]"
                doc:name="Log Error"/>
        <ee:transform doc:name="Error Response">
            <ee:message>
                <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
    success: false,
    message: error.description,
    errorType: error.errorType.identifier
}]]></ee:set-payload>
            </ee:message>
        </ee:transform>
    </on-error-continue>
</error-handler>
```

3. If set as default, add or update:

```xml
<configuration defaultErrorHandler-ref="global-error-handler" doc:name="Configuration"/>
```

4. Ensure `ee` namespace is declared if using `<ee:transform>`.

---

## API AutoDiscovery

### CREATE

#### Question 1 — API ID & Flow

> I'll set up API AutoDiscovery.
>
> **What is your API ID?** (from API Manager — the numeric identifier)
>
> **Which flow should be auto-discovered?**

Show available flows by scanning for `<flow name="...">`:

> Available flows:
> - `inventory-api-main`
> - `get-books-flow`
> - `post-book-flow`

**STOP.**

#### Question 2 — Optional Settings

> Optional settings (change any or accept defaults):
>
> | Setting | Default |
> |---------|---------|
> | Ignore Base Path | true |

**STOP.**

#### Execution

1. Locate `global-config.xml`.
2. Add `api-gateway` namespace:

```xml
xmlns:api-gateway="http://www.mulesoft.org/schema/mule/api-gateway"
```

3. Add element:

```xml
<api-gateway:autodiscovery apiId="${api.id}" flowRef="{flow-name}"
                           ignoreBasePath="true"
                           doc:name="API AutoDiscovery"/>
```

4. Add `api.id` placeholder to `config.yaml`.
5. Ensure `mule-api-gateway` dependency in `pom.xml`:

```xml
<dependency>
    <groupId>org.mule.modules</groupId>
    <artifactId>mule-api-gateway</artifactId>
    <version>${app.runtime}</version>
    <classifier>mule-plugin</classifier>
    <scope>provided</scope>
</dependency>
```

---

## Import Project Reference

### CREATE

#### Question 1 — Project Coordinates

> I'll set up a project reference import.
>
> **What are the Maven coordinates of the shared project?**
> - **Group ID**: (e.g., `com.myorg`)
> - **Artifact ID**: (e.g., `shared-error-handling`)
> - **Version**: (e.g., `1.0.0`)

**STOP.**

#### Question 2 — Import Configuration

> **What resources from the imported project do you want to use?**
> - Error handlers (to reference via `defaultErrorHandler-ref`)
> - Connector configurations (to reference via `config-ref`)
> - Utility flows/sub-flows (to reference via `<flow-ref>`)
> - DataWeave modules
> - All of the above
>
> **Should I add an `<import>` declaration?** (required to reference its global elements)

**STOP.**

#### Execution

1. Add dependency to `pom.xml`:

```xml
<dependency>
    <groupId>{groupId}</groupId>
    <artifactId>{artifactId}</artifactId>
    <version>{version}</version>
    <classifier>mule-plugin</classifier>
</dependency>
```

2. Add import declaration in `global-config.xml`:

```xml
<import file="{artifactId}.xml" doc:name="Import: {artifactId}"/>
```

3. Validate build: `mvn clean package -DskipTests`.

### DELETE

1. List imports. Ask which to delete.
2. **Find usages:** Search for `defaultErrorHandler-ref`, `config-ref`, `<flow-ref name="...">` that reference imported resources.
3. Present findings. **Wait for confirmation.**
4. Remove `<import>` element and `<dependency>` from `pom.xml`.
5. Validate build.

---

## XML Templates

### TLS Context

```xml
<tls:context name="TLS_Context"
             doc:name="TLS Context"
             enabledProtocols="TLSv1.2,TLSv1.3">
    <tls:trust-store path="certs/truststore.jks"
                     password="${truststore.password}"
                     type="jks"
                     algorithm="SunX509" />
    <tls:key-store path="certs/keystore.jks"
                   password="${keystore.password}"
                   type="jks"
                   algorithm="SunX509" />
</tls:context>
```

### Object Store

```xml
<os:config name="ObjectStore_Config" doc:name="ObjectStore Config">
    <os:connection />
</os:config>

<os:object-store name="Order_Cache"
                 persistent="true"
                 maxEntries="1000"
                 entryTtl="30"
                 entryTtlUnit="MINUTES"
                 expirationInterval="5"
                 expirationIntervalUnit="MINUTES"
                 config-ref="ObjectStore_Config" />
```

### Caching Strategy

```xml
<ee:object-store-caching-strategy name="Caching_Strategy"
                                   doc:name="Caching Strategy"
                                   keyGenerationExpression="#[vars.requestId]"
                                   synchronized="true"
                                   objectStore="Order_Cache">
    <ee:simple-event-copy-strategy />
</ee:object-store-caching-strategy>
```

### Global Error Handler

```xml
<error-handler name="global-error-handler" doc:name="Global Error Handler">
    <on-error-continue type="ANY" enableNotifications="true" logException="true"
                       doc:name="On Error Continue">
        <logger level="ERROR"
                message="#['Error in flow: ' ++ flow.name ++ ' - ' ++ error.description]"
                doc:name="Log Error"/>
        <ee:transform doc:name="Error Response">
            <ee:message>
                <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
    success: false,
    message: error.description,
    errorType: error.errorType.identifier,
    timestamp: now()
}]]></ee:set-payload>
            </ee:message>
        </ee:transform>
    </on-error-continue>
</error-handler>

<configuration defaultErrorHandler-ref="global-error-handler" doc:name="Configuration"/>
```

### API AutoDiscovery

```xml
<api-gateway:autodiscovery apiId="${api.id}" flowRef="my-api-main"
                           ignoreBasePath="true"
                           doc:name="API AutoDiscovery"/>
```

### Import Project Reference

```xml
<import file="shared-error-handling.xml" doc:name="Import: shared-error-handling"/>
```

### Base global-config.xml Skeleton

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:tls="http://www.mulesoft.org/schema/mule/tls"
      xmlns:os="http://www.mulesoft.org/schema/mule/os"
      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
      xmlns:api-gateway="http://www.mulesoft.org/schema/mule/api-gateway"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/tls http://www.mulesoft.org/schema/mule/tls/current/mule-tls.xsd
        http://www.mulesoft.org/schema/mule/os http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd
        http://www.mulesoft.org/schema/mule/ee/core http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd
        http://www.mulesoft.org/schema/mule/api-gateway http://www.mulesoft.org/schema/mule/api-gateway/current/mule-api-gateway.xsd">

    <!-- Include ONLY the namespaces needed for the configurations being created -->

</mule>
```
