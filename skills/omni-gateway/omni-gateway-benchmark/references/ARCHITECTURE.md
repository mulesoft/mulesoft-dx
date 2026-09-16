# Flex Gateway Benchmark — Architecture, Functionality & Usage Report

## Overview

This is a performance benchmarking harness for **MuleSoft Flex Gateway** running on Amazon EKS. It provisions cloud infrastructure, deploys the gateway with configurable APIs and policies, drives load with k6, and captures Grafana dashboards as evidence for each run.

Work item: `W-21368048`

---

## Directory Structure

```
omni-gateway-benchmark/
├── SKILL.md                   # Skill prose (entry point for agents/users)
├── Makefile                   # Top-level orchestration
├── .env / .env.example        # Runtime configuration
├── references/
│   └── ARCHITECTURE.md        # This document
├── scripts/                   # Shell scripts (deploy, render, run, report)
├── assets/                    # Static resources consumed by the harness
│   ├── terraform/             # AWS infrastructure (EKS, VPC, ECR)
│   ├── k8s/
│   │   ├── flex/              # Flex Gateway Helm values
│   │   ├── k6/                # k6 Operator TestRun templates
│   │   ├── observability/     # kube-prometheus-stack values
│   │   └── upstream/          # Upstream service manifests
│   ├── config/
│   │   ├── flex-config-header.yaml
│   │   ├── snippets/api-instance.yaml
│   │   └── policies/          # rate-limit.yaml, client-id-enforcement.yaml
│   ├── charts/
│   │   └── flex-bench-extras/ # Custom Helm chart: ServiceMonitor + Grafana dashboards
│   └── docker/
│       └── upstream/Dockerfile # Upstream HTTP echo server
└── reports/                   # Generated benchmark output (PNGs + Markdown)
```

---

## Architecture

### Infrastructure Layer (Terraform)

Terraform provisions a dedicated AWS environment with two Terraform configuration files:

**`assets/terraform/main.tf`** — creates:
- **VPC** (`10.20.0.0/16`) with 3 public + 3 private subnets across AZs, single NAT gateway.
- **EKS cluster** (`flex-bench`, Kubernetes 1.30) with two managed node groups:
  - `system` — `t3.large` × 2, tainted `NoSchedule` for control-plane workloads only.
  - `workload` — `c6i.2xlarge` × 3 (compute-optimized), where Flex + k6 run.
- **ECR repository** (`flex-bench/bench-upstream`) for the upstream container image.
- **EBS CSI IRSA** + EKS addon for persistent volume support.
- **Metrics Server** EKS addon.

**`assets/terraform/helm.tf`** — installs three long-lived Helm releases into the cluster:
- `kube-prometheus-stack` (v65.5.0) in `monitoring` namespace — Prometheus, Alertmanager, Grafana, node exporters.
- `flex-bench-extras` (local chart) — ServiceMonitor for Flex Envoy stats, PodMonitor for k6, three Grafana dashboard ConfigMaps.
- `k6-operator` (v4.4.1) in `k6-operator-system` — manages `TestRun` CRDs as Kubernetes jobs.

Provider authentication uses `aws eks get-token` exec auth to avoid baking kubeconfig credentials into Terraform state.

### Application Layer (Kubernetes)

Four logical workloads run in the cluster, all on `node-role: workload` nodes:

| Workload | Namespace | Description |
|---|---|---|
| `flex-gateway` | `flex` | MuleSoft Flex Gateway (Helm chart, 1–2 CPU / 512Mi–1Gi RAM) |
| `bench-upstream` | `default` | Go HTTP echo server receiving proxied traffic |
| k6 runner pod | `k6-operator-system` | k6 load generator spawned per TestRun |
| `kps-*` | `monitoring` | Prometheus stack (Grafana on ClusterIP port 80) |

Flex Gateway runs with `FLEX_DATASOURCE_K8S_ENABLED=true`, reading API configuration from Kubernetes custom resources (`ApiInstance`, `PolicyBinding`, `Service`) rather than mounted files. This means config changes do not require pod restarts.

