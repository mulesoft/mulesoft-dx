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
//   node scripts/describe_missing.mjs --phase bc                      Mode-B (used ops/sources) + Mode-C (every Mode-A config x provider)
//
// At most min(4, cores / 2) describe processes run at once (at least 1; 4 if
// the core count is unknown).
//
// Idempotent: an output file that already parses as JSON is skipped. Failed
// calls are retried once, one at a time. Per-call output of failed calls is
// kept in tmp/describe-logs/ (env DESCRIBE_LOG_DIR).
//
// Exit codes: 0 everything present, 1 some describes still failed,
// 2 bad args / prerequisites missing (Mode-A, usage files) / colliding output paths.
import { argv, env, stderr, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import { writeFileSync } from 'node:fs';
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

async function main() {
  const parsed = parseArgs(argv.slice(2));
  if (parsed.error) { stderr.write(`❌ ${parsed.error}\n`); usage(); return 2; }
  const { opts } = parsed;

  const concurrency = defaultConcurrency(os.availableParallelism?.());

  let planned;
  const notes = [];
  if (opts.phase === 'a') {
    planned = planPhaseA(opts.nicks, METADATA_DIR);
  } else {
    const plan = planPhaseBC({ usageDir: USAGE_DIR, metadataDir: METADATA_DIR });
    if (plan.problems.length > 0) {
      for (const p of plan.problems) stderr.write(`❌ ${p}\n`);
      return 2;
    }
    planned = plan.entries;
    notes.push(...plan.notes);
  }

  const { unique, conflicts } = dedupeTargets(planned);
  if (conflicts.length > 0) {
    for (const c of conflicts) stderr.write(`❌ output path collision: ${c}\n`);
    return 2;
  }

  for (const n of notes) stdout.write(`${n}\n`);

  const todo = unique.filter((e) => !isValidJsonFile(e.path));
  const present = unique.length - todo.length;
  if (todo.length === 0) {
    stdout.write(`describe_missing: phase ${opts.phase} — ${unique.length} expected, all present, nothing to do\n`);
    return 0;
  }
  stdout.write(`describe_missing: phase ${opts.phase} — ${todo.length} to run, ${present} already present, concurrency ${concurrency}\n`);

  const first = await runPool(todo, concurrency, attempt);
  const failed = first.filter((r) => r.error || !r.result.ok).map((r) => r.item);

  let stillFailed = failed;
  if (failed.length > 0) {
    stdout.write(`describe_missing: retrying ${failed.length} failed call(s) one at a time\n`);
    const second = await runPool(failed, 1, attempt);
    stillFailed = second.filter((r) => r.error || !r.result.ok).map((r) => r.item);
  }

  const ran = todo.length - stillFailed.length;
  stdout.write(`describe_missing: phase ${opts.phase} — ${ran}/${todo.length} described, ${stillFailed.length} failed, ${present} already present\n`);
  if (stillFailed.length > 0) {
    for (const e of stillFailed) stderr.write(`   FAILED ${e.label} — see ${e.logPath}\n`);
    return 1;
  }
  return 0;
}

process.exitCode = await main();
