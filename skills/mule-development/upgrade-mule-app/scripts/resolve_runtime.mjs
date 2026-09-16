#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Ensure the TARGET Mule Runtime distribution is available locally. Sibling of
// resolve_jdk.mjs (which does the same for the target JDK). Given a target Mule
// version, it locates an already-installed runtime under the Anypoint Code
// Builder runtime dir (~/AnypointCodeBuilder/runtime), and only downloads when
// none is present. A version can be downloaded ONLY if it is one that
// `anypoint-cli-v4 dx mule runtime list` returns — the list is the sole source
// of truth for what is downloadable.
//
// Usage:
//   node resolve_runtime.mjs <mule-version> [projectDir] [--no-download]
//   e.g. node resolve_runtime.mjs 4.9.19 /path/to/app
//   projectDir defaults to cwd. Output path: ${RESOLVE_RUNTIME_FILE} when set,
//   otherwise <projectDir>/tmp/resolve-runtime-<version>.json.
//
// Output JSON (file): { version, resolvedVersion, runtimePath, source,
//   downloaded, available, errors[], warnings[], notes[] }. Exit code 1 when
//   errors[] set.
//
// This script MAY download (network) unless --no-download is passed. It never
// mutates the project and never sets any runtime path — it only ensures the
// distribution is present on disk and reports where.

import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { homedir } from "node:os";

const ACB_RUNTIME_DIR = join(homedir(), "AnypointCodeBuilder", "runtime");
// Installed runtimes live under <dir>/mule-enterprise-standalone-<version>[-<build>].
const RUNTIME_DIR_PREFIX = "mule-enterprise-standalone-";

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

// Accept a bare array or the { supportedRuntimeVersions: [...] } wrapper.
function normalizeRuntimeList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.supportedRuntimeVersions)) {
    return parsed.supportedRuntimeVersions;
  }
  return [];
}

