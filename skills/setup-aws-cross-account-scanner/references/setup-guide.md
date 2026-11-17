# AWS cross-account scanner setup

Provision the IAM roles used by the Bedrock, AgentCore agent, AgentCore Runtime MCP, and API Gateway REST API scanners. `scripts/setup.sh` uses Python 3 and AWS CLI v2; it creates or updates CloudFormation stacks. It never creates access keys. Supply a pre-existing IAM principal in the hub account, and give it permission to assume the hub role. The scanner currently stores an AWS access key and secret; a separate workload-identity feature is outside this setup.

Run all examples from the downloaded skill folder. Run `bash scripts/setup.sh` for the setup sequence and a description of each command, or `bash scripts/setup.sh COMMAND --help` for its options. Start with **Hub**, then choose **Single spoke** for each account or one of the StackSet sections for centralized deployment. Finally, **Validate** checks the role chain and selected list APIs; it does not start a scanner or publish assets.

Select one or more scanners with `--scanners bedrock,agentcore,agentcore-mcp,api-gateway`. The spoke grants only the selected policy families. AgentCore invokes runtimes to fetch native A2A cards, and AgentCore MCP invokes runtimes to initialize the server and list tools; these are not read-only operations. API Gateway includes optional WAF and Route 53 read permissions for enrichment. Policies use `Resource: "*"` for operations including list APIs; review them for your security requirements and scope further where AWS permits.

## Preparation

1. Choose a hub account and explicit spoke account IDs. Install the AWS CLI and ensure your **deployment** identity can create CloudFormation stacks and named IAM roles. Use `--profile PROFILE` or standard environment credentials for each command. The deployment identity is separate from the scanner identity and from the StackSets roles.
2. Pick an External ID unique to the customer/connection and a consistent spoke role name. Supply the same values to each command and to the scanner connection. The CloudFormation parameter is visible to authorized AWS administrators, as is normal for an External ID. Do not commit an environment file containing credentials.
3. Choose one enabled AWS region for deploying these IAM roles. IAM roles are account-wide; using several CloudFormation regions with the same role names causes conflicts. Scanner target regions are configured independently.
4. For a cautious preview append `--dry-run` to any command; use `--help` for all options. Examples use placeholders; replace them before running.

## Hub

The hub role trusts a specific existing IAM user or role, and can assume only the explicitly listed spoke role ARNs. The scanner principal also needs `sts:AssumeRole` on the hub role in its identity policy when required by your IAM configuration. Do not use an STS session ARN as the trusted principal.

```bash
bash scripts/setup.sh hub --region us-east-1 --hub-account 111111111111 \
  --accounts 222222222222,333333333333 --external-id example-customer-unique-id \
  --scanner-principal-arn arn:aws:iam::111111111111:user/scanner-user
```

Add `--organizations-discovery` only when using organization-wide account discovery. `organizations:ListAccounts` must be callable from the hub account, which AWS restricts to the management account or a delegated administrator. It enumerates the whole organization, not just the StackSet OUs. An explicit list of provisioned accounts is safer when deploying to a subset. Adding a StackSet account does **not** update the hub allowlist; rerun the hub command with the full list before scanning it.

## Single spoke

Run in each spoke account using that account's deployment credentials:

```bash
bash scripts/setup.sh spoke --region us-east-1 --account 222222222222 \
  --hub-account 111111111111 --external-id example-customer-unique-id \
  --scanners bedrock,agentcore,agentcore-mcp,api-gateway
```

A standalone stack and a StackSet instance must not both manage the same named role. To migrate an existing manually created role, first plan CloudFormation resource import or use a new role name; these scripts do not take ownership of pre-existing resources.

## Self-managed StackSets

Use this model for explicit accounts, including a single account acting as hub, administrator and spoke in a test. Deploy the administration role once in the StackSet administrator account, then the execution role in **each** target account with that account's credentials:

```bash
bash scripts/setup.sh bootstrap-admin --region us-east-1 --administrator-account 111111111111 \
  --accounts 222222222222,333333333333
bash scripts/setup.sh bootstrap-execution --region us-east-1 --account 222222222222 \
  --administrator-account 111111111111
bash scripts/setup.sh bootstrap-execution --region us-east-1 --account 333333333333 \
  --administrator-account 111111111111
```

