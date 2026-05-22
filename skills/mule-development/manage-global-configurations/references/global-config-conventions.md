# Global Config Conventions

> **Status: canonical reference for `global-configs.xml` structure, element ordering,
> namespace management, and project centralization patterns.**
>
> This file documents the best practices for organizing global elements in a
> Mule 4 project. All skills that create, edit, or consolidate global elements
> should follow these conventions.

---

## Table of Contents

- [File Structure](#file-structure)
- [Element Ordering](#element-ordering)
- [Namespace Management](#namespace-management)
- [Centralization Rules](#centralization-rules)
- [Default Project Structure](#default-project-structure)
- [Consolidation Decision Matrix](#consolidation-decision-matrix)

---

## File Structure

### The `global-configs.xml` Convention

Every Mule 4 project SHOULD have a dedicated `global-configs.xml` file in
`src/main/mule/` that contains ALL global elements (except flow-coupled
elements like `apikit:config`). This separates configuration from flow logic.

```
src/
├── main/
│   ├── mule/
│   │   ├── global-configs.xml     ← All global elements
│   │   ├── {app-name}.xml        ← Flows only
│   │   └── {feature-name}.xml    ← Additional flow files (optional)
│   └── resources/
│       ├── config.yaml           ← Default properties file
│       ├── dev.yaml              ← Environment-specific (optional)
│       ├── qa.yaml               ← Environment-specific (optional)
│       ├── prod.yaml             ← Environment-specific (optional)
│       └── log4j2.xml            ← Logging configuration
```

### Base `global-configs.xml` Skeleton

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd">

    <configuration-properties file="config.yaml" doc:name="Configuration Properties" />

</mule>
```

Add namespace declarations incrementally as elements are added — never
pre-declare namespaces that aren't used.

---

## Element Ordering

Global elements in `global-configs.xml` MUST follow this ordering. The
ordering is not just cosmetic — some elements reference others, and
forward references can cause parsing failures.

### Canonical Order

```
1. <import> elements                         ← First: makes imported resources available
2. <configuration-properties> elements       ← Second: registers property files
3. <global-property> elements                ← Third: inline properties (can be used in filenames above)
4. <configuration> element                   ← Fourth: application-wide settings
5. Connector configurations                  ← Fifth: HTTP, DB, Salesforce, etc.
6. <tls:context> elements                    ← Sixth: TLS (may be referenced by connectors)
7. <os:config> elements                      ← Seventh: Object Store configs
8. <os:object-store> elements                ← Eighth: Object Store instances (reference os:config)
9. <ee:object-store-caching-strategy>        ← Ninth: Caching (references object-store)
10. <error-handler> elements                 ← Tenth: Global error handlers
11. <api-gateway:autodiscovery> elements     ← Last: API Manager registration
```

### Why This Order Matters

| Position | Element | Depends On |
|----------|---------|------------|
| 1 | `<import>` | Nothing — makes external resources available to everything below |
| 2 | `<configuration-properties>` | May use `${var}` from `<global-property>` in filename |
| 3 | `<global-property>` | Nothing (but resolved first by Mule runtime regardless of position) |
| 4 | `<configuration>` | References error handlers by name |
| 5 | Connector configs | May reference TLS contexts |
| 6 | `<tls:context>` | Nothing (but referenced by connectors via `tlsContext` attribute) |
| 7 | `<os:config>` | Nothing |
| 8 | `<os:object-store>` | References `os:config` via `config-ref` |
| 9 | Caching Strategy | References `os:object-store` via `objectStore` attribute |
| 10 | `<error-handler>` | May use connectors (e.g., HTTP request in error recovery) |
| 11 | `<api-gateway:autodiscovery>` | References a flow by name (`flowRef`) |

**Exception:** `<global-property>` is technically resolved at a different
phase by the Mule runtime (before config-properties files), so its XML
position doesn't strictly matter for resolution. However, placing it at
position 3 makes the file easier to read — properties first, then the
elements that use them.

---

## Namespace Management

### Adding Namespaces

When adding a new global element to `global-configs.xml`, add BOTH:
1. The `xmlns:{prefix}` declaration on the `<mule>` root element.
2. The corresponding entry in `xsi:schemaLocation`.

Example — adding Object Store:

```xml
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:os="http://www.mulesoft.org/schema/mule/os"
      ...
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/os http://www.mulesoft.org/schema/mule/os/current/mule-os.xsd">
```

### Removing Namespaces

When deleting the last element that uses a namespace, remove BOTH:
1. The `xmlns:{prefix}` declaration.
2. The `xsi:schemaLocation` entry.

### Namespace Rules

| Rule | Explanation |
|------|-------------|
| Never declare unused namespaces | Causes `mvn clean package` warnings and confuses readers |
| Never add `doc` to `schemaLocation` | No XSD exists at that URL — build will fail |
| Never add `xsi` to `schemaLocation` | W3C standard namespace, not a Mule schema |
| Match namespace to dependency | If `xmlns:foo` is declared, `pom.xml` must have the foo connector dependency (except for core, ee, tls, doc) |

### Namespace ↔ Dependency Parity

| Namespace | Requires pom.xml Dependency? |
|-----------|------------------------------|
| Core (`mule`) | No — runtime |
| `ee` | No — EE runtime |
| `tls` | No — runtime |
| `doc` | No — runtime (via `anyAttribute`) |
| `os` | **Yes** — `mule-objectstore-connector` |
| `api-gateway` | **Yes** — `mule-api-gateway` (scope: provided) |
| `http` | **Yes** — `mule-http-connector` |
| Any connector prefix | **Yes** — corresponding connector dependency |

---

## Centralization Rules

### What Goes in `global-configs.xml`

| Element Type | Centralize? | Reason |
|-------------|-------------|--------|
| Connector configs (`*:*-config`) | **Yes** | Shared across flows; single source of truth for connection settings |
| `<configuration-properties>` | **Yes** | Project-wide property registration |
| `<global-property>` | **Yes** | Project-wide inline properties |
| `<configuration>` | **Yes** | Only one per project; must be in one place |
| `<tls:context>` | **Yes** | Shared security config |
| `<os:config>` / `<os:object-store>` | **Yes** | Shared storage infrastructure |
| `<ee:object-store-caching-strategy>` | **Yes** | Shared caching config |
| `<error-handler name="...">` (global) | **Yes** | Centralized error handling policy |
| `<api-gateway:autodiscovery>` | **Yes** | API Manager registration |
| `<import>` | **Yes** | Dependency declarations |

### What Stays with Flow Files

| Element Type | Keep in Flow File? | Reason |
|-------------|-------------------|--------|
| `<apikit:config>` | **Yes** | Tightly coupled to the specific API router flow it configures |
| Anonymous `<error-handler>` (inside `<flow>`) | **Yes** | Flow-specific error handling |
| `<sub-flow>` elements | **Yes** | Logically grouped with calling flows |

### Detection Rules for Consolidation

When scanning for elements to consolidate, classify as **movable** if:
- Top-level element (direct child of `<mule>`, not inside `<flow>`)
- Has a `name` attribute
- Is NOT `<flow>` or `<sub-flow>`
- Is NOT `apikit:config`

---

## Default Project Structure

### New Integration/Implementation Projects

Every new project SHOULD be created with:

**`src/main/mule/global-configs.xml`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:http="http://www.mulesoft.org/schema/mule/http"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd">

    <configuration-properties file="config.yaml" doc:name="Configuration Properties" />

    <http:listener-config name="HTTP_Listener_config" doc:name="HTTP Listener config">
        <http:listener-connection host="0.0.0.0" port="${http.port}" />
    </http:listener-config>

</mule>
```

**`src/main/resources/config.yaml`:**

```yaml
http:
  port: "8081"
```

### Migration Pattern (existing projects without `global-configs.xml`)

When a project is opened that lacks `global-configs.xml`:
1. Prompt user: "This project doesn't have a centralized global config file. Would you like to create one?"
2. If confirmed, create `global-configs.xml` with the skeleton above.
3. Offer to run consolidation (move scattered global elements into the new file).

---

## Consolidation Decision Matrix

When evaluating whether to move a global element:

| Source File | Element | Recommendation | Reason |
|-------------|---------|----------------|--------|
| Any flow XML | Connector config | **Move** | Configs are shared; shouldn't be co-located with one specific flow |
| Any flow XML | `<configuration-properties>` | **Move** | Project-wide concern |
| Any flow XML | `<global-property>` | **Move** | Project-wide concern |
| Any flow XML | Named `<error-handler>` | **Move** | Global error policy |
| Any flow XML | `<tls:context>` | **Move** | Shared security config |
| `error-handling.xml` | Named `<error-handler>` | **Move** | Consolidate into global-configs.xml |
| Any flow XML | `<apikit:config>` | **Keep** | Flow-coupled — configures its specific router |
| Any flow XML | `<sub-flow>` | **Keep** | Logic, not config |
| `global-configs.xml` | Anything | **Keep** | Already centralized |

### Post-Consolidation Checklist

After moving elements:
- [ ] All required namespace declarations added to `global-configs.xml`
- [ ] Corresponding `xsi:schemaLocation` entries added
- [ ] Unused namespace declarations removed from source files
- [ ] Source file is not left as empty skeleton (ask user whether to delete)
- [ ] `config-ref` references still resolve (Mule resolves globally — should be fine)
- [ ] Build passes: `mvn clean package -DskipTests`
