// xml-flow.mjs — flow-XML scanning primitives used by enumerate_usage.mjs.
//
// Pure, dependency-free helpers implementing grep-based classification —
// kebab→camel conversion, prefix-fallback rules, and attribute filters.
import { readFileSync, readdirSync } from 'node:fs';

/** @param {string} s @returns {string} Regex-escaped literal. */
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kebab-case → camelCase. `create-object` → `createObject`. Preserves the
 * first segment verbatim; capitalises the first letter of every subsequent
 * segment (empty segments preserved as empty strings).
 * @param {string} s
 * @returns {string}
 */
export function kebabToCamel(s) {
  if (!s || !s.includes('-')) return s;
  const parts = s.split('-');
  const head = parts[0];
  const tail = parts.slice(1).map((p) => (p.length === 0 ? '' : p[0].toUpperCase() + p.slice(1)));
  return head + tail.join('');
}

/**
 * @param {string} flowDir Path to `src/main/mule` (relative or absolute).
 * @returns {string[]} Sorted list of `*.xml` file paths. Uses string
 *   concatenation (not `path.join`) so the caller's `./` prefix is
 *   preserved verbatim in the emitted paths — the usage-site JSON schema
 *   depends on that leading `./`.
 */
export function listFlowFiles(flowDir) {
  let entries;
  try {
    entries = readdirSync(flowDir);
  } catch {
    return [];
  }
  const sep = flowDir.endsWith('/') ? '' : '/';
  return entries
    .filter((f) => f.endsWith('.xml'))
    .sort()
    .map((f) => `${flowDir}${sep}${f}`);
}

/** @param {string} p @returns {string} File contents; empty on any read error. */
export function readOrEmpty(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

/**
 * Scan every `xmlns:<name>="<uri>"` binding across the flow files. Returns
 * the sorted unique list of prefix names bound to the target namespace URI.
 * @param {string[]} files
 * @param {string} uri
 * @returns {string[]}
 */
export function scanFlowPrefixesForUri(files, uri) {
  if (!uri) return [];
  const bindingRe = /xmlns:([a-zA-Z][a-zA-Z0-9._-]*)="([^"]+)"/g;
  const seen = new Set();
  for (const f of files) {
    const text = readOrEmpty(f);
    const matches = text.matchAll(bindingRe);
    for (const m of matches) {
      if (m[2] === uri) seen.add(m[1]);
    }
  }
  return [...seen].sort();
}

/**
 * Count of `<prefix:` opening tags across all flow files. Mirrors
 * `grep -hoE "<prefix:[a-zA-Z]" | wc -l`.
 * @param {string[]} files
 * @param {string} prefix
 * @returns {number}
 */
