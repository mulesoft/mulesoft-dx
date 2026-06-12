# Global Elements Catalog

> **Status: canonical reference for XML structure, namespaces, and dependencies.**
>
> This file documents the correct XML shape, namespace URI, XSD URL, and
> `pom.xml` dependency (if any) for every non-connector global element type
> in Mule 4. Connector configs are NOT covered here — they are resolved
> dynamically from Exchange via `describe-connector` metadata.
>
> Use this file to verify element structure, namespace declarations, and
> dependency requirements. Do NOT use it as a version source for connectors
> — versions must come from live Exchange searches.

---

## Table of Contents

- [TLS Context](#tls-context)
- [Object Store](#object-store)
- [Caching Strategy](#caching-strategy)
- [Global Error Handler](#global-error-handler)
- [API AutoDiscovery](#api-autodiscovery)
- [Import Project Reference](#import-project-reference)
- [Configuration Properties](#configuration-properties)
- [Global Property](#global-property)
- [Application Configuration](#application-configuration)
- [Namespace Quick Reference](#namespace-quick-reference)

---

## TLS Context

### Namespace

| Prefix | URI | XSD URL |
|--------|-----|---------|
| `tls` | `http://www.mulesoft.org/schema/mule/tls` | `http://www.mulesoft.org/schema/mule/tls/current/mule-tls.xsd` |

### pom.xml Dependency

**None required.** TLS is part of the Mule runtime — no additional dependency needed.

### XML Structure

```xml
<tls:context name="{name}" doc:name="{display-name}"
             enabledProtocols="{protocols}">
    <!-- Trust Store (optional) -->
    <tls:trust-store path="{path}"
                     password="{password}"
                     type="{jks|jceks|pkcs12}"
                     algorithm="{algorithm}"
                     insecure="{true|false}" />
    <!-- Key Store (optional) -->
    <tls:key-store path="{path}"
                   password="{password}"
                   keyPassword="{key-password}"
                   alias="{alias}"
                   type="{jks|jceks|pkcs12}"
                   algorithm="{algorithm}" />
    <!-- Revocation Check (optional, pick ONE) -->
    <tls:revocation-check>
        <tls:standard-revocation-check onlyEndEntities="{true|false}" />
        <!-- OR -->
        <tls:custom-ocsp-responder url="{url}" certAlias="{alias}" />
        <!-- OR -->
        <tls:crl-file path="{path}" />
    </tls:revocation-check>
</tls:context>
```

### Attributes Reference

| Attribute | Required | Default | Allowed Values |
|-----------|----------|---------|----------------|
| `name` | Yes | — | Any valid XML NCName |
| `enabledProtocols` | No | `TLSv1.2,TLSv1.3` | Comma-separated: `TLSv1.1`, `TLSv1.2`, `TLSv1.3` |

### Trust Store Attributes

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `path` | Yes | — | Relative to `src/main/resources/` |
| `password` | Yes | — | Use `${placeholder}` for credentials |
| `type` | No | `jks` | `jks`, `jceks`, `pkcs12` |
| `algorithm` | No | `SunX509` | Trust management algorithm |
| `insecure` | No | `false` | **WARNING:** `true` disables certificate validation — never use in production |

### Key Store Attributes

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `path` | Yes | — | Relative to `src/main/resources/` |
| `password` | Yes | — | Use `${placeholder}` for credentials |
| `type` | No | `jks` | `jks`, `jceks`, `pkcs12` |
| `algorithm` | No | `SunX509` | Key management algorithm |
| `alias` | No | — | Certificate alias within the keystore |
| `keyPassword` | No | — | Password for the specific key (if different from store password) |

### Validation Rules

- At least one of `<tls:trust-store>` or `<tls:key-store>` MUST be present.
- Mutual TLS requires BOTH trust-store AND key-store.
- Only ONE revocation check type can be active at a time.
- `insecure="true"` must NEVER be used in production — flag it as a warning.
- Store paths are relative to `src/main/resources/` — absolute paths will fail at deployment.

---

## Object Store

### Namespace

| Prefix | URI | XSD URL |
|--------|-----|---------|
| `os` | `http://www.mulesoft.org/schema/mule/os` | `http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd` |

### pom.xml Dependency

```xml
<dependency>
    <groupId>org.mule.connectors</groupId>
    <artifactId>mule-objectstore-connector</artifactId>
    <version>1.2.5</version>
    <classifier>mule-plugin</classifier>
</dependency>
```

> **Version note:** The version above is a snapshot. For new projects, resolve
> the latest via `get_latest_connector.sh mule-objectstore-connector os`.

### XML Structure — os:config

```xml
<os:config name="{name}" doc:name="{display-name}">
    <os:connection />
</os:config>
```

### XML Structure — os:object-store

```xml
<os:object-store name="{name}"
                 doc:name="{display-name}"
                 config-ref="{os-config-name}"
                 persistent="{true|false}"
                 maxEntries="{number}"
                 entryTtl="{number}"
                 entryTtlUnit="{unit}"
                 expirationInterval="{number}"
                 expirationIntervalUnit="{unit}" />
```

### Attributes Reference — os:config

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `name` | Yes | — | Referenced by `os:object-store` via `config-ref` |

### Attributes Reference — os:object-store

| Attribute | Required | Default | Allowed Values |
|-----------|----------|---------|----------------|
| `name` | Yes | — | Referenced by caching strategies via `objectStore` |
| `config-ref` | No | — | Reference to `os:config` name. If omitted, uses runtime's default ObjectStoreManager |
| `persistent` | No | `true` | `true`, `false` |
| `maxEntries` | No | No limit | Positive integer |
| `entryTtl` | No | No expiration | Positive integer |
| `entryTtlUnit` | No | `SECONDS` | `NANOSECONDS`, `MICROSECONDS`, `MILLISECONDS`, `SECONDS`, `MINUTES`, `HOURS`, `DAYS` |
| `expirationInterval` | No | `1` | Positive integer (how often to check for expired entries) |
| `expirationIntervalUnit` | No | `MINUTES` | Same time units as above |

### Ordering Rule

`<os:config>` MUST appear BEFORE `<os:object-store>` in the XML file. The object-store references the config; if the config comes after, Mule's parser may fail.

### Validation Rules

- `os:config` must have `<os:connection />` child element (even though it seems empty).
- If `maxEntries` is set, entries beyond the limit are evicted (oldest first).
- If `entryTtl` is set without `expirationInterval`, expired entries aren't cleaned up until access.
- An `os:object-store` without a `config-ref` uses the runtime's built-in ObjectStoreManager.

---

## Caching Strategy

### Namespace

| Prefix | URI | XSD URL |
|--------|-----|---------|
| `ee` | `http://www.mulesoft.org/schema/mule/ee/core` | `http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd` |

### pom.xml Dependency

**None required for `ee` namespace.** It is part of the Mule EE runtime.

However, if referencing an `os:object-store` or using an inline `os:private-object-store`, the Object Store connector dependency IS required (see Object Store section above).

### XML Structure — with Object Store reference

```xml
<ee:object-store-caching-strategy name="{name}"
                                   doc:name="{display-name}"
                                   objectStore="{object-store-name}"
                                   keyGenerationExpression="{dw-expression}"
                                   synchronized="{true|false}">
    <ee:simple-event-copy-strategy />
    <!-- OR -->
    <ee:serializable-event-copy-strategy />
</ee:object-store-caching-strategy>
```

### XML Structure — with inline private Object Store

```xml
<ee:object-store-caching-strategy name="{name}"
                                   doc:name="{display-name}"
                                   keyGenerationExpression="{dw-expression}"
                                   synchronized="{true|false}">
    <os:private-object-store alias="{alias}"
                             maxEntries="{number}"
                             entryTtl="{number}"
                             entryTtlUnit="{unit}"
                             config-ref="{os-config-name}" />
    <ee:simple-event-copy-strategy />
</ee:object-store-caching-strategy>
```

### Attributes Reference

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `name` | Yes | — | Referenced by `<ee:cache>` scopes via `cachingStrategy-ref` |
| `objectStore` | No | — | Reference to `os:object-store` name. Mutually exclusive with inline `os:private-object-store` |
| `keyGenerationExpression` | No | Default key gen | DataWeave expression, e.g. `#[vars.requestId]` |
| `synchronized` | No | `true` | `true` = thread-safe; `false` = faster but race-prone |

### Event Copy Strategy

| Strategy | Element | Use When |
|----------|---------|----------|
| Simple (immutable) | `<ee:simple-event-copy-strategy />` | Cached events are read-only (most common) |
| Serializable (mutable) | `<ee:serializable-event-copy-strategy />` | Cached events may be modified after retrieval |

### Ordering Rule

If referencing an `os:object-store` by name, that object-store MUST appear BEFORE the caching strategy in the same file.

### Validation Rules

- Either `objectStore` attribute OR inline `<os:private-object-store>` — not both.
- If using inline `<os:private-object-store>`, the `os` namespace and Object Store connector dependency are required.
- `keyGenerationExpression` must be a valid DataWeave expression (starts with `#[`).
- Response generator (`responseGenerator-ref`) is optional and rarely used.

---

## Global Error Handler

### Namespace

Uses the core Mule namespace — no additional namespace declaration needed.

| Prefix | URI | XSD URL |
|--------|-----|---------|
| (core) | `http://www.mulesoft.org/schema/mule/core` | `http://www.mulesoft.org/schema/mule/core/current/mule.xsd` |

### pom.xml Dependency

**None required.** Error handlers are part of the Mule core runtime.

However, if using `<ee:transform>` inside the error handler, the `ee` namespace must be declared.

### XML Structure

```xml
<error-handler name="{name}" doc:name="{display-name}">
    <!-- One or more strategies -->
    <on-error-continue type="{error-type}"
                       enableNotifications="{true|false}"
                       logException="{true|false}"
                       doc:name="{display-name}">
        <!-- Processors: logger, set-payload, ee:transform, etc. -->
    </on-error-continue>

    <on-error-propagate type="{error-type}"
                        enableNotifications="{true|false}"
                        logException="{true|false}"
                        doc:name="{display-name}">
        <!-- Processors -->
    </on-error-propagate>
</error-handler>

<!-- To set as default for the entire application: -->
<configuration defaultErrorHandler-ref="{name}" doc:name="Configuration" />
```

### Attributes Reference — error-handler

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `name` | Yes | — | Referenced by `defaultErrorHandler-ref` and flow-level `errorHandler-ref` |

### Attributes Reference — on-error-continue / on-error-propagate

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `type` | No | `ANY` | Error type to match. Examples: `ANY`, `HTTP:UNAUTHORIZED`, `CONNECTIVITY`, `EXPRESSION`, `MULE:RETRY_EXHAUSTED` |
| `when` | No | — | DataWeave condition for finer matching, e.g. `#[error.errorType.identifier == 'HTTP:NOT_FOUND']` |
| `enableNotifications` | No | `true` | Whether to fire error notifications |
| `logException` | No | `true` | Whether to log the exception stack trace |

### Error Strategy Semantics

| Strategy | Behavior | Use When |
|----------|----------|----------|
| `on-error-continue` | Handles the error; message is NOT re-thrown to caller. Flow execution continues as if successful. | API error responses (return 4xx/5xx), logging-only handlers |
| `on-error-propagate` | Handles the error but re-throws to the parent scope (caller). | Sub-flows that want to clean up but let the parent decide the outcome |

### Common Error Types

| Error Type | Meaning |
|------------|---------|
| `ANY` | Matches all errors |
| `MULE:CONNECTIVITY` | Connection failures (timeout, refused, DNS) |
| `MULE:RETRY_EXHAUSTED` | All retry attempts failed |
| `MULE:EXPRESSION` | DataWeave expression evaluation failure |
| `MULE:TRANSFORMATION` | Payload transformation error |
| `MULE:SECURITY` | Authentication/authorization failure |
| `HTTP:UNAUTHORIZED` | HTTP 401 response (requires HTTP connector) |
| `HTTP:NOT_FOUND` | HTTP 404 response |
| `HTTP:TIMEOUT` | HTTP request timed out |

### Validation Rules

- A global error handler MUST have at least one `<on-error-continue>` or `<on-error-propagate>` child.
- `type` values must be valid error type identifiers: `NAMESPACE:IDENTIFIER` or `ANY`.
- Only ONE `<configuration>` element may exist per project. If one exists, update it rather than creating a second.
- Error handlers defined OUTSIDE of `<flow>` are global; inside `<flow>` they are flow-local.

---

## API AutoDiscovery

### Namespace

| Prefix | URI | XSD URL |
|--------|-----|---------|
| `api-gateway` | `http://www.mulesoft.org/schema/mule/api-gateway` | `http://www.mulesoft.org/schema/mule/api-gateway/current/mule-api-gateway.xsd` |

### pom.xml Dependency

```xml
<dependency>
    <groupId>org.mule.modules</groupId>
    <artifactId>mule-api-gateway</artifactId>
    <version>${app.runtime}</version>
    <classifier>mule-plugin</classifier>
    <scope>provided</scope>
</dependency>
```

> **Note:** `${app.runtime}` resolves to the Mule runtime version from the
> project's parent POM. The `<scope>provided</scope>` means the runtime
> supplies this at deployment — it's not bundled into the JAR.

### XML Structure

```xml
<api-gateway:autodiscovery apiId="${api.id}"
                           flowRef="{flow-name}"
                           ignoreBasePath="{true|false}"
                           doc:name="API AutoDiscovery" />
```

### Attributes Reference

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `apiId` | Yes | — | The API ID from API Manager. Always use `${api.id}` placeholder — never hardcode. |
| `flowRef` | Yes | — | Name of the flow to register. Must match an existing `<flow name="...">` in the project. |
| `ignoreBasePath` | No | `true` | Whether to ignore the basePath in the API spec for routing |

### Validation Rules

- `apiId` SHOULD be a property placeholder (`${api.id}`), not a hardcoded number. Hardcoded values break across environments.
- `flowRef` MUST match the `name` attribute of an existing `<flow>` in the project. Validate by scanning `src/main/mule/*.xml`.
- Only ONE autodiscovery element should exist per flow. Multiple autodiscovery elements for the same flow is an error.
- The `api.id` property must be added to `config.yaml` (or the appropriate properties file).

---

## Import Project Reference

### Namespace

Uses the core Mule namespace — no additional namespace declaration needed.

### pom.xml Dependency

The imported project must be declared as a dependency:

```xml
<dependency>
    <groupId>{groupId}</groupId>
    <artifactId>{artifactId}</artifactId>
    <version>{version}</version>
    <classifier>mule-plugin</classifier>
</dependency>
```

### XML Structure

```xml
<import file="{artifactId}.xml" doc:name="Import: {artifactId}" />
```

### Attributes Reference

| Attribute | Required | Notes |
|-----------|----------|-------|
| `file` | Yes | The XML file name from the imported project. Convention: `{artifactId}.xml` |

### How It Works

1. The imported project is a separate Mule project packaged as a JAR with `mule-plugin` classifier.
2. The `<import>` element makes all global elements from that project available to the importing project.
3. After import, you can reference the imported project's global elements (error handlers, configs, sub-flows) as if they were defined locally.

### Common Use Cases

| Use Case | What Gets Imported |
|----------|-------------------|
| Shared error handling | Global error handler → reference via `defaultErrorHandler-ref` |
| Shared connector configs | Connector configurations → reference via `config-ref` |
| Utility sub-flows | Sub-flows → reference via `<flow-ref name="...">` |
| DataWeave modules | DW functions available via `import` in DataWeave scripts |

### Validation Rules

- The `file` attribute must match a top-level XML file in the imported project's `src/main/mule/`.
- The imported project JAR must be in `pom.xml` as a dependency with `classifier=mule-plugin`.
- Namespace declarations for imported elements are NOT needed in the importing project — they resolve from the imported JAR.
- Circular imports are not allowed and will cause a deployment failure.

---

## Configuration Properties

### Namespace

Uses the core Mule namespace.

### XML Structure

```xml
<configuration-properties file="{filename}" doc:name="Configuration Properties" />
```

### Attributes Reference

| Attribute | Required | Notes |
|-----------|----------|-------|
| `file` | Yes | Path relative to `src/main/resources/`. Can include `${var}` for dynamic resolution (e.g., `${env}.yaml`). |

### Supported File Formats

| Format | Extension | Example |
|--------|-----------|---------|
| YAML | `.yaml`, `.yml` | Nested keys: `http:\n  port: "8081"` → `${http.port}` |
| Java Properties | `.properties` | Flat keys: `http.port=8081` → `${http.port}` |

### Validation Rules

- The referenced file MUST exist in `src/main/resources/` (or resolve dynamically via `${var}`).
- Multiple `<configuration-properties>` elements are allowed — later ones override earlier ones for duplicate keys.
- YAML keys are dot-joined for placeholder resolution: `http.port` in YAML = `${http.port}` in XML.

---

## Global Property

### Namespace

Uses the core Mule namespace.

### XML Structure

```xml
<global-property name="{key}" value="{value}" doc:name="Global Property: {key}" />
```

### Attributes Reference

| Attribute | Required | Notes |
|-----------|----------|-------|
| `name` | Yes | The property key (used in `${name}` placeholders) |
| `value` | Yes | The property value |

### Common Use Cases

| Property | Purpose | Example |
|----------|---------|---------|
| `env` | Active environment selector | `<global-property name="env" value="dev" />` — used with `<configuration-properties file="${env}.yaml" />` |
| `app.name` | Application identifier | Used in logging and monitoring |
| `api.version` | API version | Referenced in documentation or headers |

### Validation Rules

- Values set via `<global-property>` can be overridden at deployment by system properties (`-Denv=prod`).
- Global properties are resolved BEFORE `<configuration-properties>` files, so they can be used in filenames (e.g., `${env}.yaml`).
- Duplicate names across multiple files: last-declared wins.

---

## Application Configuration

### Namespace

Uses the core Mule namespace.

### XML Structure

```xml
<configuration defaultErrorHandler-ref="{handler-name}"
               defaultResponseTimeout="{ms}"
               defaultTransactionTimeout="{ms}"
               shutdownTimeout="{ms}"
               maxQueueTransactionFilesSize="{MB}"
               doc:name="Configuration" />
```

### Attributes Reference

| Attribute | Required | Default | Notes |
|-----------|----------|---------|-------|
| `defaultErrorHandler-ref` | No | — | Name of a global error handler to use as default for all flows |
| `defaultResponseTimeout` | No | `10000` | Milliseconds to wait for a response before timeout |
| `defaultTransactionTimeout` | No | `30000` | Milliseconds for transaction timeout |
| `shutdownTimeout` | No | `5000` | Milliseconds to wait during graceful shutdown |
| `maxQueueTransactionFilesSize` | No | — | Maximum size in MB for transaction journal files |

### Validation Rules

- Only ONE `<configuration>` element may exist across all XML files in the project.
- `defaultErrorHandler-ref` must reference an existing named `<error-handler>` (not an anonymous one inside a flow).
- If a `<configuration>` already exists, update it — do not create a second one.

---

## Namespace Quick Reference

| Element Type | Prefix | Namespace URI | XSD URL | Dependency Required? |
|-------------|--------|---------------|---------|---------------------|
| TLS Context | `tls` | `http://www.mulesoft.org/schema/mule/tls` | `.../mule-tls.xsd` | No (runtime) |
| Object Store | `os` | `http://www.mulesoft.org/schema/mule/os` | `.../mule-os.xsd` | Yes (`mule-objectstore-connector`) |
| Caching Strategy | `ee` | `http://www.mulesoft.org/schema/mule/ee/core` | `.../mule-ee.xsd` | No (EE runtime) |
| Error Handler | (core) | `http://www.mulesoft.org/schema/mule/core` | `.../mule.xsd` | No (runtime) |
| API AutoDiscovery | `api-gateway` | `http://www.mulesoft.org/schema/mule/api-gateway` | `.../mule-api-gateway.xsd` | Yes (`mule-api-gateway`, scope: provided) |
| Import | (core) | — | — | Yes (imported project JAR) |
| Config Properties | (core) | — | — | No |
| Global Property | (core) | — | — | No |
| Configuration | (core) | — | — | No |
| Documentation | `doc` | `http://www.mulesoft.org/schema/mule/documentation` | **No XSD** — never add to `schemaLocation` | No |

### xsi:schemaLocation Construction Rule

Include in `xsi:schemaLocation` exactly one entry per namespace that has a `<dependency>` in `pom.xml` plus core and ee. Each entry is: `{namespace-uri} {xsd-url}`.

**Never include in `xsi:schemaLocation`:**
- `doc` (`http://www.mulesoft.org/schema/mule/documentation`) — no XSD exists
- `xsi` (`http://www.w3.org/2001/XMLSchema-instance`) — W3C standard, not Mule

---

## Connector Config Generation Rules

Connector configs are resolved dynamically from Exchange via `describe-connector` metadata. The rules below govern how to transform metadata into XML.

### Pattern 1: Attributes (most connectors)

When the connection provider's `attributes[]` has items, emit XML attributes:

```xml
<salesforce:sfdc-config name="salesforceConfig" doc:name="Salesforce Config">
    <salesforce:basic-connection
        username="${salesforce.username}"
        password="${salesforce.password}"
        securityToken="${salesforce.securityToken}" />
</salesforce:sfdc-config>
```

### Pattern 2: Child Elements (OAuth connectors)

When `attributes[]` is empty but `childElements[]` has items, use nested elements:

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

### OAuth Connectors Need HTTP Listener

If the provider metadata includes an `oauthCallbackConfig` child element, also generate:

```xml
<http:listener-config name="HTTP_Listener_config" doc:name="HTTP Listener config">
    <http:listener-connection host="0.0.0.0" port="8081" />
</http:listener-config>
```

And ensure `mule-http-connector` is in `pom.xml`.

### Generation Rules (from metadata)

| Metadata field | Maps to |
|----------------|---------|
| `attributes[].attributeName` | XML attributes on the element (use name verbatim) |
| `attributes[].required: true` | MUST appear in output |
| `childElements[].prefix:elementName` | Nested XML element tag |
| `childElements[].required: true` | MUST appear in output |
| `connectionProviders[].elementName` | The connection provider element tag |
| Config `name` attribute | User-provided config name (e.g., `salesforceConfig`) |

### Connector Config pom.xml Dependency

```xml
<dependency>
    <groupId>{groupId}</groupId>
    <artifactId>{assetId}</artifactId>
    <version>{version}</version>
    <classifier>mule-plugin</classifier>
</dependency>
```

Version MUST come from `get_latest_connector.sh` → `pick_connector.sh` (live Exchange), never from memory.

### Flag Semantics for describe-connector

| Flag | Carries |
|------|---------|
| `--name` | The **connection provider** name (e.g., `basic-connection`) |
| `--config-name` | The **config** name from metadata (e.g., `sfdc-config`) — NOT the user's display name |