### Observability Layer

The `flex-bench-extras` Helm chart ships three custom Grafana dashboards:

| Dashboard UID | Title | Purpose |
|---|---|---|
| `flex-envoy` | Flex / Envoy | Gateway RPS, response codes, latency (Envoy stats on port 19000) |
| `flex-pods` | Flex / Pods | Gateway pod CPU and memory under load |
| `k6-driver` | k6 / Driver | Throughput, latency percentiles, virtual user count |

k6 publishes metrics via Remote Write (`experimental-prometheus-rw`) to Prometheus, tagged with `testid=${RUN_ID}` for per-run isolation in dashboards.

---

## Script Functionality

### `Makefile` — Orchestration Entry Point

The Makefile is the primary interface. All variables are loaded from `.env` and exported to child processes.

| Target | Description |
|---|---|
| `up` | `terraform apply` — provisions VPC + EKS + ECR + cluster Helm releases |
| `down` | `terraform destroy` — full teardown |
| `push-upstream` | Builds and pushes the upstream Docker image to ECR |
| `render` | Renders `flex-config.yaml` + `scenario.js` into `.run/<RUN_ID>/` |
| `deploy-upstream` | Deploys `bench-upstream` (idempotent, skips on hash match) |
| `deploy-flex` | Renders config + deploys Flex Helm release (idempotent, skips on hash match) |
| `run` | Renders k6 script → applies TestRun → waits → snapshots Grafana → generates report |
| `benchmark` | Full pipeline: `up` → `deploy-upstream` → `deploy-flex` → `run` (optionally `down`) |
| `clean-deployment` | Removes Flex + upstream + k6 TestRuns; keeps cluster + observability |
| `report` | Exports Grafana snapshots for the most recent `.run/` entry |
| `test` | Runs renderer unit tests + `shellcheck` + `terraform fmt/validate` |

`RUN_ID` defaults to a UTC timestamp (`20260611T163325Z` format). All run artifacts land under `.run/<RUN_ID>/` (ephemeral) and `reports/<RUN_ID>/` (persisted).

---

### Shell Scripts

#### `scripts/render-flex-config.sh`

Generates the Flex Gateway declarative configuration YAML for a given run.

**Inputs:** `N_APIS`, `UPSTREAM_HOST`, `UPSTREAM_PORT`, `POLICIES` (comma-list), `RATE_LIMIT_RPS`, `FLEX_LISTEN_PORT`

**Output:** A single multi-document YAML file with:
1. One `Service` resource pointing at the upstream backend.
2. `N_APIS` × `ApiInstance` resources, each routing `/api-<i>/` to the upstream.
3. For each `(ApiInstance, policy)` pair, one `PolicyBinding` resource referencing the policy snippet template.

All resources use `apiVersion: gateway.mulesoft.com/v1alpha1` and are namespaced to `flex`.

**Supported policies:** `rate-limit` (rate-limiting-flex Extension), `client-id-enforcement`

#### `scripts/render-k6-script.sh`

Writes a static `scenario.js` k6 script to disk. The script reads all scenario parameters (`N_APIS`, `RPS`, `VUS`, `DURATION`, `FLEX_URL`, `CLIENT_ID`, `CLIENT_SECRET`) from environment variables at k6 runtime, not at render time — making the file identical across invocations and safe to cache.

**Load model:**
- Executor: `constant-arrival-rate` — maintains exact target RPS regardless of response times.
- Request distribution: round-robins across all `N_APIS` APIs using `(__VU + __ITER) % N_APIS`.
- Headers: `client_id` / `client_secret` sent on every request for client-id-enforcement policy support.

**Thresholds (hard failures):**
- `http_req_failed < 1%`
- `p(95) < 500ms`, `p(99) < 1000ms`

#### `scripts/deploy-flex.sh`

Idempotent Flex Gateway deployment.

