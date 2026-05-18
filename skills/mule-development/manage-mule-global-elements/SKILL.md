---
name: manage-mule-global-elements
description: List all global elements, find usages, validate placeholder resolution, and consolidate scattered global elements into global-config.xml. Use this when the user asks to "list global elements", "what global elements exist", "show all configs", "find usages", "where is this config used", "which flows reference", "validate placeholders", "check unresolved properties", "are my placeholders resolvable", "consolidate configs", "centralize global elements", "move configs to global-config.xml", or perform cross-project analysis of global element health and organization.
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Mule Global Elements — List, Find Usages, Validate & Consolidate

## Rules

This skill performs **read-and-analyze operations** on Mule projects. For List, Find Usages, and Validate, no files are modified. For Consolidate, files are modified only after explicit user confirmation.

Never use TaskCreate. Present analysis results clearly with file paths and line numbers.

---

## Operation Routing

Determine the user's intent and route:

| Intent | Route to |
|--------|----------|
| List / show all / what global elements exist / what configs are in my project | → **LIST ALL** |
| Find usages / where is X used / which flows reference / show references | → **FIND USAGES** |
| Validate / check placeholders / unresolved properties / are my configs valid | → **VALIDATE** |
| Consolidate / centralize / move to global-config.xml / scattered configs | → **CONSOLIDATE** |

If the intent is unclear, ask:

> What would you like to do — **list all** global elements in the project, **find usages** of a specific element, **validate** placeholder resolution, or **consolidate** scattered configs into one file?

---

## LIST ALL (mule_global_list)

### Purpose

List every global element in the project, grouped by type, with name, file location, and usage count. Provides a complete inventory of the project's global configuration.

### Step 1: Locate the Mule Project

Use Glob to search for `**/pom.xml`. If multiple projects found, ask the user which one.

### Step 2: Scan All Mule XML Files

Read all Mule XML files under `{project-root}/src/main/mule/`. Identify every top-level element inside `<mule>` that is NOT a `<flow>` or `<sub-flow>`. Categorize each element:

| Category | Elements to Detect |
|----------|-------------------|
| Connector Configs | Any `<*:*-config name="...">` with a connection provider child (e.g., `http:listener-config`, `http:request-config`, `db:config`, `salesforce:sfdc-config`) |
| Configuration Properties | `<configuration-properties file="..."/>` |
| Global Properties | `<global-property name="..." value="..."/>` |
| Global Error Handlers | `<error-handler name="...">` (outside flows) |
| API AutoDiscovery | `<api-gateway:autodiscovery .../>` |
| TLS Context | `<tls:context name="...">` |
| Object Store | `<os:config name="...">`, `<os:object-store name="...">` |
| Caching Strategy | `<ee:object-store-caching-strategy name="...">` |
| Import References | `<import file="..."/>` |
| Application Configuration | `<configuration .../>` |
| Other | Any other top-level non-flow element |

### Step 3: Count Usages

For each named global element, do a quick count of references across all Mule XML files (search for the name in `config-ref`, `tlsContext`, `objectStore`, `cachingStrategy-ref`, `defaultErrorHandler-ref`, `errorHandler-ref`, `listenerConfig`, and `<flow-ref name="...">`).

### Step 4: Present Results

