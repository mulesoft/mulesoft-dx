#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 5b helper — for each connector found in Step 5a, look it up in Exchange by
// its exact POM coordinates and report which Java versions its CURRENT (in-use)
// version declares support for. Purely informational: it shows "connector X at
// version V supports Java 8, 11, 17" so the user can see where each dependency
// stands before the upgrade. It does NOT resolve a target version, read
// min-mule-version, or compare against the target Java/Mule (a later step does
// that — finding the latest version that supports the target runtime).
//
// The primary Exchange call is `exchange asset describe <groupId>/<assetId>/<version>`
// (an exact lookup). Conditions that HARD-STOP the upgrade:
//   1. describe of the current version fails AND an existence probe shows the asset
//      is genuinely absent from Exchange (missing, wrong coordinates, or an auth
//      failure) — nothing to upgrade to.
//   2. describe succeeds but carries NO is-java-*-supported tags — Exchange has no
//      Java compatibility information for it, so we "cannot proceed".
// A version present but declaring support for NO Java version (all tags "false")
// is NOT a stop here — that is real information ("supports: none"); whether a newer
// version supports the target runtime is decided by the later step.
//
// Delisted-version case (NOT a stop): when describe of the current version fails,
// we probe with `exchange asset list <assetId>` and require an EXACT groupId+assetId
// GA match. If the asset exists (only the app's old pinned version was delisted),
// we do NOT block — the Step 3 baseline build already proved the current version
// runs on the current Java, and Step 6 verifies the target version. Only a probe
// that finds no match is a genuine "not on Exchange" stop.
//
// Retries: describe is retried a few times with a short gap so a transient network
// / auth blip is not mistaken for "not on Exchange". The CLI error is generic, so
// the raw stderr is surfaced in the block reason to help tell a genuine miss from
// an auth problem.
//
// Usage:
//   node check_connector_java_compat.mjs [projectDir]
//   Default projectDir = cwd. Reads ${CONNECTORS_FILE} or <projectDir>/tmp/connectors.json.
//   Writes ${CONNECTOR_JAVA_COMPAT_FILE} or <projectDir>/tmp/connector-java-compat.json.
//
// Output JSON (file): { projectDir, connectors[], blocked[], stop, warnings[], notes[] }.
//   Each connector: { nick, groupId, artifactId, version, supportedJava[], blocked,
//   blockReason }. `stop` is true when any connector is blocked.
//
// Exit code: 1 when stop is true (a connector could not be verified); 0 otherwise.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { listExactGaRows } from "../lib/anypoint.mjs";

// Don't crash if a downstream consumer (e.g. `head`) closes stdout early.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

function log(msg) {
  process.stdout.write(msg + "\n");
}

const DESCRIBE_ATTEMPTS = 3;
const DESCRIBE_GAP_MS = 2000;

// Block the CLI's env-driven defaults from redirecting the lookup, and silence
// Node deprecation warnings the CLI emits on stderr.
const CLI_ENV = { ...process.env, NODE_NO_WARNINGS: "1" };
delete CLI_ENV.ANYPOINT_ENV;

// Synchronous sleep without a busy-wait (which would peg a CPU core and starve
// the next spawn). Blocks the thread for ms using Atomics.wait on a throwaway
// buffer — dependency-free and idle.
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Run `exchange asset describe <coord>` once. Returns { ok, out, err }.
function describeOnce(coord) {
  const r = spawnSync(
    "anypoint-cli-v4",
    ["exchange", "asset", "describe", coord, "--output", "json"],
    { encoding: "utf8", env: CLI_ENV, maxBuffer: 32 * 1024 * 1024 }
  );
  if (r.error) return { ok: false, out: "", err: r.error.message };
  const out = r.stdout || "";
  const err = r.stderr || "";
  return { ok: r.status === 0, out, err };
}

// Describe with retries. A failure is retried (transient network/auth) up to
// DESCRIBE_ATTEMPTS; the last stderr is returned so the caller can surface it.
function describeWithRetry(coord) {
  let last = { ok: false, out: "", err: "" };
  for (let attempt = 1; attempt <= DESCRIBE_ATTEMPTS; attempt++) {
    last = describeOnce(coord);
    if (last.ok) return last;
    if (attempt < DESCRIBE_ATTEMPTS) sleep(DESCRIBE_GAP_MS);
  }
  return last;
}

// Existence probe (used only when describing the current version fails): true when
// an exact groupId+assetId row exists (only the pinned version was delisted).
function assetExistsOnExchange(groupId, artifactId) {
  return listExactGaRows(groupId, artifactId).length > 0;
}

// The CLI prints a "Fetching..." preamble before the JSON body. Slice from the
// first { or [ so JSON.parse sees only the document.
function parseCliJson(out) {
  const objStart = out.indexOf("{");
  const arrStart = out.indexOf("[");
  const start = arrStart === -1 ? objStart : (objStart === -1 ? arrStart : Math.min(objStart, arrStart));
  if (start === -1) return null;
  try {
    return JSON.parse(out.slice(start));
  } catch {
    return null;
  }
}