1. Renders `flex-config.yaml` via `render-flex-config.sh`.
2. Renders `flex-values.yaml` from `assets/k8s/flex/values-run.yaml.tpl` (image repository/tag).
3. Computes a SHA-256 hash over `flex-config.yaml` + image reference.
4. Reads the live hash from the pod template annotation `bench/spec-hash`.
5. **Skips** `helm upgrade` if hashes match.
6. Otherwise: ensures the `flex` namespace exists, creates/updates the `flex-registration` secret from `REGISTRATION_FILE`, adds the Flex Helm repo, runs `helm upgrade --install`, applies the CRD resources, patches the pod template annotation to trigger a rollout, and waits for rollout completion.

**Note:** The Flex Helm chart's public HTTP repo (`https://flex-packages.anypoint.mulesoft.com/helm`) is used — the OCI endpoint is not public.

#### `scripts/deploy-upstream.sh`

Idempotent upstream service deployment.

1. Reads `ecr_repository_url` from Terraform outputs.
2. Checks ECR that the `latest` image tag exists (fails fast if not pushed yet).
3. Renders `assets/k8s/upstream/deployment.yaml.tpl` → YAML.
4. Hashes the rendered YAML and compares to the `bench/spec-hash` label on the live Deployment.
5. **Skips** if hashes match; otherwise applies Service + Deployment + stamps the hash label.

#### `scripts/run-bench.sh`

Per-run execution path. Assumes Flex + upstream are already deployed.

1. Renders `scenario.js` via `render-k6-script.sh`.
2. Creates a per-run ConfigMap `k6-script-<RUN_SLUG>` from `scenario.js`.
3. Applies `assets/k8s/k6/testrun-template.yaml` (with `envsubst`) to create a `TestRun` CRD object.
4. Waits for the TestRun to reach `finished` phase (via `wait-for-testrun.sh`).
5. Exports Grafana snapshots (via `export-grafana-snapshot.sh`).
6. Generates the Markdown run report (via `generate-report.sh`).

`RUN_SLUG` is a lowercase version of `RUN_ID` (required because Kubernetes resource names must be RFC 1123 lowercase, while `RUN_ID` uses uppercase `T`/`Z` timestamp separators).

#### `scripts/wait-for-testrun.sh`

Polls the `TestRun` CRD status every 5 seconds until the phase reaches `finished`, `error`, or `stopped`, or a configurable timeout (default 1800s) expires. Preflight checks verify the CRD and TestRun object exist before polling begins.

#### `scripts/export-grafana-snapshot.sh`

1. Port-forwards Grafana service (`kps-grafana` in `monitoring`) to `localhost:$GRAFANA_PORT` (default 33000).
2. Polls `http://localhost:<port>/api/health` until reachable.
3. Calls Grafana's `/api/search` to list all dashboards.
4. Downloads each dashboard as a 1600×900 PNG via `/render/d/<uid>` (requires Grafana image renderer plugin).
5. Saves PNGs to `reports/<RUN_ID>/<DashboardTitle>.png`.

#### `scripts/generate-report.sh`

Generates a self-contained Markdown report for a finished run:

1. Fetches k6 runner pod logs, extracts four key summary lines via regex (dotted-label form to avoid duplicates in k6 output): `http_reqs`, `http_req_failed`, `http_req_duration`, `checks_succeeded`.
2. Derives the run time window from pod `startTime` / `finishedAt`, padded ±30s.
3. Emits a Markdown file with scenario parameters, raw k6 metrics block, Grafana deep-links (pre-set time range + `testid` variable), and a note about the co-located PNG snapshots.

Report filename convention: `flex<VERSION>_n<N_APIS>_<POLICIES>_rps<RPS>_<RUN_ID>.md`

#### `scripts/push-upstream.sh`

Builds the upstream Docker image for `linux/amd64` (using `docker buildx` for cross-compilation on Apple Silicon) and pushes it to ECR with `docker login` via `aws ecr get-login-password`.

#### `scripts/clean-deployment.sh`

Removes per-run workloads (Flex Helm release, upstream Deployment/Service, all k6 TestRuns, all `k6-script-*` ConfigMaps) while preserving the EKS cluster, observability stack, k6-operator, and ECR. Used to reset between sessions without paying for full infrastructure teardown.

