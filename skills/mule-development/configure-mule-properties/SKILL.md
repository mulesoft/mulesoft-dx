---
name: configure-mule-properties
description: Create, edit, and manage Mule configuration properties files (.yaml/.properties), register them as <configuration-properties> elements, manage inline <global-property> definitions, and set up multi-environment configuration (dev/QA/prod). Use this when the user asks to "create config.yaml", "add properties file", "set up environments", "configure dev/QA/prod", "add property", "edit property", "register properties file", "set up multi-environment", "add global property", "set global property", "add inline property", or manage ${placeholder} property values in their Mule project.
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

# Mule Properties & Configuration Management

## Rules

This is a **multi-turn interactive skill**. At every "STOP" marker: print only questions as plain text, end your response, and wait. **No tools until all questions are answered**. Never use TaskCreate. Never output raw content to chat — always write to file.

Activate when user asks to create, edit, or manage Mule configuration properties files, register them as `<configuration-properties>` elements, manage inline `<global-property>` definitions, or set up multi-environment configuration.

---

## Operation Routing

Determine the user's intent and route to the appropriate section:

| Intent | Route to |
|--------|----------|
| Create a new properties file (.yaml/.properties) | → **CREATE FILE** |
| Edit / add / modify / remove keys in a properties file | → **EDIT FILE** |
| Set up environments / multi-env / dev / QA / prod | → **SETUP ENV** |
| Register / unregister a properties file as `<configuration-properties>` | → **REGISTER** |
| Add / edit / delete inline `<global-property>` | → **GLOBAL PROPERTY** |
| List / view / show properties or registrations | → **GET** |

If the intent is unclear, ask:

> What would you like to do?
> - **Create** a new properties file
> - **Edit** an existing properties file
> - **Set up environments** (dev/QA/prod)
> - **Register** a properties file in your Mule config
> - **Manage inline global properties** (`<global-property>` in XML)
> - **View** current properties setup

**STOP.**

---

## GET — View Properties Setup

### Step 1: Locate the Mule Project

Use Glob to search for `**/pom.xml`. If multiple projects found, ask the user which one.

### Step 2: Scan and Display

1. List all `.yaml`, `.yml`, and `.properties` files in `src/main/resources/`.
2. Scan all Mule XML files for `<configuration-properties>` registrations.
3. Scan all Mule XML files for `<global-property>` elements.

Display:

