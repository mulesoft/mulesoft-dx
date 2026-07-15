---
name: secure-mule-app
description: Configure and implement Mule secure properties for encrypting sensitive data in Mule applications. Use this when the user wants to use/implement/add/configure Mule secure properties, secure configuration, or encrypt credentials in their Mule project. DO NOT use for securing an API or MCP server with a platform policy (use skill secure-api or skill secure-mcp-server) — this skill only encrypts values inside a local Mule project.
license: Apache-2.0
compatibility: Requires Java 8+ (runs the MuleSoft secure-properties-tool JAR) and curl or wget to download the JAR if not already bundled. Operates on a local Mule 4 project (src/main/mule, src/main/resources, pom.xml).
allowed-tools: Bash Read Write Edit AskUserQuestion
metadata:
  author: mule-dx-tooling
  version: "1.0.0"
---

You are a MuleSoft security specialist helping to secure a Mule application by encrypting sensitive data.

## When to Use This Skill

**Use this skill when the user asks to:**

- "Encrypt credentials / secrets in my Mule app"
- "Set up / add / configure Mule secure properties"
- "Secure my configuration" or "protect passwords in my Mule project"

**Trigger keywords:** secure properties · encrypt credentials · secure configuration · `${secure::}` · secure-properties-tool.

**Do NOT use this skill when:** the user wants to protect an API or MCP server with a
platform policy (rate limiting, OAuth2, IP allowlist) — use skill secure-api or
skill secure-mcp-server. This skill only encrypts values *inside* a local Mule project.

## Prerequisites

Before starting, ensure:

```bash
java -version    # Java 8+ required — the secure-properties-tool JAR runs on the JVM
```

- **A Mule 4 project** in the current working directory (must contain `src/main/mule`).
- **The secure-properties-tool JAR** — bundled at `assets/secure-properties-tool.jar`.
  If absent, Step 3 downloads it automatically via `curl`/`wget` from the MuleSoft docs site.

## Bundled assets

| Asset | Purpose | Source |
| --- | --- | --- |
| `assets/secure-properties-tool.jar` | CLI tool that encrypts each sensitive value (`java -cp … SecurePropertiesTool string encrypt …`). | Reused if present; else downloaded in Step 3 from `https://docs.mulesoft.com/mule-runtime/4.4/_attachments/secure-properties-tool.jar`. |

## Your Task

Scan the Mule application for sensitive data (usernames, passwords, URLs, API keys, secrets, tokens) in both XML files (`src/main/mule`) and properties files (`src/main/resources`), then encrypt them using MuleSoft's secure properties configuration.

## Workflow

## Step 1: Verify Project Structure
- Check that `src/main/mule` directory exists in the current working directory
- If not found, inform the user this doesn't appear to be a Mule application project

## Step 2: Get User Configuration
Ask the user for the following information, **one question at a time**:

**First, ask for the encryption key:**
- "What encryption key would you like to use for encrypting values? (This will be used to encrypt and decrypt your secure properties)"

**Then, ask for the encryption algorithm:**
- "Which encryption algorithm would you like to use? (Enter the number)"
  1. `AES` - Advanced Encryption Standard (128, 192, or 256 bit)
  2. `Blowfish` - Fast block cipher
  3. `DES` - Data Encryption Standard
  4. `DESede` - Triple DES
  5. `RC2` - Rivest Cipher 2

**Next, ask for the cipher mode:**
- "Which cipher mode would you like to use? (Enter the number)"
  1. `CBC` - Cipher Block Chaining
  2. `CFB` - Cipher Feedback
  3. `ECB` - Electronic Codebook
  4. `OFB` - Output Feedback
  5. `GCM` - Galois/Counter Mode (for AES only)

**Finally, ask about backup:**
- "Would you like to save the unencrypted values to `local.properties` for reference? (yes/no)"

## Step 3: Locate or Download Secure Properties Tool JAR

**Before checking, explicitly tell the user what you are doing and why.** Do not say a vague phrase like "let me check for the JAR" — the user will not know which JAR you mean. Instead, say something like:

> "Checking for the MuleSoft **secure-properties-tool JAR** (the CLI tool used to encrypt your sensitive values). If it's not already downloaded locally, I'll fetch it from the MuleSoft docs site."

