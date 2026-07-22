---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# API Catalog CLI

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

<table><colgroup><col> <col></colgroup><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><a href="#autocomplete-command">api-catalog autocomplete</a></p></div></div></td><td><div><div><p>Configures autocompletion for API Catalog commands</p></div></div></td></tr><tr><td><div><div><p><a href="#conf-command">api-catalog conf</a></p></div></div></td><td><div><div><p>Creates or deletes a credentials configuration file</p></div></div></td></tr><tr><td><div><div><p><a href="#create-descriptor-command">api-catalog create-descriptor</a></p></div></div></td><td><div><div><p>Creates a descriptor file</p></div></div></td></tr><tr><td><div><div><p><a href="#update-descriptor-command">api-catalog update-descriptor</a></p></div></div></td><td><div><div><p>Updates a descriptor file</p></div></div></td></tr><tr><td><div><div><p><a href="#publish-asset-command">api-catalog publish-asset</a></p></div></div></td><td><div><div><p>Publishes assets to Exchange</p></div></div></td></tr></tbody></table>

Discover and catalog your API definitions, documentation files, and associated metadata as part of
an automated process with API Catalog CLI. You can embed the publish asset command in your
automation tools, such as a CI/CD pipeline or custom scripts, to automatically trigger the
publishing of your API assets to Exchange. API Catalog CLI is agnostic of CI/CD tools and runtime
environments.

See [Autocataloging APIs Using API Catalog CLI](../../exchange/apicat-about-api-catalog-cli).

## api-catalog autocomplete

$ api-catalog autocomplete [flags]

This command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p>blank</p></div></div></td><td><div><div><p>Displays instructions for configuring autocompletion</p></div></div></td></tr><tr><td><div><div><p>bash</p></div></div></td><td><div><div><p>Installs autocompletion using Bash shell settings</p></div></div></td></tr><tr><td><div><div><p>zsh</p></div></div></td><td><div><div><p>Installs autocompletion using Z shell settings</p></div></div></td></tr><tr><td><div><div><p>-r, --refresh cache</p></div></div></td><td><div><div><p>Removes the current autocompletion configuration. Use this before running the command with a different shell type.</p></div></div></td></tr></tbody></table>

**Examples**

$ api-catalog autocomplete $ api-catalog autocomplete bash $ api-catalog autocomplete zsh $
api-catalog autocomplete --refresh-cache

> [!WARNING] The API Catalog CLI autocomplete plugin is not currently supported in Windows.

## api-catalog conf

Manage authentication credentials in a configuration file (config.json) by adding and removing key
value pairs. Set one key value pair per command execution.

> api-catalog conf <authkey> <authkeyvalue> [flags]

`<authkey>`  
The authentication key name. Possible key names are: username password client_id client_secret host
environment organization

`<authkeyvalue>`  
The value for the specified authentication key.

This command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>-d</code>, <code>--delete</code></p></div></div></td><td><div><div><p>Deletes the config file entry for the given key</p></div></div></td></tr><tr><td><div><div><p><code>-h</code>, <code>--help</code></p></div></div></td><td><div><div><p>Shows the help for this command</p></div></div></td></tr><tr><td><div><div><p><code>-k</code>, <code>--key=key</code></p></div></div></td><td><div><div><p>Shows the value that corresponds with the given key</p></div></div></td></tr><tr><td><div><div><p><code>-v</code>, <code>--value=value</code></p></div></div></td><td><div><div><p>Shows the key that corresponds with the given value</p></div></div></td></tr></tbody></table>

## api-catalog create-descriptor

> api-catalog create-descriptor [flags]

This command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>-d</code>, <code>--file=file</code></p></div></div></td><td><div><div><p>Default: <code>catalog.yaml</code></p></div><div><p>The name and location in which to save the generated catalog descriptor file</p></div></div></td></tr><tr><td><div><div><p><code>--external</code></p></div></div></td><td><div><div><p>Generates an <code>exchange.json</code> file for each API described in the descriptor file and adds a reference to each of those in the descriptor file using the <code>ref</code> tag in the <code>projects</code> section</p></div></div></td></tr></tbody></table>