> **Registered Properties Files:**
>
> | # | File | Registered In | Doc Name |
> |---|------|--------------|----------|
> | 1 | `config.yaml` | `global-config.xml:5` | Configuration Properties |
> | 2 | `${env}.yaml` | `global-config.xml:7` | Environment Configuration |
>
> **Available but unregistered files** in `src/main/resources/`:
> - `secure.yaml` (not registered — placeholders from this file won't resolve)
> - `test.properties`
>
> **Inline Global Properties:**
>
> | # | Name | Value | File | Line |
> |---|------|-------|------|------|
> | 1 | `env` | `dev` | `global-config.xml` | 6 |
> | 2 | `app.name` | `inventory-api` | `global-config.xml` | 7 |

---

## CREATE FILE — Create a New Properties File

### Phase 1: Questions

#### Question 1 — File Format & Name

> I'll create a new properties file. A few questions:
>
> **What format would you like?** — YAML (`.yaml`) or Java Properties (`.properties`)?
>
> **What name for the file?** (e.g., `config.yaml`, `app.properties`, `secure.yaml`)

**STOP.**

#### Question 2 — Initial Properties

> **What initial properties would you like to include?** Provide key-value pairs, or say "empty" to start with a blank file.
>
> Examples:
> ```
> http.port: "8081"
> db.host: "localhost"
> db.port: "3306"
> ```
>
> **Should this file be registered as a `<configuration-properties>` element?** (yes/no — registering means Mule will resolve `${key}` placeholders from this file at runtime)

**STOP.**

### Phase 2: Execution

#### Step 1: Locate the Mule Project

Use Glob to search for `**/pom.xml`. If multiple projects found, ask the user which one.

#### Step 2: Create the Properties File

Target path: `{project-root}/src/main/resources/{filename}`

1. Check if `src/main/resources/` exists. Create with `mkdir -p` if needed.
2. Check if the file already exists. If it does, ask user whether to overwrite or append.
3. Write the file with the user-provided key-value pairs.

**YAML format:**
```yaml
http:
  port: "8081"
db:
  host: "localhost"
  port: "3306"
```

**Properties format:**
```properties
http.port=8081
db.host=localhost
db.port=3306
```

#### Step 3: Register as Configuration Properties (if requested)

If the user wants it registered:

1. Read `global-config.xml` (or the primary Mule config file under `src/main/mule/`).
2. Check if a `<configuration-properties>` element already references this file. If yes, skip.
3. If `global-config.xml` doesn't exist, create it with the base skeleton:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd">

    <configuration-properties file="{filename}" doc:name="Configuration Properties"/>

</mule>
```

4. If `global-config.xml` exists, add:

```xml
<configuration-properties file="{filename}" doc:name="Configuration Properties"/>
```

#### Step 4: Confirm

Report: file path created, number of properties, whether it was registered. Keep to 2-3 sentences.

---

## EDIT FILE — Edit an Existing Properties File

### Phase 1: Questions

#### Question 1 — Identify the File

Scan `{project-root}/src/main/resources/` for `.yaml`, `.yml`, and `.properties` files. List them:

> I found these properties files in your project:
>
> | # | File | Keys |
> |---|------|------|
> | 1 | `config.yaml` | 12 keys |
> | 2 | `secure.yaml` | 3 keys |
> | 3 | `dev.yaml` | 8 keys |
>
> **Which file would you like to edit?**

If only one file exists, use it directly without asking.

**STOP.**

#### Question 2 — What to Change

Read the selected file and display its current contents:

> Here are the current properties in `{filename}`:
>
> | Key | Value |
> |-----|-------|
> | `http.port` | `8081` |
> | `db.host` | `localhost` |
> | ... | ... |
>
> **What would you like to do?**
> - **Add** new key-value pairs
> - **Modify** existing values
> - **Remove** specific keys
>
> Provide the changes (e.g., "add api.key=my-key-123", "change db.host to prod-db.example.com", "remove db.debug")

**STOP.**

### Phase 2: Execution

#### Step 1: Apply Changes

1. Read the properties file.
2. Apply the user's requested changes (add, modify, or remove keys).
3. Write the updated file, preserving existing structure, comments, and formatting.

#### Step 2: Validate Placeholder References

After editing, scan all Mule XML files for `${key}` placeholders that reference modified keys. If a key was removed and still referenced, warn the user:

> Warning: The key `{key}` was removed but is still referenced in:
> - `{file}:{line}` — `${key}`

#### Step 3: Confirm

Report: which file was updated, what changes were made. Keep to 2-3 sentences.

---

## SETUP ENV — Multi-Environment Configuration

### Phase 1: Questions

#### Question 1 — Environments

> I'll set up multi-environment configuration for your project.
>
> **Which environments do you need?** (e.g., dev, QA, prod — or provide your own list)
>
> **What default environment should be active for local development?** (e.g., `dev`)

**STOP.**

#### Question 2 — Environment-Specific Properties

> **What properties differ between environments?** Provide the keys and their values per environment, or say "default" and I'll create template files with placeholder values.
>
> Example:
> ```
> http.port: dev=8081, qa=8081, prod=8443
> db.host: dev=localhost, qa=qa-db.internal, prod=prod-db.internal
> db.password: dev=devpass, qa=${secure::db.password}, prod=${secure::db.password}
> ```
>
> **Do you also want common properties** that are shared across all environments in a base `config.yaml`? (yes/no)

**STOP.**

### Phase 2: Execution

#### Step 1: Locate the Mule Project

Use Glob to search for `**/pom.xml`. If multiple projects found, ask the user which one.

#### Step 2: Create Environment-Specific Files

For each environment, create `{project-root}/src/main/resources/{env}.yaml`:

**dev.yaml:**
```yaml
http:
  port: "8081"
db:
  host: "localhost"
  password: "devpass"
```

**qa.yaml:**
```yaml
http:
  port: "8081"
db:
  host: "qa-db.internal"
  password: "${secure::db.password}"
```

**prod.yaml:**
```yaml
http:
  port: "8443"
db:
  host: "prod-db.internal"
  password: "${secure::db.password}"
```

#### Step 3: Create Base config.yaml (if requested)

If the user wants common properties, create `config.yaml` with shared values.

#### Step 4: Configure Global Properties & Dynamic Configuration Properties

In `global-config.xml` (create if missing), add:

```xml
<configuration-properties file="config.yaml" doc:name="Common Configuration"/>
<global-property name="env" value="{default-env}" doc:name="Global Property: env"/>
<configuration-properties file="${env}.yaml" doc:name="Environment Configuration"/>
```

#### Step 5: Confirm and Explain

> **Setup complete.** Created {N} environment files and configured dynamic property resolution.
>
> **How it works:**
> - `<global-property name="env" value="{default}"/>` sets the active environment
> - `<configuration-properties file="${env}.yaml"/>` resolves to the matching file
> - To switch environments at deployment: pass `-Denv=prod` as a system property

---

## REGISTER — Register / Unregister Properties Files

### Register

1. List available files in `src/main/resources/` and show which are already registered.
2. Ask which to register (if not specified).
3. Add `<configuration-properties file="{filename}" doc:name="..."/>` to `global-config.xml`.

### Unregister (Delete Registration)

1. Show registered files.
2. Ask which to unregister.
3. Warn: "Removing this registration means `${...}` placeholders from this file will no longer resolve at runtime."
4. **Wait for explicit confirmation.**
5. Remove the `<configuration-properties>` element from the XML.
6. Do NOT delete the actual file from `src/main/resources/`.

---

## GLOBAL PROPERTY — Manage Inline `<global-property>` Elements

### Create

#### Question 1

> **What name-value pairs would you like to add as global properties?**
>
> Examples:
> - `env = dev`
> - `api.version = 1.0.0`
> - `app.name = my-application`
>
> **Note:** Inline global properties are best for values that control application behavior (environment, version, app name). For connection credentials, use a properties file instead.

**STOP.**

#### Execution

1. Locate `global-config.xml` (create if missing).
2. For each property, add:

```xml
<global-property name="{key}" value="{value}" doc:name="Global Property: {key}"/>
```

3. If a property with the same name already exists, ask whether to replace it.

### Edit

1. List existing global properties.
2. Ask which to edit.
3. **Cannot change:** the `name` attribute.
4. **Can change:** the `value` attribute.
5. Apply the change.

### Delete

1. List existing global properties.
2. Ask which to delete.
3. **Find usages:** Search all Mule XML files and properties files for `${name}` references.
4. Present findings with file/line details.
5. **Wait for explicit confirmation.**
6. Remove the `<global-property>` element.

---

## XML Templates

### Configuration Properties Registration

```xml
<configuration-properties file="config.yaml" doc:name="Configuration Properties"/>
```

### Multi-Environment Setup

```xml
<configuration-properties file="config.yaml" doc:name="Common Configuration"/>
<global-property name="env" value="dev" doc:name="Global Property: env"/>
<configuration-properties file="${env}.yaml" doc:name="Environment Configuration"/>
```

### Inline Global Properties

```xml
<global-property name="env" value="dev" doc:name="Global Property: env"/>
<global-property name="api.version" value="1.0.0" doc:name="Global Property: api.version"/>
<global-property name="app.name" value="inventory-api" doc:name="Global Property: app.name"/>
```

### YAML Properties File Convention

```yaml
http:
  port: "8081"
  host: "0.0.0.0"

db:
  host: "localhost"
  port: "3306"
  name: "mydb"
  username: "admin"
  password: "${secure::db.password}"
```

### Java Properties File Convention

```properties
http.port=8081
http.host=0.0.0.0
db.host=localhost
db.port=3306
db.name=mydb
db.username=admin
db.password=${secure::db.password}
```