- Check if the JAR already exists at: `{skill_base_directory}/assets/secure-properties-tool.jar`
- If it exists, tell the user it was found locally and will be reused, then proceed
- If it does **not** exist, tell the user it wasn't found and you're downloading it, then download it automatically:
  1. Create the assets directory if needed: `mkdir -p {skill_base_directory}/assets`
  2. Download using `curl` (preferred — available by default on macOS):
     ```bash
     curl -L -o "{skill_base_directory}/assets/secure-properties-tool.jar" \
       "https://docs.mulesoft.com/mule-runtime/4.4/_attachments/secure-properties-tool.jar"
     ```
  3. If `curl` is not available, try `wget`:
     ```bash
     wget -O "{skill_base_directory}/assets/secure-properties-tool.jar" \
       "https://docs.mulesoft.com/mule-runtime/4.4/_attachments/secure-properties-tool.jar"
     ```
  4. After downloading, verify the file exists and is non-empty before proceeding
- If the download fails, inform the user and provide the manual download URL:
  `https://docs.mulesoft.com/mule-runtime/4.4/_attachments/secure-properties-tool.jar`
- Note: Maven (`mvn`) cannot be used here — this JAR is hosted on a documentation site, not a Maven repository

## Step 4: Scan XML Files and Properties Files
Scan for sensitive data in two locations:

#### A. Scan XML Files
Scan all XML files in `src/main/mule` (including subdirectories) for sensitive attributes:

**Patterns to detect (case-insensitive)**:
- `password`, `passwd`, `pwd`
- `secret`, `apikey`, `api-key`, `api_key`
- `token`, `auth`, `credential`
- `username`, `user`, `login`
- `url`, `uri`, `host`, `endpoint`
- `clientId`, `client-id`, `client_id`
- `clientSecret`, `client-secret`, `client_secret`
- `key`, `private`, `certificate`