---

### Upstream Container (`assets/docker/upstream/Dockerfile`)

A two-stage Docker build:
- **Stage 1:** Clones `asoorm/go-bench-suite` at a pinned commit (`d691810`), builds a static binary with CGO disabled.
- **Stage 2:** Copies the binary into a `distroless/static:nonroot` image.
- Listens on `:8080` via `bench-suite upstream --addr=:8080` — a simple HTTP echo server.

---

### Flex Gateway Configuration (`assets/config/`)

| File | Purpose |
|---|---|
| `flex-config-header.yaml` | `Service` resource template (upstream backend declaration) |
| `snippets/api-instance.yaml` | `ApiInstance` template, parameterized by `$API_INDEX` |
| `policies/rate-limit.yaml` | `PolicyBinding` template for `rate-limiting-flex` Extension |
| `policies/client-id-enforcement.yaml` | `PolicyBinding` template for `client-id-enforcement` Extension |

All templates use `envsubst` variable substitution. The schema for these CRDs is documented in `assets/config/SCHEMA-NOTES.md` (verified against Flex Gateway 1.13.0 documentation).

---

## Data Flow

```
make benchmark
│
├─ make up
│   └─ terraform apply → EKS + VPC + ECR + kube-prometheus-stack + k6-operator
│
├─ make push-upstream
│   └─ docker buildx build → ECR push
│
├─ make deploy-upstream
│   ├─ render assets/k8s/upstream/deployment.yaml.tpl
│   └─ kubectl apply → bench-upstream Deployment + Service (ns: default)
│
├─ make deploy-flex
│   ├─ render-flex-config.sh → flex-config.yaml (Service + N ApiInstances + PolicyBindings)
│   ├─ envsubst → flex-values.yaml (image tag)
│   ├─ hash check → skip if unchanged
│   ├─ helm upgrade --install flex-gateway
│   └─ kubectl apply flex-config.yaml (CRD resources, no pod restart needed)
│
└─ make run
    ├─ render-k6-script.sh → scenario.js
    ├─ kubectl create configmap k6-script-<RUN_SLUG>
    ├─ envsubst testrun-template.yaml | kubectl apply
    ├─ wait-for-testrun.sh → polls TestRun phase
    ├─ export-grafana-snapshot.sh → PNG per dashboard → reports/<RUN_ID>/
    └─ generate-report.sh → flex<V>_n<N>_<policies>_rps<R>_<ID>.md
```

---

## Configuration Reference

### `.env` / `.env.example`

| Variable | Default | Description |
|---|---|---|
| `AWS_REGION` | `us-east-2` | AWS region for EKS cluster |
| `CLUSTER_NAME` | `flex-bench` | EKS cluster name |
| `FLEX_VERSION` | `1.13.0` | Flex Gateway version (Helm chart + image tag) |
| `FLEX_IMAGE_REPOSITORY` | `mulesoft/flex-gateway` | Override to use a private mirror |
| `FLEX_IMAGE_TAG` | *(empty — uses FLEX_VERSION)* | Override to decouple tag from version |
| `N_APIS` | `10` | Number of `ApiInstance` resources to create |
| `POLICIES` | `rate-limit,client-id-enforcement` | Comma-list of policies to apply |
| `RPS` | `1000` | Target requests per second |
| `VUS` | `200` | Pre-allocated virtual users |
| `DURATION` | `2m` | k6 test duration |
| `CLIENT_ID` | *(empty)* | Required when `client-id-enforcement` is active |
| `CLIENT_SECRET` | *(empty)* | Required when `client-id-enforcement` is active |
| `GRAFANA_PORT` | `33000` | Local port for Grafana port-forward |
| `TEARDOWN` | `0` | Set to `1` to run `make down` after `benchmark` |
| `REGISTRATION_FILE` | `.run/registration/registration.yaml` | Flex local-mode registration file |

### Terraform Variables (`assets/terraform/variables.tf`)

