# Generated script standard

Apply this standard in the customer's requested language and project style.

## Contents

- Runtime inputs
- Pull bundle and auth parity
- Authentication-family completeness
- Human-readable execution
- Mapping review
- Structured final result
- Customer guide
- Validation and approval gates
- Language parity
- Identical customer UX

## Runtime inputs

Generate an input manifest in the customer guide with one row per value:

| Input | Side | Purpose | Required when | Secret | Accepted runtime sources | Prompt label | Validation | Obtained from | Evidence |
|---|---|---|---|---|---|---|---|---|---|

Derive provider rows from the selected provider bundle or the customer's
replacement authentication and operation contract. Include only values the
selected operations require. For a current pull provider, use the exact field
labels, required conditions, validation, and auth semantics from
the pull-scanner connection form for that provider in Anypoint Exchange.

When the contract offers multiple authentication schemes, use only the scheme
the customer selected during generation. Do not generate a menu of speculative
provider logins at runtime. The guide must name the selected scheme, every
required value, where the customer obtains it, and the least-privilege access
required by the selected operations.

The manifest is the stable generic model; credential fields are provider
specific. Use provider-native names proven by the selected profile or customer
contract. Never reduce AWS, Azure, Kong, or another provider to an invented
username/password pair.

One run uses one input mode. The modes are OR. Do not cascade.

1. File, when `--input-file` / `PUSH_INPUT_FILE` is set. Read every required value, including secrets, from that file (KEY=VALUE, `#` comments ignored, or a JSON object). Do not prompt. The skill shows this format. The guide repeats it with secrets empty.
2. Parameters, when the file is absent and value flags or environment variables are set. Flags and env are one mode. Secrets in this mode are environment variables, never process arguments. Do not prompt.
3. Prompts, when neither the file nor parameter values were supplied and stdin is a TTY. Prompt once for every required value. Hide short secrets. When the unquoted AWS access key is `ASIA` and `AWS_SESSION_TOKEN` is not already in the environment or the input file, ask for it with a hidden prompt in this same process. If the token is still empty, `FAILED` names `AWS_SESSION_TOKEN` before STS. A value already set in the chosen mode is not prompted again.

Do not accept secrets in process arguments. Hidden prompts must not echo.
Help examples use placeholders, never real-looking keys such as `AKIA…`.
Help/usage must name every runtime input from the guide, including **Connected App Client Secret** (`ANYPOINT_CLIENT_SECRET` or hidden prompt, never a process argument). A help page that lists `--client-id` but not the secret is a generation failure.
Python argparse dests use underscores (`args.anypoint_base`). `args.approve-mapping` is a generation failure. After mapping approval, live must reach the Connected App secret prompt in the same process.
AWS Access Key / Secret / Session Token must strip wrapping quotes before ASIA detection. `startswith("ASIA")` on the raw prompt string is a generation failure (`InvalidClientTokenId`). A `--help` row that treats the session token as a normal flag is a generation failure. `ASIA` without `AWS_SESSION_TOKEN` after env, file, and the hidden prompt, and without `--profile`, is `FAILED` before STS.
Non-interactive execution must report all missing inputs at once before making a
provider request.

## Pull bundle and auth parity

For a provider that already has a pull-scanner connection form:

1. Implement only its API inventory and scanner asset type.
2. Implement only the customer-selected portable auth profile, fixed scope, and
   provider-specific fields.
3. Expose the profile fields the customer script asks for, with the pull form's
   exact label. Skip any field with `customerScript: false`. For AWS that skip
   is Hub Role ARN, Spoke Role Name, External ID, Account IDs, and Target
   Regions. AWS login is `--profile` / `AWS_PROFILE` (`~/.aws/config`) or
   `default-chain` when the machine is already logged in, or access keys from
   the input file or the environment, plus one region. `--profile` is AWS only;
   Azure uses `az` / DefaultAzureCredential; GCP uses `gcloud` ADC. A `--help`
   that omits `--profile` on AWS, or adds `--profile` on Azure/GCP, is a
   generation failure. A `--help` row for a skipped hub/spoke field is a
   generation failure.
4. Keep a secret field secret even when CI injects it instead of a person
   entering it through a hidden prompt.
5. Cite the bundle, profile, credential class, and API inventory in the guide.
6. Show the auth request/signing behavior and safe response fields without
   printing token bodies, signatures, private keys, or credential values.

