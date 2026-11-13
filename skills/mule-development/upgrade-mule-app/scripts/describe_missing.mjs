#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Runs the missing describe-connector calls of Step 7 concurrently. It
// replaces the serial per-call loop; each call is still one
// describe_connector.mjs invocation (one fresh JVM), so describe_connector.mjs
// stays the single place that talks to the CLI.
//
// Two phases, because the enumerators must run between them (Mode-B names come
// from tmp/connector-usage/, which needs Mode-A first):
//   node scripts/describe_missing.mjs --phase a <nick> [<nick> ...]   Mode-A per used connector
//   node scripts/describe_missing.mjs --phase bc                      Mode-B (used ops/sources) + Mode-C (the providers the app uses; every provider of a config when a rename is possible)
//
// At most min(4, cores / 2) describe processes run at once (at least 1; 4 if
// the core count is unknown).
//
// Phase bc re-plans after each pass (at most 3): see MAX_PASSES.
//
// Phase bc is idempotent: an output file that already parses as JSON is skipped.
// Phase a always re-describes (it deletes the old Mode-A file and the nick's Mode-B/C
// files first): everything in phase bc is derived from Mode-A, so files left in tmp/ by
// a run against another target version must never be reused. Failed
// calls are retried once, one at a time. Per-call output of failed calls is
// kept in tmp/describe-logs/ (env DESCRIBE_LOG_DIR).
//
// Exit codes: 0 everything present, 1 some describes still failed (see tmp/describe-logs/)
// or, for phase bc, work was still left after the last pass (MISSING rows; re-run --phase bc),
// 2 bad args / prerequisites missing (Mode-A, usage files) / colliding output paths.
import { argv, env, stderr, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirp } from '../lib/fsx.mjs';
import {
  dedupeTargets, defaultConcurrency, isValidJsonFile, planPhaseA, planPhaseBC, runPool,
} from '../lib/describe-runner.mjs';

const DESCRIBE_SCRIPT = fileURLToPath(new URL('./describe_connector.mjs', import.meta.url));
const METADATA_DIR = env.CONNECTOR_METADATA_DIR || 'tmp/connector-metadata';
const USAGE_DIR = env.CONNECTOR_USAGE_DIR || 'tmp/connector-usage';
const LOG_DIR = env.DESCRIBE_LOG_DIR || 'tmp/describe-logs';

/** Delete the Mode-B/C files (`<nick>-new-*.json`) of each nick; Mode-A and `<nick>-op-renames.json` do not match. */
function removeDerivedFiles(nicks) {
  let names;
  try { names = readdirSync(METADATA_DIR); } catch { return; }
  for (const nick of nicks) {
    const prefix = `${nick}-new-`;
    for (const f of names) if (f.startsWith(prefix) && f.endsWith('.json')) rmSync(path.join(METADATA_DIR, f), { force: true });
  }
}

function usage() {
  stderr.write('Usage: describe_missing.mjs --phase a <nick> [<nick> ...]\n');
  stderr.write('       describe_missing.mjs --phase bc\n');
}

function parseArgs(args) {
  const opts = { phase: '', nicks: [] };
  const rest = [...args];
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === '--phase') opts.phase = rest.shift() ?? '';
    else if (a.startsWith('--')) return { error: `unknown option ${a}` };
    else opts.nicks.push(a);
  }
  if (opts.phase !== 'a' && opts.phase !== 'bc') return { error: "--phase must be 'a' or 'bc'" };
  if (opts.phase === 'a' && opts.nicks.length === 0) return { error: '--phase a needs at least one connector nickname' };
  if (opts.phase === 'bc' && opts.nicks.length > 0) return { error: '--phase bc takes no nicknames' };
  for (const n of opts.nicks) {
    if (!n || n.includes('/') || n.includes('\\') || n === '.' || n === '..') return { error: `bad nickname '${n}'` };
  }
  return { opts };
}

/** Run one describe_connector.mjs call; resolves with its exit code and combined output. @param {{args: string[]}} entry */
function describeOne(entry) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DESCRIBE_SCRIPT, ...entry.args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('error', (e) => resolve({ code: 1, output: `failed to spawn describe_connector.mjs: ${e.message}\n` }));
    child.on('close', (code) => resolve({ code: code ?? 1, output: Buffer.concat(chunks).toString('utf8') }));
  });
}

/** @returns {Promise<{ok: boolean, code: number, secs: string}>} */
async function attempt(entry) {
  const started = Date.now();
  const { code, output } = await describeOne(entry);
  const ok = code === 0 && isValidJsonFile(entry.path);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (ok) {
    stdout.write(`✅ ${entry.label} (${secs}s)\n`);
  } else {
    entry.logPath = path.join(LOG_DIR, `${path.basename(entry.path, '.json')}.log`);
    let where = entry.logPath;
    try {
      mkdirp(LOG_DIR);
      writeFileSync(entry.logPath, output);
    } catch {
      where = 'unavailable, log dir not writable';
    }
    stdout.write(`❌ ${entry.label} (exit ${code}, ${secs}s) — output in ${where}\n`);
  }
  return { ok, code, secs };
}