> **Global Elements in this project**
>
> ---
>
> **Connector Configs ({N})**
>
> | Name | Type | File | Usages |
> |------|------|------|--------|
> | `HTTP_Listener_config` | http:listener-config | global-config.xml | 4 flows |
> | `HTTP_Request_config` | http:request-config | global-config.xml | 2 flows |
> | `salesforceConfig` | salesforce:sfdc-config | global-config.xml | 1 flow |
>
> ---
>
> **Configuration Properties ({N})**
>
> | File Registered | Registered In | Keys |
> |----------------|--------------|------|
> | `config.yaml` | global-config.xml | 12 keys |
> | `${env}.yaml` | global-config.xml | dynamic |
>
> ---
>
> **Global Properties ({N})**
>
> | Name | Value | File |
> |------|-------|------|
> | `env` | `dev` | global-config.xml |
> | `app.name` | `inventory-api` | global-config.xml |
>
> ---
>
> **Global Error Handlers ({N})**
>
> | Name | File | Default? | Strategies |
> |------|------|----------|------------|
> | `global-error-handler` | global-config.xml | Yes | on-error-continue (ANY) |
>
> ---
>
> **TLS Context ({N})**
>
> | Name | File | Stores | Usages |
> |------|------|--------|--------|
> | `TLS_Context` | global-config.xml | Trust + Key | 1 |
>
> ---
>
> **Object Store ({N})**
>
> | Name | Type | File | Persistent | Usages |
> |------|------|------|-----------|--------|
> | `ObjectStore_Config` | os:config | global-config.xml | — | 1 |
> | `Order_Cache` | os:object-store | global-config.xml | true | 1 |
>
> ---
>
> **Caching Strategy ({N})**
>
> | Name | File | Object Store | Usages |
> |------|------|-------------|--------|
> | `Caching_Strategy` | global-config.xml | Order_Cache | 2 |
>
> ---
>
> **API AutoDiscovery ({N})**
>
> | API ID | Flow Ref | File |
> |--------|----------|------|
> | `${api.id}` | `inventory-api-main` | global-config.xml |
>
> ---
>
> **Import References ({N})**
>
> | File Imported | Registered In |
> |--------------|--------------|
> | `shared-error-handling.xml` | global-config.xml |
>
> ---
>
> **Summary:** {total} global elements across {files} files. {centralized} centralized in `global-config.xml`, {scattered} scattered in other files.

If a category has zero elements, omit that section from the output.

### Step 5: Highlight Issues (if any)

After the listing, call out any issues detected:

> **Issues detected:**
> - {N} unresolved placeholders (run **validate** for details)
> - {N} global elements scattered outside `global-config.xml` (run **consolidate** to fix)
> - {N} unused global elements (0 references — consider deleting)

---

## FIND USAGES (mule_global_find_usages)

### Purpose

Find all flow references to a specific global element. Returns the flow name, file, line number, and the attribute that creates the reference.

### Step 1: Identify the Target Element

If the user specified the element name, use it directly. Otherwise:

1. Scan all Mule XML files under `src/main/mule/` for global elements (top-level elements with a `name` attribute).
2. List them:

> **Global elements in this project:**
>
> | # | Name | Type | File |
> |---|------|------|------|
> | 1 | `HTTP_Listener_config` | http:listener-config | global-config.xml |
> | 2 | `salesforceConfig` | salesforce:sfdc-config | global-config.xml |
> | 3 | `Database_Config` | db:config | global-config.xml |
> | 4 | `global-error-handler` | error-handler | global-config.xml |
> | 5 | `Caching_Strategy` | ee:object-store-caching-strategy | global-config.xml |
>
> **Which element do you want to find usages for?**

Wait for user response.

### Step 2: Search for References

Search ALL Mule XML files under `src/main/mule/` for references to the target element name in these attributes:

| Reference Pattern | Used By |
|-------------------|---------|
| `config-ref="{name}"` | Connector operations, sources |
| `listenerConfig="{name}"` | OAuth callback configs |
| `tlsContext="{name}"` | HTTP configs referencing TLS |
| `objectStore="{name}"` | Caching strategies referencing object stores |
| `cachingStrategy-ref="{name}"` | `<ee:cache>` scopes |
| `defaultErrorHandler-ref="{name}"` | `<configuration>` element |
| `errorHandler-ref="{name}"` | Individual flows |
| `<flow-ref name="{name}"/>` | Flow reference processors |

Also search for the name as a value in any attribute (catch-all for less common patterns).

### Step 3: Present Results

> **Usages of `{name}` ({type}):**
>
> | # | File | Line | Flow/Element | Attribute | Context |
> |---|------|------|-------------|-----------|---------|
> | 1 | `main-flow.xml` | 12 | `get-books-flow` | `config-ref` | `<http:listener config-ref="HTTP_Listener_config">` |
> | 2 | `main-flow.xml` | 45 | `post-book-flow` | `config-ref` | `<http:listener config-ref="HTTP_Listener_config">` |
> | 3 | `order-flow.xml` | 8 | `order-api-flow` | `config-ref` | `<http:listener config-ref="HTTP_Listener_config">` |
>
> **Total: {N} usages across {M} files.**