// From an asset-describe payload, return the sorted list of Java majors whose
// is-java-<major>-supported tag is exactly "true". Tags are { value, key } with
// some key === null (freeform labels) which are ignored. Returns { hasJavaTags,
// supported } so the caller can distinguish "no Java info at all" from "info
// present, supports none".
function readJavaSupport(asset) {
  const tags = Array.isArray(asset?.tags) ? asset.tags : [];
  let hasJavaTags = false;
  const supported = [];
  for (const t of tags) {
    const key = t && typeof t.key === "string" ? t.key : null;
    if (!key) continue;
    const m = key.match(/^is-java-(\d+)-supported$/);
    if (!m) continue;
    hasJavaTags = true;
    if (String(t.value) === "true") supported.push(Number(m[1]));
  }
  supported.sort((a, b) => a - b);
  return { hasJavaTags, supported };
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) projectDir = resolve(argv[i]);
  }
  projectDir = resolve(projectDir);

  const inPath = process.env.CONNECTORS_FILE || join(projectDir, "tmp", "connectors.json");
  const outPath = process.env.CONNECTOR_JAVA_COMPAT_FILE || join(projectDir, "tmp", "connector-java-compat.json");

  const result = {
    projectDir,
    connectors: [],   // { nick, groupId, artifactId, version, supportedJava[], blocked, blockReason }
    blocked: [],      // nicks that could not be verified
    stop: false,
    warnings: [],
    notes: [],
  };

  if (!existsSync(inPath)) {
    result.warnings.push(`Step 5 output not found at ${inPath}. Run extract_connectors.mjs first.`);
    result.stop = true;
    return emit(result, outPath);
  }

  let step5;
  try {
    step5 = JSON.parse(readFileSync(inPath, "utf8"));
  } catch (e) {
    result.warnings.push(`Failed to read ${inPath}: ${e.message}`);
    result.stop = true;
    return emit(result, outPath);
  }

  const connectors = Array.isArray(step5.connectors) ? step5.connectors : [];
  if (connectors.length === 0) {
    result.notes.push("No connectors to check (Step 5 found none).");
    return emit(result, outPath);
  }

  for (const c of connectors) {
    const nick = c.nick || c.artifactId;
    const entry = {
      nick,
      groupId: c.groupId,
      artifactId: c.artifactId,
      version: c.versionResolved ? c.version : null,
      supportedJava: [],
      blocked: false,
      blockReason: null,
    };

    // 1. Need a concrete version to form the describe coordinate.
    if (!c.versionResolved || !c.version) {
      entry.blocked = true;
      entry.blockReason =
        `Version is not resolvable from the POM (inherited from a parent ` +
        `<dependencyManagement>/BOM). Cannot query Exchange for Java compatibility.`;
      result.connectors.push(entry);
      result.blocked.push(nick);
      continue;
    }

    const coord = `${c.groupId}/${c.artifactId}/${c.version}`;
    const res = describeWithRetry(coord);

    // 2. describe of the current version failed. Delisted old version (asset still
    //    on Exchange) -> not a stop; genuinely absent -> stop.
    if (!res.ok) {
      if (assetExistsOnExchange(c.groupId, c.artifactId)) {
        const note =
          `${c.groupId}:${c.artifactId} ${c.version}: this version is delisted from Exchange, ` +
          `so its Java compatibility could not be verified. The connector itself is still ` +
          `available on Exchange, so the upgrade continues.`;
        entry.currentVersionDelisted = true;
        entry.warning = note;
        result.warnings.push(note);
        result.connectors.push(entry);
        continue;
      }
      entry.blocked = true;
      entry.blockReason =
        `Not found in Exchange (describe failed after ${DESCRIBE_ATTEMPTS} attempts and ` +
        `no exact-GA match from asset list). The connector may be missing, have different ` +
        `published coordinates, or this may be an authentication issue. ` +
        `CLI said: ${(res.err || res.out).trim() || "(no output)"}`;
      result.connectors.push(entry);
      result.blocked.push(nick);
      continue;
    }

    const asset = parseCliJson(res.out);
    if (!asset) {
      entry.blocked = true;
      entry.blockReason = `Exchange returned a response that could not be parsed as JSON.`;
      result.connectors.push(entry);
      result.blocked.push(nick);
      continue;
    }

    // 3. No is-java-* tags at all -> no compatibility information -> cannot proceed.
    const { hasJavaTags, supported } = readJavaSupport(asset);
    if (!hasJavaTags) {
      entry.blocked = true;
      entry.blockReason =
        `No Java compatibility information found in Exchange for this version ` +
        `(no is-java-*-supported tags). Cannot proceed.`;
      result.connectors.push(entry);
      result.blocked.push(nick);
      continue;
    }

    // Info present. An empty supported[] means the tags are all "false" — the
    // current version supports no Java version. Not a block here (a newer version
    // may support the target, decided later), but warn: it is a suspect state.
    entry.supportedJava = supported;
    if (supported.length === 0) {
      const w = `${c.groupId}:${c.artifactId} ${c.version}: no supported Java version found (all is-java-*-supported tags are false).`;
      entry.warning = w;
      result.warnings.push(w);
    }
    result.connectors.push(entry);
  }

  result.stop = result.blocked.length > 0;
  return emit(result, outPath);
}

function emit(result, outPath) {
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    result.outPath = outPath;
    log(`Saved to ${outPath}`);
  } catch (e) {
    result.warnings.push(`Failed to write ${outPath}: ${e.message}`);
    log(`⚠️  Failed to write ${outPath}: ${e.message}`);
  }

  if (result.stop) process.exitCode = 1;
  return result;
}

main();
