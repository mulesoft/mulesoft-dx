---
product: Anypoint CLI
version: 4.x
is-latest-version: true
---

# CLI for API Governance

> For the full documentation index, see: https://docs.mulesoft.com/llms.txt

Use the `governance` commands to automate your API Governance processes. For more information about
how to use these commands, refer to the [API Governance documentation](../../api-governance/).

<table><colgroup><col> <col></colgroup><tbody><tr><td><p>Command</p></td><td><p>Description</p></td></tr><tr><td><p><a href="#governance-api-evaluate">governance:api:evaluate</a></p></td><td><p>Evaluates filter criteria to determine which rulesets apply to APIs that meet that criteria</p></td></tr><tr><td><p><a href="#governance-api-inspect">governance:api:inspect</a></p></td><td><p>Inspects an API specification and lists its schemas</p></td></tr><tr><td><p><a href="#governance-api-validate">governance:api:validate</a></p></td><td><p>Validates an API specification against a specified governance ruleset</p></td></tr><tr><td><p><a href="#governance-document">governance:document</a></p></td><td><p>Creates the documentation file for a governance ruleset definition</p></td></tr><tr><td><p><a href="#governance-profile-create">governance:profile:create</a></p></td><td><p>Creates an active governance profile</p></td></tr><tr><td><p><a href="#governance-profile-delete">governance:profile:delete</a></p></td><td><p>Deletes a governance profile</p></td></tr><tr><td><p><a href="#governance-profile-info">governance:profile:info</a></p></td><td><p>Lists information for a specific governance profile ID</p></td></tr><tr><td><p><a href="#governance-profile-list">governance:profile:list</a></p></td><td><p>Lists all governance profiles for an organization</p></td></tr><tr><td><p><a href="#governance-profile-update">governance:profile:update</a></p></td><td><p>Updates a governance profile</p></td></tr><tr><td><p><a href="#governance-ruleset-clone">governance:ruleset:clone</a></p></td><td><p>Clones a governance ruleset and applies specified updates to rules</p></td></tr><tr><td><p><a href="#governance-ruleset-classes">governance:ruleset:classes</a></p></td><td><p>Lists the target classes available for governance rulesets, grouped by prefix</p></td></tr><tr><td><p><a href="#governance-ruleset-completions">governance:ruleset:completions</a></p></td><td><p>Returns context-aware completions at a cursor position in a ruleset YAML file</p></td></tr><tr><td><p><a href="#governance-ruleset-constraints">governance:ruleset:constraints</a></p></td><td><p>Lists valid constraints by property type</p></td></tr><tr><td><p><a href="#governance-ruleset-domains">governance:ruleset:domains</a></p></td><td><p>Lists available metadata domains for governance rulesets</p></td></tr><tr><td><p><a href="#governance-ruleset-generate">governance:ruleset:generate</a></p></td><td><p>Returns context and instructions for generating a ruleset from a natural-language description</p></td></tr><tr><td><p><a href="#governance-ruleset-info">governance:ruleset:info</a></p></td><td><p>Lists ruleset rules</p></td></tr><tr><td><p><a href="#governance-ruleset-init">governance:ruleset:init</a></p></td><td><p>Initializes a governance ruleset definition based on a data schema</p></td></tr><tr><td><p><a href="#governance-ruleset-properties">governance:ruleset:properties</a></p></td><td><p>Lists the properties and types for a target class</p></td></tr><tr><td><p><a href="#governance-ruleset-resolve">governance:ruleset:resolve</a></p></td><td><p>Resolves a user-facing term to its canonical target class and property path</p></td></tr><tr><td><p><a href="#governance-ruleset-simplify">governance:ruleset:simplify</a></p></td><td><p>Simplifies a ruleset by flattening nested paths and removing redundant logical wrappers</p></td></tr><tr><td><p><a href="#governance-ruleset-validate">governance:ruleset:validate</a></p></td><td><p>Validates a governance ruleset definition’s format</p></td></tr><tr><td><p><a href="#governance-ruleset-validate-authoring">governance:ruleset:validate-authoring</a></p></td><td><p>Validates a ruleset against the authoring model</p></td></tr><tr><td><p><a href="#governance-ruleset-version">governance:ruleset:version</a></p></td><td><p>Shows the governance ruleset tooling version</p></td></tr></tbody></table>

## governance:api:evaluate

`> governance:api:evaluate [flags]`