If using a custom StackSet `--name`, pass the same value as `--stackset-name` to both bootstrap commands; those roles are scoped to that StackSet. The deployment principal must also be allowed to pass the administration role to CloudFormation. These StackSets roles are deployment infrastructure and are separate from the scanner's hub and spoke roles. The execution role can modify the named spoke role and StackSet-managed CloudFormation stacks; review the template against local IAM controls.

Switch back to the administrator credentials and deploy:

```bash
bash scripts/setup.sh stackset --region us-east-1 --administrator-account 111111111111 \
  --hub-account 111111111111 --accounts 222222222222,333333333333 \
  --external-id example-customer-unique-id --scanners bedrock,agentcore-mcp \
  --permission-model SELF_MANAGED
```

## Service-managed StackSets

Within AWS Organizations, enable CloudFormation trusted access and use the management account or a CloudFormation delegated administrator. Supply the target root or OU IDs and explicit account IDs inside them:

```bash
bash scripts/setup.sh stackset --region us-east-1 --administrator-account 111111111111 \
  --hub-account 111111111111 --accounts 222222222222,333333333333 \
  --ous ou-example-one --external-id example-customer-unique-id \
  --scanners bedrock,agentcore-mcp --permission-model SERVICE_MANAGED
```

Add `--call-as DELEGATED_ADMIN` when using a delegated administrator. This explicit-account mode disables automatic enrollment: update the hub allowlist and rerun the command with the expanded account list to enroll an account. Service-managed StackSets do not deploy to the Organizations management account or to accounts outside the organization; deploy those separately if needed.

## Automatic organization-wide enrollment

Use `--auto-enroll` on **both** the hub and StackSet commands to opt into automatic provisioning for the entire AWS organization. This uses a service-managed StackSet, requires CloudFormation trusted access and a management account or delegated administrator, and targets the organization root (not an individual OU). It enables Organizations discovery and scopes the hub's `sts:AssumeRole` permission to the named spoke role in the specified organization, with the External ID. Confirm that the scanner principal can assume the hub role and that the hub can call `organizations:ListAccounts`.

```bash
bash scripts/setup.sh hub --region us-east-1 --hub-account 111111111111 \
  --scanner-principal-arn arn:aws:iam::111111111111:user/scanner-user \
  --external-id example-customer-unique-id --auto-enroll --organization-id o-example123

bash scripts/setup.sh stackset --region us-east-1 --administrator-account 111111111111 \
  --hub-account 111111111111 --external-id example-customer-unique-id \
  --scanners bedrock,agentcore,agentcore-mcp,api-gateway \
  --permission-model SERVICE_MANAGED --ous r-abcd --auto-enroll
```

Replace the example organization ID and root ID with the values from AWS Organizations. Do not supply `--accounts` with `--auto-enroll`: every member account under the root is targeted, including future accounts. In the scanner connection, leave the account list empty to use Organizations discovery and specify the same hub role, spoke role name, External ID and target regions. The scanner enumerates all active organization accounts, including the management account; StackSets does not deploy there. To scan it, deploy the same spoke role in the management account separately using `spoke`, with management-account credentials. Check account scope and permissions before enabling this mode.

The StackSet retains its stack and role if an account leaves the organization. Retained stacks are no longer managed by the StackSet and must be reviewed and removed separately; the hub's organization condition no longer permits assuming roles outside the organization. Auto-deployment is asynchronous and can fail: monitor StackSet operation results, failed instances and scanner errors, especially while accounts are joining. An account may be discovered before its role is ready. The command requires at least one observable member-account instance to verify initial deployment; an organization containing only its management account cannot pass that check. The command refuses to switch an existing StackSet between explicit and automatic enrollment or change the root or removal behavior implicitly; use a separate StackSet and plan role migration. Automatic enrollment and Organizations discovery have not yet been validated live in an AWS Organization.

## Updates, status and cleanup

Rerun `stackset` with the complete enrolled account list to update scanner selections and add accounts. Template changes update all existing StackSet instances. The command refuses an update when an existing instance's account is absent from `--accounts` or when an instance exists in another region. It waits for each operation, checks per-account results, and requires a current instance for every requested account. A timeout does not cancel the AWS operation; check status before retrying:

```bash
bash scripts/setup.sh status --region us-east-1 --name agent-scanner-spokes
```

Removing instances deletes their spoke roles and breaks scanning in those accounts. After reviewing the selected accounts, use `remove-instances` with `--delete-roles`, the same permission model, account IDs, and (for service-managed) OU IDs. Removing an account from `--accounts` alone does not delete it.

### Teardown