Do not emit a generic runtime auth selector when the selected bundle has one
portable method. If the pull bundle offers several profiles, resolve one during
generation. A profile marked `managed-only` is not executable evidence for a
customer-hosted script; request and approve a customer-side replacement auth
contract before generating live-capable code.

The generated script performs the entire adapter run in one process:

```text
provider auth -> identity/read test -> list and fetch selected asset type
-> map and validate -> show JSON and field provenance -> MuleSoft auth
-> POST /push -> ask "Commit this scan? [y/N]" (non-TTY uses `--commit` / `PUSH_COMMIT`) -> redacted final result
```

Dry-run stops before MuleSoft authentication and writes inspectable ZIPs. The
chat yes is the only mapping approval. `MAPPING_FINGERPRINT` is a record of
that yes. A run does not refuse live because a fingerprint is pending.

## Authentication-family completeness

Generate inputs only for the customer-selected scheme from the selected profile
or supplied contract. Complete that scheme using authoritative protocol
documentation when the API description omits a required companion value.

| Selected scheme | Completeness checks |
|---|---|
| Signed cloud request | Documented SDK/default-chain sources, identity/key, secret, region or scope, temporary session token when applicable, request signing, and an identity test |
| OAuth or OIDC | Exact grant or workload flow, token URL, client/workload identity, secret or certificate only when selected, required scopes/audience, form encoding, expiry/refresh behavior |
| API key, PAT, or bearer token | Exact header/query location and name, base URL, tenant/workspace selectors, expiry behavior, and a safe identity/read test |
| Basic authentication | Documented username/password or token-as-username semantics, transport requirements, and a safe identity/read test |
| mTLS | Client certificate, private-key and CA/trust references, formats, hostname verification, and rotation expectations |
| Managed/workload identity | Runtime identity source, tenant/project/account selectors, audience/scopes, token acquisition library, and identity test |
| Service-account/JWT | Account identity, private key or key reference, issuer/audience, scopes, token URL, algorithm, and lifetime |

These rows are completeness checks, not a provider catalog. Emit only the row
selected and proven by the pull profile or customer contract. Never switch
schemes automatically after an authentication failure. Secret values never
appear in process arguments or output.

Treat the authentication protocol and runtime delivery as separate concerns.
For a current pull bundle, preserve the profile's logical fields even when the
customer injects them from a secret store. For a new provider, do not emit a
method or field unless its contract and selected environment prove it.

If several documented methods must be supported in one generated script, add an
explicit non-secret authentication-mode selector. Validate all inputs for the
selected mode before the first request. Do not probe modes, infer a mode from
which secrets happen to be present, or silently fall back after failure.

MuleSoft rows include Anypoint host, organization id, scanner configuration id,
Connected App client id, and Connected App secret. Asset type is a source
constant from skill generation, not a runtime row. Token and
scanner share that host: `{ANYPOINT_BASE}/agent-scanner`. Do not ask for another
URL, do not add `--scanner-base` / `SCANNER_BASE`, and do not hard-code an
Anypoint environment or a laptop URL. The secret has no process-argument form.

## Human-readable execution

Write detailed progress to stderr and one structured result to stdout. Use
stable numbered stages adapted to the provider. Print a stage banner only
when that stage runs. `--verbose` and `--debug` add per-id skip lines and
per-page detail; they are not required to see that discovery happened.
Zero matching assets after shaping zips: print `No matching {ASSET_TYPE}
assets found.`, print JSON, exit 0, and do not print MuleSoft / publish /
commit stages. `PUSH_ALLOW_EMPTY=yes` on a live run is the only empty-commit
hatch.

Do not describe the generated program as a product command. Usage/help must be
idiomatic for the selected language and must list every runtime input from the
guide (parameters, environment variables, prompts, secrets-as-env-only). A
Python stub of only `--region`, `--dry-run`, `--verbose`, and `--anypoint-host`
is a generation failure.

```text
Step 1: resolve and validate inputs
Step 2: authenticate and test provider access
Step 3: discover assets
Step 4: map and validate artifacts
Step 5: review and write ZIPs
Step 6: authenticate to MuleSoft
Step 7: upload
Step 8: partial workspace POSTs /commit with complete false and does not ask. A full success asks "Commit this scan? [y/N]"
```

