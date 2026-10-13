// anypoint.mjs — wrap anypoint-cli-v4 invocations and toolchain probes.
import { spawnSync } from 'node:child_process';

/** @param {Record<string,string>} [extra] Overrides merged last. @returns {Record<string,string>} A child env with ANYPOINT_ENV unset and NODE_NO_WARNINGS=1. */
export function anypointEnv(extra = {}) {
  const env = { ...process.env };
  delete env.ANYPOINT_ENV;
  env.NODE_NO_WARNINGS = '1';
  return { ...env, ...extra };
}

/** @param {string} cmd Executable. @param {string[]} args Argv. @param {{env?:Record<string,string>}} [opts] @returns {{status:number|null, signal:string|null, error:Error|undefined, stdout:string, stderr:string}} Synchronous spawn capture with anypointEnv() applied. */
export function runProbe(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    env: anypointEnv(opts.env),
    encoding: 'utf8',
    shell: false,
    // Exchange `asset describe --output json` for large connectors (http, db)
    // exceeds Node's 1 MB default, yielding ENOBUFS/SIGTERM/status:null. Lift
    // the cap so the full JSON is captured.
    maxBuffer: Infinity,
  });
  return {
    status: r.status,
    signal: r.signal,
    error: r.error,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

// The CLI prints a "Fetching..." preamble before the JSON. Slice from the first { or [.
function sliceCliJson(out) {
  const o = out.indexOf('{'), a = out.indexOf('[');
  const start = a === -1 ? o : (o === -1 ? a : Math.min(o, a));
  if (start === -1) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

/** Page `exchange asset list` (fuzzy and paginated; API caps limit at 250) to
 * exhaustion and return every row whose groupId+assetId match exactly.
 * @param {string} groupId @param {string} artifactId @returns {object[]} */
export function listExactGaRows(groupId, artifactId) {
  const PAGE_SIZE = 200; // must stay <= the API's 250 ceiling
  const MAX_PAGES = 50;  // runaway guard (~10k rows)
  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = runProbe('anypoint-cli-v4',
      ['exchange', 'asset', 'list', artifactId, '--output', 'json',
       '--limit', String(PAGE_SIZE), '--offset', String(page * PAGE_SIZE)]);
    if (r.status !== 0) break;
    const rows = sliceCliJson(r.stdout);
    if (!Array.isArray(rows)) break;
    for (const a of rows) if (a && a.groupId === groupId && a.assetId === artifactId) out.push(a);
    if (rows.length < PAGE_SIZE) break; // short page => list exhausted
  }
  return out;
}
