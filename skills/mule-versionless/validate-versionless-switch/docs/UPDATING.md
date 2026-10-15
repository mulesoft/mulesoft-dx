# Updating the bundled validator

Three things can go stale: the **axis classes** (`classes/`), the **connector
descriptors** (`dsl/`), and the **classpath jars** (`lib/`). Refresh only what
changed. All paths below are relative to this skill's root.

## 1. Rebuild the overlay classes (`classes/`)

The overlay is the seven switch axes + the headless CLI, compiled against the
plugin fat jar. Rebuild when any axis changes in `mule-dx-mule-dev-component`.

```bash
JHOME=/opt/homebrew/opt/openjdk@17            # a real JDK 17 (PATH java may be a stub)
PLUGIN=.../mule-dx-mule-dev-component/mule-dx-mule-dev-plugin
FAT="$PLUGIN/build/libs/mule-dx-mule-dev-plugin-3.32.0-SNAPSHOT-all.jar"
SKILL=.                                        # this skill dir
L="$SKILL/lib"

rm -rf "$SKILL/classes"; mkdir -p "$SKILL/classes"

# (a) the seven axis main sources + the orchestrator
"$JHOME/bin/javac" -cp "$FAT:$L/*" -d "$SKILL/classes" \
  "$PLUGIN/src/main/java/org/mule/contribution/internal/project/VersionlessValidator.java" \
  "$PLUGIN/src/main/java/org/mule/contribution/internal/project/configcompat/"*.java \
  "$PLUGIN/src/main/java/org/mule/contribution/internal/project/shapecompat/"*.java \
  "$PLUGIN/src/main/java/org/mule/contribution/internal/project/securitycompat/"*.java \
  "$PLUGIN/src/main/java/org/mule/contribution/internal/project/devxcompat/"*.java \
  "$PLUGIN/src/main/java/org/mule/contribution/internal/project/statecompat/"*.java \
  "$PLUGIN/src/main/java/org/mule/contribution/internal/project/flowcompat/"*.java

# (b) the headless CLI (its source is bundled under src/ for exactly this)
"$JHOME/bin/javac" -cp "$SKILL/classes:$FAT:$L/*" -d "$SKILL/classes" \
  "$SKILL/src/VersionlessValidatorCli.java"
```

The overlay must stay **first** on the runtime classpath (see `scripts/validate.sh`,
`CP="${CLASSES}:${LIB}/*"`) so these win over the baseline axes still inside the fat
jar.

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

## 3. Refresh the classpath jars (`lib/`)

Rarely needed — only when the plugin fat jar or a provided-scope dep is rebuilt.
The proven minimal set is the 8 jars in `lib/`; see `PROVENANCE.txt` for what each
supplies and where it came from. The two large fat jars
(`mule-dx-mule-dev-plugin-all.jar`, `mule-dx-platform-5.10.1-all.jar`) come from the
respective repos' `build/libs`; the rest are standard Maven artifacts resolvable by
coordinate.

## Verify after any change

```bash
./scripts/validate.sh <a-real-mule-app>
```

Expect a BLOCK/INFO summary and `report.json`. A clean app exits 0; an app with an
unsupported element exits 3; a corrupt bundle (manifest unreadable) exits 1.
