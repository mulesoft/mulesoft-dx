#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 2a helper — detect the current Mule Runtime version from the `app.runtime`
// property, searching the child pom.xml then its full local parent chain (parent,
// grandparent, ...). ${...} refs resolve against the merged properties of the whole
// chain (nearer wins). Never prompts; signals the caller via needsUserPrompt.
//
// When detection needs a prompt, the agent re-runs with --user-version <v> to
// PERSIST the user's answer into the same output file — downstream steps (Step 4
// resolve_target_versions.mjs) read it from disk, not the conversation. Also used
// in Step 3a to record a corrected version.
//
// Usage:
//   node detect_current_mule_version.mjs [projectDir] [--user-version <v>]
//   Default projectDir = cwd. Output path: ${CURRENT_MULE_VERSION_FILE} when set,
//   otherwise <projectDir>/tmp/current-mule-version.json.
//
// Output JSON (file): { version, source, resolvedFrom, needsUserPrompt,
//   belowFloor, minSupportedVersion, warnings[], notes[] }.
//
// Exit code:
//   0  always — advisory; the caller branches on version / needsUserPrompt /
//      belowFloor rather than the exit status (both detected and --user-version).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import {
  PROP_REF,
  parseXml,
  child,
  projectOf,
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

// The only Maven property we read the MRT version from.
const RUNTIME_PROPERTY_NAME = "app.runtime";

// Lowest current version the skill upgrades from; below this is out of scope.
const MIN_SUPPORTED_MULE_VERSION = "4.3";

// Read app.runtime from one POM's own properties, resolving ${...} against the
// merged child+parent table. Returns { version, raw } or null (missing/unresolvable).
function detectInProps(ownProps, mergedProps) {
  if (!(RUNTIME_PROPERTY_NAME in ownProps)) return null;
  const raw = ownProps[RUNTIME_PROPERTY_NAME];
  const resolved = resolveValue(raw, mergedProps);
  if (resolved) return { version: resolved, raw };
  return null;
}

