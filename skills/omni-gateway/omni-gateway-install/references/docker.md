# Docker Installation

## Execution Paths

- **Connected mode, docker run** (Steps 1 → 2 → 3 → 4 → 5): Prepare directories, pull the image,
register, run the container, and verify.
- **Local mode, docker run** (Steps 1 → 2 → 4 → 5): Skip Step 3 (registration). Start the
container without a registration YAML.
- **Docker Compose** (Steps 1 → 2 → 3-compose → 4 → 5): Use a Compose file instead of a bare
`docker run` command. Registration (Step 3) still applies for connected mode.

---

## Step 1 — Prepare the conf.d directory

Create a local directory that will be bind-mounted into the container as the gateway's
configuration store:

```bash
mkdir -p ~/flex-gateway/conf.d
ls -la ~/flex-gateway/
```

Verify the directory is writable by your user. The gateway process inside the container runs as
the UID you provide — mismatched permissions are one of the most common startup failures.

---

## Step 2 — Pull the gateway image

```bash
docker pull mulesoft/flex-gateway
```

This pulls the `latest` tag. For production deployments, pin to a specific version tag
(e.g., `mulesoft/flex-gateway:1.8.0`) to avoid unintended upgrades.

---

## Step 3 — Register with Anypoint Platform (connected mode only)

Skip this step if running in local mode.

**Gather registration parameters before running the command:**

1. **Gateway name** (`<gateway-name>`): A unique, human-readable identifier (alphanumeric and hyphens
   only, e.g., `prod-docker-gw`). Appears in Anypoint Runtime Manager.
2. **Anypoint organization ID** (`<orgID>`): UUID visible in Anypoint Platform → Admin Settings →
   Organization (format: `550e8400-e29b-41d4-a716-446655440000`).
3. **Registration token** (`<token>`): Obtained from Anypoint Runtime Manager → Add Gateway →
   Self-managed tab → Copy token. Scoped to a specific organization; expires after 24 hours.

Use the bundled `flexctl` binary inside the image to perform registration. The `-u $UID` flag
runs the registration process as your current user so the output file is owned by you:

```bash
docker run --entrypoint flexctl -u $UID \
  -v "$(pwd)":/registration mulesoft/flex-gateway \
  registration create \
  --organization=<orgID> \
  --token=<token> \
  --output-directory=/registration \
  --connected=true \
  --anypoint-url=https://anypoint.mulesoft.com \
  <gateway-name>
```

This writes `registration.yaml` (and related files) to your current working directory. Verify the
artifact before moving it:

```bash
ls -la registration.yaml
cat registration.yaml
```

The file should start with `kind: Configuration` and include `spec.platformConnection` fields.
Then move the registration YAML to `~/flex-gateway/conf.d/` before starting the gateway container:

```bash
mv registration.yaml ~/flex-gateway/conf.d/
```

---

## Step 3-compose — Docker Compose variant

Instead of a bare `docker run`, generate a `docker-compose.yml` in the project directory:

```yaml
version: "3.9"
services:
  flex-gateway:
    image: mulesoft/flex-gateway
    user: "${UID}"
    volumes:
      - ./conf.d:/usr/local/share/mulesoft/flex-gateway/conf.d
    ports:
      - "8081:8081"
    restart: unless-stopped
```

Place the registration YAML (Step 3, connected mode) in a `conf.d/` subdirectory alongside
`docker-compose.yml` before running `docker compose up`.

---

## Step 4 — Run the container

For a standalone `docker run`:

```bash
docker run -d \
  -v ~/flex-gateway/conf.d:/usr/local/share/mulesoft/flex-gateway/conf.d \
  -p 8081:8081 \
  --name flex-gateway \
  mulesoft/flex-gateway
```

For Docker Compose:

```bash
docker compose up -d
```

Adjust `-p 8081:8081` to match the port(s) your `ApiInstance` resources listen on. If you have
multiple APIs on different ports, add multiple `-p` flags (e.g., `-p 8081:8081 -p 9090:9090`).

---

## Step 5 — Verify

```bash
docker ps --filter name=flex-gateway
docker logs --tail=50 flex-gateway
```

`docker ps` should show the container in `Up` state. In the logs, look for a line containing
`STARTED` to confirm the gateway finished initializing. There is no external HTTP health endpoint
— gateway health is reported through log output and, in connected mode, via Anypoint Runtime
Manager status.

**Common issues:**

- **Container exits immediately**: Run `docker logs flex-gateway` to see the error. The most
common causes are a missing or malformed `registration.yaml`, a permissions mismatch on `conf.d/`,
or a port already in use.
- `**bind: address already in use`**: Another process is listening on the mapped port. Change
the host-side port (e.g., `-p 18081:8081`) or stop the conflicting process.

For connected-mode verification in Anypoint Runtime Manager, return to `SKILL.md` →
"Confirm in Anypoint Runtime Manager".
