# Properties Patterns

> **Status: canonical reference for Mule 4 property configuration patterns,
> multi-environment setup, secure properties, and placeholder resolution.**
>
> Use this file when creating, editing, or validating property configurations.
> Covers: property file formats, `${placeholder}` resolution rules,
> multi-environment patterns, secure properties, and built-in properties.

---

## Table of Contents

- [Property File Formats](#property-file-formats)
- [Placeholder Resolution](#placeholder-resolution)
- [Multi-Environment Configuration](#multi-environment-configuration)
- [Secure Properties](#secure-properties)
- [Built-in Properties](#built-in-properties)
- [Property Precedence](#property-precedence)
- [Naming Conventions](#naming-conventions)
- [Validation Rules](#validation-rules)

---

## Property File Formats

### YAML Format (Recommended)

YAML is the preferred format for Mule 4 properties files. Keys are nested
and resolve to dot-joined placeholders.

**File:** `src/main/resources/config.yaml`

```yaml
http:
  port: "8081"
  host: "0.0.0.0"

salesforce:
  username: "user@example.com"
  password: "changeme"
  securityToken: "your-token"

db:
  host: "localhost"
  port: "3306"
  name: "mydb"
  username: "admin"
  password: "${secure::db.password}"
```

**Resolves to:**
- `${http.port}` → `"8081"`
- `${salesforce.username}` → `"user@example.com"`
- `${db.host}` → `"localhost"`

### Java Properties Format

Flat key-value pairs. Supported but less common in modern Mule 4 projects.

**File:** `src/main/resources/config.properties`

```properties
http.port=8081
http.host=0.0.0.0
salesforce.username=user@example.com
salesforce.password=changeme
db.host=localhost
db.port=3306
```

### Format Comparison

| Aspect | YAML | Properties |
|--------|------|------------|
| Nesting | Native (indentation) | Flat (dot-separated keys) |
| Comments | `#` | `#` or `!` |
| Multi-line values | `|` or `>` block syntax | `\` line continuation |
| Type safety | Quotes required for strings that look like numbers | Everything is a string |
| Readability | Better for grouped/hierarchical configs | Better for simple flat lists |
| MuleSoft convention | Preferred for new projects | Legacy/compatibility |

### YAML Gotchas

| Gotcha | Problem | Fix |
|--------|---------|-----|
| Unquoted numbers | `port: 8081` may be parsed as integer | Always quote: `port: "8081"` |
| Unquoted booleans | `enabled: true` may be parsed as boolean | Always quote: `enabled: "true"` |
| Special characters | `password: p@ss:word` breaks YAML | Quote: `password: "p@ss:word"` |
| Leading zeros | `code: 0042` becomes `42` (octal) | Quote: `code: "0042"` |

**Rule:** Always quote all values in Mule YAML property files to avoid
type-coercion surprises at runtime.

---

## Placeholder Resolution

### Syntax

| Pattern | Meaning | Resolution Source |
|---------|---------|-------------------|
| `${key}` | Standard placeholder | Properties file, global-property, or system property |
| `${key:default}` | Placeholder with default value | If `key` is not found, uses `default` |
| `${secure::key}` | Secure (encrypted) placeholder | Secure properties file (decrypted at runtime) |
| `${env}.yaml` | Dynamic filename | Resolves `env` first, then uses result as filename |
| `#[p('key')]` | DataWeave property access | Same resolution as `${key}` but usable in DW expressions |

### Resolution Order

Mule resolves properties in this order (first match wins):

1. **System properties** (`-Dkey=value` on the JVM command line)
2. **Environment variables** (OS-level, if `environmentVariables` source is configured)
3. **`<global-property>`** declarations (inline in XML)
4. **`<configuration-properties>`** files (in declaration order; later files override earlier for same key)
5. **Default values** (the part after `:` in `${key:default}`)

### Registration in XML

Properties files must be **registered** via `<configuration-properties>` to
be resolved at runtime:

```xml
<configuration-properties file="config.yaml" doc:name="Configuration Properties" />
```

A file that exists in `src/main/resources/` but is NOT registered will
NOT have its placeholders resolved — the app will fail with
`Could not resolve placeholder '${key}'`.

---

## Multi-Environment Configuration

### The `${env}.yaml` Pattern

The standard pattern for environment-specific configuration in Mule 4:

```xml
<!-- In global-configs.xml -->
<configuration-properties file="config.yaml" doc:name="Common Configuration" />
<global-property name="env" value="dev" doc:name="Global Property: env" />
<configuration-properties file="${env}.yaml" doc:name="Environment Configuration" />
```

**How it works:**
1. `config.yaml` contains properties shared across all environments.
2. `<global-property name="env" value="dev"/>` sets the default environment.
3. `<configuration-properties file="${env}.yaml"/>` resolves to `dev.yaml` by default.
4. At deployment, override with `-Denv=prod` to switch to `prod.yaml`.

### File Layout

```
src/main/resources/
├── config.yaml          ← Common properties (all environments)
├── dev.yaml             ← Development environment
├── qa.yaml              ← QA/Testing environment
└── prod.yaml            ← Production environment
```

### Example Files

**`config.yaml`** (common):
```yaml
app:
  name: "inventory-api"
  version: "1.0.0"
```

**`dev.yaml`**:
```yaml
http:
  port: "8081"
db:
  host: "localhost"
  port: "5432"
  name: "inventory_dev"
  username: "dev_user"
  password: "devpass"
```

**`qa.yaml`**:
```yaml
http:
  port: "8081"
db:
  host: "qa-db.internal"
  port: "5432"
  name: "inventory_qa"
  username: "qa_user"
  password: "${secure::db.password}"
```

**`prod.yaml`**:
```yaml
http:
  port: "8443"
db:
  host: "prod-db.internal"
  port: "5432"
  name: "inventory_prod"
  username: "prod_user"
  password: "${secure::db.password}"
```

### Override at Deployment

| Environment | Override Mechanism |
|-------------|-------------------|
| CloudHub 2.0 | Property tab in Runtime Manager: `env=prod` |
| CloudHub 1.0 | Properties tab: `env=prod` |
| On-premise | JVM argument: `-Denv=prod` |
| Local development | Default (`dev`) or IDE run config |

### Multi-Environment Validation

When validating placeholders for a multi-environment project:
- Check resolution against ALL environment files, not just the default.
- A placeholder that resolves in `dev.yaml` but not `prod.yaml` is a warning (may be intentional if prod uses secure properties or system properties).
- A placeholder that resolves in NO file is an error.

---

## Secure Properties

### Overview

Secure properties encrypt sensitive values (passwords, tokens, API keys)
so they are not stored in plaintext in source control.

### Module Registration

```xml
<!-- In global-configs.xml -->
<secure-properties:config name="Secure_Properties"
                          file="secure-${env}.yaml"
                          key="${secure.key}"
                          doc:name="Secure Properties Config">
    <secure-properties:encrypt algorithm="AES" mode="CBC" />
</secure-properties:config>
```

### pom.xml Dependency

```xml
<dependency>
    <groupId>com.mulesoft.modules</groupId>
    <artifactId>mule-secure-configuration-property-module</artifactId>
    <version>1.2.7</version>
    <classifier>mule-plugin</classifier>
</dependency>
```

### Namespace

| Prefix | URI | XSD URL |
|--------|-----|---------|
| `secure-properties` | `http://www.mulesoft.org/schema/mule/secure-properties` | `http://www.mulesoft.org/schema/mule/secure-properties/current/mule-secure-properties.xsd` |

### Encryption Attributes

| Attribute | Required | Default | Allowed Values |
|-----------|----------|---------|----------------|
| `algorithm` | No | `AES` | `AES`, `Blowfish`, `DES`, `DESede`, `RC2` |
| `mode` | No | `CBC` | `CBC`, `CFB`, `ECB`, `OFB` |

### Encrypted Property File Format

```yaml
db:
  password: "![encrypted-value-here]"
api:
  secret: "![another-encrypted-value]"
```

Values wrapped in `![...]` are encrypted. Reference them with `${secure::key}`:

```xml
<db:generic-connection url="${db.url}"
                       user="${db.username}"
                       password="${secure::db.password}" />
```

### Encrypting Values

Use the MuleSoft secure-properties-tool JAR:

```bash
java -cp secure-properties-tool-j17.jar \
  com.mulesoft.tools.SecurePropertiesTool \
  string encrypt AES CBC \
  --key "my-encryption-key" \
  --value "my-secret-password"
```

Output: `![encrypted-base64-string]`

### The `${secure.key}` Pattern

The encryption key itself should NEVER be in source control. Pass it at deployment:

| Environment | How to Pass |
|-------------|-------------|
| CloudHub | Properties tab: `secure.key=my-encryption-key` |
| On-premise | JVM arg: `-Dsecure.key=my-encryption-key` |
| Local dev | Run configuration property |

### Credential Detection Heuristic

Flag properties as "should be encrypted" when key names match:

```
*password*, *secret*, *token*, *apiKey*, *api_key*, *api-key*,
*credential*, *private_key*, *private-key*, *consumerSecret*,
*consumer_secret*, *client_secret*, *clientSecret*
```

---

## Built-in Properties

These properties are provided by the Mule runtime and should NEVER be
flagged as unresolved during validation:

### Application Properties

| Property | Description | Example Value |
|----------|-------------|---------------|
| `${app.name}` | Application name from `pom.xml` `<name>` | `inventory-api` |
| `${app.encoding}` | Application encoding | `UTF-8` |
| `${app.standalone}` | Whether running standalone | `true` |
| `${app.home}` | Application home directory | `/opt/mule/apps/inventory-api` |

### Mule Runtime Properties

| Property | Description | Example Value |
|----------|-------------|---------------|
| `${mule.home}` | Mule installation directory | `/opt/mule` |
| `${mule.clusterId}` | Cluster ID (clustered mode only) | `cluster-1` |
| `${mule.clusterNodeId}` | Node ID within cluster | `1` |

### Domain Properties

| Property | Description |
|----------|-------------|
| `${domain}` | Mule domain name (when deployed to a domain) |

### CloudHub Properties (available when deployed to CloudHub)

| Property | Description |
|----------|-------------|
| `${fullDomain}` | Full domain name |
| `${worker.id}` | Worker identifier |
| `${environment.id}` | Environment ID |
| `${organization.id}` | Organization ID |

---

## Property Precedence

When the same key exists in multiple sources, this is the override order
(highest priority wins):

```
1. System properties (-Dkey=value)                    ← HIGHEST
2. Environment variables (if configured)
3. <global-property name="key" value="..."/>
4. <configuration-properties> files (later overrides earlier)
5. ${key:default} fallback value                      ← LOWEST
```

### Multiple `<configuration-properties>` Elements

When multiple properties files are registered:

```xml
<configuration-properties file="config.yaml" />        <!-- Base: loaded first -->
<configuration-properties file="${env}.yaml" />         <!-- Override: loaded second -->
```

If both `config.yaml` and `dev.yaml` define `http.port`, the value from
`dev.yaml` wins (later registration overrides earlier).

---

## Naming Conventions

### Property Key Naming

| Convention | Example | Use For |
|-----------|---------|---------|
| `{connector}.{field}` | `salesforce.username` | Connector credentials |
| `{connector}.{sub}.{field}` | `db.connection.timeout` | Nested connector settings |
| `http.port` | `http.port` | Standard HTTP port |
| `api.id` | `api.id` | API Manager registration |
| `app.{field}` | `app.name` | Application metadata |
| `secure::{key}` | `secure::db.password` | Encrypted values (in reference) |

### File Naming

| File | Purpose |
|------|---------|
| `config.yaml` | Default/common properties (always registered) |
| `{env}.yaml` | Environment-specific (`dev.yaml`, `qa.yaml`, `prod.yaml`) |
| `secure.yaml` or `secure-{env}.yaml` | Encrypted properties |
| `{feature}.yaml` | Feature-specific properties (rare; for large projects) |

### Placeholder Naming in XML

Always use property placeholders for:
- Credentials (passwords, tokens, secrets) — `${connector.password}`
- Environment-specific values (hosts, ports, URLs) — `${db.host}`
- API IDs and registration values — `${api.id}`
- Anything that changes between environments

Never use property placeholders for:
- Static structural values (flow names, element names)
- Boolean flags that are always the same
- XML element or attribute names

---

## Validation Rules

### Placeholder Resolution Validation

When validating that all `${...}` placeholders are resolvable:

1. **Collect all registered sources:**
   - All `<configuration-properties file="..."/>` → read referenced files
   - All `<global-property name="..." value="..."/>` → add to known keys
   - All `<secure-properties:config file="..."/>` → read referenced files

2. **Scan all XML files** under `src/main/mule/` for `${...}` patterns.

3. **For each placeholder:**
   - Extract the key (strip `${` and `}`, handle `secure::` prefix, handle `:default` suffix)
   - Check if key exists in any registered source
   - If key has a `:default` suffix, it's always resolvable (has fallback)
   - If key starts with `secure::`, check secure properties files
   - If key matches a built-in property (see above), mark as resolved

4. **Report:**
   - Resolved: key found in a registered source
   - Unresolved: key not found anywhere — action needed
   - Dynamic: key uses `${var}` in the filename (e.g., `${env}.yaml`) — check all possible resolutions

### Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Could not resolve placeholder '${key}'` | Key not in any registered file | Add to config.yaml or appropriate env file |
| File registered but doesn't exist | `<configuration-properties file="missing.yaml"/>` | Create the file or remove the registration |
| Placeholder in unregistered file | File exists but no `<configuration-properties>` element | Add registration to `global-configs.xml` |
| `${secure::key}` with no secure module | Secure prefix used but `secure-properties:config` not declared | Add secure properties module config and dependency |

### Cross-Environment Validation

For multi-environment projects, validate that:
- Every placeholder referenced in flow XML resolves in ALL environment files
  (or has a `:default` suffix, or comes from `config.yaml`)
- Credential keys in prod/qa use `${secure::...}` (not plaintext)
- No environment file has keys that aren't used by any placeholder (unused = stale)
