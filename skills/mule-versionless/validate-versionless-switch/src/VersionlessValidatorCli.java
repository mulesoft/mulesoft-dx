/*
 * Copyright (c) MuleSoft, Inc.  All rights reserved. http://www.mulesoft.com.
 * The software in this package is published under the terms of the CPAL v1.0
 * license, a copy of which has been included with this distribution in the
 * LICENSE file.
 */

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.mule.contribution.api.project.Finding;
import org.mule.contribution.api.project.ValidationResult;
import org.mule.contribution.designservice.rds.DwxCapabilityManifest;
import org.mule.contribution.designservice.rds.StubRemoteDesignServiceClient;
import org.mule.contribution.internal.extension.json.JsonExtensionBundle;
import org.mule.contribution.internal.project.VersionlessValidator;

/**
 * Standalone entry point for the Upgrade-to-Versionless switch validator. Runs the real {@link VersionlessValidator} (all seven axes) over a project's {@code src/main/mule},
 * loading the DataWeave capability manifest from the bundled {@code rds/dwx-capabilities.json} resource and the versionless connector descriptors from a staged-cache-shaped
 * directory ({@code <name>/dsl.json}). Serializes the {@link ValidationResult} to {@code report.json} and prints a short summary to stdout.
 *
 * <p>
 * This mirrors what {@code DefaultProjectPropertiesService.validate} does inside the LSP server, minus Guice/registry wiring: it is the headless form the skill invokes.
 *
 * <pre>
 *   java VersionlessValidatorCli &lt;projectRoot&gt; --dsl-dir &lt;dir&gt; [--out &lt;file&gt;]
 * </pre>
 */
public final class VersionlessValidatorCli {

    private static final String MULE_SOURCE_RELATIVE_PATH = "src/main/mule";

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || "-h".equals(args[0]) || "--help".equals(args[0])) {
            System.err.println("usage: VersionlessValidatorCli <projectRoot> [--dsl-dir <dir>] [--out <report.json>]");
            System.exit(2);
            return;
        }

        Path projectRoot = Path.of(args[0]).toAbsolutePath().normalize();
        Path dslDir = null;
        Path out = null;
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
                default:
                    fail("unknown argument: " + args[i]);
            }
        }
        if (dslDir == null) {
            dslDir = defaultDslDir();
        }
        if (out == null) {
            out = projectRoot.resolve("report.json");
        }

        if (!Files.isDirectory(projectRoot)) {
            fail("project root is not a directory: " + projectRoot);
        }
        Path muleSourceRoot = projectRoot.resolve(MULE_SOURCE_RELATIVE_PATH);

        // Fail closed on a missing manifest, exactly as DefaultProjectPropertiesService does.
        Optional<DwxCapabilityManifest> manifest = new StubRemoteDesignServiceClient().fetchDwxCapabilities();
        if (manifest.isEmpty()) {
            writeFailClosed(out, "DWX_MANIFEST_UNAVAILABLE: capability manifest could not be loaded");
            summarize(null, out, "DWX_MANIFEST_UNAVAILABLE");
            System.exit(1);
            return;
        }

        List<JsonExtensionBundle> bundles = loadBundles(dslDir);

        ValidationResult result = new VersionlessValidator(manifest.get(), bundles).validate(projectRoot, muleSourceRoot);

        String json = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(result);
        Files.writeString(out, json, StandardCharsets.UTF_8);

        summarize(result, out, null);
        // The gate: nonzero blockers ⇒ the switch is not safe. Exit 3 so a wrapper can branch on it without parsing JSON.
        System.exit(result.getBlockerCount() > 0 ? 3 : 0);
    }

    /** Each {@code <name>/dsl.json} under {@code dslDir} becomes a bundle; the flow axis reads only name + dslJson, so model/xsd stay null. */
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
                    String dslJson = Files.readString(dsl, StandardCharsets.UTF_8);
                    bundles.add(new JsonExtensionBundle(dir.getFileName().toString(), null, dslJson, null));
                }
            }
        }
        return bundles;
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

    private static void summarize(ValidationResult result, Path out, String failureReason) {
        System.out.println("Versionless switch validation");
        System.out.println("  report: " + out);
        if (failureReason != null) {
            System.out.println("  status: FAIL-CLOSED (" + failureReason + ")");
            return;
        }
        int blockers = result.getBlockerCount();
        List<Finding> findings = result.getFindings();
        long infos = findings.stream().filter(f -> "INFO".equals(f.getSeverity())).count();
        System.out.println("  files scanned: " + result.getFilesScanned());
        System.out.println("  DW expressions scanned: " + result.getExpressionsScanned());
        System.out.println("  BLOCK findings: " + blockers);
        System.out.println("  INFO findings:  " + infos);

        Map<String, int[]> byCategory = new TreeMap<>();
        for (Finding f : findings) {
            int[] counts = byCategory.computeIfAbsent(f.getCategory(), k -> new int[2]);
            if ("BLOCK".equals(f.getSeverity())) {
                counts[0]++;
            } else {
                counts[1]++;
            }
        }
        if (!byCategory.isEmpty()) {
            System.out.println("  by axis (BLOCK/INFO):");
            byCategory.forEach((cat, c) -> System.out.println("    " + cat + ": " + c[0] + "/" + c[1]));
        }
        System.out.println("  verdict: " + (blockers > 0
                ? "NOT SWITCHABLE — " + blockers + " blocker(s) must be resolved first"
                : "SWITCHABLE — no blockers (review INFO notices)"));
    }

    private static void fail(String message) {
        System.err.println("[error] " + message);
        System.exit(2);
    }
}