## api-catalog update-descriptor

> api-catalog update-descriptor [flags]

This command accepts the following flag:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>-d</code>, <code>--descriptor-file=descriptor-file</code></p></div></div></td><td><div><div><p>Default: <code>catalog.yaml</code></p></div><div><p>The name and location in which to save the updated catalog descriptor file information</p></div></div></td></tr></tbody></table>

## api-catalog publish-asset

> api-catalog publish-asset [flags]

This command accepts the
[general and authentication flags](../../exchange/apicat-use-api-catalog-cli#common-options) in
addition to the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--async</code></p></div></div></td><td><div><div><p>Runs the publish job asynchronously.</p></div></div></td></tr><tr><td><div><div><p><code>-d</code>, <code>--descriptor-file=descriptor-file</code></p></div><div><p>or</p></div><div><p>ANYPOINT_DESCRIPTOR_FILE environment variable</p></div></div></td><td><div><div><p>Default: ./catalog.yaml</p></div><div><p>The name and location of the catalog descriptor file.</p></div><div><ul><li><p>If the file does not exist, no assets are cataloged.</p></li><li><p>If the file exists but is empty, the command creates and prints the catalog descriptor YAML results. It outputs cataloging information for all API definitions it finds in the full directory tree relative to the current working directory.</p></li><li><p>If a valid YAML file exists, the command catalogs the assets as specified.</p></li></ul></div><div><p>See <a href="../../exchange/apicat-create-descriptor-file-cli#create-desc-file-cli">Create a Descriptor File Using the CLI</a>.</p></div></div></td></tr><tr><td><div><div><p><code>--dry-run</code></p></div></div></td><td><div><div><p>Runs the command to verify that the descriptor file is valid. No APIs are published.</p></div></div></td></tr><tr><td><div><div><p><code>--force-publish</code></p></div></div></td><td><div><div><p>Bypasses the comparison and creates a new version of the asset in Exchange regardless of the content.</p></div></div></td></tr><tr><td><div><div><p><code>--force-update-metadata</code></p></div></div></td><td><div><div><p>Updates the asset’s metadata, such as tags, in the latest version in Exchange regardless of the content. This does not republish the asset.</p></div></div></td></tr><tr><td><div><div><p><code>--json</code></p></div></div></td><td><div><div><p>Prints the execution result in JSON format.</p></div></div></td></tr><tr><td><div><div><p><code>-s</code>, <code>--silent</code></p></div></div></td><td><div><div><p>Enables silent logging.</p></div></div></td></tr><tr><td><div><div><p><code>-t</code>, <code>--trigger-criteria=&lt;descriptor-tag&gt;:&lt;value&gt;</code> <code>--trigger-criteria=&lt;descriptor-tag&gt;:value</code></p></div></div></td><td><div><div><p>This flag works in conjunction with the <code>triggerConditions</code> section in the descriptor file. For each run of the <code>api-catalog publish-asset</code> command, the trigger values are compared to trigger condition values in the descriptor file to determine whether to publish the APIs described in the descriptor file. To match multiple conditions, specify separate <code>--trigger-criteria</code> flags for each condition. For the APIs to be published, all trigger conditions set in the descriptor file must be matched by <code>--trigger-criteria</code> flag values.</p></div><div><p>Example:</p></div><div><p><code>--trigger-criteria=branch:main --trigger-criteria=anytag:release/ --trigger=user:admin</code></p></div><div><p>See <a href="../../exchange/apicat-create-descriptor-file-manually#descriptor-yaml">Descriptor YAML Schema</a>.</p></div></div></td></tr><tr><td><div><div><p><code>-v</code>, <code>--verbose</code></p></div></div></td><td><div><div><p>Enables verbose logging.</p></div></div></td></tr><tr><td><div><div><p><code>--version-strategy-criteria=&lt;descriptor-tag&gt;:&lt;value&gt;</code></p></div></div></td><td><div><div><p>This flag works in conjunction with the <code>versionStrategyConditions</code> section in the descriptor file. The <code>api-catalog publish-asset</code> command compares the version strategy criteria values to version strategy condition values in the descriptor file to determine the version strategy to use to publish the APIs. To match multiple conditions, specify separate <code>--version-strategy-criteria</code> flags for each condition.</p></div><div><p>Example:</p></div><div><p><code>--version-strategy-criteria=branch:main --version-strategy-criteria=anytag:release/ --version-strategy-criteria=user:admin</code></p></div><div><p>See <a href="../../exchange/apicat-create-descriptor-file-manually#descriptor-yaml">Descriptor YAML Schema</a>.</p></div></div></td></tr></tbody></table>

## General and Authentication Flags

Following are the general and authentication flags for commands that authenticate to Anypoint
Platform:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--client_id=client_id</code></p></div><div><p>or</p></div><div><p><code>ANYPOINT_CLIENT_ID</code> environment variable</p></div></div></td><td><div><div><p>Connected app client ID</p></div><div><p>See <a href="../../exchange/apicat-use-api-catalog-cli#authentication">Authentication</a>.</p></div></div></td></tr><tr><td><div><div><p><code>--client_secret</code></p></div><div><p>or</p></div><div><p><code>ANYPOINT_CLIENT_SECRET</code> environment variable</p></div></div></td><td><div><div><p>Prompt for the connected app secret for the client ID</p></div><div><p>See <a href="../../exchange/apicat-use-api-catalog-cli#authentication">Authentication</a>.</p></div></div></td></tr><tr><td><div><div><p><code>--collectMetrics</code></p></div><div><p>or</p></div><div><p><code>COLLECT_METRICS</code> environment variable</p></div></div></td><td><div><div><p>Not currently used</p></div></div></td></tr><tr><td><div><div><p><code>--environment=environment</code></p></div><div><p>or</p></div><div><p><code>ANYPOINT_ENV</code> environment variable</p></div></div></td><td><div><div><p>The name of the Anypoint Platform environment where the APIs are cataloged</p></div></div></td></tr><tr><td><div><div><p><code>--host=host</code></p></div><div><p>or</p></div><div><p><code>ANYPOINT_HOST</code> environment variable</p></div></div></td><td><div><div><p>Default:</p></div><div><div><pre>anypoint.mulesoft.com</pre></div></div><div><p>The Anypoint Platform base URL without the protocol</p></div><div><p>For the US Anypoint Platform, use:</p></div><div><div><pre>anypoint.mulesoft.com</pre></div></div><div><p>For the European Anypoint Platform, use:</p></div><div><div><pre>eu1.anypoint.mulesoft.com</pre></div></div></div></td></tr><tr><td><div><div><p><code>--organization=organization</code></p></div><div><p>or</p></div><div><p><code>ANYPOINT_ORG</code> environment variable</p></div></div></td><td><div><div><p>The ID of the Anypoint Platform organization where the APIs are cataloged</p></div></div></td></tr><tr><td><div><div><p><code>-p</code>, <code>--password</code></p></div><div><p>or</p></div><div><p><code>ANYPOINT_PASSWORD</code> environment variable</p></div></div></td><td><div><div><p>Anypoint user password</p></div><div><p>See <a href="../../exchange/apicat-use-api-catalog-cli#authentication">Authentication</a>.</p></div></div></td></tr><tr><td><div><div><p><code>-u</code>, <code>--username=username</code></p></div><div><p>or</p></div><div><p><code>ANYPOINT_USERNAME</code> environment variable</p></div></div></td><td><div><div><p>Anypoint username</p></div><div><p>See <a href="../../exchange/apicat-use-api-catalog-cli#authentication">Authentication</a>.</p></div></div></td></tr></tbody></table>
