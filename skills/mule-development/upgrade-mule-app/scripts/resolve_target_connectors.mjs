#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 6 helper — for each connector from Step 5, find the LATEST published
// version that supports BOTH the target Java and the target Mule Runtime.
//
// One Exchange call per connector: `exchange asset describe <groupId>/<assetId>/<version>`
// returns a `.versions[]` array listing every sibling version, each already
// carrying its own `min-mule-version` and `is-java-<major>-supported` tags. So
// the whole version history is filtered locally from a single describe — no
// paging of the fuzzy `asset list`, no per-version network calls.
//
// Selection ("latest that fits target"): among all versions, keep those where
//   - is-java-<targetJava>-supported == "true", AND
//   - min-mule-version <= target Mule (the connector's runtime floor fits),
// then pick the highest by semver. This ALWAYS moves a connector to the latest
// target-compatible version, even when its current pin already runs on the
// target — `changed` is false only when the current version already IS that
// latest (nothing higher to move to). If none qualifies, the connector is
// BLOCKED and the upgrade cannot proceed (exit 1) — no version runs on the target.
//
// The target comes from Step 4 (tmp/target-versions.json): options[0] by default,
// or overridden with TARGET_MULE / TARGET_JAVA env vars (e.g. a user-confirmed
// requestedTarget). Retries mirror Step 5b so a transient blip is not a miss.
//
// Usage:
//   node resolve_target_connectors.mjs [projectDir]
//   Reads ${CONNECTORS_FILE} or <projectDir>/tmp/connectors.json (Step 5a),
//   and the target from ${TARGET_MULE}/${TARGET_JAVA} or tmp/target-versions.json.
//   Writes ${TARGET_CONNECTORS_FILE} or <projectDir>/tmp/target-connectors.json.
//
// Output JSON: { projectDir, targetMule, targetJava, connectors[], blocked[],
//   stop, warnings[], notes[] }. Each connector: { nick, groupId, artifactId,
//   currentVersion, targetVersion, changed, candidateCount, minMuleVersion,
//   supportedJava[], blocked, blockReason }.
//
// Exit code: 1 when stop is true (a connector has no target-compatible version);
//   0 otherwise.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { listExactGaRows } from "../lib/anypoint.mjs";

process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });
function log(msg) { process.stdout.write(msg + "\n"); }

const DESCRIBE_ATTEMPTS = 3;
const DESCRIBE_GAP_MS = 2000;

const CLI_ENV = { ...process.env, NODE_NO_WARNINGS: "1" };
delete CLI_ENV.ANYPOINT_ENV;

// Idle synchronous sleep (no busy-wait) — matches Step 5b.
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// A pre-release / non-GA version carries a qualifier after a hyphen
// (e.g. 1.7.0-rc1, 2.0.0-SNAPSHOT, 1.5.0-beta). We never upgrade TO one, so these
// are excluded from candidate selection even though Exchange publishes them with
// the same compat tags as GA.
function isPreRelease(version) {
  return String(version).includes("-");
}

// Compare two dotted version strings numerically, segment by segment. A missing
// segment counts as 0, so "4.1" == "4.1.0". Returns -1 / 0 / 1.
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

function describeOnce(coord) {
  const r = spawnSync(
    "anypoint-cli-v4",
    ["exchange", "asset", "describe", coord, "--output", "json"],
    { encoding: "utf8", env: CLI_ENV, maxBuffer: 32 * 1024 * 1024 }
  );
  if (r.error) return { ok: false, out: "", err: r.error.message };
  return { ok: r.status === 0, out: r.stdout || "", err: r.stderr || "" };
}

function describeWithRetry(coord) {
  let last = { ok: false, out: "", err: "" };
  for (let attempt = 1; attempt <= DESCRIBE_ATTEMPTS; attempt++) {
    last = describeOnce(coord);
    if (last.ok) return last;
    if (attempt < DESCRIBE_ATTEMPTS) sleep(DESCRIBE_GAP_MS);
  }
  return last;
}

