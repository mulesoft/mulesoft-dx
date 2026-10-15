# Updating the bundled validator

Three things can go stale: the **plugin jar** (`lib/mule-dx-mule-dev-plugin-all.jar`,
which now shades the seven axes) plus the **CLI jar** built against it, the
**connector descriptors** (`dsl/`), and the other **classpath jars** (`lib/`).
Refresh only what changed. All paths below are relative to this skill's root.

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

The classpath is simply `lib/*` (see `scripts/validate.sh`, `CP="${LIB}/*"`); order no
longer matters because nothing overrides the jar. **Always re-run the equivalence check
below after rebuilding the plugin jar** — a shaded jar from a different plugin HEAD can
silently change findings.

> Reproducibility caveat: as of the 2026-10-15 build the axis sources were still
> *uncommitted* in the plugin working tree (`VersionlessValidator.java` modified; the
> five `*compat/` dirs untracked on `chore/maven-build-changes`). Until that work lands
> upstream, regenerating the identical jar depends on that working-tree state — not on a
> clean checkout of a committed SHA.

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

Expect a BLOCK/INFO summary and `report.json`. A clean app exits 0; an app with an
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
