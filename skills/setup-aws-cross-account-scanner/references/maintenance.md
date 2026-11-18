# Maintaining this bundle

This self-contained bundle contains the provisioning CLI, CloudFormation
templates, setup guide, permissions reference and provisioning tests. Keep these
files synchronized when changing scanner permissions or setup behavior. Review
script and template changes together, and adapt CLI help and examples to the
packaged layout.

From the repository root:

```bash
python3 -m unittest discover -s skills/setup-aws-cross-account-scanner/scripts -p test_setup.py
make validate-skills
make test-portal
make generate-portal
```

Verify the generated skill page, registry entry and manifest, then download the
ZIP and run help and dry-run commands from an extracted temporary directory.
Use `bash scripts/setup.sh` so the download does not depend on ZIP preservation
of executable permissions. Never package credential files, generated infrastructure
state or customer-specific command output.

The provisioning tests mock AWS. They do not establish live cross-account access,
Organizations discovery, automatic enrollment, runtime invocation or asset scans.
Retain those distinctions when recording test results.

Before claiming the setup works end to end, use a fresh portal ZIP in two isolated
AWS accounts. Follow only its bundled instructions, using a scanner principal
separate from the deployment administrators and unique test stack/role names:

1. Deploy the hub and a standalone spoke with all four scanner selections.
2. Run `validate` as the scanner principal. Check the assumed spoke account and
   each selected list API. Use known fixtures and `--require-nonempty` when
   checking discovery; an empty list proves access only.
3. Verify a wrong External ID fails. Read back the deployed IAM trust and policies.
4. Remove the standalone spoke through preview and confirmed deletion. Deploy the
   self-managed bootstrap roles and StackSet, then repeat the same access checks.
   Compare the actual spoke trust and policies with the standalone deployment.
5. Preview and confirm teardown in the documented order. Verify the test stacks,
   StackSet instances and IAM roles are absent, and remove separately created
   scanner-principal fixtures.

Record actual outcomes and failures separately from the local mock tests. A list
API response does not establish agent-card retrieval or an MCP tools handshake.
Those require real scanner runs against known resources. Service-managed
deployment and automatic enrollment require their own AWS Organizations test.
Keep account IDs, credentials, local paths and customer data out of public evidence.
