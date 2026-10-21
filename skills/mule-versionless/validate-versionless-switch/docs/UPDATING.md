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
> `e009aee2428b499f8e9040330ba9b1c9e4e99a6b` on branch
> `feat/versionless-switch-compat-axes` (the `VersionlessValidator` orchestrator plus the
> five `*compat/` dirs). Build the plugin jar from that SHA. The branch is not yet merged
> upstream, so check it out explicitly rather than relying on `main`.

## 2. Refresh the connector descriptors (`dsl/`)

The flow axis decides element support against `dsl/<name>/dsl.json`. These are
byte copies of the go-runtime descriptors (the runtime's ground truth).

```bash
GO=.../go-runtime
for n in http salesforce twilio mule-core; do
  cp "$GO/connectors/$n/descriptor/dsl.json" "dsl/$n/dsl.json"
done
```

Add a connector by creating `dsl/<name>/dsl.json`; the CLI loads every
`<name>/dsl.json` under the dsl dir as a bundle. The flow axis reads only
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
- The override, being generated, is in turn **wrong on three entries** that the baked copy gets
  right. We correct those three by hand after each refresh (below).

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

**Re-apply the four corrections.** The generated manifest is wrong on exactly these, each a
confirmed runtime capability — not a speculative flip. This step is idempotent; run it after
every refresh, or the `aaa-template` / perf-repo false positives come back (`dw::util::Timer`
module, `output application/java`, and `import try from dw::Runtime`):

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path("rds-override/rds/dwx-capabilities.json")
m = json.loads(p.read_text())

# (1) system::now is registered in the runtime (dw-runtime .../natives/core.rs: `fn now` plus
#     `"system::now" => now` in the dispatch table). The generated manifest predates that wiring
#     and still marks it unsupported.
for n in m["natives"]:
    if n.get("systemSym") == "system::now":
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

# (4) dw::Runtime is PARTIALLY supported: it loads and try/fail/wait/location/props all run;
#     only `version` is unimplemented. The generated manifest classifies modules all-or-nothing,
#     so the one unregistered native taints the whole module to unsupported, making
#     `import try from dw::Runtime` a false BLOCK. Move it to the partiallySupported partition
#     carrying only the member that actually fails. Idempotent. (The matching per-member reporting
#     lives in the plugin jar's dwcompat axis; rule id dwx.module.function.unsupported.)
mods = m["modules"]
mods.setdefault("partiallySupported", [])
if "dw::Runtime" in mods["unsupported"]:
    mods["unsupported"].remove("dw::Runtime")
if not any(e.get("module") == "dw::Runtime" for e in mods["partiallySupported"]):
    mods["partiallySupported"].append({"module": "dw::Runtime", "unsupportedFunctions": ["version"]})

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
now = next(n for n in m["natives"] if n.get("systemSym") == "system::now")
assert now["supported"] is True, "system::now is registered in the runtime"
assert "dw::util::Timer" in m["modules"]["supported"]
assert "dw::util::Timer" not in m["modules"]["unsupported"]
assert "application/java" in m["writers"]["supported"]
assert "application/java" not in m["writers"]["unsupported"]
assert "application/java" in m["readers"]["unsupported"], "reader stays unsupported"
assert "java" in m["writers"]["unsupported"], "short java token stays unsupported"
rt = next((e for e in m["modules"].get("partiallySupported", []) if e["module"] == "dw::Runtime"), None)
assert rt is not None, "dw::Runtime is partially supported"
assert rt["unsupportedFunctions"] == ["version"], "only version is unsupported in dw::Runtime"
assert "dw::Runtime" not in m["modules"]["unsupported"], "dw::Runtime no longer all-or-nothing unsupported"
print("override post-conditions OK")
PY
```

The real long-term fix is upstream: once the versionless engine's generated manifest marks
`system::now` supported (cascading to `dw::util::Timer`) and treats the `application/java` writer as
the passthrough it is, the correction step and the whole override can be dropped — the baked plugin
manifest is already correct on these three, and could then be refreshed (section 1) to pick up the
data-format fixes too. Until then this override plus its corrections is load-bearing.

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