If NO usages found:

> The global element `{name}` is **not referenced** anywhere in the project. It may be unused and safe to delete.

---

## VALIDATE (mule_global_validate)

### Purpose

Scan all `${placeholder}` references in the project and report which are resolved, which are unresolved, and which properties files are registered.

### Step 1: Locate Registered Properties Sources

Scan all Mule XML files for:

1. `<configuration-properties file="..."/>` — registered properties files
2. `<global-property name="..." value="..."/>` — inline global properties
3. `<secure-properties:config file="..."/>` — secure properties files

Read each registered file and build a master key list.

### Step 2: Scan for All Placeholder References

Search all Mule XML files under `src/main/mule/` for `${...}` patterns. For each, record:
- The key being referenced
- The file and line where it's used
- Whether it resolves to a registered source

**Resolution rules:**
- `${key}` — resolves if key exists in any registered properties file or as a `<global-property>`
- `${secure::key}` — resolves if a `<secure-properties:config>` is registered with that key
- `${env}.yaml` — dynamic resolution: resolves `env` first, then uses as filename
- System/built-in properties (`${app.name}`, `${mule.home}`, `${app.encoding}`, `${app.standalone}`, `${app.home}`) are always resolved — do not flag

### Step 3: Present Validation Report

> **Placeholder Validation Report**
>
> ---
>
> **Properties Sources Registered:**
>
> | # | Source | Type | Keys | File Exists? |
> |---|--------|------|------|-------------|
> | 1 | `config.yaml` | configuration-properties | 12 keys | Yes |
> | 2 | `${env}.yaml` | configuration-properties (dynamic) | depends on env | Yes (dev.yaml) |
> | 3 | `env=dev` | global-property | 1 key | N/A (inline) |
> | 4 | `secure.yaml` | secure-properties | 3 keys | Yes |
>
> ---
>
> **Resolved Placeholders:** {N} total
>
> | Key | Resolved From | Value (or masked) |
> |-----|--------------|-------------------|
> | `${http.port}` | config.yaml | `8081` |
> | `${env}` | global-property | `dev` |
> | `${db.host}` | dev.yaml | `localhost` |
> | `${secure::db.password}` | secure.yaml | `****` (encrypted) |
>
> ---
>
> **Unresolved Placeholders:** {N} total
>
> | # | Key | File | Line | Context |
> |---|-----|------|------|---------|
> | 1 | `${api.key}` | `order-flow.xml` | 23 | `<http:header headerName="X-API-Key" value="${api.key}"/>` |
> | 2 | `${db.schema}` | `global-config.xml` | 18 | `<db:config ... database="${db.schema}">` |
>
> **Action needed:** Add these keys to `config.yaml` or the appropriate environment file.
>
> ---
>
> **Warnings:**
> - Unused keys in `config.yaml`: `legacy.endpoint` (not referenced anywhere)
> - Unused keys in `secure.yaml`: `old.api.secret` (not referenced anywhere)

### Step 4: Suggest Fixes

For each unresolved placeholder, suggest:

> **Suggested fixes:**
> 1. Add `api.key: "your-api-key"` to `config.yaml`
> 2. Add `db.schema: "mydb"` to `config.yaml`
>
> Would you like me to add these to your properties file?

If confirmed, apply fixes.

---

## CONSOLIDATE (mule_global_consolidate)

### Purpose

Scan all config files for global elements scattered outside `global-config.xml`. Report what can be moved and execute on confirmation.

### Step 1: Scan for Scattered Global Elements

Read all Mule XML files under `src/main/mule/`. For each file, identify global elements — top-level elements inside `<mule>` that are NOT `<flow>` or `<sub-flow>`.

Global element types to detect:
- `<*:*-config ...>` — connector configurations
- `<configuration-properties ...>` — properties file registrations
- `<global-property ...>` — inline properties
- `<configuration ...>` — application configuration
- `<error-handler name="...">` — named global error handlers (outside flows)
- `<api-gateway:autodiscovery ...>` — API autodiscovery
- `<tls:context ...>` — TLS contexts
- `<os:object-store ...>` / `<os:config ...>` — Object Store
- `<ee:object-store-caching-strategy ...>` — Caching strategies
- `<import ...>` — project imports

