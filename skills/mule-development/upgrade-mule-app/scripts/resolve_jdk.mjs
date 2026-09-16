#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Ensure a JDK for a given Java MAJOR version is available locally, and report a
// usable JAVA_HOME. Shared by Step 3 (build baseline on the app's CURRENT Java)
// and Phase 2 (build on the TARGET Java). Resolves major -> full JDK build string
// (e.g. 8 -> 8.0.472_8) via `anypoint-cli-v4 dx mule runtime list`,
// locates an already-installed JDK under the Anypoint Code Builder java dir
// (~/AnypointCodeBuilder/java), and only downloads when none is present.
//
// Usage:
//   node resolve_jdk.mjs <major> [projectDir] [--no-download]
//   e.g. node resolve_jdk.mjs 8 /path/to/app
//   projectDir defaults to cwd. Output path: ${RESOLVE_JDK_FILE} when set,
//   otherwise <projectDir>/tmp/resolve-jdk-<major>.json.
//
// Output JSON (file): { major, requestedBuild, javaHome, javaBin, source,
//   downloaded, available, errors[], warnings[], notes[] }. Exit code 1 when
//   errors[] set.
//
// This script MAY download (network) unless --no-download is passed. It never
// mutates the project. The resolved javaHome is meant to be consumed as
//   JAVA_HOME=<javaHome> mvn clean package

import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";

const ACB_JAVA_DIR = join(homedir(), "AnypointCodeBuilder", "java");

// Don't crash if a downstream consumer (e.g. `head`) closes stdout early.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

function log(msg) {
  process.stdout.write(msg + "\n");
}

// --- helpers ---------------------------------------------------------------

function tryExec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.error) return { ok: false, out: "", status: null, error: r.error.message };
  const combined = `${r.stdout || ""}${r.stderr || ""}`;
  return { ok: r.status === 0, out: combined, status: r.status };
}

// A JDK build string may arrive as 17.0.13_11 (API/flag) or 17.0.13+11 (dir name).
// The description field is the major ("17"). Normalize the disk dir form to the
// flag form so we can compare.
function buildToFlagForm(s) {
  return String(s).replace(/\+/g, "_");
}
function buildToDirForm(s) {
  return String(s).replace(/_/g, "+");
}

// Accept a bare array or the { supportedRuntimeVersions: [...] } wrapper.
function normalizeRuntimeList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.supportedRuntimeVersions)) {
    return parsed.supportedRuntimeVersions;
  }
  return [];
}

// From a supportedRuntimeVersions[] shape, pick the full JDK build string whose
// description === the requested major. Prefer the one flagged latest.
function pickBuildForMajor(runtimes, major) {
  const candidates = [];
  for (const rt of runtimes) {
    for (const jdk of rt.compatibleJDKs || []) {
      if (String(jdk.description) === String(major) && jdk.version) {
        candidates.push(jdk);
      }
    }
  }
  if (candidates.length === 0) return null;
  const latest = candidates.find((c) => c.latest);
  return buildToFlagForm((latest || candidates[0]).version);
}

// Resolve major -> full build string via the live CLI (sole source of truth).
// If the CLI is unavailable we return null
// and the caller surfaces a clear "check network/auth" error.
function resolveBuild(major, result) {
  const cli = tryExec("anypoint-cli-v4", ["dx", "mule", "runtime", "list", "--output", "json"]);
  if (cli.ok) {
    const jsonStart = cli.out.indexOf("[");
    const objStart = cli.out.indexOf("{");
    // The CLI prints a "Fetching available runtimes..." preamble before the JSON.
    const start = jsonStart === -1 ? objStart : (objStart === -1 ? jsonStart : Math.min(jsonStart, objStart));
    if (start !== -1) {
      try {
        const parsed = JSON.parse(cli.out.slice(start));
        const build = pickBuildForMajor(normalizeRuntimeList(parsed), major);
        if (build) {
          result.source = "runtime-list-cli";
          return build;
        }
        result.warnings.push(`runtime list returned no JDK with description "${major}".`);
      } catch (e) {
        result.warnings.push(`Could not parse runtime list JSON: ${e.message}`);
      }
    } else {
      result.warnings.push("runtime list output contained no JSON.");
    }
  } else {
    result.warnings.push(
      "`anypoint-cli-v4 dx mule runtime list` unavailable. Check network/" +
      "authentication (anypoint-cli-v4 conf) and re-run."
    );
  }
  return null;
}

// Given a JDK install root (mac: <root>/Contents/Home/bin/java; linux/win:
// <root>/bin/java), return the JAVA_HOME that contains bin/java, or null.
function javaHomeUnder(root) {
  const candidates = [root, join(root, "Contents", "Home")];
  for (const c of candidates) {
    const bin = join(c, "bin", process.platform === "win32" ? "java.exe" : "java");
    if (existsSync(bin)) return c;
  }
  return null;
}

