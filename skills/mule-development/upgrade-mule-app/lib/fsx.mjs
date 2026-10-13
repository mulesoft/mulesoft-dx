// fsx.mjs — file-system helpers (mkdirp, readJson, writeJson, isFile, isDir,
// readJsonOrNull).
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';

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

/** @param {string} p File path. @returns {any|null} Parsed JSON or null on any read/parse error. */
export function readJsonOrNull(p) {
  try { return readJson(p); } catch { return null; }
}
