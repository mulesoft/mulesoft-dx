# Generated script standard

Apply this standard in the customer's requested programming language and project
style.

## Runtime inputs

One run uses one value source. The three sources are OR.

1. **Input file** when `--input-file` / `PUSH_INPUT_FILE` is set.
2. **Parameters** when the file is absent and a value flag is on the command line.
3. **Prompts** when neither file nor value flags were supplied and stdin is a TTY.

Do not switch source mid-run. Inside the chosen source, fill each field in this
order. A variable already in the shell fills the value; a blank prompt must not
erase it.

1. Command flag already set.
2. Else the environment variable.
3. Else the input-file key, when the source is the input file.
4. Else a TTY prompt in this same process. Hide a secret.
5. Else, not a TTY → `FAILED` naming the missing input.

Secrets are never process arguments. Hidden prompts must not echo. Help examples
use placeholders, never real-looking keys. `--help` three columns: Prompt label,
Parameter flag, Input file key. A help page that lists `--client-id` but not
**Connected App Client Secret** / `ANYPOINT_CLIENT_SECRET` is a generation
failure. A help page that lists `--username` but not **Anypoint Password** /
`ANYPOINT_PASSWORD` is a generation failure. Python argparse dests use
underscores (`args.anypoint_base`). `args.approve-mapping` is a generation
failure.

Flags, same spelling in every language: `--dry-run`, `--input-file`,
`--anypoint-base`, `--org`, `--config`, `--scanner-name`,
`--scanner-description`, `--auth-mode`, `--client-id`, `--username`,
`--commit`, `--verbose`, `--help`. No `--asset-type`. No `--client-secret`.
No `--password`. No `--scanner-base`. No `--allow-empty`. Provider flags come
from their auth document.

`--help` must list the caps: 1000 assets per run, 12 MB zip, 5 MB per file,
one zip = one asset, org-wide default 20000 (not 10000).

| Input | Required |
|---|---|
| `ANYPOINT_BASE` | always except `--dry-run` |
| `ANYPOINT_ORG_ID` | always except `--dry-run` |
| `ANYPOINT_AUTH_MODE` | live; `connected-app` or `username-password`. If empty, infer from which credential pair is present (exactly one pair). Mixed or neither is FAILED. |
| `SCANNER_CONFIGURATION_ID` | when not creating |
| `SCANNER_NAME` | when `SCANNER_CONFIGURATION_ID` is empty |
| `SCANNER_DESCRIPTION` | optional; create only |
| `ANYPOINT_CLIENT_ID` | live when mode is `connected-app` |
| `ANYPOINT_CLIENT_SECRET` | live when mode is `connected-app` |
| `ANYPOINT_USERNAME` | live when mode is `username-password` |
| `ANYPOINT_PASSWORD` | live when mode is `username-password` |
| `PUSH_COMMIT` | optional, default no |
| `PUSH_ALLOW_EMPTY` | optional; `yes` is the empty-inventory hatch |

`--dry-run` does not require Anypoint rows and does not create a configuration.

`--help` epilog:

```
Inputs and where to obtain them:
  --anypoint-base / ANYPOINT_BASE: Anypoint host. Scanner path is that host plus /agent-scanner.
    Example US production: https://anypoint.mulesoft.com
  --org / ANYPOINT_ORG_ID: organization id from Exchange or Access Management
  --auth-mode / ANYPOINT_AUTH_MODE: connected-app or username-password
  --config / SCANNER_CONFIGURATION_ID: existing configuration id. Empty creates one.
  --scanner-name / SCANNER_NAME: Name field; used only when creating
  --scanner-description / SCANNER_DESCRIPTION: Description field; optional; create only
  --client-id / ANYPOINT_CLIENT_ID: Connected App Client ID (connected-app)
  Connected App Client Secret: ANYPOINT_CLIENT_SECRET, matching --input-file key, or hidden
    prompt labeled "Connected App Client Secret". Never a process argument. No --client-secret.
  --username / ANYPOINT_USERNAME: Anypoint username (username-password)
  Anypoint Password: ANYPOINT_PASSWORD, matching --input-file key, or hidden
    prompt labeled "Anypoint Password". Never a process argument. No --password.
Caps: 1000 assets per run, 12 MB zip, 5 MB per file, one zip = one asset,
  org-wide default 20000.
Provider flags: only the fields from the authentication document they pasted.
```

## Execution

```text
provider auth -> identity/read test -> list and fetch selected asset type
-> map and validate against schemas/ -> write ZIPs -> MuleSoft auth
-> create configuration if id empty -> POST /push
-> ask "Commit this scan? [y/N]" (non-TTY uses --commit / PUSH_COMMIT)
-> redacted final result
```