Dry-run executes steps 1–5, writes inspectable ZIPs, then logs that upload and
commit were skipped. That message is expected. The mapping was approved in chat,
so live is not refused for a pending fingerprint. A partial workspace still
calls `POST /commit` with `complete: false` and does not ask. A full success
asks "Commit this scan? [y/N]". The default is no. `--commit` or
`PUSH_COMMIT=yes` is that yes when there is no prompt, and that yes sends
`complete: true`. Live without `--commit` on a full success uploads and stops.

Before discovery, explain:

- what the script reads from the provider
- what leaves the customer environment
- what remains local
- selected operations and target asset type
- selected provider authentication scheme and how each missing value is
  supplied without exposing secrets
- input precedence and secret handling
- dry-run versus live behavior

For every page, log operation name, page number, records received, continuation
presence, cumulative count, skipped count, and completeness. For every asset,
log type, stable external id, display name, validation result, ZIP path, and
upload result. Do not print raw provider bodies by default.

Default output is detailed operator guidance: numbered stages, identity-test
result, per-page counts, per-asset id/name/ZIP path, fingerprint and approval
state, and a plain-English next action. Add verbose and debug modes when
idiomatic for the selected runtime. Use a run id and timestamps or a structured
equivalent. On failure, print one actionable block containing severity, stage,
operation, redacted method/URL, status or provider error code, provider request
id when available, affected non-secret asset id, retry count, retryability,
completeness impact, whether upload or commit ran, a redacted response excerpt,
plain-English explanation, and next action. Avoid raw tracebacks for expected
provider or HTTP failures. Debug output may include a redacted stack trace and
response metadata, never authorization material or an unfiltered payload.

Use bounded retries only for documented transient failures such as throttling,
timeouts, and selected 5xx responses. Respect `Retry-After` when supplied, add
jitter, and log every attempt. Do not retry invalid credentials, authorization
denials, contract violations, or validation failures as though they were
transient.

## Mapping review

Print the mapping before writing ZIPs and repeat it in the final result. Build a
deterministic SHA-256 fingerprint over the canonical authentication plan,
operations, field rows, transformations, validations, and target ZIP layout.
The skill shows the mapping in chat and asks exactly "Does this look fine?"
before any files exist. After yes, write the script. Do not ask them to approve
the mapping again when the script runs. Do not refuse live because a fingerprint
is pending or missing. The chat yes is the approval.

Each row contains:

```json
{
  "targetPath": "<externalId>/specification/a2a-card.json",
  "targetField": "url",
  "required": true,
  "sourceOperation": "getAgent",
  "sourcePath": "$.agent.endpoint",
  "transformation": "parse and require public HTTPS",
  "validation": "absolute HTTPS URL",
  "evidence": "OpenAPI components.schemas.Agent.properties.endpoint"
}
```

Include representative generated `config.json` and artifact JSON. Redact secret
or unrelated response values. Mark large-artifact previews as truncated and
identify the local full ZIP.

## Structured final result

Include at least:

```json
{
  "ok": true,
  "discoveryComplete": true,
  "provider": "customer-approved identifier",
  "assetType": "agent",
  "mode": "dry-run",
  "inputs": {},
  "operations": [],
  "mappingReview": {
    "approved": false,
    "approvalState": "pending",
    "fingerprint": "sha256:<hex>",
    "authentication": {},
    "credentialManifest": [],
    "fields": [],
    "zipLayout": [],
    "sample": {}
  },
  "counts": {
    "discovered": 0,
    "mapped": 0,
    "skipped": 0,
    "failed": 0,
    "uploaded": 0
  },
  "truncated": false,
  "failures": [],
  "publish": {
    "workspaceRunId": null,
    "scanRunId": null,
    "committed": false,
    "complete": null
  }
}
```

Never include secret values, bearer tokens, authorization headers, private keys,
session tokens, full credential-bearing URLs, or unfiltered provider responses.

Every failure result also includes `error.stage`, `error.operation`,
`error.code`, `error.retryable`, `error.completenessImpact`, `error.nextAction`,
and the non-secret run id. Keep human-readable stderr and structured stdout
consistent.

## Customer guide

Start with the operation table, credential/input manifest, complete field-level
provenance table, ZIP paths, and representative JSON. Then document:

