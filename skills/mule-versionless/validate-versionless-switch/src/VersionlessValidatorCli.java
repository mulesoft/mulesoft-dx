/*
 * Copyright (c) MuleSoft, Inc.  All rights reserved. http://www.mulesoft.com.
 * The software in this package is published under the terms of the CPAL v1.0
 * license, a copy of which has been included with this distribution in the
 * LICENSE file.
 */

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.eclipse.lemminx.commons.BadLocationException;
import org.eclipse.lemminx.dom.DOMDocument;
import org.eclipse.lemminx.dom.DOMElement;
import org.eclipse.lemminx.dom.DOMNode;
import org.eclipse.lsp4j.Position;
import org.mule.contribution.WorkspaceHelper;
import org.mule.contribution.api.project.Finding;
import org.mule.contribution.api.project.ValidationResult;
import org.mule.contribution.designservice.rds.DwxCapabilityManifest;
import org.mule.contribution.designservice.rds.StubRemoteDesignServiceClient;
import org.mule.contribution.internal.extension.json.JsonExtensionBundle;
import org.mule.contribution.internal.project.VersionlessValidator;

/**
 * Standalone entry point for the Upgrade-to-Versionless switch validator. Runs the real {@link VersionlessValidator} (all seven axes) over a project's {@code src/main/mule},
 * loading the DataWeave capability manifest from the bundled {@code rds/dwx-capabilities.json} resource and the versionless connector descriptors from a staged-cache-shaped
 * directory ({@code <name>/dsl.json}). Serializes the {@link ValidationResult} to {@code <app>-versionless-switch-report.json} and prints a short summary to stdout.
 *
 * <p>
 * This mirrors what {@code DefaultProjectPropertiesService.validate} does inside the LSP server, minus Guice/registry wiring: it is the headless form the skill invokes.
 *
 * <p>
 * Two things this CLI layers on top of the raw validator:
 * <ul>
 * <li><b>Report scope: all seven axes, always.</b> The CLI reports every category the validator produces ({@code dataweave}, {@code flow}, {@code connector}, {@code config},
 * {@code security}, {@code project}, {@code devx}, {@code state}) and counts {@code blockerCount} across all of them. This is deliberately <em>stricter</em> than the ACB
 * "Upgrade to Versionless" wizard, which gates on DataWeave + flow + connector only and treats the rest as advisory: online the wizard has platform fallbacks (RDS, the
 * mesh/gateway that terminates TLS and runs policies), but this CLI validates an <em>offline</em> switch where those axes are genuine build/deploy failures. Empirically against
 * the versionless runtime builder: an unsupported in-flow construct fails the build ({@code BuildError::UnexpectedChild}); an unsupported top-level config ({@code <tls:context>},
 * {@code <secure-properties:config>}, {@code <os:object-store>}) is silently dropped so the capability vanishes; a {@code ${secure::…}} reference resolves to {@code PropertyError::Missing}.
 * {@code --extended} is accepted for backward compatibility but is now a no-op — its former behavior (widening from three axes to seven) is the default.</li>
 * <li><b>Connector switchability ({@code connector}, INFO).</b> The versionless runtime has no offline connector registry, so whether a connector is switchable can only be
 * confirmed by RDS at switch time. Headlessly the CLI can only observe which element namespaces have no bundled descriptor and are not core/ee/apikit (runtime-supported without
 * one) nor owned by another axis — it emits one INFO per such namespace, never a fabricated BLOCK.</li>
 * </ul>
 * The core-construct gap (constructs/operations the versionless runtime builder does not implement even though the mule-core descriptor lists them) is handled upstream of the flow
 * axis by {@link #pruneUnsupportedCoreElements}, so the existing flow-element walker reports them with real positions.
 *
 * <pre>
 *   java VersionlessValidatorCli &lt;projectRoot&gt; --dsl-dir &lt;dir&gt; [--out &lt;file&gt;] [--extended]
 * </pre>
 */
public final class VersionlessValidatorCli {

    private static final String MULE_SOURCE_RELATIVE_PATH = "src/main/mule";

    private static final String CORE_NS_URI = "http://www.mulesoft.org/schema/mule/core";

