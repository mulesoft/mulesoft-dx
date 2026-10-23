# Updating the bundled validator

Four things can go stale: the **plugin jar** (`lib/mule-dx-mule-dev-plugin-all.jar`,
which now shades the seven axes) plus the **CLI jar** built against it, the
**connector descriptors** (`dsl/`), the **DataWeave capability manifest override**
(`rds-override/`), and the other **classpath jars** (`lib/`). Refresh only what
changed. All paths below are relative to this skill's root.

## 1. Rebuild the plugin jar + CLI jar (`lib/`)

The seven switch axes are shaded **inside** `mule-dx-mule-dev-plugin-all.jar` — there
is no loose-class overlay. Rebuild when any axis changes in `mule-dx-mule-dev-component`.
Two artifacts come out: the shaded plugin jar (`shadowJar`) and the headless CLI jar
(compiled from the bundled `src/` against it).

```bash
JHOME=/opt/homebrew/opt/openjdk@17            # a real JDK 17 (PATH java may be a stub)
REPO=.../mule-dx-mule-dev-component
SKILL=.                                        # this skill dir
L="$SKILL/lib"

# (a) shade the plugin (produces .../build/libs/mule-dx-mule-dev-plugin-3.32.0-SNAPSHOT-all.jar).
#     Skip tests and the TS-model generation (the latter writes into the vscode source tree).
#     Requires NEXUS_USERNAME/NEXUS_PASSWORD in the env for dependency resolution.
( cd "$REPO" && ./gradlew :mule-dx-mule-dev-plugin:shadowJar \
    -x test -x generateModels -x generateCanvasModel -x generatePlatformModel \
    -x generateMuleServiceModel -x generateUIFormServiceModel )
cp "$REPO/mule-dx-mule-dev-plugin/build/libs/mule-dx-mule-dev-plugin-3.32.0-SNAPSHOT-all.jar" \
   "$L/mule-dx-mule-dev-plugin-all.jar"

# (b) the headless CLI (its source is bundled under src/ for exactly this), packaged as its own jar
rm -rf "$SKILL/.cli-build"; mkdir -p "$SKILL/.cli-build"
"$JHOME/bin/javac" -cp "$L/*" -d "$SKILL/.cli-build" "$SKILL/src/VersionlessValidatorCli.java"
"$JHOME/bin/jar" cf "$L/versionless-validator-cli.jar" -C "$SKILL/.cli-build" .
rm -rf "$SKILL/.cli-build"
```

The classpath is `rds-override:lib/*` (see `scripts/validate.sh`,
`CP="${SKILL_DIR}/rds-override:${LIB}/*"`). **Order matters:** `rds-override/` must come
first so its `rds/dwx-capabilities.json` wins the stub's first-match-wins lookup over the
stale copy inside the plugin jar (see section 2b). Nothing else overrides a jar, so the
relative order of the jars themselves is irrelevant. **Always re-run the equivalence check
below after rebuilding the plugin jar** — a shaded jar from a different plugin HEAD can
silently change findings.

