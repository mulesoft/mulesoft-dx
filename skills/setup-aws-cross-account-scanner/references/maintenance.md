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