/** Plan the phase; returns { unique, notes } or { exit } when the run cannot proceed. */
function planOnce(opts) {
  let planned;
  const notes = [];
  if (opts.phase === 'a') {
    planned = planPhaseA(opts.nicks, METADATA_DIR);
  } else {
    const plan = planPhaseBC({ usageDir: USAGE_DIR, metadataDir: METADATA_DIR });
    if (plan.problems.length > 0) {
      for (const p of plan.problems) stderr.write(`❌ ${p}\n`);
      return { exit: 2 };
    }
    planned = plan.entries;
    notes.push(...plan.notes);
  }

  const { unique, conflicts } = dedupeTargets(planned);
  if (conflicts.length > 0) {
    for (const c of conflicts) stderr.write(`❌ output path collision: ${c}\n`);
    return { exit: 2 };
  }
  return { unique, notes };
}

/** Run `todo` through the pool, then retry failures once, one at a time. @returns {Promise<any[]>} the calls that still failed */
async function runBatch(todo, concurrency) {
  const first = await runPool(todo, concurrency, attempt);
  const failed = first.filter((r) => r.error || !r.result.ok).map((r) => r.item);
  if (failed.length === 0) return [];
  stdout.write(`describe_missing: retrying ${failed.length} failed call(s) one at a time\n`);
  const second = await runPool(failed, 1, attempt);
  return second.filter((r) => r.error || !r.result.ok).map((r) => r.item);
}

// Phase bc can need a second (rarely third) pass: which Mode-C files are required
// depends on the Mode-C files already described (lib/metadata-coverage.mjs widens
// a config to all its providers when a used provider's elementName differs from
// the element the flows use), so the plan is recomputed after each pass.
// Two passes always suffice today (used providers, then the widened config); the
// third is slack. DESCRIBE_MAX_PASSES exists so a test can exercise the cap.
const MAX_PASSES = Number(env.DESCRIBE_MAX_PASSES) > 0 ? Number(env.DESCRIBE_MAX_PASSES) : 3;

async function main() {
  const parsed = parseArgs(argv.slice(2));
  if (parsed.error) { stderr.write(`❌ ${parsed.error}\n`); usage(); return 2; }
  const { opts } = parsed;

  const concurrency = defaultConcurrency(os.availableParallelism?.());

  if (opts.phase === 'a') {
    // Remove first, so a stale file can neither be reused nor pass the post-call check if the describe writes nothing.
    // Also drop the nick's Mode-B/C files (<nick>-new-*.json): their names carry no version, so ones left by a run
    // against another target would otherwise be skipped by phase bc and feed Step 12 stale attributes.
    for (const e of planPhaseA(opts.nicks, METADATA_DIR)) rmSync(e.path, { force: true });
    removeDerivedFiles(opts.nicks);
  }

  const attempted = new Set();
  const stillFailed = [];
  let ran = 0;
  let total = 0;
  let present = 0;
  let settled = false;
  for (let pass = 1; pass <= (opts.phase === 'bc' ? MAX_PASSES : 1); pass++) {
    const planned = planOnce(opts);
    if (planned.exit !== undefined) return planned.exit;
    const { unique, notes } = planned;
    const todo = unique.filter((e) => !isValidJsonFile(e.path) && !attempted.has(e.path));
    if (pass === 1) {
      for (const n of notes) stdout.write(`${n}\n`);
      present = unique.length - todo.length;
    }
    if (todo.length === 0) {
      if (pass === 1) {
        stdout.write(`describe_missing: phase ${opts.phase} — ${unique.length} expected, all present, nothing to do\n`);
      }
      settled = true;
      break;
    }
    if (pass > 1) {
      stdout.write(`describe_missing: pass ${pass} — ${todo.length} more Mode-C describe(s) needed after the previous pass\n`);
    }
    stdout.write(`describe_missing: phase ${opts.phase} — ${todo.length} to run, ${unique.length - todo.length} already present, concurrency ${concurrency}\n`);
    for (const e of todo) attempted.add(e.path);
    const failedNow = await runBatch(todo, concurrency);
    stillFailed.push(...failedNow);
    ran += todo.length - failedNow.length;
    total += todo.length;
    if (failedNow.length > 0) break; // do not widen on top of a failed describe
  }

  // The last pass ran describes; confirm the re-plan needs nothing more instead of exiting 0 with work left.
  if (opts.phase === 'bc' && !settled && stillFailed.length === 0) {
    const planned = planOnce(opts);
    if (planned.exit !== undefined) return planned.exit;
    const left = planned.unique.filter((e) => !isValidJsonFile(e.path));
    if (left.length > 0) {
      stdout.write(`describe_missing: phase bc — ${left.length} describe(s) still needed after ${MAX_PASSES} pass(es)\n`);
      for (const e of left) stderr.write(`   MISSING ${e.label}\n`);
      return 1;
    }
  }

  if (total === 0) return 0;
  stdout.write(`describe_missing: phase ${opts.phase} — ${ran}/${total} described, ${stillFailed.length} failed, ${present} already present\n`);
  if (stillFailed.length > 0) {
    for (const e of stillFailed) stderr.write(`   FAILED ${e.label} — see ${e.logPath}\n`);
    return 1;
  }
  return 0;
}

process.exitCode = await main();