### Step 2: Classify Elements

| Classification | Rule | Action |
|---------------|------|--------|
| **Movable** | Connector configs, properties registrations, global properties, error handlers, TLS, Object Store, Caching Strategy, API autodiscovery, imports | Recommend moving to `global-config.xml` |
| **Flow-coupled** | `apikit:config` elements | Recommend keeping in place |
| **Already centralized** | Elements already in `global-config.xml` | No action |

### Step 3: Present Consolidation Report

> **Global Elements Consolidation Report**
>
> ---
>
> **Already in `global-config.xml`:** {N} elements
> - `HTTP_Listener_config` (http:listener-config)
> - `configuration-properties → config.yaml`
>
> ---
>
> **Recommended to move to `global-config.xml`:** {N} elements
>
> | # | Element | Type | Current File | Reason |
> |---|---------|------|-------------|--------|
> | 1 | `HTTP_Request_config` | http:request-config | `order-flow.xml` | Connector config — should be centralized |
> | 2 | `Salesforce_config` | salesforce:sfdc-config | `sfdc-flow.xml` | Connector config — should be centralized |
> | 3 | `global-error-handler` | error-handler | `error-handling.xml` | Global error handler — should be centralized |
>
> ---
>
> **Recommended to keep in place:** {N} elements
>
> | # | Element | Type | Current File | Reason |
> |---|---------|------|-------------|--------|
> | 1 | `inventory-api-config` | apikit:config | `inventory-app.xml` | APIKit config — flow-coupled |
>
> ---
>
> **Would you like me to move the {N} recommended elements to `global-config.xml`?**

**Wait for explicit confirmation before making any changes.**

### Step 4: Execute Consolidation (only after confirmation)

For each element being moved:

1. **Copy** element from source file to `global-config.xml` (insert before `</mule>`).
2. **Remove** element from source file.
3. **Move namespace declarations**: Add required `xmlns:` and `xsi:schemaLocation` entries to `global-config.xml` if not present.
4. **Clean up source**: Remove unused namespace declarations from source file.
5. **Preserve order** in `global-config.xml`:
   - `<import>` elements first
   - `<configuration-properties>` elements
   - `<global-property>` elements
   - `<configuration>` element
   - Connector configs
   - `<tls:context>`
   - `<os:config>` / `<os:object-store>`
   - `<ee:object-store-caching-strategy>`
   - `<error-handler>` elements
   - `<api-gateway:autodiscovery>`

### Step 5: Create global-config.xml (if needed)

If no `global-config.xml` exists, create it first:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd">

</mule>
```

### Step 6: Validate Build

```bash
cd {project-dir} && mvn clean package -DskipTests
```

If build fails:
- **Missing namespace** — add required namespace declaration
- **Duplicate name** — ask user which to keep
- **Broken reference** — should not happen (Mule resolves globally) but report if it does

### Step 7: Confirm

> **Consolidation complete.**
>
> - Moved {N} global elements to `global-config.xml`
> - Cleaned up namespaces in {M} source files
> - {K} elements kept in original location (flow-coupled)
> - Build: SUCCESS

---

## Reference: Placeholder Syntax

| Pattern | Resolution Source |
|---------|-----------------|
| `${key}` | Properties file, global-property, system property |
| `${secure::key}` | Secure properties file |
| `${env}.yaml` | Dynamic — resolves `env` first, then uses as filename |
| `${p('key')}` | DataWeave property access — same as `${key}` |

## Reference: Built-in Properties (never flag as unresolved)

- `${app.name}`, `${app.encoding}`, `${app.standalone}`, `${app.home}`
- `${mule.home}`, `${mule.clusterId}`, `${mule.clusterNodeId}`

## Reference: Global Element Reference Attributes

| Attribute | What It References |
|-----------|-------------------|
| `config-ref` | Connector configuration name |
| `tlsContext` | TLS context name |
| `objectStore` | Object store name |
| `cachingStrategy-ref` | Caching strategy name |
| `defaultErrorHandler-ref` | Global error handler name |
| `errorHandler-ref` | Error handler name (in flows) |
| `listenerConfig` | HTTP listener config (OAuth callbacks) |