    /**
     * Core-namespace elements the mule-core descriptor lists but the versionless runtime builder does not register ({@code register_core}/{@code register_ee}/{@code register_apikit}
     * in mule-versionless {@code runtime/builder/src/builders.rs}). Pruning them from the mule-core bundle makes the flow axis flag them {@code BLOCK} instead of silently treating
     * the descriptor as ground truth. The six multi-route/scope constructs plus {@code raise-error} (a core operation with no runtime implementation). {@code scheduler} is
     * excluded (it is a source, resolved by the generic source path) as are {@code route}/{@code source} (internal {@code childs} markers, never user-authored). {@code async} was
     * dropped here once mule-versionless master registered it ({@code build_async}, PRs #253/#305) — the runtime now implements the fire-and-forget scope.
     */
    private static final Set<String> CORE_UNSUPPORTED_BY_RUNTIME = Set.of(
            "first-successful", "parallel-foreach", "round-robin", "scatter-gather", "try", "until-successful", "raise-error");

    /**
     * Namespace URI fragments that already have a dedicated checker owner, so the connector-switchability walk must not also report them (one owner per concern). core/ee/apikit are
     * handled separately because they are runtime-supported with no bundled descriptor. {@code os}/{@code oauth} are connector namespaces, but the data-integrity checker already
     * emits a {@code connector}-category BLOCK for them (a known incompatibility, not an unverifiable one) — excluding them here keeps that single owner.
     */
    private static final List<String> EXTENDED_AXIS_NS_FRAGMENTS = List.of(
            "schema/mule/secure-properties", // config axis
            "schema/mule/tls",               // security axis
            "schema/mule/api-gateway",       // security axis
            "schema/mule/http-policy",       // security axis
            "schema/mule/os",                // connector (data-integrity checker: connector.objectStore.unsupported BLOCK)
            "schema/mule/oauth",             // connector (data-integrity checker: connector.oauth.unsupported BLOCK)
            "schema/mule/tracking",          // devx axis
            "schema/mule/opentelemetry");    // devx axis

    /** core/ee/apikit are supported by the runtime builder even without a bundled dsl.json, so a missing descriptor for them is not a switchability signal. */
    private static final List<String> RUNTIME_SUPPORTED_NS_FRAGMENTS = List.of(
            "schema/mule/core", "schema/mule/ee/core", "schema/mule/mule-apikit");

