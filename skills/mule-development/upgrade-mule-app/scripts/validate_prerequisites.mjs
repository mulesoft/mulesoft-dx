#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 1 helper — validate filesystem and toolchain prerequisites: app directory
// (pom.xml + mule-artifact.json), parent-POM availability if declared, Anypoint
// CLI v4, DX plugin, and local Maven in the supported range. Validation-only;
// never prompts or mutates.
//
// Maven pre-req: the upgrade toolchain requires Maven 3.9.x — the line that MMP
// 4.x and MUnit require (see SKILL.md Step 11). The baseline build (Step 3c) runs
// on a 4.x MMP (bumping the app's current 3.x for the build only), so a 3.9.x
// Maven is needed throughout. We gate on the 3.9 MINOR (major 3, minor 9, any
// patch) rather than a closed patch range: MMP/MUnit release notes currently
// validate 3.9.0–3.9.15, but patches are backward-compatible, so accepting any
// 3.9.x avoids falsely rejecting a newer patch (e.g. 3.9.16) the moment it ships.
// Maven is a standard developer toolchain, treated as a pre-req like the CLI/DX
// plugin: we detect and instruct, never download or auto-install.
//
// Usage:
//   node validate_prerequisites.mjs [projectDir]
//   Default projectDir = cwd. Output path: ${UPGRADE_PREREQS_FILE} when set,
//   otherwise <projectDir>/tmp/upgrade-prereqs.json.
//
// Output JSON (file): { ok, inAppDir, pomExists, muleArtifactExists,
//   parentDeclared, parentFound, parentPath, ancestorChain[], cliPresent,
//   dxPluginPresent, mavenVersion, mavenInRange, errors[], warnings[], notes[] }.
//   ancestorChain[] is every local ancestor POM path (nearest-first) discovered by
//   walking the full <relativePath> chain; parent{Declared,Found,Path} describe the
//   immediate parent only (retained for backward compatibility). `ok` is true when
//   errors[] is empty. Exit code: 1 when errors[] is non-empty.

// Required Maven line (major 3, minor 9, any patch). See header note. The label
// is derived from these so user-facing messages never hardcode the version.
const MAVEN_REQUIRED_MAJOR = 3;
const MAVEN_REQUIRED_MINOR = 9;
const MAVEN_REQUIRED_LABEL = `${MAVEN_REQUIRED_MAJOR}.${MAVEN_REQUIRED_MINOR}.x`;

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { readPomProject, child, findParentPomPath } from "./_pom_utils.mjs";

// Don't crash if a downstream consumer (e.g. `head`) closes stdout early.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

function log(msg) {
  process.stdout.write(msg + "\n");
}

// Run a command, capturing both streams.
function tryExec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.error) return { ok: false, out: "", error: r.error.message };
  const combined = `${r.stdout || ""}${r.stderr || ""}`.trim();
  return { ok: r.status === 0, out: combined };
}

// Parse "Apache Maven 3.9.6 (...)" from `mvn -v`. Returns { major, minor, patch,
// version } or null.
function parseMavenVersion(out) {
  const m = /Apache Maven\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(out);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] ? Number(m[3]) : 0,
    version: `${m[1]}.${m[2]}${m[3] ? "." + m[3] : ""}`,
  };
}