// Compare numeric dotted-prefix versions (qualifiers ignored). Returns -1/0/1.
function compareVersions(a, b) {
  const pa = numericParts(a);
  const pb = numericParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
function numericParts(v) {
  const m = String(v).match(/^\d+(?:\.\d+)*/);
  if (!m) return [];
  return m[0].split(".").map(Number);
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  let userVersion = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user-version") {
      userVersion = argv[i + 1] != null ? String(argv[i + 1]).trim() : null;
      i++;
    } else if (!argv[i].startsWith("--")) {
      projectDir = resolve(argv[i]);
    }
  }
  projectDir = resolve(projectDir);
  const outPath = process.env.CURRENT_MULE_VERSION_FILE || join(projectDir, "tmp", "current-mule-version.json");

  const result = {
    projectDir,
    version: null,          // resolved MRT version, or null
    source: null,           // e.g. "app.runtime"
    resolvedFrom: null,     // "child" | "parent" | "ancestor" | null
    needsUserPrompt: false,
    belowFloor: false,      // version < MIN_SUPPORTED_MULE_VERSION
    minSupportedVersion: MIN_SUPPORTED_MULE_VERSION,
    warnings: [],
    notes: [],
  };

  // --user-version: persist the user-supplied/corrected value (no POM re-read).
  // floorCheck() still applies the floor, flagging belowFloor for the caller.
  if (userVersion != null) {
    result.version = userVersion;
    result.source = "user-supplied";
    result.notes.push(`Mule Runtime ${userVersion} supplied by the user; persisted for downstream steps.`);
    floorCheck(result);
    return emit(result, outPath);
  }

  // Child pom.xml is required.
  const childPomPath = join(projectDir, "pom.xml");
  if (!existsSync(childPomPath)) {
    result.warnings.push(`No pom.xml found at ${childPomPath}`);
    result.needsUserPrompt = true;
    return emit(result, outPath);
  }
  const childProject = projectOf(parseXml(readFileSync(childPomPath, "utf8")));
  const childProps = extractProperties(childProject);

  // Walk the local parent chain (parent, grandparent, ...) as far as the POMs are
  // readable on disk. app.runtime — and any ${...} it references — may be declared
  // on ANY ancestor, not just the direct parent, so search the whole chain.
  // ancestors[0] is the direct parent, [1] the grandparent, etc.
  const ancestors = []; // { props, path }
  let curProject = childProject;
  let curPath = childPomPath;
  const seenPoms = new Set([childPomPath]);
  while (true) {
    const nextPath = findParentPomPath(curProject, curPath);
    if (!nextPath || seenPoms.has(nextPath)) break; // no parent, or a chain cycle
    seenPoms.add(nextPath);
    let nextProject;
    try {
      nextProject = readPomProject(nextPath);
    } catch (e) {
      result.warnings.push(`Failed to read parent POM ${nextPath}: ${e.message}`);
      break;
    }
    ancestors.push({ props: extractProperties(nextProject), path: nextPath });
    result.notes.push(`Parent POM: ${nextPath}`);
    curProject = nextProject;
    curPath = nextPath;
  }
  // The direct parent was declared but could not be read locally.
  const parentDeclaredButMissing = ancestors.length === 0 && !!child(childProject, "parent");

  // Merged table for ${...} resolution: nearer wins over farther, child over all.
  // Spread farthest-first so the child assignment lands last.
  const mergedProps = {};
  for (let i = ancestors.length - 1; i >= 0; i--) Object.assign(mergedProps, ancestors[i].props);
  Object.assign(mergedProps, childProps);

  // Look for app.runtime nearest-first: child, then each ancestor.
  let found = detectInProps(childProps, mergedProps);
  if (found) {
    result.resolvedFrom = "child";
  } else {
    for (let i = 0; i < ancestors.length; i++) {
      found = detectInProps(ancestors[i].props, mergedProps);
      if (found) {
        result.resolvedFrom = i === 0 ? "parent" : "ancestor";
        break;
      }
    }
  }

  if (found) {
    result.version = found.version;
    result.source = RUNTIME_PROPERTY_NAME;
    if (PROP_REF.test(found.raw || "")) {
      result.notes.push(`Resolved ${found.raw} -> ${found.version}`);
    }
    // Resolved from the child, so the missing parent did not matter here.
    if (parentDeclaredButMissing) {
      result.notes.push(
        "Child declares a <parent> whose POM was not found locally, but " +
        "app.runtime was resolved from the child pom.xml, so it was not needed."
      );
    }
  } else {
    // Nothing resolvable: caller must prompt.
    result.needsUserPrompt = true;
    if (parentDeclaredButMissing) {
      result.warnings.push(
        "Child declares a <parent>, but the parent POM was not found locally. " +
        "A parent-defined app.runtime cannot be resolved. Ask the user to make " +
        "the parent POM available locally and re-run."
      );
    } else {
      const chain = ancestors.length
        ? "the child pom.xml or its parent chain (" + ancestors.map((a) => a.path).join(", ") + ")"
        : "the child pom.xml";
      result.warnings.push(
        `Could not determine Mule Runtime version from app.runtime in ${chain}. ` +
        `Prompt the user for the current version.`
      );
    }
  }

  floorCheck(result);

  return emit(result, outPath);
}

// Flag a below-floor version (detected or user-supplied) for the caller.
function floorCheck(result) {
  if (result.version && compareVersions(result.version, MIN_SUPPORTED_MULE_VERSION) < 0) {
    result.belowFloor = true;
    result.warnings.push(
      `Mule Runtime version ${result.version} is below the minimum ` +
      `supported version (${MIN_SUPPORTED_MULE_VERSION}). This skill only upgrades ` +
      `apps already on Mule ${MIN_SUPPORTED_MULE_VERSION}+. Upgrade the app to at ` +
      `least ${MIN_SUPPORTED_MULE_VERSION} before running this skill.`
    );
  }
}

function emit(result, outPath) {
  if (result.belowFloor) {
    log(`❌ Mule Runtime ${result.version} is below the minimum supported ${result.minSupportedVersion}.`);
  } else if (result.version) {
    const from = result.resolvedFrom ? ` (from ${result.resolvedFrom} pom.xml)` : "";
    log(`✅ Current Mule Runtime: ${result.version}${from}`);
  } else if (result.needsUserPrompt) {
    log("⚠️  Could not auto-detect the Mule Runtime version — the agent must prompt the user.");
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
  return result;
}

main();
