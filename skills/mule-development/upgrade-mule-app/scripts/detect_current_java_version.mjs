#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 2b helper — detect the current Java version from mule-artifact.json
// javaSpecificationVersions (the only source): one entry → use it, multiple →
// signal prompt-to-choose, absent/missing → signal prompt. Never prompts itself.
//
// When detection needs a prompt, the agent re-runs with --user-version <n> to
// PERSIST the user's answer into the same output file — downstream steps (Step 4
// resolve_target_versions.mjs) read it from disk, not the conversation. Also used
// in Step 3a to record a corrected version.
//
// Usage:
//   node detect_current_java_version.mjs [projectDir] [--user-version <n>]
//   Default projectDir = cwd. Output path: ${CURRENT_JAVA_VERSION_FILE} when set,
//   otherwise <projectDir>/tmp/current-java-version.json.
//
// Output JSON (file): { version, source, supportedVersions, needsUserPrompt,
//   belowFloor, minSupportedVersion, warnings[], notes[] }.
//
// Exit code:
//   0  always — advisory; the caller branches on version / needsUserPrompt /
//      belowFloor rather than the exit status (both detected and --user-version).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

// Don't crash if a downstream consumer (e.g. `head`) closes stdout early.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

function log(msg) {
  process.stdout.write(msg + "\n");
}

// Lowest current version the skill upgrades from; below this is out of scope.
const MIN_SUPPORTED_JAVA_VERSION = 8;

// Normalize a Java token to its spec number: "1.8" -> "8"; "11"/"17"/"21" pass through.
function normalizeJava(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/^1\.(\d+)$/);
  if (m) return m[1];
  return s;
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  let userVersion = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user-version") {
      userVersion = argv[i + 1] != null ? normalizeJava(argv[i + 1]) : null;
      i++;
    } else if (!argv[i].startsWith("--")) {
      projectDir = resolve(argv[i]);
    }
  }
  projectDir = resolve(projectDir);
  const outPath = process.env.CURRENT_JAVA_VERSION_FILE || join(projectDir, "tmp", "current-java-version.json");

  const result = {
    projectDir,
    version: null,            // resolved Java spec number, or null
    source: null,
    supportedVersions: null,  // javaSpecificationVersions array, if present
    needsUserPrompt: false,
    belowFloor: false,        // version < MIN_SUPPORTED_JAVA_VERSION
    minSupportedVersion: String(MIN_SUPPORTED_JAVA_VERSION),
    warnings: [],
    notes: [],
  };

  // --user-version: persist the user-supplied/corrected value (no mule-artifact.json
  // re-read). emit() still applies the floor, flagging belowFloor for the caller.
  if (userVersion != null) {
    result.version = userVersion;
    result.source = "user-supplied";
    result.notes.push(`Java version ${userVersion} supplied by the user; persisted for downstream steps.`);
    return emit(result, outPath);
  }

  // mule-artifact.json is the only source.
  const artifactPath = join(projectDir, "mule-artifact.json");
  if (!existsSync(artifactPath)) {
    result.needsUserPrompt = true;
    result.warnings.push(
      `No mule-artifact.json found at ${artifactPath}. javaSpecificationVersions ` +
      `is the only source for the Java version; prompt the user for it.`
    );
    return emit(result, outPath);
  }

  let javaSpecs = null;
  try {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const raw = artifact.javaSpecificationVersions;
    if (Array.isArray(raw)) javaSpecs = raw.map((x) => normalizeJava(String(x))).filter(Boolean);
  } catch (e) {
    result.warnings.push(`Failed to parse mule-artifact.json: ${e.message}`);
  }

  if (javaSpecs && javaSpecs.length > 0) {
    result.supportedVersions = javaSpecs;
    if (javaSpecs.length === 1) {
      result.version = javaSpecs[0];
      result.source = "mule-artifact.json:javaSpecificationVersions";
      return emit(result, outPath);
    }
    // Multiple entries are a compatibility list, not a single current version.
    result.needsUserPrompt = true;
    result.warnings.push(
      `mule-artifact.json declares multiple Java versions ` +
      `(${javaSpecs.join(", ")}). This is a compatibility list, not a single ` +
      `current version. Ask the user which one the app currently runs on.`
    );
    return emit(result, outPath);
  }

  // Absent or empty: caller must prompt.
  result.needsUserPrompt = true;
  result.warnings.push(
    "mule-artifact.json has no javaSpecificationVersions. It is the only source " +
    "for the Java version; prompt the user for the current Java version."
  );
  return emit(result, outPath);
}

function emit(result, outPath) {
  // Floor check applies only to a detected version; the caller floor-checks
  // any user-supplied value (SKILL.md).
  if (result.version != null) {
    const n = Number(result.version);
    if (Number.isFinite(n) && n < MIN_SUPPORTED_JAVA_VERSION) {
      result.belowFloor = true;
      result.warnings.push(
        `Detected Java version ${result.version} is below the minimum supported ` +
        `version (${MIN_SUPPORTED_JAVA_VERSION}). This skill only upgrades apps ` +
        `already on Java ${MIN_SUPPORTED_JAVA_VERSION}+. Upgrade the app to at ` +
        `least Java ${MIN_SUPPORTED_JAVA_VERSION} before running this skill.`
      );
    }
  }

  if (result.belowFloor) {
    log(`❌ Java ${result.version} is below the minimum supported Java ${result.minSupportedVersion}.`);
  } else if (result.version) {
    log(`✅ Current Java version: ${result.version}`);
  } else if (result.needsUserPrompt) {
    log("⚠️  Could not auto-detect the Java version — the agent must prompt the user.");
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