// True when the parsed Maven version is on the required 3.9.x line (any patch).
function isMavenOnRequiredLine(v) {
  return v.major === MAVEN_REQUIRED_MAJOR && v.minor === MAVEN_REQUIRED_MINOR;
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) projectDir = resolve(argv[i]);
  }
  projectDir = resolve(projectDir);
  const outPath = process.env.UPGRADE_PREREQS_FILE || join(projectDir, "tmp", "upgrade-prereqs.json");

  const result = {
    ok: false,          // true when errors[] is empty (set in emit)
    projectDir,
    inAppDir: false,
    pomExists: false,
    muleArtifactExists: false,
    parentDeclared: false,
    parentFound: false,
    parentPath: null,
    ancestorChain: [], // every local ancestor POM path, nearest-first (parent, grandparent, …)
    cliPresent: false,
    dxPluginPresent: false,
    mavenVersion: null,
    mavenInRange: false,
    errors: [],
    warnings: [],
    notes: [],
  };

  log(`Validating prerequisites in ${projectDir}...`);

  // App directory: child pom.xml + mule-artifact.json.
  const childPomPath = join(projectDir, "pom.xml");
  const artifactPath = join(projectDir, "mule-artifact.json");
  result.pomExists = existsSync(childPomPath);
  result.muleArtifactExists = existsSync(artifactPath);
  if (result.pomExists) {
    log("✅ pom.xml found");
  } else {
    log("❌ pom.xml not found");
    result.errors.push(`pom.xml not found at ${childPomPath}. Run from the Mule application root.`);
  }
  if (result.muleArtifactExists) {
    log("✅ mule-artifact.json found");
  } else {
    log("❌ mule-artifact.json not found");
    result.errors.push(`mule-artifact.json not found at ${artifactPath}. Run from the Mule application root.`);
  }
  result.inAppDir = result.pomExists && result.muleArtifactExists;

  // Ancestor-chain availability (only if the child POM parsed). Walk the FULL
  // local <relativePath> chain — parent, grandparent, … — not just the immediate
  // parent: Step 5's extractor and Steps 14/18's fork consume the whole chain
  // (a connector version can live in the grandparent). A missing hop must fail
  // HERE with a clear message, not surface much later as an unresolved-version
  // error at Step 5. parentDeclared/parentFound/parentPath are retained for the
  // immediate parent (backward-compatible fields); ancestorChain[] is the full list.
  if (result.pomExists) {
    try {
      let curProject = readPomProject(childPomPath);
      let curPath = childPomPath;
      const seen = new Set([childPomPath]);
      let depth = 0;
      while (true) {
        const declaresParent = !!child(curProject, "parent");
        if (depth === 0) result.parentDeclared = declaresParent;
        if (!declaresParent) break;

        const nextPath = findParentPomPath(curProject, curPath);
        const label = depth === 0 ? "Parent" : depth === 1 ? "Grandparent" : `Ancestor (depth ${depth + 1})`;

        if (!nextPath) {
          if (depth === 0) result.parentFound = false;
          log(`❌ ${label} POM declared but not found locally`);
          result.errors.push(
            `${label} POM is declared (a <parent> ${depth + 1} hop(s) up from the child) but was not ` +
            "found at a local relative path (from <parent><relativePath>, or the default " +
            "../pom.xml). The full ancestor chain is required for version detection (Step 2/5) and " +
            "Phase 2 edits (inherited connector versions live in ancestors; Steps 14/18 edit and fork " +
            "them). Ask the user to make the POM available locally and re-run. Do NOT download it."
          );
          break;
        }

        if (seen.has(nextPath)) break; // cycle guard
        seen.add(nextPath);
        result.ancestorChain.push(nextPath);
        if (depth === 0) {
          result.parentFound = true;
          result.parentPath = nextPath;
        }
        log(`✅ ${label} POM found: ${nextPath}`);

        try {
          curProject = readPomProject(nextPath);
        } catch (e) {
          log(`❌ Failed to parse ${label.toLowerCase()} POM ${nextPath}`);
          result.errors.push(`Failed to parse ancestor POM ${nextPath}: ${e.message}`);
          break;
        }
        curPath = nextPath;
        depth += 1;
      }
    } catch (e) {
      log("❌ Failed to parse pom.xml");
      result.errors.push(`Failed to parse pom.xml: ${e.message}`);
    }
  }

  // Anypoint CLI v4 + DX plugin.
  const cli = tryExec("anypoint-cli-v4", ["--version"]);
  result.cliPresent = cli.ok;
  if (!cli.ok) {
    log("❌ anypoint-cli-v4 not found");
    result.errors.push("anypoint-cli-v4 not found. Install: npm install -g @mulesoft/anypoint-cli-v4");
  } else {
    log("✅ anypoint-cli-v4 found");
    const dx = tryExec("anypoint-cli-v4", ["dx", "--help"]);
    result.dxPluginPresent = dx.ok;
    if (!dx.ok) {
      log("❌ DX plugin not found");
      result.errors.push("DX plugin not found. Install: npm install -g @salesforce/anypoint-cli-dx-mule-plugin");
    } else {
      log("✅ DX plugin found");
    }
  }

  // Local Maven on the required 3.9.x line. Detect-and-instruct only —
  // never download or auto-install (Maven is a standard toolchain pre-req).
  const mvn = tryExec("mvn", ["-v"]);
  const parsedMvn = mvn.ok ? parseMavenVersion(mvn.out) : null;
  if (!parsedMvn) {
    log("❌ Maven not found");
    result.errors.push(
      `Maven not found on PATH. This skill requires Maven ${MAVEN_REQUIRED_LABEL} (MMP 4.x and MUnit need it). Put an Apache Maven ${MAVEN_REQUIRED_LABEL} bin/ first on PATH and re-run.`
    );
  } else {
    result.mavenVersion = parsedMvn.version;
    const onLine = isMavenOnRequiredLine(parsedMvn);
    result.mavenInRange = onLine;
    if (onLine) {
      log(`✅ Maven ${parsedMvn.version} (on the required ${MAVEN_REQUIRED_LABEL} line)`);
    } else {
      log(`❌ Maven ${parsedMvn.version} is not on the required ${MAVEN_REQUIRED_LABEL} line`);
      result.errors.push(
        `Maven ${parsedMvn.version} found, but this skill requires Maven ${MAVEN_REQUIRED_LABEL} (MMP 4.x and MUnit need it). Switch to a Maven ${MAVEN_REQUIRED_LABEL} distribution and re-run.`
      );
    }
  }

  return emit(result, outPath);
}

function emit(result, outPath) {
  result.ok = result.errors.length === 0;
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
    log("\nPrerequisite check FAILED. Resolve these before continuing:");
    for (const err of result.errors) log(`  • ${err}`);
    process.exitCode = 1;
  }
  return result;
}

main();
