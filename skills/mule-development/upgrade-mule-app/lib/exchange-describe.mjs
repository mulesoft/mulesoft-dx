// exchange-describe.mjs — `anypoint-cli-v4 exchange asset describe <g>/<a>/<v>` with
// retries and a per-run cache, shared by Step 5b (check_connector_java_compat.mjs)
// and Step 6 (resolve_target_connectors.mjs).
//
// Both steps describe the SAME coordinate for every connector (the app's current
// version), and the payload carries everything each needs: the current version's
// is-java-*-supported tags for 5b, and the sibling `.versions[]` for 6. Step 5b
// writes each successful describe under `<tmp>/exchange-describe/`, Step 6 reads it
// back instead of calling the CLI again. Only successful, parseable responses are
// cached, so a failure is always retried live. A missing or corrupt entry is a miss.
// Step 1 clears `tmp/`, so the cache never outlives the run that produced it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DESCRIBE_ATTEMPTS = 3;
export const DESCRIBE_GAP_MS = 2000;
export const CACHE_DIRNAME = 'exchange-describe';

// Block the CLI's env-driven defaults from redirecting the lookup, and silence
// Node deprecation warnings the CLI emits on stderr.
const CLI_ENV = { ...process.env, NODE_NO_WARNINGS: '1' };
delete CLI_ENV.ANYPOINT_ENV;

// Synchronous sleep without a busy-wait (which would peg a CPU core and starve
// the next spawn).
function defaultSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Run `exchange asset describe <coord>` once. Returns { ok, out, err }.
export function describeOnce(coord, spawn = spawnSync) {
  const r = spawn(
    'anypoint-cli-v4',
    ['exchange', 'asset', 'describe', coord, '--output', 'json'],
    { encoding: 'utf8', env: CLI_ENV, maxBuffer: 32 * 1024 * 1024 }
  );
  if (r.error) return { ok: false, out: '', err: r.error.message };
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '' };
}

// The CLI prints a "Fetching..." preamble before the JSON body. Slice from the
// first { or [ so JSON.parse sees only the document.
export function parseCliJson(out) {
  const objStart = out.indexOf('{');
  const arrStart = out.indexOf('[');
  const start = arrStart === -1 ? objStart : (objStart === -1 ? arrStart : Math.min(objStart, arrStart));
  if (start === -1) return null;
  try {
    return JSON.parse(out.slice(start));
  } catch {
    return null;
  }
}

function cachePath(cacheDir, coord) {
  return join(cacheDir, `${coord.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

function readCache(cacheDir, coord) {
  const p = cachePath(cacheDir, coord);
  if (!existsSync(p)) return null;
  try {
    const entry = JSON.parse(readFileSync(p, 'utf8'));
    if (entry && entry.coord === coord && typeof entry.out === 'string' && parseCliJson(entry.out)) {
      return { ok: true, out: entry.out, err: '', cached: true };
    }
  } catch {
    // corrupt entry: treat as a miss
  }
  return null;
}

function writeCache(cacheDir, coord, out) {
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath(cacheDir, coord), JSON.stringify({ coord, out }));
  } catch {
    // the cache is an optimisation; never fail the step over it
  }
}

/**
 * Describe with retries. A failure is retried (transient network/auth) up to
 * DESCRIBE_ATTEMPTS; the last stderr is returned so the caller can surface it.
 *
 * @param {string} coord `<groupId>/<assetId>/<version>`
 * @param {{ cacheDir?: string, spawn?: Function, sleep?: Function }} [opts]
 *   `cacheDir`: when set, a cached success is returned without calling the CLI and
 *   a fresh success is written there.
 * @returns {{ ok: boolean, out: string, err: string, cached?: boolean }}
 */
export function describeWithRetry(coord, opts = {}) {
  const { cacheDir, spawn = spawnSync, sleep = defaultSleep } = opts;
  if (cacheDir) {
    const hit = readCache(cacheDir, coord);
    if (hit) return hit;
  }
  let last = { ok: false, out: '', err: '' };
  for (let attempt = 1; attempt <= DESCRIBE_ATTEMPTS; attempt++) {
    last = describeOnce(coord, spawn);
    if (last.ok) {
      if (cacheDir && parseCliJson(last.out)) writeCache(cacheDir, coord, last.out);
      return last;
    }
    if (attempt < DESCRIBE_ATTEMPTS) sleep(DESCRIBE_GAP_MS);
  }
  return last;
}