The `teardown` command previews the entire named StackSet and requires the exact list of its current instance accounts, including automatically enrolled accounts. It refuses an unexpected account, region, permission model, OU/root, in-progress operation, or a template that differs from this version of `spoke-role.json`. Omit `--accounts` only for an empty StackSet. The preview reads AWS; it makes no changes. After reviewing the result, rerun the same command with `--confirm-delete`:

```bash
bash scripts/setup.sh teardown --region us-east-1 --name agent-scanner-spokes \
  --administrator-account 111111111111 --permission-model SELF_MANAGED \
  --accounts 222222222222,333333333333
# Rerun with --confirm-delete after review.
```

For service-managed StackSets, use `--permission-model SERVICE_MANAGED` and the exact `--ous` target IDs; use `--call-as DELEGATED_ADMIN` if appropriate. The command disables automatic enrollment if enabled, checks the account scope again, removes instances and their spoke roles, waits for the operation, then deletes the empty StackSet. A failed operation stops cleanup: inspect AWS and retry with the remaining account list. Disabling automatic enrollment or deleting roles affects any scanners relying on them.

Remove any remaining setup stacks separately, with credentials for the account that owns each stack. Preview first; rerun with `--confirm-delete`. For bootstrap stacks, first confirm no other StackSet or consumer needs the role, and also specify `--confirm-unused`:

```bash
bash scripts/setup.sh teardown-stack --region us-east-1 --account 222222222222 \
  --kind bootstrap-execution --name agent-scanner-stackset-execution
bash scripts/setup.sh teardown-stack --region us-east-1 --account 111111111111 \
  --kind bootstrap-admin --name agent-scanner-stackset-admin
bash scripts/setup.sh teardown-stack --region us-east-1 --account 111111111111 \
  --kind hub --name agent-scanner-hub
```

Use `--kind spoke --name agent-scanner-spoke` to remove a standalone spoke stack; StackSet-managed stacks must be removed through the StackSet. Delete bootstrap roles only after all their StackSets have been removed. `teardown-stack` verifies the stack's original template against the current matching template and refuses a mismatch; inspect older or customized stacks and clean them up manually. Neither command deletes the pre-existing scanner user/role or its credentials. Retained stacks that have left the StackSet or organization are not discoverable through the StackSet and need separate review and cleanup. Service-managed teardown has not been tested live.

## Validate

Use credentials for the scanner principal to test the actual two-hop chain, passing the same role names, External ID and scanner selection:

```bash
bash scripts/setup.sh validate --region us-east-1 --hub-account 111111111111 \
  --accounts 222222222222,333333333333 --external-id example-customer-unique-id \
  --scanners bedrock,agentcore,agentcore-mcp,api-gateway --require-nonempty
```

The command identifies each assumed spoke and calls each scanner's list API. Counts of zero are not proof of discovery; `--require-nonempty` fails when a list has no resources. AgentCore and AgentCore MCP both list runtimes, so even a nonzero count does not prove that an MCP endpoint exists or that an MCP handshake succeeds. Complete validation by running each actual scanner against known assets, checking the native A2A card and MCP tools, and exercising every configured region. One account can validate role chaining and IAM configuration, but not cross-account trust or Organizations enrollment. A real two-account test and service-managed StackSet test remain necessary before claiming those flows are validated.

For the scanner connection, enter the scanner principal's access key/secret, hub role ARN, spoke role name, External ID, explicit account IDs and target regions. Do not paste credentials into tickets or logs. `Test Connection` is a connectivity check, not a full scan.

## Auditing AWS operations

AWS CloudTrail records CloudFormation API calls and STS role assumptions as management events, including the caller, time, request and any AWS-reported error. These AWS records are the audit source for this local setup tool; its console output is not an audit log. See [CloudFormation logging](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-api-logging-cloudtrail.html) and [IAM and STS logging](https://docs.aws.amazon.com/IAM/latest/UserGuide/cloudtrail-integration.html). CloudFormation operation acceptance is not the same as successful completion: inspect stack events and StackSet operation results for the final outcome.

Configure an organization trail or CloudTrail Lake event data store with the needed management events and retention for every relevant account and region. Include both read and write management events: STS `AssumeRole` is classified as read-only. CloudTrail Event history is limited to the most recent 90 days per region and is not a substitute for the retention and monitoring required by your organization. AWS does not record denied cross-account STS assumptions in the target account; investigate them in the calling account, subject to AWS's documented logging limitations. This setup does not configure, verify, or guarantee delivery of CloudTrail logs.
