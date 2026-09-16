#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 3c helper — detect the app's CURRENT `mule-maven-plugin` (MMP) version so
// Step 3c can decide whether to bump it for the baseline build. Validation-only:
// never prompts, downloads, or mutates the project.
//
// Why: the baseline build must run on Maven 3.9.0–3.9.15 (checked as a pre-req in
// Step 1). MMP 3.x crashes on Maven >= 3.9 (it was built against Maven 3.8's
// Eclipse Aether, which Maven 3.9 replaced with Maven Resolver) with
//   NoClassDefFoundError: org/eclipse/aether/connector/basic/BasicRepositoryConnectorFactory
// The fix is NOT to downgrade Maven to the EOL 3.8 line — it is to bump MMP to the
// latest 4.x for the baseline build only (Step 3c). This script reports the
// current MMP version + major so Step 3c knows whether a bump is needed:
//   pluginMajor < 4  → 3.x, bump to latest 4.x for the baseline (see Step 3c)
//   pluginMajor >= 4 → already 4.x, build as-is
//
// Usage:
//   node detect_current_mmp_version.mjs [projectDir]
//   Default projectDir = cwd. Output path: ${CURRENT_MMP_FILE} when set,
//   otherwise <projectDir>/tmp/current-mmp.json.
//
// Output JSON (file): { pluginVersion, pluginMajor, pluginDefinedIn,
//   needsPluginBump, errors[], warnings[], notes[] }.
//   Exit code: 1 only when a hard error occurs (no pom.xml). Plugin-version-not-
//   resolvable is a warning, not a block.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import {
  parseXml,
  projectOf,
  child,
  children,
  textOf,
  extractProperties,
  resolveValue,
  findParentPomPath,
  readPomProject,
} from "./_pom_utils.mjs";

// Don't crash if a downstream consumer (e.g. `head`) closes stdout early.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

function log(msg) {
  process.stdout.write(msg + "\n");
}

const MMP_GROUP_ID = "org.mule.tools.maven";
const MMP_ARTIFACT_ID = "mule-maven-plugin";

// Lowest MMP major that runs on the required Maven 3.9.x line. MMP 3.x was built
// against Maven 3.8's Eclipse Aether; Maven 3.9 replaced it with Maven Resolver,
// so MMP < 4 crashes on 3.9.x (NoClassDefFoundError: …BasicRepositoryConnectorFactory).
// Fixed compatibility boundary, NOT a target version (latest 4.x is resolved live
// in Step 3c). ACB ships MMP 4.10.0 and auto-bumps 3.x projects to it on first open.
// TODO: boundary is hardcoded — make deterministic (derive from ACB/tooling
// metadata) if it ever needs to track ACB's version precisely.
const MMP_MIN_MAJOR_FOR_MAVEN_39 = 4;

// --- helpers ---------------------------------------------------------------

// Find the mule-maven-plugin version in ONE project's <build><plugins> or
// <build><pluginManagement><plugins>, resolving ${...} against mergedProps.
function pluginVersionIn(project, mergedProps) {
  const build = child(project, "build");
  if (!build) return null;
  const scanPluginsUnder = (parent) => {
    const plugins = parent ? child(parent, "plugins") : null;
    if (!plugins) return null;
    for (const p of children(plugins, "plugin")) {
      if (textOf(child(p, "artifactId")) !== MMP_ARTIFACT_ID) continue;
      const gid = textOf(child(p, "groupId"));
      if (gid && gid !== MMP_GROUP_ID) continue;
      const rawV = textOf(child(p, "version"));
      const resolved = rawV ? resolveValue(rawV, mergedProps) : null;
      if (resolved) return resolved;
    }
    return null;
  };
  return scanPluginsUnder(build) || scanPluginsUnder(child(build, "pluginManagement"));
}

