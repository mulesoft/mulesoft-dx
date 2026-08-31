#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Cross-check helper — ask Maven what each connector ACTUALLY resolves to
// (`mvn dependency:tree`) and diff that against what the skill expects. This is
// the one authority on the RESOLVED value; the static POM walk (Step 5) is the
// authority on the edit LOCATION. They are complementary: the tree follows
// imported BOMs and transitive pulls that the static walk deliberately does not,
// so a disagreement means the real source of a version is OUTSIDE the editable
// local ancestor chain (an imported <scope>import</scope> BOM, a transitive
// dependency, or a stale ~/.m2), and any edit the skill makes to the discovered
// site would silently no-op.
//
// Run at TWO points, same engine, different expected map and different reaction:
//   • Gate 1 (pre-write, before the Step 12 plan): --against=existing.
//     Expected = current versions from connectors.json (Step 5). Verifies our
//     DISCOVERY. A mismatch is SOFT — annotate the plan and raise at the Step 12
//     approval gate; nothing has been written yet.
//   • Gate 2 (post-write, before the Step 16 build): --against=target.
//     Expected = targetVersion from target-connectors.json (Step 6), the values
//     Step 14 just wrote. Verifies the EDIT TOOK. A mismatch is HARD — stop
//     before the (expensive) build, which would otherwise validate the wrong
//     versions and give a false green.
//
// The tree only ever reflects what is ON DISK when it runs, so the CALLER is
// responsible for positioning: --against=existing BEFORE Step 14 writes, and
// --against=target AFTER. This script does not know which phase it is in beyond
// the expected map it is handed.
//
// Usage:
//   node verify_dependency_tree.mjs [projectDir] --against=existing|target
//   node verify_dependency_tree.mjs [projectDir] --expected=<path-to-json>
//   Default projectDir = cwd. --against is a convenience that picks the standard
//   file (existing -> tmp/connectors.json, target -> tmp/target-connectors.json);
//   --expected overrides it with an explicit path. Output path:
//   ${DEP_TREE_VERIFY_FILE} when set, otherwise
//   <projectDir>/tmp/dep-tree-verify-<mode>.json.
//
// Output JSON: { projectDir, mode, expectedFile, matched[], mismatches[],
//   missingFromTree[], resolvedOnlyByTree[], stop, buildOk, warnings[], notes[] }.
//   Each mismatch: { groupId, artifactId, expected, resolved, managedFrom?,
//   likelyCause }.
//
// Exit code:
//   0  clean — every expected connector resolves to its expected version.
//   1  operational error — Maven missing, the tree build failed, or the expected
//      file was unreadable. Always a stop, regardless of gate.
//   2  mismatch(es) found — the CALLER decides soft (Gate 1) vs hard (Gate 2).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";

// Don't crash if a downstream consumer (e.g. `head`) closes stdout early.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });
function log(msg) { process.stdout.write(msg + "\n"); }

// Compare two dotted version strings numerically, segment by segment. A missing
// segment counts as 0, so "1.8" == "1.8.0". Mirrors resolve_target_connectors.
function cmpVersion(a, b) {
  const pa = String(a).split(".");
  const pb = String(b).split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const na = parseInt(pa[i] || "0", 10) || 0;
    const nb = parseInt(pb[i] || "0", 10) || 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

// Parse one `mvn dependency:tree` line into { ga, version, managedFrom } or null.
// A resolved node looks like:
//   [INFO] +- com.mulesoft.connectors:mule-amazon-s3-connector:jar:mule-plugin:8.0.4:compile
//   [INFO] |  \- com.mulesoft.connectors:mule-connector-commons:jar:2.1.2:compile
//   [INFO] +- org.mule.connectors:mule-db-connector:jar:mule-plugin:1.13.5:compile (version managed from 1.13.0)
// The coordinate is groupId:artifactId:type[:classifier]:version:scope — 5 or 6
// colon tokens; version is always second-to-last, scope last. Lines containing
// "omitted" (for duplicate / for conflict) describe nodes NOT in the resolved
// tree, so they are skipped — mapping them would report a version Maven discarded.
const COORD_RE =
  /([A-Za-z0-9_.\-]+:[A-Za-z0-9_.\-]+:[A-Za-z0-9_.\-]+(?::[A-Za-z0-9_.\-]+){1,3})/;
function parseTreeLine(line) {
  if (/\bomitted\b/.test(line)) return null;
  const m = COORD_RE.exec(line);
  if (!m) return null;
  const tokens = m[1].split(":");
  if (tokens.length < 5) return null; // not a full coordinate (scope always present)
  const version = tokens[tokens.length - 2];
  const ga = `${tokens[0]}:${tokens[1]}`;
  const mgd = /version managed from ([0-9][^)\s]*)/i.exec(line);
  return { ga, version, managedFrom: mgd ? mgd[1] : null };
}

