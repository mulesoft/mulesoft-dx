//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Planning and scheduling pieces of describe_missing.mjs, kept free of
// process spawning so they can be unit-tested: which describe calls are
// missing, how many may run at once, and the bounded pool that runs them.
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { isDir, readJsonOrNull } from './fsx.mjs';
import { computeCoverageRows } from './metadata-coverage.mjs';

/** Fallback when the core count cannot be read. */
export const FALLBACK_CONCURRENCY = 4;
/** Upper bound of the default; each describe is a fresh JVM (~300 MB, ~1.5 cores). */
export const MAX_DEFAULT_CONCURRENCY = 4;

/**
 * Default pool size: half the cores, at most MAX_DEFAULT_CONCURRENCY, at least 1.
 * @param {number|undefined} cpuCount from os.availableParallelism(); unusable values fall back to 4
 * @returns {number}
 */
export function defaultConcurrency(cpuCount) {
  if (!Number.isInteger(cpuCount) || cpuCount < 1) return FALLBACK_CONCURRENCY;
  return Math.max(1, Math.min(MAX_DEFAULT_CONCURRENCY, Math.floor(cpuCount / 2)));
}

/** @param {string} p @returns {boolean} true iff `p` holds parseable JSON (a killed describe can leave a truncated file) */
export function isValidJsonFile(p) {
  return readJsonOrNull(p) !== null;
}

/**
 * Phase "a": one Mode-A describe per nick.
 * @param {string[]} nicks
 * @param {string} metadataDir
 */
export function planPhaseA(nicks, metadataDir) {
  return nicks.map((nick) => ({
    label: `${nick}/Mode-A`,
    path: path.join(metadataDir, `${nick}-new.json`),
    args: [`${nick}-new`],
  }));
}

/**
 * Phase "bc": every Mode-B / Mode-C describe the coverage gate expects.
 * @param {{usageDir: string, metadataDir: string}} p
 * @returns {{entries: any[], notes: string[], problems: string[]}}
 *   `problems` are prerequisites that make the run meaningless (missing
 *   usage files / Mode-A); `notes` are the gate's WARN and INFO rows.
 */
export function planPhaseBC({ usageDir, metadataDir }) {
  const problems = [];
  const notes = [];
  const entries = [];

  if (!isDir(usageDir)) {
    return { entries, notes, problems: [`${usageDir} does not exist — run enumerate_usage.mjs (Step 7b) first`] };
  }
  const usageFiles = readdirSync(usageDir).filter((f) => f.endsWith('.json')).sort();
  if (usageFiles.length === 0) {
    return { entries, notes, problems: [`no usage files in ${usageDir} — run enumerate_usage.mjs (Step 7b) first`] };
  }

  for (const file of usageFiles) {
    const nick = path.basename(file, '.json');
    const usage = readJsonOrNull(path.join(usageDir, file));
    if (!usage) { problems.push(`could not parse ${path.join(usageDir, file)}`); continue; }
    if (usage.status === 'not_in_use') continue;
    const modeAPath = path.join(metadataDir, `${nick}-new.json`);
    const modeA = readJsonOrNull(modeAPath);
    if (!modeA) { problems.push(`${nick}: missing or unparseable Mode-A ${modeAPath} — run the Mode-A phase first`); continue; }
    for (const row of computeCoverageRows({ nick, usage, modeA, metadataDir })) {
      if (row.level === 'EXPECT') entries.push(row);
      else notes.push(row.text);
    }
  }
  return { entries, notes, problems };
}

/**
 * Drop exact repeats and report different calls that would write the same file
 * (e.g. `a-b` + `c` against `a` + `b-c`), which would silently overwrite each other.
 * @param {Array<{path: string, args: string[], label: string}>} entries
 * @returns {{unique: any[], conflicts: string[]}}
 */
export function dedupeTargets(entries) {
  const byPath = new Map();
  const conflicts = [];
  for (const e of entries) {
    const seen = byPath.get(e.path);
    if (!seen) { byPath.set(e.path, e); continue; }
    if (seen.args.join('\u0000') !== e.args.join('\u0000')) {
      conflicts.push(`${seen.label} and ${e.label} both write ${e.path}`);
    }
  }
  return { unique: [...byPath.values()], conflicts };
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 * Never rejects: a throwing worker becomes a result with `error`.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<Array<{item: T, result?: R, error?: Error}>>} in input order
 */
export async function runPool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { item: items[i], result: await worker(items[i]) }; } catch (error) { out[i] = { item: items[i], error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return out;
}
