#!/usr/bin/env python3
"""Provision scanner IAM roles and StackSets using AWS CLI v2 (Python standard library only)."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time

DIRECTORY = Path(__file__).resolve().parent
SCANNERS = {"bedrock": "Bedrock", "agentcore": "AgentCore", "agentcore-mcp": "AgentCoreMcp", "api-gateway": "ApiGateway"}


def csv(value):
    values = [v.strip() for v in value.split(",")]
    if not all(values) or len(set(values)) != len(values):
        raise argparse.ArgumentTypeError("Use a nonempty comma-separated list without duplicates")
    return values


def accounts(value):
    values = csv(value)
    if any(not re.fullmatch(r"[0-9]{12}", v) for v in values):
        raise argparse.ArgumentTypeError("AWS account IDs must contain exactly 12 digits")
    return values


def one_account(value):
    values = accounts(value)
    if len(values) != 1:
        raise argparse.ArgumentTypeError("Specify exactly one AWS account ID")
    return values[0]


def scanners(value):
    values = csv(value)
    if set(values) - SCANNERS.keys():
        raise argparse.ArgumentTypeError("Scanners: " + ",".join(SCANNERS))
    return values


def role_name(value):
    if not re.fullmatch(r"[A-Za-z0-9+=,.@_-]{1,64}", value):
        raise argparse.ArgumentTypeError("Use an IAM role name without a path, up to 64 characters")
    return value


def external_id(value):
    if not re.fullmatch(r"[A-Za-z0-9_+=,.@:/-]{2,1224}", value):
        raise argparse.ArgumentTypeError("Invalid STS External ID")
    return value


class AwsError(RuntimeError):
    pass


class Aws:
    def __init__(self, args, env=None):
        self.args = args
        self.env = env

    def run(self, *command, missing=None):
        cmd = ["aws", *command, "--region", self.args.region, "--output", "json", "--no-cli-pager"]
        if self.args.profile and self.env is None:
            cmd += ["--profile", self.args.profile]
        if self.args.dry_run:
            print(shlex.join(cmd))
            return {}
        env = dict(os.environ if self.env is None else self.env, AWS_PAGER="", AWS_CLI_AUTO_PROMPT="off")
        result = subprocess.run(cmd, env=env, text=True, capture_output=True, timeout=900)
        if result.returncode:
            if missing and re.search(r"\(" + re.escape(missing) + r"\)", result.stderr):
                return None
            raise AwsError(result.stderr.strip() or "AWS CLI failed")
        return json.loads(result.stdout) if result.stdout.strip().startswith(("{", "[")) else {}

    def check_account(self, expected):
        identity = self.run("sts", "get-caller-identity")
        if not self.args.dry_run and identity["Account"] != expected:
            raise AwsError(f"Expected account {expected}, authenticated to {identity['Account']}")

    def deploy(self, name, template, parameters):
        self.run("cloudformation", "deploy", "--stack-name", name,
                 "--template-file", str(DIRECTORY / template),
                 "--capabilities", "CAPABILITY_NAMED_IAM", "--no-fail-on-empty-changeset",
                 "--parameter-overrides", *(f"{k}={v}" for k, v in parameters.items()))
        result = self.run("cloudformation", "describe-stacks", "--stack-name", name)
        if not self.args.dry_run:
            print(json.dumps(result["Stacks"][0].get("Outputs", []), indent=2))


def spoke_parameters(args):
    return {"HubRoleArn": f"arn:aws:iam::{args.hub_account}:role/{args.hub_role_name}",
            "SpokeRoleName": args.spoke_role_name, "ExternalId": args.external_id,
            **{"Enable" + name: str(key in args.scanners).lower() for key, name in SCANNERS.items()}}


def wait_operation(aws, operation_id):
    args = aws.args
    if args.dry_run:
        return
    print(f"StackSet operation: {operation_id}", flush=True)
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        result = aws.run("cloudformation", "describe-stack-set-operation", "--stack-set-name", args.name,
                         "--operation-id", operation_id, "--call-as", args.call_as)
        status = result["StackSetOperation"]["Status"]
        if status in {"SUCCEEDED", "FAILED", "STOPPED"}:
            results = aws.run("cloudformation", "list-stack-set-operation-results", "--stack-set-name", args.name,
                              "--operation-id", operation_id, "--call-as", args.call_as)
            rows = results.get("Summaries", [])
            print(json.dumps(rows, indent=2))
            if status != "SUCCEEDED" or any(r["Status"] != "SUCCEEDED" for r in rows):
                raise AwsError(f"StackSet operation {operation_id} ended {status}; inspect account results above")
            return
        time.sleep(5)
    raise AwsError(f"Timed out waiting for {operation_id}; AWS may still be running. Use status before retrying.")


def stackset(aws):
    args = aws.args
    aws.check_account(args.administrator_account)
    common = ["--stack-set-name", args.name, "--call-as", args.call_as]
    result = aws.run("cloudformation", "describe-stack-set", *common, missing="StackSetNotFoundException")
    exists = result is not None and not args.dry_run
    if exists and result["StackSet"]["PermissionModel"] != args.permission_model:
        raise AwsError("Existing StackSet uses a different permission model; choose a different name")
    if exists and args.permission_model == "SERVICE_MANAGED":
        current = result["StackSet"]
        if current.get("AutoDeployment", {}).get("Enabled", False) != args.auto_enroll:
            raise AwsError("Existing StackSet uses a different automatic enrollment mode; choose a different name")
        if args.auto_enroll and not current.get("AutoDeployment", {}).get("RetainStacksOnAccountRemoval", False):
            raise AwsError("Existing automatic StackSet deletes stacks on account removal; review retention before updating")
        if args.auto_enroll and current.get("OrganizationalUnitIds") and set(current["OrganizationalUnitIds"]) != set(args.ous):
            raise AwsError("Existing automatic StackSet does not target the specified organization root")
    instances = aws.run("cloudformation", "list-stack-instances", *common).get("Summaries", []) if exists else []
    if exists and args.auto_enroll and instances and not result["StackSet"].get("OrganizationalUnitIds"):
        raise AwsError("Cannot verify existing automatic StackSet targets; inspect it before updating")
    if any(i["Region"] != args.region for i in instances):
        raise AwsError("IAM roles are global. This StackSet already has instances in another region")
    enrolled = {i["Account"] for i in instances}
    unexpected = enrolled - set(args.accounts or []) if not args.auto_enroll else set()
    if unexpected:
        raise AwsError("Existing StackSet contains accounts not in --accounts; updates affect every enrolled account: " + ",".join(sorted(unexpected)))
    config = ["--template-body", "file://" + str(DIRECTORY / "spoke-role.json"),
              "--capabilities", "CAPABILITY_NAMED_IAM", "--permission-model", args.permission_model,
              "--parameters", json.dumps([{"ParameterKey": k, "ParameterValue": v} for k, v in spoke_parameters(args).items()])]
    if args.permission_model == "SELF_MANAGED":
        config += ["--administration-role-arn", f"arn:aws:iam::{args.administrator_account}:role/{args.administration_role_name}",
                   "--execution-role-name", args.execution_role_name]
    else:
        config += ["--auto-deployment", "Enabled=true,RetainStacksOnAccountRemoval=true" if args.auto_enroll else "Enabled=false"]
    preferences = ["--operation-preferences", "FailureToleranceCount=0,MaxConcurrentCount=1"]
    if exists:
        # Updating the template updates all currently enrolled instances; removing an ID never deletes a stack.
        try:
            operation = aws.run("cloudformation", "update-stack-set", *common, *config, *preferences)
        except AwsError as error:
            if "No updates are to be performed" not in str(error):
                raise
            print("StackSet template and parameters are unchanged.")
        else:
            wait_operation(aws, operation["OperationId"])
    else:
        aws.run("cloudformation", "create-stack-set", *common, *config)
    enrolled = {i["Account"] for i in instances}
    new_accounts = [a for a in (args.accounts or []) if a not in enrolled]
    if new_accounts or (args.auto_enroll and (not exists or not result["StackSet"].get("OrganizationalUnitIds"))):
        targets = target_arguments(args, new_accounts)
        operation = aws.run("cloudformation", "create-stack-instances", *common, *targets,
                            "--regions", args.region, *preferences)
        wait_operation(aws, operation.get("OperationId"))
    if not args.dry_run:
        actual = aws.run("cloudformation", "list-stack-instances", *common).get("Summaries", [])
        if args.auto_enroll and not actual:
            raise AwsError("No StackSet instances found; cannot verify deployment to organization member accounts")
        healthy = {i["Account"] for i in actual if i["Region"] == args.region and i["Status"] == "CURRENT"}
        missing = set(args.accounts or []) - healthy
        if args.auto_enroll:
            missing |= {i["Account"] for i in actual if i["Region"] == args.region and i["Status"] != "CURRENT"}
        if missing:
            raise AwsError("StackSet has no CURRENT instance in these requested accounts: " + ",".join(sorted(missing)))
    print("StackSet deployment complete." if not args.dry_run else "Dry run: no AWS calls executed.")


def target_arguments(args, selected):
    if args.permission_model == "SELF_MANAGED":
        return ["--accounts", *selected]
    if getattr(args, "auto_enroll", False):
        return ["--deployment-targets", json.dumps({"OrganizationalUnitIds": args.ous})]
    return ["--deployment-targets", json.dumps({"OrganizationalUnitIds": args.ous, "Accounts": selected,
                                               "AccountFilterType": "INTERSECTION"})]


def verify_template(actual, template):
    """Fail closed if a named resource is not managed by the expected template."""
    try:
        actual = json.loads(actual) if isinstance(actual, str) else actual
        expected = json.loads((DIRECTORY / template).read_text())
    except (ValueError, TypeError) as error:
        raise AwsError("Cannot verify CloudFormation template: " + str(error)) from error
    if actual != expected:
        raise AwsError("Template does not match " + template + "; inspect the resource and remove it manually")


def teardown_stackset(aws):
    args = aws.args
    aws.check_account(args.administrator_account)
    common = ["--stack-set-name", args.name, "--call-as", args.call_as]
    result = aws.run("cloudformation", "describe-stack-set", *common, missing="StackSetNotFoundException")
    if result is None:
        print("StackSet is already absent; no StackSet resources to remove.")
        return
    stackset = result["StackSet"]
    original_name = args.name
    args.name = stackset["StackSetId"]
    common = ["--stack-set-name", args.name, "--call-as", args.call_as]
    if stackset["PermissionModel"] != args.permission_model:
        raise AwsError("StackSet permission model does not match --permission-model")
    verify_template(stackset.get("TemplateBody"), "spoke-role.json")
    if args.permission_model == "SERVICE_MANAGED" and set(stackset.get("OrganizationalUnitIds", [])) != set(args.ous):
        raise AwsError("StackSet target roots/OUs do not match --ous; inspect before removing")
    operations = aws.run("cloudformation", "list-stack-set-operations", *common).get("Summaries", [])
    if any(op.get("Status") in {"RUNNING", "QUEUED", "STOPPING"} for op in operations):
        raise AwsError("StackSet has an operation in progress; wait for it to finish")
    def instances():
        return aws.run("cloudformation", "list-stack-instances", *common).get("Summaries", [])
    def verify_scope(rows):
        if any(row.get("Region") != args.region for row in rows):
            raise AwsError("StackSet has instances in another region; inspect and remove them separately")
        actual = {row["Account"] for row in rows}
        if actual != set(args.accounts or []):
            raise AwsError("--accounts must match all current StackSet instance accounts; actual: " + ",".join(sorted(actual)))
        return sorted(actual)
    rows = instances()
    selected = verify_scope(rows)
    auto = stackset.get("AutoDeployment", {}).get("Enabled", False)
    print(json.dumps({"stackSet": original_name, "stackSetId": args.name, "administratorAccount": args.administrator_account,
                      "region": args.region, "permissionModel": args.permission_model,
                      "accounts": selected, "instances": [{"account": row["Account"], "region": row["Region"],
                          "stackId": row.get("StackId"), "status": row.get("Status")} for row in rows],
                      "automaticEnrollment": auto,
                      "action": "delete StackSet instances, spoke roles and StackSet"}, indent=2))
    print("Hub and bootstrap stacks are separate; retained stacks and the scanner principal are not deleted.")
    if not args.confirm_delete:
        print("Preview only. Add --confirm-delete after reviewing this plan.")
        return
    if auto:
        operation = aws.run("cloudformation", "update-stack-set", *common, "--use-previous-template",
                            "--capabilities", "CAPABILITY_NAMED_IAM", "--auto-deployment", "Enabled=false")
        wait_operation(aws, operation["OperationId"])
        print("Automatic enrollment disabled.")
    # Detect enrollment between preview and deletion (or while disabling auto-deployment).
    selected = verify_scope(instances())
    if selected:
        targets = target_arguments(args, selected)
        operation = aws.run("cloudformation", "delete-stack-instances", *common, *targets,
                            "--regions", args.region, "--no-retain-stacks",
                            "--operation-preferences", "FailureToleranceCount=0,MaxConcurrentCount=1")
        wait_operation(aws, operation["OperationId"])
    if instances():
        raise AwsError("StackSet instances remain; do not delete bootstrap roles. Inspect status and retry")
    aws.run("cloudformation", "delete-stack-set", *common)
    print("StackSet removed. Delete the verified hub/bootstrap stacks separately in their accounts.")


def teardown_stack(aws):
    args = aws.args
    aws.check_account(args.account)
    try:
        result = aws.run("cloudformation", "describe-stacks", "--stack-name", args.name)
    except AwsError as error:
        if re.search(r"\(ValidationError\).*does not exist", str(error), re.IGNORECASE):
            print("Stack is already absent: " + args.name)
            return
        raise
    stack = result["Stacks"][0]
    if stack.get("StackStatus") == "DELETE_COMPLETE":
        print("Stack is already deleted: " + args.name)
        return
    if stack.get("StackName", "").startswith("StackSet-"):
        raise AwsError("StackSet-managed stacks must be removed through teardown or remove-instances")
    if stack.get("StackStatus", "").endswith("_IN_PROGRESS"):
        raise AwsError("Stack operation is in progress; wait for completion")
    template = {"hub": "hub-role.json", "spoke": "spoke-role.json",
                "bootstrap-admin": "stackset-administration-role.json",
                "bootstrap-execution": "stackset-execution-role.json"}[args.kind]
    verify_template(aws.run("cloudformation", "get-template", "--stack-name", args.name).get("TemplateBody"), template)
    print(json.dumps({"account": args.account, "region": args.region, "stack": args.name,
                      "stackId": stack["StackId"], "kind": args.kind, "status": stack["StackStatus"],
                      "action": "delete stack and its managed IAM resources"}, indent=2))
    if not args.confirm_delete:
        print("Preview only. Confirm no other consumers use these roles, then add --confirm-delete.")
        return
    if args.kind in {"bootstrap-admin", "bootstrap-execution"} and not args.confirm_unused:
        raise AwsError("Bootstrap roles may be shared; verify they are unused and specify --confirm-unused")
    # Use the immutable ID that was inspected; a replacement stack cannot be deleted by mistake.
    aws.run("cloudformation", "delete-stack", "--stack-name", stack["StackId"])
    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline:
        try:
            current = aws.run("cloudformation", "describe-stacks", "--stack-name", stack["StackId"])
        except AwsError as error:
            if re.search(r"\(ValidationError\).*does not exist", str(error), re.IGNORECASE):
                print("Stack removed: " + args.name)
                return
            raise
        status = current["Stacks"][0]["StackStatus"]
        if status == "DELETE_COMPLETE":
            print("Stack removed: " + args.name)
            return
        if status == "DELETE_FAILED":
            raise AwsError("Stack deletion failed; inspect CloudFormation stack events")
        time.sleep(5)
    raise AwsError("Timed out waiting for stack deletion; inspect AWS before retrying")


def validate(aws):
    args = aws.args
    hub_arn = f"arn:aws:iam::{args.hub_account}:role/{args.hub_role_name}"
    hub = aws.run("sts", "assume-role", "--role-arn", hub_arn, "--role-session-name", "scanner-setup-validation")
    if args.dry_run:
        print("Validation will assume hub, then each spoke, and list selected scanner resources in each target region.")
        return
    def assumed(result):
        creds = result["Credentials"]
        env = {k: v for k, v in os.environ.items() if not k.startswith("AWS_")}
        env.update(AWS_ACCESS_KEY_ID=creds["AccessKeyId"], AWS_SECRET_ACCESS_KEY=creds["SecretAccessKey"],
                   AWS_SESSION_TOKEN=creds["SessionToken"])
        # Preserve networking settings, but never inherited profile/credential/endpoint overrides.
        for key in ("AWS_CA_BUNDLE", "AWS_DEFAULT_REGION"):
            if key in os.environ:
                env[key] = os.environ[key]
        return Aws(args, env)
    hub_client = assumed(hub)
    failures = []
    for account in args.accounts:
        try:
            spoke = hub_client.run("sts", "assume-role", "--role-arn", f"arn:aws:iam::{account}:role/{args.spoke_role_name}",
                                   "--external-id", args.external_id, "--role-session-name", "scanner-spoke-validation")
            client = assumed(spoke)
            identity = client.run("sts", "get-caller-identity")
            if identity["Account"] != account:
                raise AwsError("Assumed role resolved to an unexpected account")
            for scanner in args.scanners:
                command, field = {
                    "bedrock": (("bedrock-agent", "list-agents"), "agentSummaries"),
                    "agentcore": (("bedrock-agentcore-control", "list-agent-runtimes"), "agentRuntimes"),
                    "agentcore-mcp": (("bedrock-agentcore-control", "list-agent-runtimes"), "agentRuntimes"),
                    "api-gateway": (("apigateway", "get-rest-apis"), "items"),
                }[scanner]
                resources = client.run(*command).get(field, [])
                print(f"{account} {args.region} {scanner}: {len(resources)} resources; identity={identity['Arn']}")
                if args.require_nonempty and not resources:
                    raise AwsError(f"No {scanner} fixtures discovered")
        except AwsError as error:
            failures.append(account)
            print(f"FAILED {account}: {error}", file=sys.stderr)
    if failures:
        raise AwsError("Validation failed for accounts: " + ",".join(failures))
    print("Role-chain and list-API validation passed. Full scanner/protocol validation is a separate step.")


def parser():
    descriptions = {
        "hub": "Create or update the hub role that the scanner assumes first.",
        "spoke": "Create or update a scanner role in one target account.",
        "bootstrap-admin": "Create the administration role for self-managed StackSets.",
        "bootstrap-execution": "Create the StackSet execution role in one target account.",
        "stackset": "Deploy or update spoke roles across selected accounts using a StackSet.",
        "status": "Show the status of StackSet instances.",
        "remove-instances": "Remove selected StackSet instances and their spoke roles.",
        "teardown": "Preview or remove a StackSet and all its spoke instances.",
        "teardown-stack": "Preview or remove one verified hub, spoke, or bootstrap stack.",
        "validate": "Assume the hub and spoke roles and call the selected scanner list APIs; does not run a scan.",
    }
    result = argparse.ArgumentParser(
        prog="setup.sh",
        description="Set up AWS roles for cross-account scanner discovery.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Getting started:
  1. Choose a scanner principal, hub account, target account(s), and External ID.
  2. Run 'hub' in the hub account.
  3. Run 'spoke' in each target account, OR use a StackSet:
     - Self-managed: run 'bootstrap-admin', then 'bootstrap-execution' in
       each target account, then 'stackset' in the administrator account.
     - Service-managed: enable AWS Organizations trusted access, then run
       'stackset' with the target accounts and organizational units.
  4. Run 'validate' using the scanner principal's credentials, then run the
     actual scanner against known assets.

Use 'bash scripts/setup.sh COMMAND --help' from the skill folder and see
references/setup-guide.md
for examples, prerequisites, cleanup, and validation limitations.
""")
    sub = result.add_subparsers(dest="command", required=True, title="commands")
    for cmd in ("hub", "spoke", "bootstrap-admin", "bootstrap-execution", "stackset", "status", "remove-instances", "teardown", "teardown-stack", "validate"):
        p = sub.add_parser(cmd, help=descriptions[cmd], description=descriptions[cmd])
        p.add_argument("--profile", help="AWS CLI profile; otherwise use the normal AWS credential chain")
        p.add_argument("--region", required=True, help="One CloudFormation deployment region (IAM roles are global)")
        if cmd not in {"teardown", "teardown-stack"}:
            p.add_argument("--dry-run", action="store_true", help="Print commands without calling AWS")
        else:
            p.set_defaults(dry_run=False)
        p.add_argument("--name", required=cmd in {"teardown", "teardown-stack"}, default={"hub":"agent-scanner-hub", "spoke":"agent-scanner-spoke",
                       "bootstrap-admin":"agent-scanner-stackset-admin", "bootstrap-execution":"agent-scanner-stackset-execution"}.get(cmd, "agent-scanner-spokes"))
        if cmd in {"hub", "spoke", "stackset", "validate"}:
            p.add_argument("--hub-account", type=one_account, required=True, help="12-digit account ID where the hub role lives")
            p.add_argument("--hub-role-name", type=role_name, default="AgentScannerHubRole", help="Hub IAM role name (default: AgentScannerHubRole)")
            p.add_argument("--spoke-role-name", type=role_name, default="AgentScannerSpokeRole", help="Spoke IAM role name (default: AgentScannerSpokeRole)")
            p.add_argument("--external-id", type=external_id, required=True, help="Customer-specific External ID; use the same value throughout setup and in the scanner connection")
        if cmd in {"spoke", "stackset", "validate"}:
            p.add_argument("--scanners", type=scanners, required=True, help="Comma-separated selections: bedrock, agentcore, agentcore-mcp, api-gateway")
        if cmd in {"hub", "bootstrap-admin", "stackset", "remove-instances", "teardown", "validate"}:
            account_help = "Exact comma-separated list of current instance account IDs; omit only for an empty StackSet" if cmd == "teardown" else "Comma-separated 12-digit target account IDs; omit with --auto-enroll"
            p.add_argument("--accounts", type=accounts, required=cmd not in {"hub", "stackset", "teardown"}, help=account_help)
        if cmd in {"bootstrap-admin", "bootstrap-execution", "stackset"}:
            p.add_argument("--administration-role-name", type=role_name, default="AgentScannerStackSetAdministrationRole")
            p.add_argument("--execution-role-name", type=role_name, default="AgentScannerStackSetExecutionRole")
            if cmd != "stackset":
                p.add_argument("--stackset-name", default="agent-scanner-spokes", help="Must match stackset --name")
        if cmd in {"spoke", "bootstrap-execution", "teardown-stack"}:
            p.add_argument("--account", type=one_account, required=True)
        if cmd == "bootstrap-execution":
            p.add_argument("--spoke-role-name", type=role_name, default="AgentScannerSpokeRole")
        if cmd in {"bootstrap-admin", "bootstrap-execution", "stackset", "teardown"}:
            p.add_argument("--administrator-account", type=one_account, required=True)
        if cmd in {"stackset", "remove-instances", "teardown"}:
            p.add_argument("--permission-model", choices=["SELF_MANAGED", "SERVICE_MANAGED"], required=True)
            p.add_argument("--ous", type=csv, help="OU/root IDs, required for SERVICE_MANAGED; accounts are intersected with these OUs")
        if cmd in {"stackset", "status", "remove-instances", "teardown"}:
            p.add_argument("--call-as", choices=["SELF", "DELEGATED_ADMIN"], default="SELF")
            p.add_argument("--timeout", type=int, default=3600)
        if cmd == "hub":
            p.add_argument("--scanner-principal-arn", required=True, help="Existing IAM user or IAM role ARN; never a session ARN")
            p.add_argument("--organizations-discovery", action="store_true")
            p.add_argument("--organization-id", help="Organization ID, required with --auto-enroll")
        if cmd in {"hub", "stackset"}:
            p.add_argument("--auto-enroll", action="store_true", help="Enable organization-wide enrollment; use on both hub and stackset")
        if cmd == "validate":
            p.add_argument("--require-nonempty", action="store_true", help="Fail if a list API returns no resources; this does not prove full discovery")
        if cmd == "remove-instances":
            p.add_argument("--delete-roles", action="store_true", help="Required acknowledgement: delete spoke roles in selected accounts")
        if cmd == "teardown-stack":
            p.add_argument("--kind", required=True, choices=["hub", "spoke", "bootstrap-admin", "bootstrap-execution"])
            p.add_argument("--timeout", type=int, default=3600)
            p.add_argument("--confirm-unused", action="store_true", help="Acknowledge the selected bootstrap role is no longer used")
        if cmd in {"teardown", "teardown-stack"}:
            p.add_argument("--confirm-delete", action="store_true", help="Delete the resources shown in the preview")
    return result