| Variable | Default | Description |
|---|---|---|
| `aws_region` | `us-east-2` | AWS region |
| `cluster_name` | `flex-bench` | EKS cluster and VPC name prefix |
| `k8s_version` | `1.30` | Kubernetes version |
| `system_node.instance_type` | `t3.large` | System node pool instance type |
| `workload_node.instance_type` | `c6i.2xlarge` | Workload node pool instance type |
| `kps_chart_version` | `65.5.0` | kube-prometheus-stack chart version |
| `k6_operator_chart_version` | `4.4.1` | k6-operator chart version |

---

## Usage

### Prerequisites

- AWS CLI configured with permissions to create EKS/VPC/ECR/IAM resources
- `terraform` ≥ 1.x
- `kubectl`, `helm`
- `docker` with buildx (for cross-platform builds on Apple Silicon)
- A Flex Gateway registration file (local mode) at `.run/registration/registration.yaml`

### First-Time Setup

```bash
cd skills/omni-gateway/omni-gateway-benchmark

# 1. Configure environment
cp .env.example .env
# Edit .env: set CLIENT_ID, CLIENT_SECRET if using client-id-enforcement policy

# 2. Generate Flex local-mode registration (one-time)
flexctl registration create --connected=false --output-directory=.run/registration

# 3. Build and push the upstream image
make push-upstream

# 4. Full benchmark run (provisions cluster if not already up)
make benchmark
```

### Subsequent Runs (Cluster Already Provisioned)

```bash
# Re-run with same config (deploy-* steps are idempotent, skip if unchanged)
make benchmark

# Re-run with different scenario parameters (no infra changes)
RPS=2000 VUS=400 DURATION=5m make run

# Test with different number of APIs and no policies
N_APIS=50 POLICIES= make benchmark

# Test a specific Flex version
FLEX_VERSION=1.14.0 make deploy-flex
make run
```

### Cleanup

```bash
# Remove Flex + upstream + k6 runs (keep cluster — ~$0.10/hr saved vs teardown)
make clean-deployment

# Full teardown (stops all AWS billing for this cluster)
make down
```

### Accessing Results

```bash
# Reports land in reports/<RUN_ID>/
ls reports/

# View the markdown report
cat reports/20260611T164129Z/flex1.13.0_n10_rate-limit_rps1000_20260611T164129Z.md

# Open Grafana (requires kubectl access to the cluster)
kubectl -n monitoring port-forward svc/kps-grafana 3000:80
# → http://localhost:3000 (admin / admin)
```

### Running Tests

```bash
# Unit tests for shell renderers + shellcheck + terraform validation
make test
```

---

## Idempotency Design

Both `deploy-flex` and `deploy-upstream` use content-addressed hashing to avoid unnecessary Kubernetes operations:

- **`deploy-flex`**: SHA-256 of `flex-config.yaml` + image reference → stored as pod template annotation `bench/spec-hash`. Annotation placement (not Deployment metadata) ensures the Kubernetes rollout controller sees the change and triggers a new pod.
- **`deploy-upstream`**: SHA-256 of rendered Deployment YAML → stored as Deployment label `bench/spec-hash`.

This makes `make benchmark` safe to re-run: only `make run` (the k6 test) executes if infrastructure is unchanged.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Kubernetes CRD datasource for Flex config | Allows live config updates without pod restarts; matches production Flex behavior |
| `constant-arrival-rate` k6 executor | Maintains precise RPS target; response-time variance does not reduce load |
| Hash-based idempotency in deploy scripts | Back-to-back `make benchmark` is cheap when only k6 knobs change |
| `linux/amd64` buildx target | EKS workload nodes are x86_64; building on Apple Silicon without `--platform` produces incompatible images |
| Grafana as ClusterIP (no Ingress) | Security posture — no public exposure; port-forward used for access |
| Pinned Terraform provider versions | Prevents silent Helm chart upgrades breaking the cluster on re-apply months later |
| `RUN_SLUG` (lowercase `RUN_ID`) | Kubernetes RFC 1123 names forbid uppercase; `RUN_ID` uses `T`/`Z` separators for readability in reports |