export function countPrefixOpeners(files, prefix) {
  if (!prefix) return 0;
  const re = new RegExp(`<${escapeRegExp(prefix)}:[a-zA-Z]`, 'g');
  let total = 0;
  for (const f of files) {
    const text = readOrEmpty(f);
    const matches = text.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

/**
 * Grep every `<prefix:<name>` element opener across the files and return
 * the sorted-unique kebab→camel-normalised name list (skill DSL uses
 * kebab-case but SDK metadata uses camelCase — Drawback #1).
 * @param {string[]} files
 * @param {string} prefix
 * @returns {string[]}
 */
export function grepElementNames(files, prefix) {
  if (!prefix) return [];
  const re = new RegExp(`<${escapeRegExp(prefix)}:([a-zA-Z][a-zA-Z0-9_-]*)`, 'g');
  const seen = new Set();
  for (const f of files) {
    const text = readOrEmpty(f);
    const matches = text.matchAll(re);
    for (const m of matches) seen.add(m[1]);
  }
  return [...seen].sort().map(kebabToCamel);
}

/**
 * Extract error-type strings from `<on-error-{propagate,continue}>` blocks
 * that carry `type="PREFIX_UPPER:CODE"`, filtered by uppercased prefix.
 * @param {string[]} files
 * @param {string} prefixUpper
 * @returns {string[]}
 */
export function grepErrorTypesCaught(files, prefixUpper) {
  return _grepErrorTypes(
    files,
    /<on-error-(?:propagate|continue)[^>]*type="([A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*)"/g,
    prefixUpper,
  );
}

/**
 * Extract error-type strings raised via `<raise-error type="...">`, filtered
 * by uppercased prefix.
 * @param {string[]} files
 * @param {string} prefixUpper
 * @returns {string[]}
 */
export function grepErrorTypesRaised(files, prefixUpper) {
  return _grepErrorTypes(
    files,
    /<raise-error[^>]*type="([A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*)"/g,
    prefixUpper,
  );
}

function _grepErrorTypes(files, re, prefixUpper) {
  const seen = new Set();
  const filter = `${prefixUpper}:`;
  for (const f of files) {
    const text = readOrEmpty(f);
    const matches = text.matchAll(re);
    for (const m of matches) {
      if (m[1].startsWith(filter)) seen.add(m[1]);
    }
  }
  return [...seen].sort();
}

/**
 * Extract every child element inside `<prefix:*-config>...</prefix:*-config>`
 * blocks. Line-scan inside-block state machine; returns kebab→camel-normalised
 * child names.
 * @param {string[]} files
 * @param {string} prefix
 * @returns {string[]} Deduplicated in order of first occurrence.
 */
export function extractConfigProviderChildren(files, prefix) {
  const p = escapeRegExp(prefix);
  const openRe = new RegExp(`<${p}:[a-zA-Z0-9_-]*[Cc]onfig(\\s[^>]*)?>`);
  const closeRe = new RegExp(`</${p}:[a-zA-Z0-9_-]*[Cc]onfig>`);
  const childRe = new RegExp(`<${p}:([a-zA-Z][a-zA-Z0-9_-]*)`, 'g');

  const out = [];
  const seen = new Set();
  for (const f of files) {
    const text = readOrEmpty(f);
    const lines = text.split('\n');
    let inside = false;
    for (const line of lines) {
      if (!inside) {
        if (openRe.test(line)) inside = true;
        continue;
      }
      if (closeRe.test(line)) {
        inside = false;
        continue;
      }
      const matches = line.matchAll(childRe);
      for (const m of matches) {
        const camel = kebabToCamel(m[1]);
        if (!seen.has(camel)) {
          seen.add(camel);
          out.push(camel);
        }
      }
    }
  }
  return out;
}

/**
 * Extract per-op usage sites — one row per `<prefix:name>` opener in the
 * flow XMLs, with the opening tag's attributes_set map.
 *
 * Attribute filter:
 * - Retain `doc:name`-style values? NO — skip anything with `doc:`, `xmlns:`,
 *   or `xsi:` prefix, and the bare `xmlns` attribute (they carry no
 *   connector-behavior signal).
 *
 * @param {string[]} files
 * @param {string} prefix
 * @returns {Array<{op:string, op_dsl:string, file:string, line:number, attributes_set:Record<string,string>}>}
 */
export function extractUsageSites(files, prefix) {
  if (!prefix) return [];
  const p = escapeRegExp(prefix);
  const openerRe = new RegExp(`<${p}:[a-zA-Z][a-zA-Z0-9_-]*`, 'g');
  const attrRe = /((?:[a-zA-Z][a-zA-Z0-9_-]*:)?[a-zA-Z][a-zA-Z0-9_-]*)="([^"]*)"/g;
  const sites = [];

  for (const f of files) {
    const text = readOrEmpty(f);
    if (!text) continue;
    const lines = text.split('\n');
    for (let idx = 0; idx < lines.length; idx += 1) {
      const line = lines[idx];
      const openers = line.matchAll(openerRe);
      for (const opener of openers) {
        const opDsl = opener[0].slice(1 + prefix.length + 1); // drop `<prefix:`
        const opCamel = kebabToCamel(opDsl);

        // Build the full opening tag: start at target line, accumulate until '>'.
        let full = '';
        for (let j = idx; j < lines.length; j += 1) {
          full += lines[j] + (j + 1 < lines.length ? '\n' : '');
          if (lines[j].includes('>')) break;
        }
        const tagRe = new RegExp(
          `<${p}:${escapeRegExp(opDsl)}([^>]*?)(/?)>`,
        );
        const tagMatch = full.match(tagRe);
        const attrs = {};
        if (tagMatch) {
          const attrString = tagMatch[1];
          const attrMatches = attrString.matchAll(attrRe);
          for (const am of attrMatches) {
            const name = am[1];
            if (name === 'xmlns' || name.startsWith('doc:') || name.startsWith('xmlns:') || name.startsWith('xsi:')) continue;
            attrs[name] = am[2];
          }
        }
        sites.push({
          op: opCamel,
          op_dsl: opDsl,
          file: f,
          line: idx + 1,
          attributes_set: attrs,
        });
      }
    }
  }
  return sites;
}