Numbered stderr banners, only when that stage runs:

```text
── Step 1: provider login
── Step 2: list assets
── Step 3: shape zips
── Step 4: MuleSoft login
── Step 5: ensure configuration
── Step 6: publish
── Step 7: commit
```

After writing each ZIP, refuse it when the archive is larger than 12 MB or any
entry is larger than 5 MB. Stop listing when matching assets would exceed 1000.
That run is partial (`complete: false`). One ZIP is one asset.

`--dry-run` stops after step 3. Zero matching assets after shaping zips: print
`No matching {ASSET_TYPE} assets found.`, print JSON, exit 0, and do not print
MuleSoft / ensure / publish / commit stages. `PUSH_ALLOW_EMPTY=yes` on a live
run is the only empty-commit hatch.

Caps, enforced in the script (not only documented):

- Stop listing after 1000 matching assets. Set `truncated=true`. Later commit
  is `complete: false`.
- Refuse a ZIP whose byte size is greater than 12 MB. FAILED step=shape-zips.
- Refuse a ZIP entry whose uncompressed size is greater than 5 MB. FAILED
  step=shape-zips.
- One ZIP file is one asset. Do not bundle two assets in one archive.
- Do not tell the operator the org-wide cap is 10000. The server default is
  20000; a 409/429 from capacity is FAILED with the server message, not a
  guessed number.

After a successful list: `listed N, matching M, skipped K`. One line per
matching asset (type, external id, display name). Skip ids only with `--verbose`.

A partial workspace still calls `POST /commit` with `complete: false` and does
not ask. A full success asks "Commit this scan? [y/N]". The default is no.
`--commit` or `PUSH_COMMIT=yes` is that yes when there is no prompt, and that
yes sends `complete: true`. It does not turn a partial inventory into
`complete: true`.

Token request depends on `ANYPOINT_AUTH_MODE`. Never `localhost`. Copy this
helper (or the same bytes in the language they named):

```python
def mint_anypoint_token(base, mode, client_id, client_secret, username, password):
    base = base.rstrip("/")
    if mode == "connected-app":
        body = (
            "grant_type=client_credentials"
            f"&client_id={quote(client_id, safe='')}"
            f"&client_secret={quote(client_secret, safe='')}"
        ).encode()
        req = Request(
            f"{base}/accounts/api/v2/oauth2/token",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
    elif mode == "username-password":
        body = json.dumps({"username": username, "password": password}).encode()
        req = Request(
            f"{base}/accounts/login",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    else:
        raise SystemExit("FAILED step=anypoint-login: unknown ANYPOINT_AUTH_MODE")
    with urlopen(req) as resp:
        return json.loads(resp.read().decode())["access_token"]
```

`connected-app` is form-urlencoded and never JSON. `username-password` is JSON
`{"username","password"}` to `/accounts/login` and never form-urlencoded, and
never `grant_type=password` on the Connected App token URL. Infer mode when
`ANYPOINT_AUTH_MODE` is empty: client id+secret present and username empty →
`connected-app`; username+password present and client id empty →
`username-password`. Mixed or neither is FAILED before any HTTP. Do not try
the other mode after a 401.

Copy `zip_within_caps` from `scripts/anypoint_token.py` (12 MB zip, 5 MB per
file). Call it after writing each ZIP, before `/push`. Copy
`build_scanner_create_body` and `match_target_system` from
`scripts/scanner_create.py` for the create path.

## Mapping fingerprint

The chat yes is the only mapping approval. Record:

```json
{"assetType":"...","rows":[{"source":"...","sentAs":"...","required":true}]}
```

Canonical JSON, UTF-8, keys sorted, rows in the order shown, SHA-256 hex.
`MAPPING_FINGERPRINT` is a record of that yes. A run does not refuse live
because a fingerprint is pending.

## JSON stdout

```json
{
  "ok": true,
  "truncated": false,
  "assetType": "agent",
  "counts": {
    "listed": 0,
    "matching": 0,
    "agent": 0,
    "mcp": 0,
    "rest-api": 0,
    "skipped": 0,
    "failed": 0
  },
  "failures": [],
  "publish": {
    "configurationId": null,
    "configurationCreated": false,
    "uploaded": 0,
    "failed": 0,
    "completed": false,
    "workspaceRunId": null,
    "scanRunId": null,
    "committed": false,
    "complete": null,
    "notes": []
  }
}
```

Never include secrets, bearer tokens, authorization headers, private keys, or
unfiltered provider responses. Only one of `agent` / `mcp` / `rest-api` counts
is non-zero: the baked `ASSET_TYPE`.

