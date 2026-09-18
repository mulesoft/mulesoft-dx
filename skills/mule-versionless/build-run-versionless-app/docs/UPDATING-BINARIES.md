# Updating the bundled binaries

The skill ships three native binaries in `bin/<os>-<arch>/` (currently
`darwin-arm64` only). They're on no package registry — the only way to get them
is to build from the `mule-versionless` repo.

## The rule

**Build `mule-ast` and `mule-server` from `master`. Build `descriptor-gen` from
`feat/versionless-descriptor-generation`** — it was never merged to `master`.

| Binary | Crate | Branch | Phase |
|---|---|---|---|
| `mule-ast` | `cli` | `master` | build (XML → `artifact.ast`) |
| `mule-server` | `mule_server` | `master` | runtime (serves flows) |
| `descriptor-gen` | `mule_descriptor_gen` | `feat/versionless-descriptor-generation` | build (schemas) |

> **Trap:** `master` has a different binary called `extension-model-gen` — **not**
> a substitute for `descriptor-gen`. If `git ls-tree -r --name-only origin/master
> | grep extension-model/descriptor-gen` ever returns a hit, the split is gone:
> build all three from `master` and simplify this doc.

## Steps

```bash
cd /path/to/mule-versionless && git fetch origin
SKILL=/path/to/skills/mule-versionless/build-run-versionless-app
BIN="$SKILL/bin/darwin-arm64"

# 1. Build from a detached worktree so your checkout is untouched.
#    cd into it: cargo finds .cargo/config.toml (the vendored-crates source
#    replacement that makes --offline work) from the CWD. Always --offline —
#    the corp network can't reach crates.io.
git worktree add --detach /tmp/mv origin/master
cd /tmp/mv
cargo build --offline --release \
  -p cli --bin mule-ast -p mule_server --bin mule-server

# 2. Back up, swap in, mark executable.
mkdir -p /tmp/skill-bin-backup
cp -p "$BIN"/{mule-ast,mule-server} /tmp/skill-bin-backup/
cp -p /tmp/mv/target/release/{mule-ast,mule-server} "$BIN/"
chmod +x "$BIN"/*

# 3. Clean up (cd out of the worktree first).
cd "$SKILL" && git -C /path/to/mule-versionless worktree remove /tmp/mv --force
```

Refreshing `descriptor-gen` too? Add a second worktree on
`origin/feat/versionless-descriptor-generation`, `cargo build --offline --release
-p mule_descriptor_gen --bin descriptor-gen`, and copy that in as well. It changes
rarely — leaving the bundled one in place is fine.

> If a binary arrives via download instead of a local build, strip the macOS
> quarantine flag or Gatekeeper blocks it:
> `xattr -d com.apple.quarantine "$BIN"/* 2>/dev/null || true`

## Verify (don't skip)

Run the skill's own scripts end-to-end — this exercises every binary the way the
plugin and runtime do:

```bash
"$SKILL/scripts/setup.sh"                                    # smoke-tests binaries
APP=/tmp/vverify; rm -rf "$APP"; cp -R "$SKILL/example-app" "$APP"
"$SKILL/scripts/build.sh" "$APP"                             # expect: artifact.ast ✓
"$SKILL/scripts/deploy-run.sh" start
cp "$APP"/target/*-mule-application-versionless.jar /tmp/vdemo.jar
"$SKILL/scripts/deploy-run.sh" deploy /tmp/vdemo.jar
"$SKILL/scripts/deploy-run.sh" run vdemo/flowtotestpayload '{"msg":"hi"}'  # → Versionless is ready to rock!
"$SKILL/scripts/deploy-run.sh" undeploy vdemo && "$SKILL/scripts/deploy-run.sh" stop
```

All green → the swap is good. Then record what you shipped in
[`../bin/darwin-arm64/PROVENANCE.txt`](../bin/darwin-arm64/PROVENANCE.txt) (source
branch + commit + date — the binaries carry no version string).

## Other platforms

Build the binaries **on that host** and drop them into a matching `bin/<os>-<arch>/`
(e.g. `bin/linux-x86_64/`). The plugin, exchange stub, and example app are
platform-independent — only `bin/` changes.