// The CLI prints a "Fetching..." preamble before the JSON. Slice from the first
// { or [ so JSON.parse sees only the document.
function parseCliJson(out) {
  const objStart = out.indexOf("{");
  const arrStart = out.indexOf("[");
  const start = arrStart === -1 ? objStart : (objStart === -1 ? arrStart : Math.min(objStart, arrStart));
  if (start === -1) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

// When describing the pinned version fails, return the newest GA sibling to re-anchor
// the describe: highest exact groupId+assetId version, pre-releases excluded. Null if none.
function newestGaVersionOnExchange(groupId, artifactId) {
  const versions = listExactGaRows(groupId, artifactId)
    .map((a) => a.version)
    .filter((v) => v && !isPreRelease(v))
    .map(String)
    .sort((a, b) => cmpVersion(b, a));
  return versions[0] || null;
}

// Read a keyed tag value (e.g. min-mule-version) off a version entry.
function tagValue(entry, key) {
  const tags = Array.isArray(entry?.tags) ? entry.tags : [];
  for (const t of tags) if (t && t.key === key) return t.value;
  return null;
}

// The Java majors a version entry declares support for (is-java-<n>-supported == "true").
function supportedJavaOf(entry) {
  const tags = Array.isArray(entry?.tags) ? entry.tags : [];
  const out = [];
  for (const t of tags) {
    if (!t || typeof t.key !== "string") continue;
    const m = t.key.match(/^is-java-(\d+)-supported$/);
    if (m && String(t.value) === "true") out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

// Build the full candidate list for a connector from a describe payload. Each
// version entry is normalized to { version, minMule, java[] }. Falls back to the
// top-level asset when `.versions[]` is absent (older payloads).
function versionsFrom(asset) {
  const list = Array.isArray(asset?.versions) && asset.versions.length
    ? asset.versions
    : [asset];
  return list
    .filter((e) => e && e.version)
    .map((e) => ({
      version: String(e.version),
      minMule: tagValue(e, "min-mule-version"),
      java: supportedJavaOf(e),
    }));
}

function readTarget(projectDir) {
  let mule = process.env.TARGET_MULE || null;
  let java = process.env.TARGET_JAVA || null;
  if (mule && java) return { mule, java, source: "env" };

  const tvPath = process.env.TARGET_VERSIONS_FILE || join(projectDir, "tmp", "target-versions.json");
  if (existsSync(tvPath)) {
    try {
      const tv = JSON.parse(readFileSync(tvPath, "utf8"));
      const opt = Array.isArray(tv.options) && tv.options[0] ? tv.options[0] : null;
      if (opt) {
        mule = mule || (opt.mule != null ? String(opt.mule) : null);
        java = java || (opt.java != null ? String(opt.java) : null);
      }
    } catch { /* fall through to null */ }
  }
  return { mule, java, source: mule && java ? "target-versions.json" : "incomplete" };
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  for (let i = 0; i < argv.length; i++) if (!argv[i].startsWith("--")) projectDir = resolve(argv[i]);
  projectDir = resolve(projectDir);

  const inPath = process.env.CONNECTORS_FILE || join(projectDir, "tmp", "connectors.json");
  const outPath = process.env.TARGET_CONNECTORS_FILE || join(projectDir, "tmp", "target-connectors.json");

  const { mule: targetMule, java: targetJava, source: targetSource } = readTarget(projectDir);

  const result = {
    projectDir,
    targetMule,
    targetJava,
    connectors: [],
    blocked: [],
    stop: false,
    warnings: [],
    notes: [],
  };

  if (!targetMule || !targetJava) {
    result.warnings.push(
      `Target Mule/Java not available (source: ${targetSource}). Run Step 4 ` +
      `(resolve_target_versions.mjs) first, or pass TARGET_MULE and TARGET_JAVA.`
    );
    result.stop = true;
    return emit(result, outPath);
  }

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
    result.notes.push("No connectors to resolve (Step 5 found none).");
    return emit(result, outPath);
  }

  const targetJavaNum = Number(targetJava);

  for (const c of connectors) {
    const nick = c.nick || c.artifactId;
    const entry = {
      nick,
      groupId: c.groupId,
      artifactId: c.artifactId,
      currentVersion: c.versionResolved ? c.version : null,
      targetVersion: null,
      changed: false,
      candidateCount: 0,
      minMuleVersion: null,
      supportedJava: [],
      blocked: false,
      blockReason: null,
    };

    // Need a resolvable current version to form a describe coordinate. (Step 5b
    // already hard-stops on this; guard here in case Step 6 is run standalone.)
    if (!c.versionResolved || !c.version) {
      entry.blocked = true;
      entry.blockReason = `Current version is not resolvable from the POM, so the connector could not be queried in Exchange.`;
      result.connectors.push(entry);
      result.blocked.push(nick);
      continue;
    }

    let res = describeWithRetry(`${c.groupId}/${c.artifactId}/${c.version}`);

    // Current version delisted? Re-anchor the describe on the newest GA sibling so
    // we can still read `.versions[]`. Only a genuinely-absent asset blocks here.
    if (!res.ok) {
      const anchor = newestGaVersionOnExchange(c.groupId, c.artifactId);
      if (anchor) {
        const note = `${c.groupId}:${c.artifactId} ${c.version}: this version is delisted from Exchange; resolving the target from the newest available version (${anchor}) instead.`;
        result.warnings.push(note);
        res = describeWithRetry(`${c.groupId}/${c.artifactId}/${anchor}`);
      }
    }
    if (!res.ok) {
      entry.blocked = true;
      entry.blockReason =
        `Not found in Exchange (describe failed after ${DESCRIBE_ATTEMPTS} attempts and ` +
        `no exact-GA match from asset list). CLI said: ${(res.err || res.out).trim() || "(no output)"}`;
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

    // Keep GA versions that support the target Java AND whose Mule floor fits the
    // target. Pre-releases (rc/beta/SNAPSHOT/…) are excluded up front: an upgrade
    // must never target a non-GA build, and Exchange tags them the same as GA so
    // the Java/Mule filter alone can't distinguish them.
    const candidates = versionsFrom(asset).filter((v) => {
      if (isPreRelease(v.version)) return false;
      const javaOk = v.java.includes(targetJavaNum);
      const muleOk = v.minMule ? cmpVersion(v.minMule, targetMule) <= 0 : false;
      return javaOk && muleOk;
    });
    entry.candidateCount = candidates.length;

    if (candidates.length === 0) {
      entry.blocked = true;
      entry.blockReason =
        `No published version supports the target runtime (Mule ${targetMule}, Java ${targetJava}). ` +
        `The upgrade cannot proceed until this connector publishes a compatible version.`;
      result.connectors.push(entry);
      result.blocked.push(nick);
      continue;
    }

    // Always move to the LATEST version that fits the target — regardless of
    // whether the current pin already runs on the target. `changed` is false
    // ONLY when the current version already IS that latest target-compatible
    // version (nothing higher to move to), not merely because it is compatible.
    candidates.sort((a, b) => cmpVersion(b.version, a.version));
    const best = candidates[0];
    entry.targetVersion = best.version;
    entry.minMuleVersion = best.minMule;
    entry.supportedJava = best.java;
    entry.changed = cmpVersion(best.version, c.version) !== 0;
    result.connectors.push(entry);
  }

  result.stop = result.blocked.length > 0;
  return emit(result, outPath);
}

function emit(result, outPath) {
  if (result.connectors.length) {
    log(`Target: Mule ${result.targetMule}, Java ${result.targetJava}`);
    for (const c of result.connectors) {
      if (c.blocked) {
        log(`   ✗ ${c.nick}: ${c.blockReason}`);
      } else if (c.changed) {
        log(`   • ${c.nick}: ${c.currentVersion} → ${c.targetVersion} (min-mule ${c.minMuleVersion}, java ${c.supportedJava.join(",")})`);
      } else {
        log(`   • ${c.nick}: ${c.targetVersion} already at latest target-compatible version (no change)`);
      }
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

  if (result.stop) process.exitCode = 1;
  return result;
}

main();