// The CLI prints a "Fetching available runtimes..." preamble before the JSON.
// Slice from the first { or [ so JSON.parse sees only the document.
function parseCliJson(out) {
  const objStart = out.indexOf("{");
  const arrStart = out.indexOf("[");
  const start = arrStart === -1 ? objStart : (objStart === -1 ? arrStart : Math.min(objStart, arrStart));
  if (start === -1) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

// The set of downloadable Mule versions is exactly what `runtime list` returns.
// Returns the list of version strings, or null when the CLI is unavailable.
function listRuntimeVersions(result) {
  const cli = tryExec("anypoint-cli-v4", ["dx", "mule", "runtime", "list", "--output", "json"]);
  if (!cli.ok) {
    result.warnings.push(
      "`anypoint-cli-v4 dx mule runtime list` unavailable. Check network/" +
      "authentication (anypoint-cli-v4 conf) and re-run."
    );
    return null;
  }
  const parsed = parseCliJson(cli.out);
  if (!parsed) {
    result.warnings.push("Could not parse runtime list JSON.");
    return null;
  }
  return normalizeRuntimeList(parsed)
    .map((rt) => (rt && rt.version != null ? String(rt.version) : null))
    .filter(Boolean);
}

// Look for an installed runtime of the given version under the ACB runtime dir.
// Match the exact dir (mule-enterprise-standalone-<version>) first, then any dir
// whose version segment starts with "<version>" (a build-suffixed install, e.g.
// mule-enterprise-standalone-4.4.0-20250919 for 4.4.0). Returns the full path.
function findInAcbRuntimeDir(version) {
  if (!existsSync(ACB_RUNTIME_DIR)) return null;
  let dirs;
  try {
    dirs = readdirSync(ACB_RUNTIME_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith(RUNTIME_DIR_PREFIX))
      .map((d) => d.name);
  } catch {
    return null;
  }
  const exact = `${RUNTIME_DIR_PREFIX}${version}`;
  if (dirs.includes(exact)) return join(ACB_RUNTIME_DIR, exact);
  // Build-suffixed install: version segment is "<version>" or "<version>-<build>".
  const suffixed = dirs
    .filter((name) => {
      const seg = name.slice(RUNTIME_DIR_PREFIX.length);
      return seg === version || seg.startsWith(`${version}-`);
    })
    .sort()
    .reverse();
  if (suffixed.length) return join(ACB_RUNTIME_DIR, suffixed[0]);
  return null;
}

// --- main ------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  let version = null;
  let projectDir = process.cwd();
  let allowDownload = true;
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--no-download") allowDownload = false;
    else if (!argv[i].startsWith("--")) positionals.push(argv[i]);
  }
  if (positionals.length > 0) version = positionals[0];
  if (positionals.length > 1) projectDir = resolve(positionals[1]);
  let outPath = process.env.RESOLVE_RUNTIME_FILE || null;

  const result = {
    version,
    resolvedVersion: null, // the version segment of the install actually found
    runtimePath: null,
    source: null,          // where runtimePath came from: acb-dir | download
    downloaded: false,
    available: false,
    errors: [],
    warnings: [],
    notes: [],
  };

  if (!version || !/^\d+\.\d+/.test(String(version))) {
    result.errors.push(`A Mule runtime version is required (e.g. 4.6.32, 4.9.19). Got: ${JSON.stringify(version)}`);
    return emit(result, outPath, version);
  }
  if (!outPath) outPath = join(projectDir, "tmp", `resolve-runtime-${version}.json`);

  // 1. Already installed under the ACB runtime dir?
  const found = findInAcbRuntimeDir(version);
  if (found) {
    result.runtimePath = found;
    result.resolvedVersion = found.slice(found.lastIndexOf(RUNTIME_DIR_PREFIX) + RUNTIME_DIR_PREFIX.length);
    result.source = "acb-dir";
    result.available = true;
    result.notes.push(`Found an installed Mule ${version} runtime at ${found}.`);
    return emit(result, outPath, version);
  }

  // 2. Not installed — download it, but only if `runtime list` offers it.
  if (!allowDownload) {
    result.errors.push(`Mule ${version} runtime is not installed and --no-download was set.`);
    return emit(result, outPath, version);
  }

  const available = listRuntimeVersions(result);
  if (available === null) {
    // CLI unavailable — listRuntimeVersions already pushed a warning.
    result.errors.push(
      `Cannot verify Mule ${version} is downloadable because the runtime list ` +
      `could not be read. Fix CLI network/auth and re-run.`
    );
    return emit(result, outPath, version);
  }
  if (!available.includes(version)) {
    result.errors.push(
      `Mule ${version} is not in the downloadable runtime list ` +
      `(available: ${available.join(", ") || "none"}). Only versions returned by ` +
      `\`dx mule runtime list\` can be downloaded — re-resolve the target against ` +
      `the runtime list and try again.`
    );
    return emit(result, outPath, version);
  }

  result.notes.push(`Downloading Mule ${version} runtime via Anypoint CLI...`);
  log(`Mule ${version} runtime not found locally — downloading (this can take a few minutes)...`);
  const dl = tryExec("anypoint-cli-v4", ["dx", "mule", "runtime", "download", "--version", version]);
  if (!dl.ok) {
    result.errors.push(`Mule runtime download failed for ${version}. CLI output:\n${dl.out.trim()}`);
    return emit(result, outPath, version);
  }
  result.downloaded = true;

  // 3. Re-locate after download.
  const after = findInAcbRuntimeDir(version);
  if (after) {
    result.runtimePath = after;
    result.resolvedVersion = after.slice(after.lastIndexOf(RUNTIME_DIR_PREFIX) + RUNTIME_DIR_PREFIX.length);
    result.source = "download";
    result.available = true;
  } else {
    result.errors.push(
      `Download reported success but no Mule ${version} runtime was found under ` +
      `${ACB_RUNTIME_DIR} afterward.`
    );
  }
  return emit(result, outPath, version);
}

function emit(result, outPath, version) {
  if (!outPath) outPath = join(process.cwd(), "tmp", `resolve-runtime-${version || "unknown"}.json`);

  if (result.available) {
    const via = result.downloaded ? "downloaded" : "already installed";
    log(`✅ Mule ${result.version} runtime ready (${via}).`);
    log(`   runtimePath: ${result.runtimePath}`);
  } else if (result.errors.length === 0) {
    log(`⚠️  Mule ${result.version} runtime not resolved.`);
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
    log(`\nMule runtime resolution FAILED for ${result.version}:`);
    for (const err of result.errors) log(`  • ${err}`);
    process.exitCode = 1;
  }
  return result;
}

main();