    private static final String CONNECTOR_CATEGORY = "connector";
    private static final String CONNECTOR_RULE = "connector.switchability.unverified";
    private static final String SEVERITY_INFO = "INFO";

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || "-h".equals(args[0]) || "--help".equals(args[0])) {
            System.err.println("usage: VersionlessValidatorCli <projectRoot> [--dsl-dir <dir>] [--out <file>] [--include-info] [--extended]");
            System.exit(2);
            return;
        }

        Path projectRoot = Path.of(args[0]).toAbsolutePath().normalize();
        Path dslDir = null;
        Path out = null;
        boolean includeInfo = false;
        for (int i = 1; i < args.length; i++) {
            switch (args[i]) {
                case "--dsl-dir":
                    if (++i >= args.length) {
                        fail("--dsl-dir requires a value");
                    }
                    dslDir = Path.of(args[i]).toAbsolutePath().normalize();
                    break;
                case "--out":
                    if (++i >= args.length) {
                        fail("--out requires a value");
                    }
                    out = Path.of(args[i]).toAbsolutePath().normalize();
                    break;
                case "--include-info":
                    // INFO notices are advisory (they never gate the switch), so the report carries blockers only by
                    // default; pass this to serialize the INFO findings into the JSON too. The gate is unaffected either way.
                    includeInfo = true;
                    break;
                case "--extended":
                    // Retained for backward compatibility (callers/scripts may still pass it); the CLI now
                    // reports all seven axes unconditionally, so this is accepted but has no effect — see assembleReport.
                    break;
                default:
                    fail("unknown argument: " + args[i]);
            }
        }
        if (dslDir == null) {
            dslDir = defaultDslDir();
        }
        if (out == null) {
            // Name the report after the app so collected reports stay distinguishable (getFileName
            // is non-null here: projectRoot is a validated app dir, never a filesystem root).
            Path appDir = projectRoot.getFileName();
            String base = (appDir == null) ? "versionless" : appDir.toString();
            out = projectRoot.resolve(base + "-versionless-switch-report.json");
        }

        if (!Files.isDirectory(projectRoot)) {
            fail("project root is not a directory: " + projectRoot);
        }
        Path muleSourceRoot = projectRoot.resolve(MULE_SOURCE_RELATIVE_PATH);

        // Fail closed on a missing manifest, exactly as DefaultProjectPropertiesService does.
        Optional<DwxCapabilityManifest> manifest = new StubRemoteDesignServiceClient().fetchDwxCapabilities();
        if (manifest.isEmpty()) {
            writeFailClosed(out, "DWX_MANIFEST_UNAVAILABLE: capability manifest could not be loaded");
            summarize(null, out, projectRoot, "DWX_MANIFEST_UNAVAILABLE");
            System.exit(1);
            return;
        }

        List<JsonExtensionBundle> bundles = loadBundles(dslDir);
        Set<String> knownNamespaces = collectKnownNamespaces(bundles);

        ValidationResult result = new VersionlessValidator(manifest.get(), bundles).validate(projectRoot, muleSourceRoot);

        // The connector-switchability signal is CLI-side (no offline connector registry): one INFO per app namespace that has
        // no bundled descriptor and no other axis owner. It is a `connector`-category finding, so it survives the default filter.
        List<Finding> connectorInfos = connectorSwitchabilityInfos(muleSourceRoot, knownNamespaces);

        ValidationResult reported = assembleReport(result, connectorInfos, includeInfo);

        String json = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(reported);
        Files.writeString(out, json, StandardCharsets.UTF_8);

        summarize(reported, out, projectRoot, null);
        // The gate: nonzero blockers ⇒ the switch is not safe. Exit 3 so a wrapper can branch on it without parsing JSON.
        System.exit(reported.getBlockerCount() > 0 ? 3 : 0);
    }

    /**
     * Builds the {@link ValidationResult} the CLI reports: the raw validator findings plus the connector INFOs, across all seven axes, with {@code blockerCount} recomputed from the
     * full set. The validator's own {@code blockerCount} already covers all seven, but the connector INFOs are CLI-side additions, so the count is recomputed to include them.
     *
     * <p>
     * {@code blockerCount} is always computed over the full finding set, before any INFO filtering, so the gate (and exit code) is identical whether or not INFO is serialized.
     * When {@code includeInfo} is false the INFO notices are dropped from the serialized findings — they are advisory and never gate — leaving a blockers-only report; passing
     * {@code --include-info} keeps them.
     */
    private static ValidationResult assembleReport(ValidationResult raw, List<Finding> connectorInfos, boolean includeInfo) {
        List<Finding> all = new ArrayList<>(raw.getFindings());
        all.addAll(connectorInfos);

        int blockerCount = (int) all.stream().filter(f -> "BLOCK".equals(f.getSeverity())).count();

        List<Finding> reported = includeInfo
                ? all
                : all.stream().filter(f -> !SEVERITY_INFO.equals(f.getSeverity())).toList();
        return new ValidationResult(raw.isSuccess(), reported, raw.getFilesScanned(), raw.getExpressionsScanned(),
                blockerCount, raw.getManifestVersion(), raw.getFailureReason());
    }

    /**
     * One INFO per app element namespace that (a) has no bundled connector descriptor, (b) is not core/ee/apikit (runtime-supported without one), and (c) is not owned by an
     * extended axis. Switchability of a real connector can only be confirmed by RDS at switch time, so this is advisory — never a BLOCK.
     */
    private static List<Finding> connectorSwitchabilityInfos(Path muleSourceRoot, Set<String> knownNamespaces) {
        List<Finding> findings = new ArrayList<>();
        if (muleSourceRoot == null || !Files.isDirectory(muleSourceRoot)) {
            return findings;
        }
        List<URI> xmlFiles;
        try {
            xmlFiles = WorkspaceHelper.getAllFilesFrom(muleSourceRoot, ".xml");
        } catch (IOException e) {
            return findings;
        }
        // Report each namespace once, at its first occurrence, so the signal is per-connector not per-element.
        Set<String> reported = new LinkedHashSet<>();
        for (URI uri : xmlFiles) {
            DOMDocument document;
            try {
                document = WorkspaceHelper.getDocument(new File(uri));
            } catch (IOException e) {
                continue;
            }
            DOMElement root = document.getDocumentElement();
            if (root == null) {
                continue;
            }
            collectUnverifiedNamespaces(root, document, uri, knownNamespaces, reported, findings);
        }
        return findings;
    }

    private static void collectUnverifiedNamespaces(DOMElement element, DOMDocument document, URI uri, Set<String> knownNamespaces,
            Set<String> reported, List<Finding> findings) {
        String namespace = element.getNamespaceURI();
        if (isUnverifiableConnectorNamespace(namespace, knownNamespaces) && reported.add(namespace)) {
            findings.add(connectorInfo(element, document, uri, namespace));
        }
        for (DOMNode child : element.getChildren()) {
            if (child.isElement()) {
                collectUnverifiedNamespaces((DOMElement) child, document, uri, knownNamespaces, reported, findings);
            }
        }
    }

    private static boolean isUnverifiableConnectorNamespace(String namespace, Set<String> knownNamespaces) {
        if (namespace == null || namespace.isBlank()) {
            return false;
        }
        if (knownNamespaces.contains(namespace)) {
            return false; // has a bundled descriptor — the flow axis already judged its elements
        }
        if (!namespace.contains("mulesoft.org/schema/mule/")) {
            return false; // doc:, xsi:, spring and other non-connector namespaces
        }
        for (String fragment : RUNTIME_SUPPORTED_NS_FRAGMENTS) {
            if (namespace.contains(fragment)) {
                return false;
            }
        }
        for (String fragment : EXTENDED_AXIS_NS_FRAGMENTS) {
            if (namespace.contains(fragment)) {
                return false;
            }
        }
        return true;
    }

    private static Finding connectorInfo(DOMElement element, DOMDocument document, URI uri, String namespace) {
        Position position = positionOf(element, document);
        int line = position.getLine() + 1;
        int column = position.getCharacter() + 1;
        String message = "Connector namespace '" + namespace
                + "' has no bundled versionless descriptor; its switchability can only be confirmed against RDS at switch time.";
        return new Finding(CONNECTOR_CATEGORY,
                line, column, line, column,
                -1, -1, -1, -1,
                uri.toString(), namespace, CONNECTOR_RULE, namespace, message, SEVERITY_INFO);
    }

    private static Position positionOf(DOMElement element, DOMDocument document) {
        try {
            return document.positionAt(element.getStart());
        } catch (BadLocationException e) {
            return new Position(0, 0);
        }
    }

    /**
     * Each {@code <name>/dsl.json} under {@code dslDir} becomes a bundle; the flow axis reads only name + dslJson, so model/xsd stay null. The mule-core bundle is pruned of the
     * elements the versionless runtime builder does not implement, so the flow axis flags them (see {@link #CORE_UNSUPPORTED_BY_RUNTIME}).
     */
    private static List<JsonExtensionBundle> loadBundles(Path dslDir) throws IOException {
        List<JsonExtensionBundle> bundles = new ArrayList<>();
        if (dslDir == null || !Files.isDirectory(dslDir)) {
            System.err.println("[warn] dsl dir not found, flow axis will treat all connector namespaces as unknown: " + dslDir);
            return bundles;
        }
        try (var entries = Files.list(dslDir)) {
            List<Path> dirs = entries.filter(Files::isDirectory).sorted().toList();
            for (Path dir : dirs) {
                Path dsl = dir.resolve("dsl.json");
                if (Files.isRegularFile(dsl)) {
                    String name = dir.getFileName().toString();
                    String dslJson = Files.readString(dsl, StandardCharsets.UTF_8);
                    if ("mule-core".equals(name)) {
                        dslJson = pruneUnsupportedCoreElements(dslJson);
                    }
                    bundles.add(new JsonExtensionBundle(name, null, dslJson, null));
                }
            }
        }
        return bundles;
    }

    /**
     * Removes the core-namespace constructs/operations the versionless runtime builder does not implement from the mule-core dsl.json. The bundled descriptor is a go-runtime copy
     * and lists constructs ({@code try}, {@code scatter-gather}, …) the Rust versionless builder has no counterpart for; left in, the flow axis would treat them as supported. By
     * dropping them from the {@code constructs} and {@code operations} sections the existing flow-element walker reports each as {@code flow.element.unsupported} with its real
     * position — one owner for element support, no duplicated reachability walk.
     */
    static String pruneUnsupportedCoreElements(String dslJson) {
        Gson gson = new Gson();
        JsonObject doc = gson.fromJson(dslJson, JsonObject.class);
        if (doc == null) {
            return dslJson;
        }
        pruneSection(doc, "constructs");
        pruneSection(doc, "operations");
        return gson.toJson(doc);
    }

    private static void pruneSection(JsonObject doc, String section) {
        JsonElement sectionEl = doc.get(section);
        if (sectionEl == null || !sectionEl.isJsonObject()) {
            return;
        }
        JsonObject records = sectionEl.getAsJsonObject();
        for (String key : List.copyOf(records.keySet())) {
            JsonElement recordEl = records.get(key);
            if (!recordEl.isJsonObject()) {
                continue;
            }
            JsonObject record = recordEl.getAsJsonObject();
            if (CORE_NS_URI.equals(stringField(record, "namespace")) && CORE_UNSUPPORTED_BY_RUNTIME.contains(stringField(record, "elementName"))) {
                records.remove(key);
            }
        }
    }

    private static String stringField(JsonObject record, String field) {
        JsonElement el = record.get(field);
        return el != null && el.isJsonPrimitive() ? el.getAsString() : "";
    }

    /** The namespaces that have a bundled descriptor — anything else in the app has no offline switchability signal. */
    private static Set<String> collectKnownNamespaces(List<JsonExtensionBundle> bundles) {
        Set<String> namespaces = new LinkedHashSet<>();
        Gson gson = new Gson();
        for (JsonExtensionBundle bundle : bundles) {
            String dslJson = bundle.dslJson();
            if (dslJson == null || dslJson.isBlank()) {
                continue;
            }
            JsonObject doc = gson.fromJson(dslJson, JsonObject.class);
            if (doc == null) {
                continue;
            }
            for (String section : List.of("operations", "sources", "constructs")) {
                collectNamespaces(doc.get(section), namespaces);
            }
        }
        return namespaces;
    }

    private static void collectNamespaces(JsonElement sectionEl, Set<String> namespaces) {
        if (sectionEl == null || !sectionEl.isJsonObject()) {
            return;
        }
        for (Map.Entry<String, JsonElement> entry : sectionEl.getAsJsonObject().entrySet()) {
            if (!entry.getValue().isJsonObject()) {
                continue;
            }
            String ns = stringField(entry.getValue().getAsJsonObject(), "namespace");
            if (!ns.isBlank()) {
                namespaces.add(ns);
            }
        }
    }

    private static Path defaultDslDir() {
        String acbHome = System.getenv("ACB_HOME");
        if (acbHome == null || acbHome.isBlank()) {
            acbHome = System.getProperty("user.home") + "/AnypointCodeBuilder";
        }
        return Path.of(acbHome, ".cache", "versionless");
    }

    private static void writeFailClosed(Path out, String reason) throws IOException {
        ValidationResult failed = new ValidationResult(false, List.of(), 0, 0, 0, null, reason);
        String json = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(failed);
        Files.writeString(out, json, StandardCharsets.UTF_8);
    }

    private static void summarize(ValidationResult result, Path out, Path projectRoot, String failureReason) {
        System.out.println("Versionless switch validation");
        System.out.println("  report: " + out);
        if (failureReason != null) {
            System.out.println("  status: FAIL-CLOSED (" + failureReason + ")");
            return;
        }
        System.out.println("  files scanned: " + result.getFilesScanned());
        System.out.println("  DW expressions scanned: " + result.getExpressionsScanned());
        System.out.println("  blockers: " + result.getBlockerCount());

        List<Finding> blockers = new ArrayList<>();
        for (Finding f : result.getFindings()) {
            if ("BLOCK".equals(f.getSeverity())) {
                blockers.add(f);
            }
        }
        if (blockers.isEmpty()) {
            return;
        }
        // Sort by axis, then file, then line, so related blockers sit together in the table.
        blockers.sort(Comparator.comparing(Finding::getCategory)
                .thenComparing(VersionlessValidatorCli::fileNameOf)
                .thenComparingInt(Finding::getStartLine));
        printBlockerTable(blockers, projectRoot);
    }

    /** Longest the CODE cell renders before it is truncated with an ellipsis — keeps a wide DataWeave snippet from blowing out the terminal. */
    private static final int MAX_CODE_WIDTH = 44;

    /** Zero-based index of the CODE column in {@link #printBlockerTable} — the only unbounded cell, so the only one truncated (LOCATION must stay whole to point at the right line:col). */
    private static final int CODE_COLUMN = 3;

    /**
     * Renders the BLOCK findings as a bordered fixed-width table. Columns: AXIS, SYMBOL (the offending construct/format/module),
     * RULE (which check fired — distinguishes an unsupported writer from an unsupported module from an unsupported flow element),
     * CODE (the source snippet, so a user can eyeball the directive — {@code output application/java} vs {@code import …} — without
     * opening the file), and LOCATION (project-relative {@code path:line:col}, editor-navigable). INFO notices are intentionally omitted.
     */
    private static void printBlockerTable(List<Finding> blockers, Path projectRoot) {
        String[] headers = {"AXIS", "SYMBOL", "RULE", "CODE", "LOCATION"};
        List<String[]> rows = new ArrayList<>();
        for (Finding f : blockers) {
            rows.add(new String[] {
                    f.getCategory(),
                    f.getSymbol(),
                    f.getRuleId(),
                    snippetOf(f),
                    locationOf(f, projectRoot),
            });
        }
        int[] width = new int[headers.length];
        for (int c = 0; c < headers.length; c++) {
            width[c] = headers[c].length();
        }
        for (String[] row : rows) {
            row[CODE_COLUMN] = truncate(row[CODE_COLUMN]);
            for (int c = 0; c < width.length; c++) {
                width[c] = Math.max(width[c], row[c].length());
            }
        }
        String border = buildBorder(width);
        System.out.println();
        System.out.println(border);
        System.out.println(formatRow(headers, width));
        System.out.println(border);
        for (String[] row : rows) {
            System.out.println(formatRow(row, width));
        }
        System.out.println(border);
    }

    private static String formatRow(String[] cells, int[] width) {
        StringBuilder line = new StringBuilder("|");
        for (int c = 0; c < width.length; c++) {
            line.append(' ').append(padRight(cells[c], width[c])).append(" |");
        }
        return line.toString();
    }

    private static String buildBorder(int[] width) {
        StringBuilder line = new StringBuilder("+");
        for (int w : width) {
            line.append("-".repeat(w + 2)).append('+');
        }
        return line.toString();
    }

    private static String padRight(String value, int width) {
        String safe = value == null ? "" : value;
        return safe.length() >= width ? safe : safe + " ".repeat(width - safe.length());
    }

    /** A finding's source snippet, collapsed to one line (DataWeave snippets can span lines) so it fits one table row. The full text stays in the JSON report. */
    private static String snippetOf(Finding finding) {
        String snippet = finding.getSnippet();
        if (snippet == null) {
            return "";
        }
        return snippet.strip().replaceAll("\\s+", " ");
    }

    /** Caps a cell at {@link #MAX_CODE_WIDTH}, ellipsising the overflow; the untruncated value is always in the JSON report. */
    private static String truncate(String value) {
        String safe = value == null ? "" : value;
        return safe.length() <= MAX_CODE_WIDTH ? safe : safe.substring(0, MAX_CODE_WIDTH - 1) + "…";
    }

    /**
     * A finding's location as an editor-navigable {@code path:line:col}, with the path relative to the project root
     * ({@code src/main/mule/errors.xml:290:15}) so files in subfolders are unambiguous. Falls back to the bare file name
     * if the URI cannot be relativized. The full absolute URI is always in the JSON report.
     */
    private static String locationOf(Finding finding, Path projectRoot) {
        String path = relativePathOf(finding, projectRoot);
        if (path.isEmpty()) {
            return "";
        }
        String location = path + ":" + finding.getStartLine();
        if (finding.getStartColumn() >= 0) {
            location += ":" + finding.getStartColumn();
        }
        return location;
    }

    /** The project-relative path of a finding's file (POSIX separators), or the bare file name if it is outside the project root / unparseable. */
    private static String relativePathOf(Finding finding, Path projectRoot) {
        String uri = finding.getFileUri();
        if (uri == null || uri.isBlank()) {
            return "";
        }
        try {
            Path file = Path.of(URI.create(uri)).toAbsolutePath().normalize();
            Path rel = projectRoot.relativize(file);
            // A path that climbs out of the project root (starts with "..") is less useful than the bare name.
            if (!rel.startsWith("..")) {
                return rel.toString().replace(File.separatorChar, '/');
            }
        } catch (IllegalArgumentException e) {
            // Not a parseable file: URI — fall through to the bare file name.
        }
        return fileNameOf(finding);
    }

    /** The file name (last path segment) of a finding's URI — used for sorting and as the relativization fallback. */
    private static String fileNameOf(Finding finding) {
        String uri = finding.getFileUri();
        if (uri == null || uri.isBlank()) {
            return "";
        }
        int slash = uri.lastIndexOf('/');
        return slash >= 0 ? uri.substring(slash + 1) : uri;
    }

    private static void fail(String message) {
        System.err.println("[error] " + message);
        System.exit(2);
    }
}
