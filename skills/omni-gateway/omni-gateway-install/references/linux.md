# Linux Installation (Ubuntu/Debian)

This section covers Ubuntu and Debian distributions only. For RHEL, CentOS, or Amazon Linux,
contact the gateway team for RPM repository details — do not attempt to use the APT repository
on RPM-based systems.

## Execution Paths

- **Connected mode** (Steps 1 → 2 → 3 → 4 → 5): Install the package, add the APT repo, install
flex-gateway, register with Anypoint, then start and verify.
- **Local mode** (Steps 1 → 2 → 3 → 5): Skip Step 4 (registration). The gateway runs
standalone without connecting to Anypoint Platform.

---

## Step 1 — Verify prerequisites

Check whether `flexctl` is already on the system. If it is, this may be an upgrade rather than
a fresh install — warn the user and confirm they want to continue.

```bash
which flexctl && flexctl version
```

Check the OS distribution to confirm Ubuntu or Debian:

```bash
cat /etc/os-release | grep -E "^(ID|ID_LIKE)="
```

If the output shows `rhel`, `centos`, `amzn`, or similar, stop here. The APT-based instructions
below do not apply. Ask the user to contact the MuleSoft gateway team for RPM repository details.

**What you'll need before continuing:**

- Ubuntu or Debian host (any LTS release)
- `sudo` access
- Internet connectivity to `flex-packages.anypoint.mulesoft.com`
- For connected mode: an Anypoint Platform organization ID and a registration token (see Step 4)

---

## Step 2 — Add the MuleSoft APT repository

Register the MuleSoft GPG signing key and add the package repository to the system's APT sources:

```bash
curl -XGET -L https://flex-packages.anypoint.mulesoft.com/ubuntu/pubkey.gpg | sudo apt-key add -
echo "deb https://flex-packages.anypoint.mulesoft.com/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/mulesoft.list
sudo apt update
```

The `$(lsb_release -cs)` substitution inserts your Ubuntu/Debian codename (e.g., `jammy`, `focal`,
`bookworm`) so the correct repository variant is selected automatically.

**Common issues:**

- `**lsb_release: command not found`**: Install it with `sudo apt install -y lsb-release`, then
rerun the `echo` command.
- `**apt-key` deprecation warning on Ubuntu 22.04+**: This is a warning only; the key is still
accepted. For a warning-free alternative, download the key to `/etc/apt/trusted.gpg.d/` using
`gpg --dearmor`.

---

## Step 3 — Install flex-gateway

```bash
sudo apt install -y flex-gateway
flexctl version
```

`flexctl` is the gateway management CLI bundled with the package. If `flexctl version` returns a
version string, the installation succeeded.

---

## Step 4 — Register with Anypoint Platform (connected mode only)

Skip this step if running in local mode.

**Gather registration parameters before running the command:**

1. **Gateway name** (`<gateway-name>`): A unique, human-readable identifier (alphanumeric and hyphens
   only, e.g., `prod-linux-gw`). Appears in Anypoint Runtime Manager.
2. **Anypoint organization ID** (`<orgID>`): UUID visible in Anypoint Platform → Admin Settings →
   Organization (format: `550e8400-e29b-41d4-a716-446655440000`).
3. **Registration token** (`<token>`): Obtained from Anypoint Runtime Manager → Add Gateway →
   Self-managed tab → Copy token. Scoped to a specific organization; expires after 24 hours.

Registration contacts Anypoint Platform, creates a gateway record in your organization, and writes
a `registration.yaml` file to `conf.d/`. This file is the gateway's identity credential — keep it
secure and do not commit it to source control.

```bash
sudo flexctl registration create <gateway-name> \
  --token=<token> \
  --organization=<orgID> \
  --connected=true \
  --anypoint-url=https://anypoint.mulesoft.com \
  --output-directory=/usr/local/share/mulesoft/flex-gateway/conf.d
```

The command should complete in 10–15 seconds. Verify the registration artifact was written:

```bash
ls -la /usr/local/share/mulesoft/flex-gateway/conf.d/
cat /usr/local/share/mulesoft/flex-gateway/conf.d/registration.yaml
```

The file should start with `kind: Configuration` and include `spec.platformConnection` fields
with `agentId`, `arm`, `clientId`, and `clientSecret`.

---

## Step 5 — Start and verify

Enable the systemd service so it starts on boot, then start it and check its status:

```bash
sudo systemctl enable flex-gateway
sudo systemctl start flex-gateway
sudo systemctl status flex-gateway
```

The status output should show `active (running)`. For connected mode, the gateway will appear in
Anypoint Runtime Manager within a few seconds of startup.

To tail the logs directly:

```bash
sudo journalctl -u flex-gateway -f
```

Look for a line containing `STARTED` to confirm the gateway is fully initialized.

For connected-mode verification in Anypoint Runtime Manager, return to `SKILL.md` →
"Confirm in Anypoint Runtime Manager".