Evaluates specified filters to determine the rulesets that would be applied to your APIs that meet
that criteria.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--api=&lt;api&gt;</code></p></div></div></td><td><div><div><p>The API project against which you want to evaluate. The command uses the criteria in the project’s <code>exchange.json</code> file.</p></div></div></td></tr><tr><td><div><div><p><code>--criteria &lt;filtertype:filtervalue&gt;,…​</code></p></div></div></td><td><div><div><p>Enables you to apply filters to select the list of APIs to which the profile rulesets apply. Specify a list of comma-separated filters where each filter has a type and value in the format <code>filtertype:filtervalue</code>.</p></div><div><p>Available filters include:</p></div><div><ul><li><p><code>scope</code>: API type. Supported values are: <code>async-api</code>, <code>http-api</code>, or <code>rest-api</code>.</p></li><li><p><code>tag</code>: Tag defined for APIs in Exchange.</p></li><li><p><code>category</code>: Category defined for APIs in Exchange, where the filter value is specified in two parts as <code>categoryName:value</code>.</p></li><li><p><code>env-type</code>: Environment type. Supported values are: <code>any</code>, <code>production</code>, or <code>sandbox</code>.</p></li><li><p><code>env-id</code>: The ID for the environment name in API Manager. You can get this value using <strong>API Manager</strong> &gt; <strong>Environment information</strong>. See <a href="../../api-manager/latest/environments-concept">Reviewing Environment Concepts</a>.</p><div><p>If <code>env-type</code> or <code>env-id</code> is used, the <strong>API Instance</strong> filter is set in the profile, so that only APIs that have instances are filtered.</p></div><div><p>To deselect the <strong>API Instance</strong> filter in the profile using the CLI, update the profile using the <code>--criteria</code> flag with neither <code>env-type</code> nor <code>env-id</code>.</p></div></li></ul></div><div><p>Example: tag:tag1,category:category1:value,category:category2:value2,scope:rest-api,scope:async-api,env-type:production</p></div></div></td></tr></tbody></table>

> [!NOTE] This command must be run with either the `--criteria` or the `--api` flag.

**Example commands:**

`anypoint-cli-v4 governance:api:evaluate --criteria "tag:best,category:API Type:Experience API,scope:rest-api"`

`anypoint-cli-v4 governance:api:evaluate --api order-api-1.0.0-raml.zip`  
where `order-api-1.0.0-raml.zip` contains an API and its `exchange.json` file

**Example output:**

╔════════════════════════════════════════════════════════════════════╗ ║ Ruleset GAV ║
╟────────────────────────────────────────────────────────────────────╢ ║
68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-best-practices/1.5.1 ║
╟────────────────────────────────────────────────────────────────────╢ ║
68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-best-practices/1.0.1 ║
╚════════════════════════════════════════════════════════════════════╝

## governance:api:inspect

`> governance:api:inspect [flags] <api-specification>`

