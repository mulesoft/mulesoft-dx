// fsx.mjs — file-system helpers (mkdirp, readJson, writeJson, isFile, isDir,
// listDir, readJsonOrNull, mktempFile, registerCleanup).
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, statSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

/** @param {string} dir Recursively-created directory. */
export function mkdirp(dir) {
  mkdirSync(dir, { recursive: true });
}

/** @param {string} p File path. @returns {any} Parsed JSON; throws on read/parse error. */
export function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** @param {string} p Output path. @param {any} value JSON-serializable value written 2-space indented with a trailing newline. */
export function writeJson(p, value) {
  const text = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(p, text);
}

/** @param {string} p Path. @returns {boolean} True iff path exists and is a regular file. */
export function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

/** @param {string} p Path. @returns {boolean} True iff path exists and is a directory. */
export function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/** @param {string} dir Directory path. @returns {import('node:fs').Dirent[]} Entries; empty array on error. */
export function listDir(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/** @param {string} p File path. @returns {any|null} Parsed JSON or null on any read/parse error. */
export function readJsonOrNull(p) {
  try { return readJson(p); } catch { return null; }
}

/**
 * @param {string} template Path containing literal "XXXXXX"; replaced with 6 random chars.
 * @returns {string} Path of a freshly-created empty file.
 */
export function mktempFile(template) {
  const dir = path.dirname(template);
  mkdirp(dir);
  const idx = template.lastIndexOf('XXXXXX');
  if (idx === -1) throw new Error(`mktempFile: template missing XXXXXX: ${template}`);
  for (let i = 0; i < 100; i += 1) {
    // CSPRNG-derived suffix (3 random bytes -> 6 lowercase hex chars), so the
    // generated name does not leak PRNG state to other processes on the host.
    const suffix = randomBytes(3).toString('hex');
    const candidate = template.slice(0, idx) + suffix + template.slice(idx + 6);
    if (!existsSync(candidate)) {
      writeFileSync(candidate, '', { flag: 'wx' });
      return candidate;
    }
  }
  throw new Error(`mktempFile: could not create unique file for ${template}`);
}

const _cleanupPaths = new Set();
let _cleanupRegistered = false;
/** @param {string} p Path to delete on process exit (also on SIGINT/SIGTERM). */
export function registerCleanup(p) {
  _cleanupPaths.add(p);
  if (_cleanupRegistered) return;
  _cleanupRegistered = true;
  const cleanup = () => {
    for (const f of _cleanupPaths) {
      try { unlinkSync(f); } catch { /* already gone */ }
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
}
