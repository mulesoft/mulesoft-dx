---
name: setup-aws-cross-account-scanner
description: >-
  Set up AWS IAM hub and spoke roles for MuleSoft cross-account scanning of
  Bedrock agents, AgentCore agents, AgentCore Runtime MCP servers, and API Gateway
  REST APIs. Use when provisioning scanner permissions, deploying scanner
  CloudFormation stacks or StackSets, enabling organization account discovery or
  automatic spoke enrollment, validating AWS role access, or removing this setup.
---

# Set up AWS cross-account scanning

## What this sets up

MuleSoft scanners discover existing agents, MCP servers, or APIs so teams can
review and register them in their catalog. Cross-account scanning lets a scanner
connection access several AWS accounts and regions through IAM roles:

**Scanner IAM user → hub role → spoke role in each target account.**

This skill provisions those roles with the bundled Python CLI and CloudFormation
templates. The four scanner selections are `bedrock`, `agentcore`,
`agentcore-mcp`, and `api-gateway`. AgentCore MCP means **MCP servers hosted on
AgentCore Runtime**, not AgentCore Gateway. API Gateway means REST APIs.

Use the existing scripts rather than reconstructing IAM policies or generating
replacement provisioning code. Read [the setup guide](https://dev-portal.mulesoft.com/skills/setup-aws-cross-account-scanner/references/setup-guide.md)
for the commands for the selected mode, and
[the permissions reference](https://dev-portal.mulesoft.com/skills/setup-aws-cross-account-scanner/references/permissions.md) for exact template grants. Installed copies are at `references/setup-guide.md`
and `references/permissions.md` in this skill folder.

## 1. Establish the account scope and deployment mode

Collect the scanner selections, hub account ID, existing scanner principal ARN,
spoke account IDs or organization scope, AWS CLI deployment profiles, deployment
region, role names, and External ID. Reuse values already provided. Credentials
stay in the customer's local AWS configuration; ask for profile names rather
than secrets. The scanner itself currently needs an access key ID and secret
for an existing IAM user to start the role chain. These scripts do not create
that user or its keys.

Account selection and role provisioning are separate choices:

| Choice | Requirement |
|---|---|
| Explicit account selection | Supply Account IDs in the scanner. Organizations discovery is not required. |
| Organizations discovery | Leave Account IDs empty. The hub role needs `organizations:ListAccounts`; the hub must be the management account or a delegated administrator in the target organization. Ordinary member-account status is insufficient. |
| Individual spoke stacks | Deploy once in each spoke with that account's deployment credentials. |
| Self-managed StackSet | Bootstrap the administration role once and the execution role in every target account before deploying centrally. |
| Service-managed StackSet | Organizations, CloudFormation trusted access, and management-account or authorized CloudFormation delegated-administrator access. |
| Automatic enrollment | Explicit opt-in on both hub and service-managed StackSet. Our tooling targets the entire organization root, including future member accounts. |

Do not select organization-wide enrollment merely because the user asks to
scan multiple accounts. For a subset, use explicit account selection and the
matching deployment scope. Discovery enumerates active accounts across the whole
organization, regardless of StackSet OU scope. A new standalone account can be
an explicit-mode hub; creating it does not confer discovery privileges.

## 2. Check prerequisites and prepare the commands

Download/extract the **whole skill folder**, including `scripts/` and
`references/`. If only this file is available, retrieve the complete skill
through the portal's ZIP download or the public repository before continuing.
Run from the extracted skill folder:

```bash
python3 --version
aws --version
bash scripts/setup.sh
```

Python 3, AWS CLI v2, and access to AWS APIs are required. Check each deployment
profile with `aws sts get-caller-identity --profile PROFILE` and compare its
account ID with the intended account. Deployment administrators need the IAM,
CloudFormation and, when applicable, Organizations authority described in the
guide. These permissions are separate from the scanner's runtime permissions.

Before applying changes, present the selected accounts, regions, roles, scanner
policy families, and commands. Use `--dry-run` to show the AWS requests. It prints
commands without contacting AWS and therefore does not validate access or
existing infrastructure. Preserve the intended account scope and the CLI's
existing deletion acknowledgements.

IAM roles are account-wide: deploy each named role in one CloudFormation region.
Keep that region separate from the regions the scanner will scan. Do not deploy
a standalone spoke stack and a StackSet instance that own the same named role.
The templates do not adopt existing roles automatically.

## 3. Provision the selected mode

Follow the corresponding section of [the setup guide](https://dev-portal.mulesoft.com/skills/setup-aws-cross-account-scanner/references/setup-guide.md):

- **Hub:** create/update the hub role, its trusted scanner principal and permitted
  spokes. Configure discovery only when needed.
- **Single spoke:** create/update each spoke role using that account's profile.
- **Self-managed StackSets:** bootstrap administration and execution roles first,
  then deploy the spoke StackSet from the administrator account.
- **Service-managed StackSets:** confirm trusted access and the deployment account,
  then use explicit accounts within the selected OU/root.
- **Automatic organization-wide enrollment:** use `--auto-enroll` on both commands,
  the organization ID on the hub command and root ID on the StackSet command.

Use `bash scripts/setup.sh COMMAND --help` for supported arguments. Keep JSON
templates beside `setup.py`; it resolves them relative to its own location.
Wait for CloudFormation and StackSet completion, and inspect per-account results.
If an operation times out, check its status before retrying.

In explicit mode, enrolling another account also requires updating the hub's
spoke ARN allowlist and scanner account list. Service-managed StackSets do not
deploy to the management account: if discovery includes that account, provision
its spoke role separately. Automatic enrollment is asynchronous; discovery can
find an account before its role is ready.

## 4. Validate AWS access and provide scanner connection values

Use the **scanner identity's** local credentials for `validate`, with the same
hub role, spoke role name, External ID, accounts and scanner selections. See the
guide's validation example. This checks the role chain and selected AWS list
APIs; `--require-nonempty` also rejects empty resource lists. This command requires
explicit `--accounts`, even when planning to use discovery in the scanner. It
does not exercise Organizations discovery or automatic enrollment.

A successful list call is not a completed scan. In particular, AgentCore and
AgentCore MCP both list runtimes; the count does not establish an MCP handshake,
tool discovery or a native A2A card fetch. Full validation requires running each
selected scanner against known resources in the configured regions.

Provide the connection values and where the customer supplies the credentials:

| Connection field | Value |
|---|---|
| Access key ID / secret | Existing scanner IAM user's credentials; enter securely in MuleSoft |
| Hub Role ARN | Hub stack output |
| Spoke Role Name | Same role name deployed in each target account |
| External ID | Same value used in hub permissions and spoke trust |
| Account IDs | Explicit deployed account list, or empty for Organizations discovery |
| Primary / target regions | Enabled, supported regions containing the resources to scan |

For creating the MuleSoft configuration, use
[skill setup-service-scanner](https://dev-portal.mulesoft.com/skills/setup-service-scanner/SKILL.md). For an actual
scan and result review, use
[skill run-service-scan-and-view-results](https://dev-portal.mulesoft.com/skills/run-service-scan-and-view-results/SKILL.md)
when requested. Report AWS deployment, access validation, actual discovery and
publication separately; claim only the checks performed. Organizations discovery,
automatic enrollment and service-managed teardown have not yet been validated
live by the maintainers in an AWS Organization.

## Updates and removal

For updates, status, removing selected instances, or full teardown, follow
**Updates, status and cleanup** in the guide. Teardown previews read AWS and
require the exact current account scope. Add `--confirm-delete` only for an
authorized deletion; bootstrap removal also requires `--confirm-unused`. Removal
breaks scanning that depends on those roles. Retained stacks outside the StackSet
need separate review; the tool does not delete the pre-existing scanner user or
its credentials.

## Maintaining this bundle

Read the bundled `references/maintenance.md`
([maintenance instructions](https://dev-portal.mulesoft.com/skills/setup-aws-cross-account-scanner/references/maintenance.md)) for local
checks and packaging guidance. Use placeholders in examples and keep secrets,
customer account data and internal-only links out of the published skill.