// Numeric major of a version string ("3.3.5" -> 3, "4.9.0" -> 4). null if unparsable.
function majorOf(v) {
  const m = String(v).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) projectDir = resolve(argv[i]);
  }
  projectDir = resolve(projectDir);
  const outPath = process.env.CURRENT_MMP_FILE || join(projectDir, "tmp", "current-mmp.json");

  const result = {
    projectDir,
    pluginVersion: null,
    pluginMajor: null,
    pluginDefinedIn: null,
    needsPluginBump: false,   // true when current MMP is < 4.x (bump for baseline)
    errors: [],
    warnings: [],
    notes: [],
  };

  // The app's CURRENT mule-maven-plugin version (child, then local parent chain).
  const childPomPath = join(projectDir, "pom.xml");
  if (!existsSync(childPomPath)) {
    result.errors.push(`No pom.xml found at ${childPomPath}. Run from the Mule application root.`);
    return emit(result, outPath);
  }
  const childProject = projectOf(parseXml(readFileSync(childPomPath, "utf8")));

  // Build the parent chain and a merged property table (nearer wins) so a
  // ${mule.maven.plugin.version} defined on any ancestor resolves.
  const chain = [{ project: childProject, path: childPomPath }];
  const seen = new Set([childPomPath]);
  let cur = childProject;
  let curPath = childPomPath;
  while (true) {
    const nextPath = findParentPomPath(cur, curPath);
    if (!nextPath || seen.has(nextPath)) break;
    seen.add(nextPath);
    let nextProject;
    try {
      nextProject = readPomProject(nextPath);
    } catch (e) {
      result.warnings.push(`Failed to read parent POM ${nextPath}: ${e.message}`);
      break;
    }
    chain.push({ project: nextProject, path: nextPath });
    cur = nextProject;
    curPath = nextPath;
  }
  const mergedProps = {};
  for (let i = chain.length - 1; i >= 0; i--) Object.assign(mergedProps, extractProperties(chain[i].project));

  for (const { project, path } of chain) {
    const v = pluginVersionIn(project, mergedProps);
    if (v) {
      result.pluginVersion = v;
      result.pluginDefinedIn = path;
      break;
    }
  }

  if (!result.pluginVersion) {
    // No explicit plugin version found locally (may be inherited from a remote
    // parent). Can't determine the MMP major — warn, don't block. Step 3c should
    // treat this as "unknown"; if the build hits the Aether/Resolver crash, bump
    // MMP to the latest 4.x for the baseline (see SKILL.md Step 3c).
    result.warnings.push(
      "Could not find an explicit mule-maven-plugin <version> in the pom.xml or its " +
      "local parent chain (it may be inherited from a remote parent). Cannot tell " +
      "whether an MMP bump is needed for the baseline; if the build fails with a " +
      "'BasicRepositoryConnectorFactory' NoClassDefFoundError, the MMP is 3.x — bump " +
      "it to the latest 4.x for the baseline build (Step 3c)."
    );
    return emit(result, outPath);
  }
  result.pluginMajor = majorOf(result.pluginVersion);

  // 3. Decide whether Step 3c must bump MMP for the baseline build.
  //    MMP 3.x cannot run on Maven 3.9.x (the required range) → bump to latest 4.x.
  //    MMP 4.x already runs on 3.9.x → build as-is.
  if (result.pluginMajor !== null && result.pluginMajor < MMP_MIN_MAJOR_FOR_MAVEN_39) {
    result.needsPluginBump = true;
    result.notes.push(
      `Current mule-maven-plugin ${result.pluginVersion} is on the 3.x line and cannot ` +
      `run on Maven 3.9.x. Step 3c will build the baseline on the latest 4.x MMP ` +
      `(resolved live from Maven metadata) — for the baseline build only, not persisted.`
    );
  } else {
    result.notes.push(
      `Current mule-maven-plugin ${result.pluginVersion} is 4.x — compatible with ` +
      `Maven 3.9.x. Baseline builds as-is; no plugin bump needed.`
    );
  }
  return emit(result, outPath);
}

function emit(result, outPath) {
  if (result.errors.length === 0) {
    if (result.pluginVersion) {
      const verdict = result.needsPluginBump
        ? "3.x — Step 3c will bump to latest 4.x for the baseline build"
        : "4.x — baseline builds as-is";
      log(`✅ Current mule-maven-plugin ${result.pluginVersion} (${verdict}).`);
    } else {
      log(`⚠️  mule-maven-plugin version not resolved locally; see warnings.`);
    }
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

  if (result.errors.length > 0) {
    log("\nMMP version detection FAILED:");
    for (const err of result.errors) log(`  • ${err}`);
    process.exitCode = 1;
  }
  return result;
}

main();