def main(argv=None):
    cli = parser()
    if not (sys.argv[1:] if argv is None else argv):
        cli.print_help()
        return 0
    args = cli.parse_args(argv)
    if args.command in {"hub", "stackset"}:
        if args.auto_enroll and args.accounts:
            cli.error("--auto-enroll targets the entire organization; omit --accounts")
        if not args.auto_enroll and not args.accounts:
            cli.error("--accounts is required unless --auto-enroll is enabled")
    if args.command == "hub":
        if args.auto_enroll and not re.fullmatch(r"o-[a-z0-9]{10,32}", args.organization_id or ""):
            cli.error("--auto-enroll requires a valid --organization-id")
        if not args.auto_enroll and args.organization_id:
            cli.error("--organization-id requires --auto-enroll")
    if args.command == "stackset" and args.auto_enroll:
        if args.permission_model != "SERVICE_MANAGED":
            cli.error("--auto-enroll requires SERVICE_MANAGED permissions")
        if not args.ous or len(args.ous) != 1 or not re.fullmatch(r"r-[a-z0-9]{4,32}", args.ous[0]):
            cli.error("--auto-enroll requires exactly one organization root ID in --ous")
    if getattr(args, "permission_model", None) == "SERVICE_MANAGED" and not args.ous:
        cli.error("SERVICE_MANAGED requires --ous")
    if getattr(args, "permission_model", None) == "SELF_MANAGED" and (args.ous or args.call_as != "SELF"):
        cli.error("SELF_MANAGED uses explicit accounts and --call-as SELF")
    if hasattr(args, "timeout") and args.timeout < 1:
        cli.error("--timeout must be positive")
    if args.command == "hub" and not re.fullmatch(r"arn:aws:iam::" + args.hub_account + r":(user|role)/[A-Za-z0-9+=,.@_/-]+", args.scanner_principal_arn):
        cli.error("Scanner principal must be an IAM user or role in the hub account")
    if args.command == "remove-instances" and not args.delete_roles:
        cli.error("Removing instances deletes spoke roles; specify --delete-roles")
    aws = Aws(args)
    try:
        if args.command == "hub":
            aws.check_account(args.hub_account)
            aws.deploy(args.name, "hub-role.json", {"HubRoleName": args.hub_role_name, "ScannerPrincipalArn": args.scanner_principal_arn,
                       "SpokeRoleArns": ",".join(f"arn:aws:iam::{a}:role/{args.spoke_role_name}" for a in (args.accounts or [])),
                       "ExternalId": args.external_id, "EnableOrganizationsDiscovery": str(args.organizations_discovery or args.auto_enroll).lower(),
                       "AutoEnroll": str(args.auto_enroll).lower(), "OrganizationId": args.organization_id or "", "SpokeRoleName": args.spoke_role_name})
        elif args.command == "spoke":
            aws.check_account(args.account)
            aws.deploy(args.name, "spoke-role.json", spoke_parameters(args))
        elif args.command == "bootstrap-admin":
            aws.check_account(args.administrator_account)
            aws.deploy(args.name, "stackset-administration-role.json", {"AdministrationRoleName": args.administration_role_name,
                       "ExecutionRoleName": args.execution_role_name, "StackSetName": args.stackset_name,
                       "ExecutionRoleArns": ",".join(f"arn:aws:iam::{a}:role/{args.execution_role_name}" for a in args.accounts)})
        elif args.command == "bootstrap-execution":
            aws.check_account(args.account)
            aws.deploy(args.name, "stackset-execution-role.json", {"AdministratorAccountId": args.administrator_account,
                       "AdministrationRoleName": args.administration_role_name, "ExecutionRoleName": args.execution_role_name,
                       "SpokeRoleName": args.spoke_role_name, "StackSetName": args.stackset_name})
        elif args.command == "stackset":
            stackset(aws)
        elif args.command == "status":
            print(json.dumps(aws.run("cloudformation", "list-stack-instances", "--stack-set-name", args.name, "--call-as", args.call_as), indent=2))
        elif args.command == "remove-instances":
            op = aws.run("cloudformation", "delete-stack-instances", "--stack-set-name", args.name, "--call-as", args.call_as,
                         *target_arguments(args, args.accounts), "--regions", args.region, "--no-retain-stacks",
                         "--operation-preferences", "FailureToleranceCount=0,MaxConcurrentCount=1")
            wait_operation(aws, op.get("OperationId"))
        elif args.command == "teardown":
            teardown_stackset(aws)
        elif args.command == "teardown-stack":
            teardown_stack(aws)
        else:
            validate(aws)
    except (AwsError, OSError, subprocess.TimeoutExpired) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