> Reproducibility: the axis sources are committed at
> `3bb467c3f934e1f63757cefa74ecbd30b91f1d9b` (tip of branch
> `feat/versionless-switch-compat-axes` — the `VersionlessValidator` orchestrator plus the
> five `*compat/` dirs). The pivoted dwcompat/rds files (nested-FQN `dw::Runtime` model, with
> the two DW-axis fixes below) are disjoint — the axes branch touches none of them — so the
> shipped jar is built by checking out the axes tip and overlaying the six pivot files from the
> **merge of two fix branches**, both stacked on `309a560e1` ("Unwrap dw::Runtime into nested
> member FQNs"):
>
> - `fix/dwx-runtime-wildcard-partial-info` @ `010cc58cf` — FIX 1: a bare/wildcard import of a
>   partially-supported module (one with at least one supported member FQN) downgrades from
>   BLOCK to INFO.
> - `fix/dwx-java-writer-passthrough` @ `1273e8307` — FIX 2: an `application/java` output
>   (a format with no byte serializer) is a passthrough INFO rather than a BLOCK.
>
> The six pivot files are `DwxCapabilityManifest`, `DwxClassifier`, `SymbolCollector`,
> `SymbolReference`, the baked `rds/dwx-capabilities.json`, and the dwcompat test. The two
> fixes are disjoint siblings (MODULE vs WRITER regions of `DwxClassifier`); their only merge
> conflict is the class Javadoc — keep both narrative blocks. All three branches are unmerged
> upstream, so check them out explicitly rather than relying on `main`.

## 2. Refresh the connector descriptors (`dsl/`)

The flow axis decides element support against `dsl/<name>/dsl.json`. Refresh them
with `scripts/regen-dsl.sh`, which **generates** `http`, `twilio`, and `mule-core`
from each connector's `extension-model.json` via the versionless `descriptor-gen`
CLI — the same CLI the Maven packager (`ConnectorSchemaResolver`) drives at build
time — instead of hand-copying go-runtime's `dsl.json`. descriptor-gen reproduces
those three byte-for-byte, so the script gates every run on an exact parity check.

```bash
scripts/regen-dsl.sh           # regenerate dsl/ (writes)
scripts/regen-dsl.sh --check   # parity gate only: verify, no writes (use in CI / pre-commit)
```

It resolves `descriptor-gen` from the sibling `build-run-versionless-app` skill's
`bin/<os>-<arch>/` (override with `--descriptor-gen <path>`) and reads inputs from
the workspace `go-runtime/` sibling (override with `--go <dir>`). Exit codes: 0
clean/refreshed, 1 unexpected drift, 2 usage/missing-input.

**`salesforce` is the one exception — it stays a verbatim go-runtime `cp`** (the
script does this copy for you). descriptor-gen hyphenizes the operation element
names (`describeSObject` → `describe-s-object`, `getUserInfo` → `get-user-info`),
but the flow axis resolves an app's XML elements by exactly that `elementName`, and
the connector's own `extension.xsd` and go golden use the camelCase form. The
element name isn't stored in the extension model, so hyphenize can't recover it —
generating salesforce would manufacture a flow-axis false-negative on those two
ops. See `docs/OPEN-ITEMS.md` O8.

Add a connector by listing it in `regen-dsl.sh` (in `GENERATED_CONNECTORS` once its
descriptor-gen output is parity-verified, else `COPIED_CONNECTORS`); the CLI loads
every `<name>/dsl.json` under the dsl dir as a bundle. The flow axis reads only
`name` + `dslJson`, so no model/xsd is needed.

To validate against a *specific* staged runtime instead of the bundled descriptors,
pass `--dsl-dir <ACB-cache>/.cache/versionless` to `validate.sh`.

**`mule-core/dsl.json` stays a verbatim go-runtime copy — do NOT hand-edit it.** It lists
constructs the versionless Rust runtime does not implement (`try`, `scatter-gather`,
`parallel-foreach`, `round-robin`, `first-successful`, `until-successful`) plus the
`raise-error` operation. The CLI prunes exactly those seven core-namespace entries at load
(`VersionlessValidatorCli.pruneUnsupportedCoreElements`), so the flow axis flags them.
Keeping the prune in code (not in the file) means the blind `cp` above stays safe. If the
versionless runtime builder (`register_core`/`register_ee`/`register_apikit` in
mule-versionless `runtime/builder/src/builders.rs`) starts or stops supporting a core
element, update `CORE_UNSUPPORTED_BY_RUNTIME` in the CLI and rebuild the CLI jar (section 1,
step (b)). (`async` was on this list until mule-versionless master registered it via
`build_async`, PRs #253/#305 — it is now runtime-supported and no longer pruned.)

## 2b. Refresh the DataWeave capability manifest override (`rds-override/`)

`rds-override/rds/dwx-capabilities.json` is the DataWeave capability manifest the classifier
reads. It is prepended to the classpath so it wins the stub's first-match-wins resource lookup
(`rds/dwx-capabilities.json`) over the copy baked into the plugin jar. The two manifests disagree
in both directions; the override is right on balance:

- The baked copy is **stale on data formats** — it marks `yaml`, `excel`/`xlsx`, `properties`,
  `octet-stream`, and `binary` as *unsupported* writers even though the versionless engine
  implements them, and conversely marks `avro`/`protobuf` *supported* even though the engine does
  not. The override is the engine's own generated output, so it has these right.
- The override, being generated, is in turn **wrong on four entries** that we correct by hand after
  each refresh (below). Corrections (1)-(3) are stale-verdict flips the baked copy gets right;
  correction (4) is the nested-FQN `dw::Runtime` shape paired with the shipped FIX 1.

Base manifest — the versionless engine's own generated output, authoritative for the
format/module/native sets:

```bash
VL=.../mule-versionless
git -C "$VL" show origin/master:dwx-rust/capabilities/capability-manifest.json \
  > rds-override/rds/dwx-capabilities.json
```

(An older copy lived at `rust-runtime services/design-service/assets/dwx-capabilities.json`
with 20 supported writers; the `mule-versionless` master manifest is newer — 30 supported
writers — and is generated by the Rust DW engine itself, so it supersedes the rust-runtime
copy. Only `natives`/`modules`/`readers`/`writers` are read by the Java deserializer; the
extra keys are ignored, so the richer schema is drop-in.)

> **CAVEAT — the committed artifact lags the generator.** `git show origin/master:…
> capability-manifest.json` fetches the *vendored blob*, which is regenerated by hand and can
> be months behind the generator code. As of 2026-10-22 it was last written by `d982842b`
> ("dwx vendored blob", **Aug 26 2026**), ~2 months before PR **#358** (`cda7b6fd`) rewrote the
> generator to classify partially-supported modules. So this base manifest still lists
> `dw::core::Dates`, `dw::core::Binaries`, and `dw::Runtime` flatly in `modules.unsupported`
> with no nested member FQNs — i.e. a refresh here does **not** pick up #358's Dates/Binaries/
> fromBase64 fixes. Those stay false positives until someone runs the generator and commits a
> fresh `capability-manifest.json` upstream (or this step is changed to run the generator
> rather than `git show` the blob). Verify freshness before trusting a refresh:
> `git -C "$VL" log -1 --format='%ci %s' origin/master -- dwx-rust/capabilities/capability-manifest.json`
> — if that date predates the DW capability work you expect, the blob is stale.

**Re-apply the four corrections.** The generated manifest is wrong on exactly these, each a
confirmed runtime capability — not a speculative flip. This step is idempotent; run it after
every refresh, or the `aaa-template` / perf-repo false positives come back (`dw::util::Timer`
module, `output application/java`, and `import * from dw::Runtime`). Correction (4) is the
override half of the shipped **FIX 1** (wildcard import of a partially-supported module →
INFO); it must carry the nested-FQN shape the jar reads, and the jar + override must be
refreshed together (see the FOOTGUN note in correction (4)):

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path("rds-override/rds/dwx-capabilities.json")
m = json.loads(p.read_text())

# (1) system::now/uuid/random are all registered in the runtime, in the same dw-runtime
#     .../natives/core.rs dispatch table (`fn now`/`fn uuid`/`fn random` + the matching
#     `"system::now" => now` / `"system::uuid" => uuid` / `"system::random" => random`
#     arms, core.rs:~222/296). The generated manifest predates that wiring and still marks
#     uuid/random unsupported (now was corrected earlier); the plugin's baked copy already
#     has all three true. Flip all three here so dwx.native.unsupported stops false-firing
#     on uuid()/random() (OPEN-ITEMS O1).
for n in m["natives"]:
    if n.get("systemSym") in ("system::now", "system::uuid", "system::random"):
        n["supported"] = True

def promote(bucket, name):
    if name in bucket["unsupported"]:
        bucket["unsupported"].remove(name)
    if name not in bucket["supported"]:
        bucket["supported"].append(name)
        bucket["supported"].sort()

# (2) dw::util::Timer's only non-Null leaf is now(); once now() resolves the module resolves.
#     Pure cascade of (1).
promote(m["modules"], "dw::util::Timer")

# (3) application/java is the in-memory Mule value representation, NOT a serialization format.
#     The runtime never serializes it: uses_format_writer() (dwx/src/dwx_evaluator.rs) returns
#     false for it, so output is taken through the evaluate_value_with_metadata passthrough and
#     no writer is invoked. The generated manifest's writer-probe can't see that and reports
#     NotImplemented -> unsupported, a false negative.
promote(m["writers"], "application/java")

# (4) Model dw::Runtime in the NESTED-FQN shape the shipped jar reads: keep the bare module
#     `dw::Runtime` in modules.unsupported AND list each runnable member FQN
#     (dw::Runtime::{try,fail,props,wait}) in modules.supported. The only genuinely-unrunnable
#     member is version() -> native("system::version"), NOT in any Rust dispatch table
#     (capabilities_probe.rs:96 asserts this intentionally); every other member is registered and
#     runs: try/fail/wait/run/eval (runtime.rs:1696/1697/1701/1702/1703) and props/location
#     (core.rs:294/298). We list only try/fail/props/wait (the four the committed golden manifest
#     carries); version has no member entry, so it inherits the module's unsupported verdict and a
#     selected `import version from dw::Runtime` still BLOCKs. This shape matches the generator's
#     nested-FQN output (mule-versionless `309a560e1` "Unwrap dw::Runtime into nested member FQNs")
#     and the baked manifest in the shipped plugin jar. Idempotent.
#
#     The jar and this override MUST carry the SAME shape. FIX 1's isPartiallySupported(module)
#     (DwxClassifier) keys off a nested member FQN (dw::Runtime::try) sitting in modules.supported
#     while the bare module sits in modules.unsupported. With that pairing a bare/wildcard
#     `import * from dw::Runtime` is INFO (dwx.module.unsupported, "only partially supported …
#     verify … version"), and a selected `import version` still BLOCKs.
#
#     FOOTGUN — do NOT revert to the retired partition shape (a `partiallySupported` key with
#     dw::Runtime removed from modules.unsupported). Against the shipped nested-FQN jar the
#     DwxClassifier MODULE case only fires when the bare module is IN modules.unsupported; if
#     dw::Runtime is absent from unsupported, a wildcard import matches nothing and produces NO
#     finding at all — a silent false negative, strictly worse than either BLOCK or INFO. The jar
#     reads supported/unsupported string lists only; the `partiallySupported` key is dead (Gson
#     ignores it). Shape the override to the jar, not to the retired reader.
mods = m["modules"]
# drop the retired partition key if a stale override still carries it
mods.pop("partiallySupported", None)
if "dw::Runtime" not in mods["unsupported"]:
    mods["unsupported"].append("dw::Runtime")
for member in ("dw::Runtime::try", "dw::Runtime::fail", "dw::Runtime::props", "dw::Runtime::wait"):
    if member not in mods["supported"]:
        mods["supported"].append(member)
mods["supported"].sort()
mods["unsupported"].sort()

p.write_text(json.dumps(m, indent=2) + "\n")
print("corrections applied")
PY
```

**Deliberately NOT corrected** — these stay `unsupported` and must match the runtime:

- `application/java` **reader** — you cannot parse raw bytes *as* an in-memory Mule value; there is
  no `application/java` reader on any branch. Only the writer side is a passthrough.
- the short `java` token — the loader-qualified `java!` form is a hard block (`dwx.module.java`);
  the bare `java` format stays unsupported in both manifests.

Verify the post-conditions (this replaces the old "`application/java` must be in
`writers.unsupported`" check, which was backwards — see correction (3) above):

```bash
python3 - <<'PY'
import json
m = json.load(open("rds-override/rds/dwx-capabilities.json"))
for sym in ("system::now", "system::uuid", "system::random"):
    nat = next(n for n in m["natives"] if n.get("systemSym") == sym)
    assert nat["supported"] is True, f"{sym} is registered in the runtime (core.rs dispatch table)"
assert "dw::util::Timer" in m["modules"]["supported"]
assert "dw::util::Timer" not in m["modules"]["unsupported"]
assert "application/java" in m["writers"]["supported"]
assert "application/java" not in m["writers"]["unsupported"]
assert "application/java" in m["readers"]["unsupported"], "reader stays unsupported"
assert "java" in m["writers"]["unsupported"], "short java token stays unsupported"
mods = m["modules"]
# Nested-FQN shape the shipped jar reads: bare module unsupported + runnable members supported.
assert "dw::Runtime" in mods["unsupported"], "bare dw::Runtime must stay unsupported (FIX 1 keys the MODULE case off it; absent => wildcard produces NO finding, a silent false negative)"
members = {s for s in mods["supported"] if s.startswith("dw::Runtime::")}
assert members == {"dw::Runtime::try", "dw::Runtime::fail", "dw::Runtime::props", "dw::Runtime::wait"}, \
    "runnable members (try/fail/props/wait) must be listed supported; version is omitted so it inherits the module's BLOCK"
assert "partiallySupported" not in mods, "the retired partition key is dead — the shipped jar ignores it; its presence signals a stale override"
print("override post-conditions OK")
PY
```

The real long-term fix is upstream, and it has two halves. (1) The generator must emit the right
classification — PR #358 (`cda7b6fd`) already did this: it marks `system::now` supported (cascading
to `dw::util::Timer`), classifies Dates/Binaries as supported, and emits `dw::Runtime` members as
nested FQNs. (2) Someone must then **run that generator and commit the regenerated
`capability-manifest.json`** — #358 did NOT do this, so the vendored blob is still stale (see the
CAVEAT above). Only once a *fresh* manifest is committed will refreshing this override pick up the
Dates/Binaries/fromBase64 fixes and let the correction step shrink. The `application/java` writer
passthrough is still a genuine generator gap even on #358, so correction (3) stays until that lands.
Until both halves are true, this override plus its corrections is load-bearing. (Note: unlike the
pre-FIX-1 bundle, `import * from dw::Runtime` is now INFO, not a BLOCK — the shipped jar carries FIX 1
(`DwxClassifier.isPartiallySupported`), which pairs with correction (4)'s nested-FQN shape to downgrade
a wildcard import of a partially-supported module. This is a coupled jar+override change; a mismatched
pair re-blocks or, worse, silently hides the import — see correction (4)'s FOOTGUN.)

## 3. Refresh the other classpath jars (`lib/`)

Rarely needed — only when a provided-scope dep is rebuilt. (For the plugin jar + CLI
jar, see section 1.) The proven minimal set is the **5 jars** in `lib/`; see
`PROVENANCE.txt` for what each supplies and where it came from. The two large fat jars
(`mule-dx-mule-dev-plugin-all.jar`, `mule-dx-platform-5.10.1-all.jar`) come from the
respective repos' `build/libs`; `scala-library` and `tooling-api` are standard Maven
artifacts resolvable by coordinate; `versionless-validator-cli.jar` is built in section 1.

**Coupling to watch when refreshing `mule-dx-platform-5.10.1-all.jar`:** that fat jar
shades gson, lsp4j, maven-model, and slf4j, which is why those four standalone jars are
*not* bundled. If you refresh platform and its shading changes, re-run the leave-one-out
check below; if the result degrades or a `NoClassDefFoundError` appears for one of those
(`com/google/gson/*`, `org/eclipse/lsp4j/*`, `org/apache/maven/model/*`, `org/slf4j/*`),
re-add that standalone jar to `lib/`:

```bash
# resolve a standalone jar into lib/ by Maven coordinate, e.g. gson:
mvn -q dependency:copy \
  -Dartifact=com.google.code.gson:gson:2.10.1 \
  -DoutputDirectory="$SKILL/lib"
```

Verify any `lib/` change with the leave-one-out sweep: drop each jar in turn, re-run against
a multi-axis app (one with many DataWeave expressions and a TLS/config blocker, e.g. a classic
`aaa-template`-shaped app), and confirm the finding set is byte-identical. All five current jars
are load-bearing — each fails fast with `NoClassDefFoundError` when removed. A jar that could be
dropped with no change would be redundant and should not be bundled.

## Verify after any change

```bash
./scripts/validate.sh <a-real-mule-app>
```

Expect a BLOCK/INFO summary and a `<app>-versionless-switch-report.json`. A clean app exits 0; an app with an
unsupported element exits 3; a corrupt bundle (manifest unreadable) exits 1.

**Equivalence check after a plugin-jar rebuild (section 1).** Because a shaded jar from a
different plugin HEAD can silently shift findings, diff the full `ValidationResult` against a
known-good baseline — not just the exit code. Run the new bundle against both a multi-blocker app
and a clean app, and confirm every field of every finding matches:

```bash
# baseline (previous bundle) -> /tmp/base-*.json, candidate (new bundle) -> /tmp/cand-*.json, then:
python3 - <<'PY'
import json
def norm(p):
    d=json.load(open(p)); d['findings']=sorted(d['findings'],
        key=lambda f:(f.get('ruleId'),f.get('symbol',''),f.get('startLine'),f.get('startColumn'),f.get('scriptStartLine')))
    return d
for n,b,c in [("multi","/tmp/base-multi.json","/tmp/cand-multi.json"),("clean","/tmp/base-clean.json","/tmp/cand-clean.json")]:
    print(n,"identical:", norm(b)==norm(c))
PY
```