- source specification and exact operations used
- selected provider authentication scheme, why it was selected, contract
  evidence, credential-source choice, complete credential manifest, safe
  acquisition, validation, refresh/expiry behavior, and input precedence
- language/runtime and dependency rationale
- prerequisites and least-privilege provider permissions
- preliminary validation, mapping/authentication approval, final validation,
  help, dry-run, verbose/debug, live, and non-interactive execution examples
- expected logs, final result fields, and ZIP inspection
- secret-store integration appropriate to the selected environment
- CI/scheduler integration without generating that infrastructure
- safe reruns and unchanged server-side versioning/reconciliation ownership
- symptom-driven debugging for auth, permissions, pagination, empty inventory,
  invalid source data, mapping failure, ZIP rejection, token failure, push
  failure, partial upload, and commit failure

Use placeholders rather than real credentials in every example.

## Validation and approval gates

Before presenting the approval package, perform preliminary engineering checks:

1. Run idiomatic syntax/static validation for the selected language.
2. Run unit tests for mapping and safety behavior.
3. Verify help or usage output when the language supports it.
4. Run a dry run and inspect every ZIP entry and JSON document.
5. Confirm no scanner network request occurs during dry-run.
6. Scan generated files and test fixtures for credentials.
7. Verify every emitted field has one provenance row.
8. Verify every required target field is populated and validated.
9. Verify all documented parameters, environment variables, prompts, and final
   result fields match the script.
10. Confirm a run does not ask for mapping approval again and does not exit
    with `MAPPING_APPROVAL_REQUIRED`. Files are written only after "Does this look fine? Yes".

After the customer says yes, write the files. Do not ask them to approve the
mapping again. Verify verbose/debug redaction, failure output for each major
stage, the actual mapping against every approved row, and the exact
customer-facing help and usage examples.

Keep generated, preliminarily tested, mapping approved, finally validated,
published, reconciled, and visible-in-Exchange status as separate claims.

## Language parity

The adapter job is identical in every language the customer named. Emit that
language. Do not switch to Python because it is easier. A file that parses but
passes a mangled region (`us-east-1}`), skips a filled flag, or omits mapping /
push / default-off commit is a generation failure. The upload call is POST /push with the ZIP as multipart part `file` (filename `{externalId}.zip`). JSON, `json=`, or `Content-Type: application/json` on `/push` is a generation failure (HTTP 415). A multipart boundary that starts with `=` is a generation failure. The finish call is POST /commit with the `workspaceRunId` from the 202. Inventing `run-…` or committing after zero accepted uploads is a generation failure. POST /seal, POST /complete, and POST /push-assets are generation failures.

Before claiming it works, run that language's syntax or static check on the
file you wrote. `bash -n` is not sufficient: do not nest
`${a:-${b:-x}}}}`; assign flag, then env, then prompt in separate statements;
quote every expansion. If you cannot run the checker, search the file for
those forbidden patterns and fail the generation.

## Identical customer UX

Flags, env names, numbered stderr steps, the FAILED block, and JSON stdout keys
are the same for AWS, Azure, GCP, and every other provider, and the same in
Python, Bash, Node, Java, Go, and PowerShell. Provider-specific pieces are only
the pull-form fields and that bundle's list/probe/export calls.

One run uses one mode. Input file, or parameters, or prompts. Do not fill a
gap from the next mode. A missing required value in file or parameters mode is
one FAILED block. Prompts mode asks once, in the same process, and does not
tell them to rerun. A session token or a private key is not a prompt.

`--verbose` adds per-page, per-asset, and per-skip detail on stderr. It does
not change JSON keys. Default stderr prints only the stages that ran, a
`listed N, matching M, skipped K` summary, and one line per **matching**
asset (`type`, external id, display name). Skip ids are counted in `skipped`.

Discovery is asset-type specific. A shared provider list is not permission to
publish another type. AgentCore MCP must handshake at
`/runtimes/{urlencoded ARN}/invocations?qualifier={endpointName}` with
`Accept: application/json, text/event-stream`; a null `initialize` is a skip
counted in `skipped` (print the id only with `--verbose`).
`/runtimes/{id}/invocations/mcp` is a generation failure.
AgentCore agents must skip `serverProtocol=MCP` without printing each skip
on a default run. Zipping an agent runtime
as `mcp` (or an MCP runtime as `agent`) is a generation failure.
