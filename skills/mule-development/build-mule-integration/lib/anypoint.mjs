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

// cmd.exe metacharacters that would let an argument break out of the command
// line when a .cmd shim is run through `shell: true` (Windows only).
const WIN_SHELL_UNSAFE = /[&|<>^%"'\r\n]/;

/** @param {string[]} args Argv. @returns {string[]} Args safe to hand to a `shell: true` spawn: unchanged off Windows; on Windows each arg is rejected (throws) if it contains a cmd.exe metacharacter, otherwise double-quoted so spaces stay inside one argument. */
export function shellSafeArgs(args) {
  if (process.platform !== 'win32') return args;
  return args.map((a) => {
    const s = String(a);
    if (WIN_SHELL_UNSAFE.test(s)) {
      throw new Error(`argument contains shell metacharacters and was rejected: ${JSON.stringify(s)}`);
    }
    return /\s/.test(s) || s === '' ? `"${s}"` : s;
  });
}

/** @param {string} cmd Executable. @param {string[]} args Argv. @param {{env?:Record<string,string>}} [opts] @returns {{status:number|null, signal:string|null, error:Error|undefined, stdout:string, stderr:string}} Synchronous spawn capture with anypointEnv() applied. shell is scoped to win32 — anypoint-cli-v4 resolves to a .cmd shim there, and spawnSync can't find it by bare name without a shell to apply PATHEXT resolution. Unconditional shell:true with an args array would trip Node's DEP0190 (unescaped args) and is unnecessary on POSIX, where direct exec already works. */
export function runProbe(cmd, args, opts = {}) {
  let safeArgs;
  try {
    safeArgs = shellSafeArgs(args);
  } catch (error) {
    return { status: null, signal: null, error, stdout: '', stderr: '' };
  }
  const r = spawnSync(cmd, safeArgs, {
    env: anypointEnv(opts.env),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    status: r.status,
    signal: r.signal,
    error: r.error,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}
