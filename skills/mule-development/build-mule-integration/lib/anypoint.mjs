// anypoint.mjs — wrap anypoint-cli-v4 invocations and toolchain probes.
import { spawnSync } from 'node:child_process';

/** @param {Record<string,string>} [extra] Overrides merged last. @returns {Record<string,string>} A child env with ANYPOINT_ENV unset and NODE_NO_WARNINGS=1. */
export function anypointEnv(extra = {}) {
  const env = { ...process.env };
  delete env.ANYPOINT_ENV;
  env.NODE_NO_WARNINGS = '1';
  return { ...env, ...extra };
}

/** @param {string} cmd Executable name. @returns {boolean} True iff resolvable on PATH (uses `where` on Windows, `command -v` on POSIX). */
export function commandExists(cmd) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    const r = spawnSync('where', [cmd], { stdio: 'ignore' });
    return r.status === 0;
  }
  // `command -v` is a shell builtin, so invoke it through /bin/sh. The '_'
  // argv slot is $0 (a placeholder) so cmd arrives as $1 for the snippet.
  const r = spawnSync('/bin/sh', ['-c', `command -v "$1" >/dev/null 2>&1`, '_', cmd], { stdio: 'ignore' });
  return r.status === 0;
}

/** @param {string} cmd Executable. @param {string[]} args Argv. @param {{env?:Record<string,string>}} [opts] @returns {{status:number|null, signal:string|null, error:Error|undefined, stdout:string, stderr:string}} Synchronous spawn capture with anypointEnv() applied. */
export function runProbe(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    env: anypointEnv(opts.env),
    encoding: 'utf8',
    shell: false,
  });
  return {
    status: r.status,
    signal: r.signal,
    error: r.error,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}