## Multipart ZIP upload

Required helper (or the same bytes in the language they named). Copy the
boundary; do not start it with `=`.

```python
def _multipart_zip(filename, payload):
    boundary = "----pushcollector7b1c"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/zip\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    return head + payload + tail, f"multipart/form-data; boundary={boundary}"
```

`requests`: `files={"file": (f"{external_id}.zip", zip_bytes, "application/zip")}`
and do not set `Content-Type` (that drops the boundary → 415). `curl`:
`-F "file=@{externalId}.zip;type=application/zip"`. After writing, search the
script for `json=` or `"Content-Type": "application/json"` on the `/push` URL.
Any match is a generation failure. Search for a boundary that starts with `=`.
Any match is a generation failure.

## FAILED block

Every failure prints this on stderr and exits 2:

```
FAILED step=<name> http=<code>
where: <call>
request: <method and path, no secrets>
response fields: <names only>
why: <one sentence>
body: <response snippet with secrets removed>
next: <what to fix>
```

| http | why | next |
|---|---|---|
| 0 / connection refused | Cannot reach that Anypoint host. | Retry once. Then confirm `ANYPOINT_BASE`. Token, create, push, and commit use `{that host}/agent-scanner`. |
| 401 / 403 first token | Connected App rejected, username/password rejected, MFA required, or missing `manage:exchange`. | Do not retry. connected-app: reset the secret on the same app. username-password: confirm username (not email unless that is the login) and that the account has no MFA. |
| 401 after a good token | Anypoint token expired mid-run. | Remint once in the same `ANYPOINT_AUTH_MODE` and retry the same `/push` or `/commit`. Still 401 → FAILED. Do not switch modes. |
| 404 | Org id, configuration id, or `/agent-scanner` path is wrong. | Stay on `{ANYPOINT_BASE}/agent-scanner`. Create the configuration if the id was empty. Do not retry. |
| 400 / 415 / 422 | Zip refused, schema failed, wrong multipart, `/commit` without a real `workspaceRunId`, or create sent a schedule / stored credential. | Do not retry the same bytes. Check `specification/config.json` against `schemas/`. |
| 409 | Stale `workspaceRunId`, or `/commit` already started. | `GET .../workspace` once and commit the current id. Already started → treat as success. Do not create another scanner. |
| 429 / 502 / 503 / 504 | Transient scanner or proxy. | Retry the same request up to 3 times (`Retry-After` or 1s/2s/4s). Then FAILED, and `/commit` `complete: false` if anything is staged. |

Retry, remint, and stale-workspace rules: `references/failure-and-retry.md` and
`scripts/retry_policy.py`. Several provider accounts: `references/multi-account.md`.

## Ways to run

Show this after the two files exist, in this order, using whatever runs the
language they named (`<run> <script>`). Do not show a Python command unless
they named Python.

Interactive:

```
<run> <script>
```

Parameters (omit `--config` and pass `--scanner-name NAME` to create).
Connected App:

```
export ANYPOINT_CLIENT_SECRET="..."
export PROVIDER_SECRET="..."
<run> <script> \
  --anypoint-base https://anypoint.mulesoft.com \
  --org YOUR_ORG_ID \
  --auth-mode connected-app \
  --config YOUR_CONFIGURATION_ID \
  --client-id YOUR_CLIENT_ID \
  --commit
```

Username/password (no Connected App):

```
export ANYPOINT_PASSWORD="..."
export PROVIDER_SECRET="..."
<run> <script> \
  --anypoint-base https://anypoint.mulesoft.com \
  --org YOUR_ORG_ID \
  --auth-mode username-password \
  --scanner-name "Production Account - Marketing" \
  --username YOUR_USERNAME \
  --commit
```

Input file:

```
<run> <script> --input-file inputs.env
```

Dry-run and help:

```
<run> <script> --help
<run> <script> --dry-run
<run> <script> --input-file inputs.env --dry-run
```

## Language checker

Whatever programming language they named, the generated file must parse in that
language and do the same job. Do not emit Python because another language is
hard.

| They asked | Must pass |
|---|---|
| Python | `python3 -m py_compile FILE`. Search for `args.[a-z]+-`. Any match fails. |
| Node / `.mjs` | `node --check FILE`. |
| Bash | `bash -n FILE`. Sequential assignments only; extra `}` on an expansion is a generation failure. |
| Java | project compile. |
| Go | `go build`. |
| Other | that project's syntax check. |

Python: stdlib plus whatever library their auth document requires. Node: Node
18+ `fetch` unless their project already has an SDK. Bash: `curl`, `jq`, `zip`;
token call is form-urlencoded. Same env names in every language.
