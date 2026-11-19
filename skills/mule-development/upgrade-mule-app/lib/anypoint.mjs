// anypoint.mjs — wrap anypoint-cli-v4 invocations and toolchain probes.
import { spawnSync } from 'node:child_process';

/** @param {Record<string,string>} [extra] Overrides merged last. @returns {Record<string,string>} A child env with ANYPOINT_ENV unset and NODE_NO_WARNINGS=1. */
export function anypointEnv(extra = {}) {
  const env = { ...process.env };
  delete env.ANYPOINT_ENV;
  env.NODE_NO_WARNINGS = '1';
  return { ...env, ...extra };
}

// Required DX Mule plugin floor. Three independent failure modes land on the
// same floor: (1) `dx mule jdk download` — used to auto-provision the
// source/target JDK (Steps 3b/13) — only exists in
// @salesforce/anypoint-cli-dx-mule-plugin >= 1.3.0; older plugins pass the
// `dx --help` presence check but fail at JDK-download time. (2)
// `describe-connector`'s session-token auth path only works correctly for
// some connectors >= 1.3.1 — below that it authenticates fine for most
// connectors but exits 0 with an empty/failed response for others, with no
// indication it's a version problem. (3) Plugins < 1.3.2 bundle Flow Design
// Service 1.1.800 (mule-api 1.12.2), which hits a swallowed NoSuchMethodError
// and exits 1 with no output against runtimes released from 2026-10-07 (e.g.
// 4.9.22). Step 7 describes on the target runtime when it is 4.9 or later, so
// that is where this bites. 1.3.2 bundles FDS 1.1.2300 (mule-api 1.13.1).
// 1.3.2 is a strict superset of 1.3.1 and 1.3.0, so one floor covers all three.
export const DX_PLUGIN_MIN_MAJOR = 1;
export const DX_PLUGIN_MIN_MINOR = 3;
export const DX_PLUGIN_MIN_PATCH = 2;
export const DX_PLUGIN_MIN_LABEL = `${DX_PLUGIN_MIN_MAJOR}.${DX_PLUGIN_MIN_MINOR}.${DX_PLUGIN_MIN_PATCH}`;
// Installs into the CLI's own plugin directory, which is where the CLI loads the
// plugin from. `npm install -g <plugin>` does not update that copy.
export const DX_PLUGIN_UPGRADE_CMD = 'anypoint-cli-v4 plugins:install @salesforce/anypoint-cli-dx-mule-plugin';

/** Parse "@salesforce/anypoint-cli-dx-mule-plugin 1.3.1" from `anypoint-cli-v4
 * plugins` (or `plugins --core`). @param {string} out @returns {{major:number,minor:number,patch:number,version:string}|null} */
export function parseDxPluginVersion(out) {
  const m = /@salesforce\/anypoint-cli-dx-mule-plugin\s+v?(\d+)\.(\d+)\.(\d+)/i.exec(out);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    version: `${m[1]}.${m[2]}.${m[3]}`,
  };
}

/** True when the parsed DX plugin version is >= the required floor (DX_PLUGIN_MIN_LABEL).
 * @param {{major:number,minor:number,patch:number}} v @returns {boolean} */
export function isDxPluginAtLeastMin(v) {
  if (v.major !== DX_PLUGIN_MIN_MAJOR) return v.major > DX_PLUGIN_MIN_MAJOR;
  if (v.minor !== DX_PLUGIN_MIN_MINOR) return v.minor > DX_PLUGIN_MIN_MINOR;
  return v.patch >= DX_PLUGIN_MIN_PATCH;
}

/** Run `anypoint-cli-v4 <args>` and return its combined output, or '' on failure. @param {string[]} args @returns {string} */
function pluginsOutput(args) {
  // shell on win32 only: anypoint-cli-v4 is a .cmd shim there, which spawnSync cannot find by bare name.
  const r = spawnSync('anypoint-cli-v4', args, { env: anypointEnv(), encoding: 'utf8', timeout: 10_000, shell: process.platform === 'win32' });
  return r.status === 0 ? `${r.stdout || ''}${r.stderr || ''}` : '';
}

/** Read the DX plugin version the CLI loads and report whether it meets
 * DX_PLUGIN_MIN_LABEL. Used both at Step 1 (pre-check) and reactively at
 * describe-connector's failure point (correlate, don't guess).
 * `plugins` lists only user-installed plugins. A fresh CLI install carries the
 * plugin as a core (bundled) plugin that `plugins` does not list, so fall back
 * to `plugins --core` (when a user copy exists, both commands show it, so the
 * order only saves a second CLI start-up). @param {(args:string[]) => string} [run] Output source; injectable for tests.
 * @returns {{parsed:{major:number,minor:number,patch:number,version:string}|null, inRange:boolean}} */
export function checkDxPluginVersion(run = pluginsOutput) {
  const parsed = parseDxPluginVersion(run(['plugins'])) ?? parseDxPluginVersion(run(['plugins', '--core']));
  if (!parsed) return { parsed: null, inRange: false };
  return { parsed, inRange: isDxPluginAtLeastMin(parsed) };
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