Inspects the API specification passed in `api-specification` and lists all its schemas, such as
headers, requests, and response payloads. You can use this schema information in the
`governance:ruleset:init` command. See [governance:ruleset:init](#governance-ruleset-init).

This command accepts the [default flags](./#default-options).

**Example command:**

```copy
anypoint-cli-v4 governance:api:inspect my-healthcare-api.yaml
```

**Example schema**

```copy
types:
  patientmultipleBirthBoolean:
    properties:
      multipleBirthBoolean:
        description: Whether patient is part of a multiple birth
        type: boolean
  patientmultipleBirthInteger:
    properties:
      multipleBirthInteger:
        description: Whether patient is part of a multiple birth
        type: integer

        .
        .
        .

  PatientEntry:
    type: FHIR_commons.Entry
    properties:
      resource: Patient

  PatientBundle:
    type: FHIR_commons.Bundle
    properties:
      entry?: PatientEntry[]
```

**Example output:**

'patientmultipleBirthBoolean', 'PatientBundle', 'patientmultipleBirthInteger', 'PatientEntry'

## governance:api:validate

`> governance:api:validate <api-specification> [flags]`

Validates the API specification passed in `api-specification` against specified rulesets.

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use "-- " (two dashes followed by a space) before the
> parameter.

You can specify `api-specification` as one of the following:

- An API project ZIP file
- An API project folder
- An asset identifier for an API project, if the `--remote` flag is specified. An asset identifier
  is a group ID, asset ID, and version (GAV) that uniquely identifies each asset in Exchange.

You can specify rulesets against which to validate as follows:

- To use an existing `exchange.json` file that defines your API project’s ruleset dependencies,
  ensure that the `exchange.json` file is included in the folder or ZIP file that you specify in
  `api-specification`. If the `exchange.json` file is present, the command downloads all of the
  ruleset dependencies and validates against those rulesets. The ruleset dependencies are present in
  the `exchange.json` file only if dependencies are defined for that API project in API Designer.
  See [Add Rulesets to Your Project](../../api-governance/find-conformance-issues#add-rulesets).
- To validate directly against rulesets published in Exchange, use the `--remote-rulesets` flag.
- To validate against local rulesets, use the `--rulesets` flag.

> [!NOTE] Duplicate rulesets are not detected, so if you use more than one of the preceding ways of
> identifying rulesets in the same command execution, some rulesets might be validated multiple
> times.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--rulesets &lt;ruleset-yaml-file1&gt; &lt;ruleset-yaml-file2&gt; …​</code></p></div></div></td><td><div><div><p>Local ruleset definitions. The <code>rulesets</code> flag is followed by a list of ruleset YAML files separated by spaces.</p></div></div></td></tr><tr><td><div><div><p><code>--remote-rulesets &lt;ruleset-asset-identifier&gt; &lt;ruleset-asset-identifier&gt; …​</code></p></div></div></td><td><div><div><p>Remote ruleset definitions. The <code>remote-rulesets</code> flag is followed by a list of ruleset asset identifiers separated by spaces. An asset identifier is a group ID, asset ID, and version (GAV) that uniquely identifies each asset in Exchange. For example: <code>&lt;group_id&gt;/&lt;asset_id&gt;/&lt;version&gt;,&lt;group_id&gt;/&lt;asset_id&gt;/&lt;version&gt;</code></p></div><div><p>See <a href="#exchange-asset-identifiers">Get Exchange Asset Identifiers</a>.</p></div></div></td></tr><tr><td><div><div><p><code>--remote</code></p></div></div></td><td><div><div><p>Flag to indicate that the validation should be done against a published API. The value passed in <code>api-specification</code> is the API’s asset identifier. An asset identifier is a group ID, asset ID, and version (GAV) that uniquely identifies each asset in Exchange. For example: <code>&lt;group_id&gt;/&lt;asset_id&gt;/&lt;version&gt;</code></p></div><div><p>See <a href="#exchange-asset-identifiers">Get Exchange Asset Identifiers</a>.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:api:validate /MyApis/order-api-1.0.0-raml.zip

anypoint-cli-v4 governance:api:validate /MyApis/order-api-1.0.0-raml

anypoint-cli-v4 governance:api:validate /MyApis/order-api-1.0.0-raml.zip --rulesets /MyRulesets/ruleset1.yaml /MyRulesets/ruleset2.yaml

anypoint-cli-v4 governance:api:validate /MyApis/order-api-1.0.0-raml.zip --remote-rulesets 68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/1.0.1

anypoint-cli-v4 governance:api:validate 8a840abd-e63a-4f8b-87ab-24052eda2017/order-api/1.0.0 --remote-rulesets 68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/1.0.1 --remote
```

**Example output:**

For a specification that is conformant to the ruleset:

Spec conforms with Ruleset

For a specification that is nonconformant to the ruleset:

Conforms: false Number of results: 3 **(1)**

## Functional Validations

Constraint: http://a.ml/vocabularies/amf/core#declaration-not-found Severity: Violation Message: not
supported scalar for documentation Target: null Range: [(6,3)-(6,3)] Location:
file:///Users/myuser/Downloads/order-api-1.0.0-raml/order-api-1.0.0-raml

## Conformance Validations **(2)**

Constraint:
file:///exchange_modules/68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-best-practices/1.0.0/ruleset.yaml#/encodes/validations/api-must-have-documentation
**(3)** Severity: Warning **(4)** Message: Provide the documentation for the API. **(5)** Target:
amf://id#2 **(6)** Range: [(2,0)-(6,4)] **(7)** Location:
file:///Users/myuser/Downloads/order-api-1.0.0-raml/order-api-1.0.0-raml **(8)**

Constraint:
file:///exchange_modules/8a840abd-e63a-4f8b-87ab-24052eda2017/best-practices-ruleset/1.0.0/bestpractices.yaml#/encodes/validations/api-must-have-documentation
Severity: Violation Message: Provide the documentation for the API Target: amf://id#2 Range:
[(2,0)-(6,4)] Location: file:///Users/myuser/Downloads/order-api-1.0.0-raml/order-api-1.0.0-raml

<table><tbody><tr><td><i data-value="1"></i><b>1</b></td><td>Total of functional and conformance validation issues found</td></tr><tr><td><i data-value="2"></i><b>2</b></td><td>Conformance issues section</td></tr><tr><td><i data-value="3"></i><b>3</b></td><td>Ruleset and rule to which this set of issues applies</td></tr><tr><td><i data-value="4"></i><b>4</b></td><td>Severity level for the issue</td></tr><tr><td><i data-value="5"></i><b>5</b></td><td>Description of the issue</td></tr><tr><td><i data-value="6"></i><b>6</b></td><td>AMF model node ID; for information on the AMF model, see <a href="../../api-governance/create-custom-rulesets">Creating Custom Governance Rulesets</a></td></tr><tr><td><i data-value="7"></i><b>7</b></td><td>Beginning line number and column and end line number and column in the API specification where the issue occurs, where column is the offset from the beginning of the line and numbering for the offset starts at 0</td></tr><tr><td><i data-value="8"></i><b>8</b></td><td>The file in which the issue occurs, either the main file or one of its dependencies</td></tr></tbody></table>

## governance:document

`> governance:document [flags] <ruleset> <doc-file>`

Creates the documentation for the API Governance ruleset definition ZIP file specified in `ruleset`.
It puts the documentation in the `doc-file` ZIP file for you to upload and publish to Exchange.

This command accepts the [default flags](./#default-options).

**Example command:**

```copy
anypoint-cli-v4 governance:document /myrulesetfolder/mynewruleset.yaml /myrulesetfolder/ruleset.doc.zip
```

**Example output:**

validation name [ 'security-fields-operation-empty' ] validation name [
'access-tokens-oauth2-cleartext' ] validation name [ 'insecure-oauth2-grants' ] validation name
[ 'api-keys-in-cookie' ] validation name [ 'api-keys-in-query' ] validation name [
'api-keys-in-header' ] validation name [ 'api-negotiates-authentication' ] validation name [
'insecure-basic-auth' ] validation name [ 'bearer-token-cleartext' ] validation name [
'http-token-cleartext' ] validation name [ 'oauth1-deprecated' ] validation name [
'oauth2-redirections-non-encrypted' ] validation name [ 'unknown-security-scheme' ] validation
name [ 'valid-server-urltemplate' ] validation name [ 'valid-oauth2-redirection-urls' ] Saving
to myRulesetFolder/ruleset.doc.zip

## governance:profile:create

`> governance:profile:create [flags] <profile-name> <ruleset-asset-identifiers>`

Creates an active governance profile using a string value for the new governance profile name
specified in `profile-name`.

You must include `ruleset-asset-identifiers`, a comma-separated list of ruleset asset identifiers,
each of which is the group ID, asset ID, and version (GAV) that uniquely identifies each asset in
Exchange. For example: `<group_id>/<asset_id>/<version>,<group_id>/<asset_id>/<version>`, where
`<version>` is a specific version or `latest`. If you use `latest` as the version, the profile
automatically uses the latest version of the ruleset when versions are published after you create
the profile. See [Get Exchange Asset Identifiers](#exchange-asset-identifiers).

You can use one of the `notify` flags to configure notifications for the profile you are creating.
If you do not use a `notify` flag, no notifications are configured by the command. Notifications are
off by default.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--criteria &lt;filtertype:filtervalue&gt;,…​</code></p></div></div></td><td><div><div><p>Enables you to apply filters to select the list of APIs to which the profile rulesets apply. Specify a list of comma-separated filters where each filter has a type and value in the format <code>filtertype:filtervalue</code>.</p></div><div><p>Available filters include:</p></div><div><ul><li><p><code>scope</code>: API type. Supported values are: <code>async-api</code>, <code>http-api</code>, or <code>rest-api</code>.</p></li><li><p><code>tag</code>: Tag defined for APIs in Exchange.</p></li><li><p><code>category</code>: Category defined for APIs in Exchange, where the filter value is specified in two parts as <code>categoryName:value</code>.</p></li><li><p><code>env-type</code>: Environment type. Supported values are: <code>any</code>, <code>production</code>, or <code>sandbox</code>.</p></li><li><p><code>env-id</code>: The ID for the environment name in API Manager. You can get this value using <strong>API Manager</strong> &gt; <strong>Environment information</strong>. See <a href="../../api-manager/latest/environments-concept">Reviewing Environment Concepts</a>.</p><div><p>If <code>env-type</code> or <code>env-id</code> is used, the <strong>API Instance</strong> filter is set in the profile, so that only APIs that have instances are filtered.</p></div><div><p>To deselect the <strong>API Instance</strong> filter in the profile using the CLI, update the profile using the <code>--criteria</code> flag with neither <code>env-type</code> nor <code>env-id</code>.</p></div></li></ul></div><div><p>Example: tag:tag1,category:category1:value,category:category2:value2,scope:rest-api,scope:async-api,env-type:production</p></div></div></td></tr><tr><td><div><div><p><code>--description &lt;description&gt;</code></p></div></div></td><td><div><div><p>The <code>description</code> flag is followed by a string that is the new governance profile’s description.</p></div></div></td></tr><tr><td><div><div><p><code>--notify-contact</code></p></div></div></td><td><div><div><p>Enables notifications and sets the recipient to the contact set for the API.</p></div></div></td></tr><tr><td><div><div><p><code>--notify-publisher</code></p></div></div></td><td><div><div><p>Enables notifications and sets the recipient to the API publisher.</p></div></div></td></tr><tr><td><div><div><p><code>--notify-others &lt;email ID,email ID,…​&gt;</code></p></div></div></td><td><div><div><p>Enables notifications and sets the recipient to the specified list of email IDs.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:profile:create "OAS Best Practices" 68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/1.0.1 --criteria "tag:oas,category:API Type:Experience API,scope:rest-api" --description "Profile for OAS Best Practices"

anypoint-cli-v4 governance:profile:create "Open API Best Practices" 68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/1.0.1 --criteria "tag:oas,category:API Type:Experience API,scope:rest-api" --description "Profile for OAS Best Practices"

anypoint-cli-v4 governance:profile:create "Anypoint Best Practices" 68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-api-best-practices/1.0.1 --criteria "tag:raml tag:oas category:API Type:Experience API,scope:rest-api" --description "Profile for REST API Best Practices" --notify-publisher  --notify-contact --notify-others a@a.a,b@b.com

anypoint-cli-v4 governance:profile:create "Primary API Standards" 68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/latest,68ef9520-24e9-4cf2-b2f5-620025690913/myorg-best-practices/1.0.2 --criteria "tag:prim,category:API Type:Experience API,scope:rest-api" --description "Profile for Primary API Standards"
```

**Example output:**

Profile Added Id 4f98e59d-8efb-420f-ac95-9cd0af15bd45 Name OAS Best Practices Description Profile
for OAS Best Practices Rulesets
gav://68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/1.0.1 Filter tag:best

## governance:profile:delete

`> governance:profile:delete [flags] <profile-id>`

Deletes a specific governance profile specified by `profile-id`. To get this ID, run the
`governance:profile:info` or `governance:profile:list` command.

This command accepts the [default flags](./#default-options).

**Example command:**

```copy
anypoint-cli-v4 governance:profile:delete 8ffd463f-86b2-4132-afc6-44d179209362
```

**Example output:**

Profile with id 8ffd463f-86b2-4132-afc6-44d179209362 removed

## governance:profile:info

`> governance:profile:info [flags] <profile-id>`

Lists all information for a governance profile ID

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--output &lt;output-format&gt;</code></p></div></div></td><td><div><div><p>Format for the command output. Supported values are <code>table</code> (default) and <code>json</code>.</p></div></div></td></tr></tbody></table>

**Example command:**

```copy
anypoint-cli-v4 governance:profile:info 19fb211b-8775-43cc-865a-46228921d6ed
```

**Example output:**

Id 19fb211b-8775-43cc-865a-46228921d6ed Name Best Practices Description Best Practices Profile
Rulesets 68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-best-practices/1.0.0
8a840abd-e63a-4f8b-87ab-24052eda2017/best-practices-ruleset/1.0.0
68ef9520-24e9-4cf2-b2f5-620025690913/required-examples/1.0.0 Criteria tag:best,category:API
Type:Experience API,scope:rest-api NotificationConfig Contact,Publisher

## governance:profile:list

`> governance:profile:list [flags]`

Lists information for all governance profiles for an organization. You need this information when
updating a governance profile.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--output &lt;output-format&gt;</code></p></div></div></td><td><div><div><p>Format for the command output. Supported values are <code>table</code> (default) and <code>json</code>.</p></div></div></td></tr></tbody></table>

**Example command:**

```copy
anypoint-cli-v4 governance:profile:list
```

**Example output:**

Profile Name Profile Id

Minimum Security Requirements 1f418cf4-b870-4b31-8734-f55f28d45f8f Best Practices
19fb211b-8775-43cc-865a-46228921d6ed New Best Practices 4eaf9176-3ef9-4021-a67c-6e4bc10d3763 OAS
Standards 51ae8795-2278-407e-942f-becba29af986

## governance:profile:update

`> governance:profile:update [flags] <profile-id>`

Updates the governance profile specified in `profile-id`. To get this ID, run the
`governance:profile:info` or `governance:profile:list` command.

You can update the governance profile’s general information, rulesets, filter criteria, and
notification configuration. You can use one of the `notify` flags to update the notification
configuration or turn off notifications. Any changes override existing notification configurations.
If you do not use a `notify` flag, no changes are made to the notification configuration.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--profile-name &lt;profile-name&gt;</code></p></div></div></td><td><div><div><p>The <code>profile-name</code> flag is followed by a string that is the new governance profile name.</p></div></div></td></tr><tr><td><div><div><p><code>--ruleset-gavs &lt;ruleset-gavs&gt;</code></p></div></div></td><td><div><div><p>The <code>ruleset-gavs</code> flag is followed by a list with the asset identifier for each ruleset, formatted as follows: <code>&lt;group_id&gt;/&lt;asset_id&gt;/&lt;version&gt;,&lt;group_id&gt;/&lt;asset_id&gt;/&lt;version&gt;</code>, where <code>&lt;version&gt;</code> is a specific version or <code>latest</code>. An asset identifier is a unique group ID, asset ID, and version (GAV) that identifies each asset in Exchange. If you use <code>latest</code> as the version, the profile automatically uses the latest version of the ruleset when versions are published after you create the profile.</p></div><div><p>See <a href="#exchange-asset-identifiers">Get Exchange Asset Identifiers</a>.</p></div></div></td></tr><tr><td><div><div><p><code>--criteria &lt;filtertype:filtervalue&gt;,…​</code></p></div></div></td><td><div><div><p>Enables you to apply filters to select the list of APIs to which the profile rulesets apply. Specify a list of comma-separated filters where each filter has a type and value in the format <code>filtertype:filtervalue</code>.</p></div><div><p>Available filters include:</p></div><div><ul><li><p><code>scope</code>: API type. Supported values are: <code>async-api</code>, <code>http-api</code>, or <code>rest-api</code>.</p></li><li><p><code>tag</code>: Tag defined for APIs in Exchange.</p></li><li><p><code>category</code>: Category defined for APIs in Exchange, where the filter value is specified in two parts as <code>categoryName:value</code>.</p></li><li><p><code>env-type</code>: Environment type. Supported values are: <code>any</code>, <code>production</code>, or <code>sandbox</code>.</p></li><li><p><code>env-id</code>: The ID for the environment name in API Manager. You can get this value using <strong>API Manager</strong> &gt; <strong>Environment information</strong>. See <a href="../../api-manager/latest/environments-concept">Reviewing Environment Concepts</a>.</p><div><p>If <code>env-type</code> or <code>env-id</code> is used, the <strong>API Instance</strong> filter is set in the profile, so that only APIs that have instances are filtered.</p></div><div><p>To deselect the <strong>API Instance</strong> filter in the profile using the CLI, update the profile using the <code>--criteria</code> flag with neither <code>env-type</code> nor <code>env-id</code>.</p></div></li></ul></div><div><p>Example: tag:tag1,category:category1:value,category:category2:value2,scope:rest-api,scope:async-api,env-type:production</p></div></div></td></tr><tr><td><div><div><p><code>--description &lt;description&gt;</code></p></div></div></td><td><div><div><p>The <code>description</code> flag is followed by a string that is the new governance profile description.</p></div></div></td></tr><tr><td><div><div><p><code>--notify-off</code></p></div></div></td><td><div><div><p>Disables notifications.</p></div></div></td></tr><tr><td><div><div><p><code>--notify-contact</code></p></div></div></td><td><div><div><p>Enables notifications and sets the recipient to the contact set for the API.</p></div></div></td></tr><tr><td><div><div><p><code>--notify-publisher</code></p></div></div></td><td><div><div><p>Enables notifications and sets the recipient to the API publisher.</p></div></div></td></tr><tr><td><div><div><p><code>--notify-others &lt;email ID,email ID,…​&gt;</code></p></div></div></td><td><div><div><p>Enables notifications and sets the recipient to the specified list of email IDs.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:profile:update 4eaf9176-3ef9-4021-a67c-6e4bc10d3763 --profile-name "MyOrg Best Practices"

anypoint-cli-v4 governance:profile:update 19fb211b-8775-43cc-865a-46228921d6ed --criteria `tag:best,category:API Type:Experience API,scope:rest-api`

anypoint-cli-v4 governance profile update 67eff44a-28a3-43d4-93d9-bddedb92c711 --notify-publisher  --notify-contact --notify-others a@a.a,b@b.com

anypoint-cli-v4 governance profile update 67eff44a-28a3-43d4-93d9-bddedb92c711 --notify-off

anypoint-cli-v4 governance profile update 19fb211b-8775-43cc-865a-46228921d6ed --criteria `tag:best,category:API Type:Experience API,scope:rest-api,env-type:production` --ruleset-gavs 68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/latest,68ef9520-24e9-4cf2-b2f5-620025690913/myorg-best-practices/latest
```

**Example output:**

Profile updated 51f9f94c-fb0c-43d4-9895-22c9e64f1537

## governance:ruleset:classes

`> governance:ruleset:classes [flags]`

Lists the target classes available for governance rulesets, grouped by prefix. Prints the total
count of targetable classes.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--domain &lt;domain&gt;</code></p></div></div></td><td><div><div><p>Filters the list to classes belonging to the specified domain. Supported values are <code>api-spec</code>, <code>mcp</code>, <code>api-project</code>, <code>governance</code>, and <code>community</code>. To see all available domains, run the <code>governance:ruleset:domains</code> command.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:classes

anypoint-cli-v4 governance:ruleset:classes --domain api-spec
```

## governance:ruleset:clone

`> governance:ruleset:clone [flags] <ruleset> <new_title> <new_description>`

Clones a governance ruleset to create a new custom ruleset and applies specified updates to rules
based on the flags. The new ruleset is written to standard output.

The `new-title` parameter gives the title for the new ruleset.

The `new description` parameter gives the description for the new ruleset.

> [!TIP] Run the `governance:ruleset:info` command before running this command to get the rule ID
> information to use in this command.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--remote</code></p></div></div></td><td><div><div><p>Indicates that the ruleset to clone is published in Exchange and that the <code>ruleset</code> parameter is the asset identifier for the ruleset. An asset identifier is the group ID, asset ID, and version (GAV) that uniquely identifies each asset in Exchange. For example: <code>&lt;group_id&gt;/&lt;asset_id&gt;/&lt;version&gt;</code></p></div><div><p>See <a href="#exchange-asset-identifiers">Get Exchange Asset Identifiers</a>.</p></div></div></td></tr><tr><td><div><div><p><code>--error=&lt;list_rules_to_move_to_error&gt;</code></p></div></div></td><td><div><div><p>The <code>error</code> flag is followed by the rule IDs for the rules to move to the error severity level section of the ruleset YAML.</p></div></div></td></tr><tr><td><div><div><p><code>--warning=&lt;list_rules_to_move_to_warning&gt;</code></p></div></div></td><td><div><div><p>The <code>warning</code> flag is followed by the rule IDs for the rules to move to the warning severity level section of the ruleset YAML.</p></div></div></td></tr><tr><td><div><div><p><code>--info=&lt;list_rules_to_move_to_info&gt;</code></p></div></div></td><td><div><div><p>The <code>info</code> flag is followed by the rule IDs for the rules to move to the info severity level section of the ruleset YAML.</p></div></div></td></tr><tr><td><div><div><p><code>--remove=&lt;list_rules_to_disable&gt;</code></p></div></div></td><td><div><div><p>The <code>remove</code> flag is followed by the rule IDs for the rules to comment out, and therefore effectively disable, in the ruleset YAML.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:clone ~/Downloads/ruleset.yaml 'New Ruleset from Clone' 'Cloned from ruleset.yaml' --warning=operation-default-response,operation-operationId > mynewruleset.yaml

anypoint-cli-v4 governance:ruleset:clone 68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-best-practices/1.0.2 'Custom Anypoint Best Practices' 'Cloned from MuleSoft Anypoint Best Practices' --remote --remove=openapi-tags,operation-tags > my-anypoint-best-practices.yaml
```

## governance:ruleset:completions

`> governance:ruleset:completions [flags] <ruleset>`

Returns context-aware completions at a specific cursor position in the ruleset YAML file specified
in `ruleset`. Intended for editor and tooling integration.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--offset &lt;offset&gt;</code></p></div></div></td><td><div><div><p>The cursor offset in the file. Required.</p></div></div></td></tr><tr><td><div><div><p><code>--line-text &lt;line-text&gt;</code></p></div></div></td><td><div><div><p>The current line text up to the cursor. Required.</p></div></div></td></tr></tbody></table>

**Example command:**

```copy
anypoint-cli-v4 governance:ruleset:completions my-ruleset.yaml --offset 120 --line-text "    targetClass: "
```

## governance:ruleset:constraints

`> governance:ruleset:constraints [flags]`

Lists the valid constraints for each property type: `scalar`, `node`, `scalarArray`, and
`nodeArray`.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--type &lt;type&gt;</code></p></div></div></td><td><div><div><p>Filters the list to constraints for the specified property type. Supported values are <code>scalar</code>, <code>node</code>, <code>scalarArray</code>, and <code>nodeArray</code>.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:constraints

anypoint-cli-v4 governance:ruleset:constraints --type scalar

anypoint-cli-v4 governance:ruleset:constraints --type nodeArray
```

## governance:ruleset:domains

`> governance:ruleset:domains`

Lists the available metadata domains for governance rulesets. For each domain, the command prints
the name, description, class count, and (when applicable) spec kind.

This command accepts the [default flags](./#default-options).

**Example command:**

```copy
anypoint-cli-v4 governance:ruleset:domains
```

## governance:ruleset:generate

`> governance:ruleset:generate [flags] <intent>`

Returns the context and step-by-step instructions for generating a governance ruleset in Validation
Profile 1.0 YAML format from the natural-language description provided in `intent`. When an API spec
is provided, the command detects the spec type to include as context.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--api-spec &lt;api-spec&gt;</code></p></div></div></td><td><div><div><p>Path to an API spec for context extraction. The command detects whether the spec is RAML or OpenAPI.</p></div></div></td></tr><tr><td><div><div><p><code>--attempt &lt;attempt&gt;</code></p></div></div></td><td><div><div><p>Retry attempt number. Values greater than <code>1</code> append a note to fix errors from the previous attempt. Defaults to <code>1</code>.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:generate "Every operation must have a description"

anypoint-cli-v4 governance:ruleset:generate "Require rate-limit policy" --api-spec openapi.yaml
```

## governance:ruleset:info

`> governance:ruleset:info <governance-ruleset> [flags]`

Lists the ruleset rules in the ruleset definition passed in the `governance-ruleset` parameter.

> [!NOTE] This command has multi-option flags. When using multi-option flags in a command, either
> put the parameter before the flags or use "-- " (two dashes followed by a space) before the
> parameter.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--remote</code></p></div></div></td><td><div><div><p>Indicates that the ruleset for which to get information is published in Exchange and that the <code>ruleset</code> parameter is the asset identifier for the ruleset. An asset identifier is the group ID, asset ID, and version (GAV) that uniquely identifies an asset in Exchange. For example: <code>&lt;group_id&gt;/&lt;asset_id&gt;/&lt;version&gt;</code>, where <code>&lt;version&gt;</code> is a specific version or <code>latest</code>. If you use <code>latest</code> as the version, the profile automatically uses the latest version of the ruleset when versions are published after you create the profile.</p></div><div><p>See <a href="#exchange-asset-identifiers">Get Exchange Asset Identifiers</a>.</p></div></div></td></tr></tbody></table>

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:info myrulesetfolder/myruleset.yaml

anypoint-cli-v4 governance:ruleset:info 68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-best-practices/1.0.2 --remote

anypoint-cli-v4  governance:ruleset:info 68ef9520-24e9-4cf2-b2f5-620025690913/anypoint-best-practices/latest --remote
```

**Example output:**

Ruleset myrulesetfolder/myruleset.yaml Ruleset conforms with Dialect
╔═══════════╤═══════════════════════════════════╗ ║ Violation │ security-fields-operation-empty ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ access-tokens-oauth2-cleartext ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ insecure-oauth2-grants ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ api-keys-in-cookie ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ api-keys-in-query ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ api-keys-in-header ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ api-negotiates-authentication ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ insecure-basic-auth ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ bearer-token-cleartext ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ http-token-cleartext ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ oauth2-redirections-non-encrypted ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ unknown-security-scheme ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ valid-server-urltemplate ║
╟───────────┼───────────────────────────────────╢ ║ Violation │ valid-oauth2-redirection-urls ║
╟───────────┼───────────────────────────────────╢ ║ Warning │ unknown-security-scheme ║
╟───────────┼───────────────────────────────────╢ ║ Warning │ oauth1-deprecated ║
╚═══════════╧═══════════════════════════════════╝

## governance:ruleset:init

`> governance:ruleset:init [flags] <schema>`

Initializes a ruleset based on the data schema passed in the `schema` parameter.

In addition to the [default flags](./#default-options), this command accepts the following flags:

<table><colgroup><col> <col></colgroup><thead><tr><th>Flag</th><th>Description</th></tr></thead><tbody><tr><td><div><div><p><code>--types &lt;types&gt;</code></p></div></div></td><td><div><div><p>The <code>types</code> flag gives the target types to export as rules. You can use the <code>governance:api:inspect</code> command to identify the types to specify for this flag. See <a href="#governance-api-inspect">governance:api:inspect</a>.</p></div></div></td></tr><tr><td><div><div><p><code>--name &lt;name&gt;</code></p></div></div></td><td><div><div><p>The <code>name</code> flag is the name of the ruleset. This defaults to <code>GeneratedRuleset</code>.</p></div></div></td></tr></tbody></table>

**Example command:**

```copy
anypoint-cli-v4 governance:ruleset:init --types patientmultipleBirthBoolean,patientBundle,patientmultipleBirthInteger --name=my-ruleset mydataschema
```

## governance:ruleset:properties

`> governance:ruleset:properties [flags] <targetClass>`

Lists the properties and their types for the target class specified in `targetClass`. Property types
are `scalar`, `node`, `scalarArray`, `nodeArray`, or `dynamic`. For node types, the range (target
class) is also shown. Use the `governance:ruleset:classes` command to see available target classes.

This command accepts the [default flags](./#default-options).

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:properties apiContract.Operation

anypoint-cli-v4 governance:ruleset:properties mcp.Tool
```

## governance:ruleset:resolve

`> governance:ruleset:resolve [flags] <term>`

Resolves the user-facing term specified in `term` to its canonical target class and property path.
Matching is fuzzy: case-insensitive, ignoring spaces, dashes, and underscores.

This command accepts the [default flags](./#default-options).

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:resolve consumerUrl

anypoint-cli-v4 governance:ruleset:resolve rate-limit-policy
```

## governance:ruleset:simplify

`> governance:ruleset:simplify [flags] <ruleset>`

Simplifies the ruleset YAML file specified in `ruleset` by flattening nested property paths and
removing redundant logical wrappers. The command lists the simplifications applied and then prints
the simplified ruleset YAML to standard output.

This command accepts the [default flags](./#default-options).

**Example command:**

```copy
anypoint-cli-v4 governance:ruleset:simplify my-ruleset.yaml
```

## governance:ruleset:validate

`> governance:ruleset:validate [flags] <governance-ruleset>`

Validates the ruleset definitions passed using the `governance-ruleset` parameter. You can pass one
of the following as the `governance-ruleset` parameter:

- A ruleset definition YAML file
- A ZIP file that contains an API project with an `exchange.json` file that specifies the ruleset as
  the main file
- A folder that contains an API project with an `exchange.json` file that specifies the ruleset as
  the main file

This command accepts the [default flags](./#default-options).

**Example commands:**

```copy
anypoint-cli-v4 governance:ruleset:validate ~/myrulesetfolder/myruleset.yaml

anypoint-cli-v4 governance:ruleset:validate ~/myrulesetfolder/myruleset.zip

anypoint-cli-v4 governance:ruleset:validate ~/myrulesetfolder/myrulesetfolder
```

**Example output for a valid ruleset:**

Ruleset User/myuser/myrulesetfolder/myruleset.yaml Ruleset conforms with Dialect

**Example output for a nonvalid ruleset:**

Ruleset does not conform with Dialect ModelId: file:///Users/myuser/myrulesetfolder/prof-1-bad.yaml
Profile: Validation Profile 1.0 Conforms: false Number of results: 1

Level: Violation

- Constraint:
  http://a.ml/amf/default_document#/declarations/profileNode_profile_required_validation
  Message: Property 'profile' is mandatory Severity: Violation Target:
  file:///Users/myuser/myrulesetfolder/prof-1-bad.yaml#/encodes Property: http://schema.org/name
  Range: [(3,0)-(11,19)] Location: file:///Users/myuser/myrulesetfolder/prof-1-bad.yaml

## governance:ruleset:validate-authoring

`> governance:ruleset:validate-authoring [flags] <ruleset>`

Validates the ruleset YAML file specified in `ruleset` against the authoring model, checking target
classes, property paths, constraint compatibility, and severity assignments. Prints diagnostics with
line numbers. The command exits with code `1` if any errors are found; warnings and informational
messages do not cause a failure.

This command accepts the [default flags](./#default-options).

**Example command:**

```copy
anypoint-cli-v4 governance:ruleset:validate-authoring my-ruleset.yaml
```

## governance:ruleset:version

`> governance:ruleset:version`

Shows the governance ruleset tooling version.

This command accepts the [default flags](./#default-options).

**Example command:**

```copy
anypoint-cli-v4 governance:ruleset:version
```

### Get Exchange Asset Identifiers

To get the full asset identifier (group ID/asset ID/version) for Exchange assets:

- If you are using Anypoint CLI, run the `exchange:asset:list` command.
- If you are using the Anypoint Platform web UI, select the asset in Exchange and copy the group ID
  and asset ID from the URL. Then, add the version node for the version you are viewing. For
  example, the asset identifier for the OpenAPI Best Practices ruleset in Exchange is
  `68ef9520-24e9-4cf2-b2f5-620025690913/open-api-best-practices/1.0.1`.