// Look for an installed JDK of the given major under the ACB java dir. Match by
// major (any build of that major is usable for a build); prefer an exact build
// match when we know the requested build string.
function findInAcbJavaDir(major, requestedBuild) {
  if (!existsSync(ACB_JAVA_DIR)) return null;
  let dirs;
  try {
    dirs = readdirSync(ACB_JAVA_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^jdk-/i.test(d.name))
      .map((d) => d.name);
  } catch {
    return null;
  }
  // e.g. jdk-8.0.472+8 -> major 8. Match dir whose version starts with "<major>.".
  const ofMajor = dirs.filter((name) => {
    const ver = name.replace(/^jdk-/i, "");
    return ver === String(major) || ver.startsWith(`${major}.`);
  });
  if (ofMajor.length === 0) return null;

  // Prefer an exact build match if we resolved one.
  if (requestedBuild) {
    const wantDir = `jdk-${buildToDirForm(requestedBuild)}`;
    const exact = ofMajor.find((n) => n.toLowerCase() === wantDir.toLowerCase());
    if (exact) {
      const home = javaHomeUnder(join(ACB_JAVA_DIR, exact));
      if (home) return home;
    }
  }
  // Otherwise use any installed JDK of that major (newest name wins).
  ofMajor.sort().reverse();
  for (const name of ofMajor) {
    const home = javaHomeUnder(join(ACB_JAVA_DIR, name));
    if (home) return home;
  }
  return null;
}

// --- main ------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  let major = null;
  let projectDir = process.cwd();
  let allowDownload = true;
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--no-download") allowDownload = false;
    else if (!argv[i].startsWith("--")) positionals.push(argv[i]);
  }
  if (positionals.length > 0) major = positionals[0];
  if (positionals.length > 1) projectDir = resolve(positionals[1]);
  let outPath = process.env.RESOLVE_JDK_FILE || null;

  const result = {
    major: major,
    requestedBuild: null,
    javaHome: null,
    javaBin: null,
    source: null,        // where javaHome came from: acb-dir | download
    buildSource: null,   // where the build string came from: runtime-list-cli
    downloaded: false,
    available: false,
    errors: [],
    warnings: [],
    notes: [],
  };

  if (!major || !/^\d+$/.test(String(major))) {
    result.errors.push(`A numeric Java major version is required (e.g. 8, 11, 17). Got: ${JSON.stringify(major)}`);
    return emit(result, outPath, major);
  }
  if (!outPath) outPath = join(projectDir, "tmp", `resolve-jdk-${major}.json`);

  // 1. Resolve major -> full build string (needed for download + exact match).
  const buildResult = { source: null, warnings: result.warnings };
  result.requestedBuild = resolveBuild(major, buildResult);
  result.buildSource = buildResult.source;
  if (!result.requestedBuild) {
    result.notes.push(
      `Could not resolve a full JDK build string for major ${major}. Will still ` +
      `try to use an already-installed JDK of that major; download is not possible ` +
      `without a build string.`
    );
  }

  // 2. Is a JDK of that major already installed under the ACB java dir?
  if (!result.javaHome) {
    const home = findInAcbJavaDir(major, result.requestedBuild);
    if (home) {
      result.javaHome = home;
      result.source = "acb-dir";
      result.notes.push(`Found an installed Java ${major} under ${ACB_JAVA_DIR}.`);
    }
  }

  // 3. Download if still not found.
  if (!result.javaHome) {
    if (!allowDownload) {
      result.errors.push(`No Java ${major} JDK found and --no-download was set.`);
      return emit(result, outPath, major);
    }
    if (!result.requestedBuild) {
      result.errors.push(
        `No Java ${major} JDK is installed and no build string could be resolved ` +
        `to download one. Ensure the Anypoint CLI DX plugin is installed and you ` +
        `are authenticated (anypoint-cli-v4 conf), then re-run.`
      );
      return emit(result, outPath, major);
    }
    result.notes.push(`Downloading JDK ${result.requestedBuild} via Anypoint CLI...`);
    log(`Java ${major} not found locally — downloading JDK ${result.requestedBuild} (this can take a few minutes)...`);
    const dl = tryExec("anypoint-cli-v4", ["dx", "mule", "jdk", "download", "--version", result.requestedBuild]);
    if (!dl.ok) {
      result.errors.push(
        `JDK download failed for ${result.requestedBuild}. CLI output:\n${dl.out.trim()}`
      );
      return emit(result, outPath, major);
    }
    result.downloaded = true;
    // Re-locate after download.
    const home = findInAcbJavaDir(major, result.requestedBuild);
    if (home) {
      result.javaHome = home;
      result.source = "download";
    } else {
      result.errors.push(
        `Download reported success but no Java ${major} JDK was found under ` +
        `${ACB_JAVA_DIR} afterward.`
      );
      return emit(result, outPath, major);
    }
  }

  result.available = !!result.javaHome;
  if (result.javaHome) {
    result.javaBin = join(result.javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
  }
  return emit(result, outPath, major);
}

function emit(result, outPath, major) {
  if (!outPath) outPath = join(process.cwd(), "tmp", `resolve-jdk-${major || "unknown"}.json`);

  if (result.available) {
    const via = result.downloaded ? "downloaded" : "already installed";
    log(`✅ Java ${result.major} JDK ready (${via}).`);
    log(`   JAVA_HOME: ${result.javaHome}`);
  } else if (result.errors.length === 0) {
    log(`⚠️  Java ${result.major} JDK not resolved.`);
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
    log(`\nJDK resolution FAILED for Java ${result.major}:`);
    for (const err of result.errors) log(`  • ${err}`);
    process.exitCode = 1;
  }
  return result;
}

main();