// Load the expected connectors from the mode file. connectors.json (Step 5)
// carries { version }; target-connectors.json (Step 6) carries { targetVersion,
// blocked }. Normalise both to { groupId, artifactId, expected } where expected
// is null when we could not determine it locally (unresolved) or the connector
// is blocked — those are reported, never diffed as a hard mismatch.
function loadExpected(mode, path) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(doc.connectors) ? doc.connectors : [];
  return list.map((c) => {
    let expected = null;
    if (mode === "target") {
      expected = c.blocked ? null : (c.targetVersion || null);
    } else {
      expected = c.versionResolved ? (c.version || null) : null;
    }
    return { groupId: c.groupId, artifactId: c.artifactId, expected };
  });
}

function runTree(projectDir, includesCsv) {
  const r = spawnSync(
    "mvn",
    [
      "-B", // batch mode: no ANSI, stable output
      "dependency:tree",
      `-Dincludes=${includesCsv}`,
      "-DoutputType=text",
    ],
    { cwd: projectDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (r.error) return { ok: false, out: "", err: r.error.message };
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}` };
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  let mode = null;        // "existing" | "target"
  let expectedPath = null;
  for (const a of argv) {
    if (a.startsWith("--against=")) mode = a.slice("--against=".length);
    else if (a.startsWith("--expected=")) expectedPath = resolve(a.slice("--expected=".length));
    else if (!a.startsWith("--")) projectDir = resolve(a);
  }
  projectDir = resolve(projectDir);

  // Resolve mode / expected file. --expected wins; otherwise --against picks the
  // standard tmp file. Default mode label for output naming is derived from the
  // file when only --expected is given.
  if (!mode && !expectedPath) mode = "existing";
  if (!expectedPath) {
    expectedPath = mode === "target"
      ? (process.env.TARGET_CONNECTORS_FILE || join(projectDir, "tmp", "target-connectors.json"))
      : (process.env.CONNECTORS_FILE || join(projectDir, "tmp", "connectors.json"));
  }
  if (!mode) mode = /target-connectors/.test(expectedPath) ? "target" : "existing";

  const outPath = process.env.DEP_TREE_VERIFY_FILE
    || join(projectDir, "tmp", `dep-tree-verify-${mode}.json`);

  const result = {
    projectDir,
    mode,
    expectedFile: expectedPath,
    matched: [],
    mismatches: [],
    missingFromTree: [],
    resolvedOnlyByTree: [],
    stop: false,
    buildOk: false,
    warnings: [],
    notes: [],
  };

  if (!existsSync(expectedPath)) {
    result.warnings.push(
      `Expected connectors file not found at ${expectedPath}. ` +
      `Run ${mode === "target" ? "Step 6 (resolve_target_connectors.mjs)" : "Step 5 (extract_connectors.mjs)"} first.`
    );
    result.stop = true;
    return emit(result, outPath, 1);
  }

  let expected;
  try {
    expected = loadExpected(mode, expectedPath);
  } catch (e) {
    result.warnings.push(`Failed to read ${expectedPath}: ${e.message}`);
    result.stop = true;
    return emit(result, outPath, 1);
  }

  if (expected.length === 0) {
    result.notes.push("No connectors to verify (expected file lists none).");
    return emit(result, outPath, 0);
  }

  // Scope the tree to just the connector coordinates — keeps the output small and
  // the run fast. Maven's -Dincludes matches on groupId:artifactId patterns.
  const includesCsv = [...new Set(expected.map((e) => `${e.groupId}:${e.artifactId}`))].join(",");

  log(`Resolving dependency tree in ${projectDir} (mode: ${mode})...`);
  const tree = runTree(projectDir, includesCsv);
  if (!tree.ok) {
    result.buildOk = false;
    result.warnings.push(
      `mvn dependency:tree failed. Cannot verify resolved versions. ` +
      `Maven output (tail): ${tree.out.trim().split("\n").slice(-8).join(" | ") || tree.err || "(no output)"}`
    );
    result.stop = true;
    return emit(result, outPath, 1);
  }
  result.buildOk = true;

  // Build the resolved GA -> { version, managedFrom } map from the tree.
  const resolved = new Map();
  for (const line of tree.out.split("\n")) {
    const parsed = parseTreeLine(line);
    if (!parsed) continue;
    if (!resolved.has(parsed.ga)) resolved.set(parsed.ga, parsed); // top-most (resolved) node wins
  }

  for (const e of expected) {
    const ga = `${e.groupId}:${e.artifactId}`;
    const hit = resolved.get(ga);

    if (!hit) {
      // Maven's resolved tree doesn't contain this connector at all. In target
      // mode that is a real problem (we expected to have pinned it); in existing
      // mode it usually means the dep is declared but pruned (e.g. provided by
      // the runtime) — report, don't hard-fail.
      result.missingFromTree.push({ groupId: e.groupId, artifactId: e.artifactId, expected: e.expected });
      continue;
    }

    if (e.expected == null) {
      // We couldn't determine the expected version locally (unresolved static
      // walk, or blocked). The tree DID resolve it — surface the real value: it
      // fills a discovery gap AND confirms the source is outside the editable
      // local chain (imported BOM / transitive). Informational, not a mismatch.
      result.resolvedOnlyByTree.push({
        groupId: e.groupId,
        artifactId: e.artifactId,
        resolved: hit.version,
        managedFrom: hit.managedFrom,
      });
      continue;
    }

    if (cmpVersion(e.expected, hit.version) === 0) {
      result.matched.push({ groupId: e.groupId, artifactId: e.artifactId, version: hit.version });
    } else {
      result.mismatches.push({
        groupId: e.groupId,
        artifactId: e.artifactId,
        expected: e.expected,
        resolved: hit.version,
        managedFrom: hit.managedFrom,
        likelyCause: hit.managedFrom
          ? "Version is managed by an imported BOM or dependencyManagement outside the discovered edit site — the local edit did not win."
          : (mode === "target"
              ? "The written pin did not take: the wrong POM was edited, an imported BOM overrides it, or a stale ~/.m2 is in play."
              : "The static walk resolved a different value than Maven — the real source is likely an imported BOM, a transitive pull, or a stale ~/.m2."),
      });
    }
  }

  result.stop = result.mismatches.length > 0;
  return emit(result, outPath, result.stop ? 2 : 0);
}

function emit(result, outPath, exitCode) {
  if (result.matched.length) {
    log(`✅ ${result.matched.length} connector(s) resolve to the expected version.`);
  }
  for (const m of result.mismatches) {
    log(`   ✗ ${m.groupId}:${m.artifactId}: expected ${m.expected}, Maven resolves ${m.resolved}` +
        (m.managedFrom ? ` (version managed from ${m.managedFrom})` : ""));
    log(`     ${m.likelyCause}`);
  }
  for (const r of result.resolvedOnlyByTree) {
    log(`   ℹ️  ${r.groupId}:${r.artifactId}: not resolvable from local POMs, Maven resolves ${r.resolved}` +
        (r.managedFrom ? ` (managed from ${r.managedFrom})` : "") + " — source is outside the editable local chain.");
  }
  for (const mg of result.missingFromTree) {
    log(`   ⚠️  ${mg.groupId}:${mg.artifactId}: not present in the resolved dependency tree.`);
  }
  for (const w of result.warnings) log(`   • ${w}`);

  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    result.outPath = outPath;
    log(`Saved to ${outPath}`);
  } catch (e) {
    result.warnings.push(`Failed to write ${outPath}: ${e.message}`);
    log(`⚠️  Failed to write ${outPath}: ${e.message}`);
  }

  process.exitCode = exitCode;
  return result;
}

main();