**Important**: Flag attributes that:
1. Match one of the patterns above
2. Have a non-empty value
3. Are NOT already using secure property placeholders (don't start with `${secure::`)
4. **Include attributes using property placeholders** (like `${email.password}` or `${db.username}`) - these need to be converted to `${secure::}` format

#### B. Scan Properties/YAML Files
- Scan `src/main/resources` directory (including subdirectories) for existing `.properties` and `.yaml`/`.yml` files
- For each file found, check if it contains sensitive data using the same patterns above
- **Track property names** that contain sensitive values (e.g., `email.password=secret` → track `email.password`)
- These values will need to be encrypted and moved to `.secure.properties` files

## Step 5: Display Findings
Show a summary of all sensitive data found:
- **XML files**: List each file with sensitive attributes (hardcoded values or property placeholders)
- **Properties files**: List files containing sensitive properties with their property names
- Show the attribute/property names (but NOT the values for security)
- Provide a count of total items found

If no sensitive data is found, inform the user and exit.

## Step 6: Get User Confirmation

**[GATE] WAIT for explicit user confirmation before modifying any files. Do not
proceed to Step 7 until the user approves. If the user says no, stop immediately.**

Before making ANY changes, show the user:
- What files will be modified
- What actions will be taken (update pom.xml, create secure properties, encrypt values, update XML files, create/update global-configs.xml)
- Number of values that will be encrypted using the secure-properties-tool.jar

If user says no, stop immediately.

## Step 7: Determine Property Keys
For each sensitive value found, determine the property key name:

#### A. For values already in properties files:
- **Use the existing property name** from the properties file
- Example: If `local.properties` contains `email.password=secret`, use `email.password`
- This ensures XML references like `${email.password}` will match after conversion to `${secure::email.password}`

#### B. For hardcoded values in XML:
Generate a contextual property key name based on:

1. **Config/connector type**: Extract from XML element or parent element
   - `<db:mysql-config>` → `mysql`
   - `<http:request-config>` → `http`
   - `<sfdc:sfdc-config>` → `salesforce`
   - `<mongo:config>` → `mongodb`
   - `<ftp:config>` → `ftp`

2. **Attribute name**: Use the actual attribute name
   - `password` → `password`
   - `username` → `username`
   - `url` → `url`
   - `clientId` → `clientId`

3. **Config name attribute** (if available): Use the `name` or `doc:name` attribute value
   - `<db:mysql-config name="MySQL_Config">` → use `MySQL_Config`

**Property key format**: `{connector}.{config-name}.{attribute}` or `{connector}.{attribute}`

**Examples**:
- MongoDB password: `mongodb.password` or `mongodb.MongoDB_Config.password`
- MySQL username: `mysql.username` or `mysql.Database_Config.username`
- HTTP API key: `http.apikey` or `http.API_Config.apikey`
- Salesforce client secret: `salesforce.clientSecret`

If the same property key would be generated multiple times, append a number: `mongodb.password.1`, `mongodb.password.2`

## Step 8: Encrypt Values
After user confirmation, batch encrypt all unique sensitive values:
- Collect all unique sensitive values that need encryption
- For each value, run the encryption command without prompting:
  ```bash
  java -cp {skill_base_directory}/assets/secure-properties-tool.jar com.mulesoft.tools.SecurePropertiesTool string encrypt <algorithm> <mode> <key> <value>
  ```
- Store each encrypted value with its generated property key
- Execute all encryption commands in sequence without asking for additional permission

## Step 9: Create/Update Properties Files

**Secure Properties File** (`src/main/resources/local.secure.properties`):
- Check if file exists
- If exists: append new encrypted properties
- If not: create the file and directory structure
- Format: `property.key=![encrypted_value]`

**Backup Properties File** (`src/main/resources/local.properties`) - *Optional*:
- Only create if user chose to backup original values
- Write unencrypted property values for reference
- Format: `property.key=original_value`
- Add warning comment at top of file:
  ```text
  # WARNING: This file contains unencrypted sensitive values for reference only
  # DO NOT commit this file to version control
  # Add this file to .gitignore
  ```

## Step 10: Update XML Files
For each XML file with sensitive data, perform two types of updates:

#### A. Replace hardcoded values with secure property placeholders:
- Replace each hardcoded sensitive value with `${secure::property.key.name}`

Example:
```xml
<!-- Before -->
<mongo:config name="MongoDB_Config">
    <mongo:connection username="admin" password="secret123" database="mydb" />
</mongo:config>

<!-- After -->
<mongo:config name="MongoDB_Config">
    <mongo:connection username="${secure::mongodb.MongoDB_Config.username}"
                      password="${secure::mongodb.MongoDB_Config.password}"
                      database="mydb" />
</mongo:config>
```

#### B. Update existing property placeholders to use secure:: prefix:
- If XML already uses property placeholders like `${email.password}`, update them to `${secure::email.password}`
- **IMPORTANT**: Only update placeholders for properties that were encrypted (moved to `.secure.properties`)

Example:
```xml
<!-- Before -->
<logger message="${email.username}"/>
<logger message="${email.password}"/>

<!-- After -->
<logger message="${secure::email.username}"/>
<logger message="${secure::email.password}"/>
```

Write the updated XML back to disk after making all changes.

## Step 11: Create/Update global-configs.xml
Check if `src/main/mule/global-configs.xml` exists:

**If it exists**:
- Read the file and check if secure-properties configuration already exists
- If not present, inform the user they need to add this configuration manually:

```xml
<secure-properties:config name="Secure_Properties_Config"
    file="local.secure.properties"
    key="${encryption.key}"
    doc:name="Secure Properties Config">
    <secure-properties:encrypt algorithm="ALGORITHM" mode="MODE" />
</secure-properties:config>
```

**If it doesn't exist**:
- Create a new `global-configs.xml` file with the proper Mule XML structure
- Include the secure-properties namespace and configuration
- Add the secure properties config element

Template:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:secure-properties="http://www.mulesoft.org/schema/mule/secure-properties"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/secure-properties http://www.mulesoft.org/schema/mule/secure-properties/current/mule-secure-properties.xsd">

    <secure-properties:config name="Secure_Properties_Config"
        file="local.secure.properties"
        key="${encryption.key}"
        doc:name="Secure Properties Config">
        <secure-properties:encrypt algorithm="ALGORITHM" mode="MODE" />
    </secure-properties:config>

</mule>
```

## Step 12: Update pom.xml with Secure Properties Dependency
- Read the `pom.xml` file in the project root
- Check if the `mule-secure-configuration-property-module` dependency already exists
- If not present, add it to the `<dependencies>` section:
  ```xml
  <dependency>
      <groupId>com.mulesoft.modules</groupId>
      <artifactId>mule-secure-configuration-property-module</artifactId>
      <version>1.3.0</version>
      <classifier>mule-plugin</classifier>
  </dependency>
  ```
- If the dependency already exists, inform the user and skip this step

## Step 13: Update launch.json with Encryption Key
- Check if `.vscode/launch.json` exists in the project root
- If it exists:
  - Read the file
  - Find the configuration(s) for running the Mule application
  - Look for the `mule.runtime.args` field in each configuration
  - If `mule.runtime.args` exists, append `-M-Dencryption.key=<their-encryption-key>` to the existing value
  - If `mule.runtime.args` doesn't exist, add it with the value `-M-Dencryption.key=<their-encryption-key>`
  - Write the updated launch.json back to disk
  - **Check .gitignore**: Ensure `.vscode/` or `.vscode/launch.json` is in `.gitignore`
    - If `.gitignore` exists, check if it contains `.vscode/` or `.vscode/launch.json`
    - If neither pattern is found, add `.vscode/` to `.gitignore`
    - If `.gitignore` doesn't exist, create it and add `.vscode/`
- If it doesn't exist, inform the user they need to manually add the encryption key to their run configuration:
  ```
  Add to VM arguments:
  -M-Dencryption.key=<their-encryption-key>

  Or set as environment variable:
  export ENCRYPTION_KEY=<their-encryption-key>
  ```

## Step 14: Protect Existing Properties/YAML Files in .gitignore
- For each properties/YAML file that contained sensitive data (identified in Step 4):
  - Add the file to `.gitignore` to prevent committing sensitive data
  - This includes files like `local.properties`, `dev.properties`, etc.

## Step 15: Final Summary
Provide a completion summary:
- ✅ Number of XML files scanned
- ✅ Number of properties files scanned
- ✅ Number of sensitive values encrypted
- ✅ Secure properties file created/updated (e.g., `local.secure.properties`)
- ✅ XML files updated:
  - Hardcoded values replaced with `${secure::}` placeholders
  - Existing property references updated from `${property}` to `${secure::property}`
- ✅ global-configs.xml configured with secure properties
- ✅ pom.xml updated with secure properties dependency
- ✅ launch.json updated with encryption key
- ✅ Existing properties/YAML files with sensitive data protected in .gitignore

**Important reminders**:
- DO NOT commit `local.secure.properties` to version control
- DO NOT commit `local.properties` (if created) to version control
- DO NOT commit any properties/YAML files containing sensitive data (now in .gitignore)
- Verify that property names in `.secure.properties` match references in XML files
- Test the application with the encryption key before committing changes
- Review all XML file changes to ensure `${secure::}` prefix was added correctly

## Best Practices

- Never log or display sensitive values in plain text
- Always ask for confirmation before making changes
- Remind user not to commit secure properties file
- Suggest adding `.gitignore` entry

## Troubleshooting

**Java is not installed:** `java -version` fails. Encryption cannot run — inform the user and exit; direct them to install a JRE/JDK 8+.

**JAR download fails:** `curl`/`wget` cannot reach the docs site. Provide the manual download URL (`https://docs.mulesoft.com/mule-runtime/4.4/_attachments/secure-properties-tool.jar`) and ask the user to place it at `assets/secure-properties-tool.jar`.

**Encryption fails for a value:** show the error and skip that value; continue with the rest, then report which values were skipped.

**XML parsing fails:** show a warning and continue with the other files — do not abort the whole run for one malformed file.

**File writes fail:** show the error and list what was already completed, so the user knows the partial state.

## Related Skills

- **skill secure-api**: Protect an API instance with a platform policy (rate limiting, OAuth2, IP allowlist). Use instead when securing at the API layer, not the project files.
- **skill secure-mcp-server**: Apply a policy to an MCP server. Use instead when securing an MCP server rather than encrypting local Mule config.
- **skill build-mule-integration**: Build a Mule integration project from scratch; run this skill afterward to encrypt any credentials it introduced.

## Reference Documentation

For more information, refer to:
https://docs.mulesoft.com/anypoint-code-builder/int-create-secure-configs
