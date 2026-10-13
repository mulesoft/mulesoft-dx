// xml-flow-dom.mjs — parser-based flow-XML extraction (fast-xml-parser).
//
// Structural counterpart to the regex helpers in xml-flow.mjs. Produces the
// SAME record shape as the grep path, but classification/nesting come from a
// real parse tree instead of line-window heuristics — so config-ref binds to
// the element that actually carries it, config-provider children are scoped by
// true parentage, and commented-out elements are ignored.
//
// Requires `fast-xml-parser` to be importable (a `--no-save` install in the
// skill dir; see enumerate_usage_xml.mjs). Pure helpers (kebabToCamel, prefix
// detection, error-type grep) are reused from xml-flow.mjs — those are already
// attribute-exact and need no DOM.
import { XMLParser } from 'fast-xml-parser';
import { kebabToCamel, readOrEmpty } from './xml-flow.mjs';

// preserveOrder keeps document order (needed to re-derive line numbers);
// attributes land under `:@` with a leading `@` on each name.
//
// processEntities:false keeps attribute values in their on-disk form
// (`#[payload.amount &gt; 0]` stays `&gt;`, not decoded to `>`) so the emitted
// attributes_set is byte-identical to the grep script AND matches what the
// agent sees when it opens usage_sites[].file at .line — a decoded `>` would
// fail a naive match against the raw XML.
const PARSER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  preserveOrder: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
};

/**
 * Parse every flow file once. Returns [{file, text, nodes}] where `nodes` is
 * the fast-xml-parser preserveOrder tree. Files that fail to parse are skipped
 * with the error surfaced to stderr by the caller (nodes:null).
 * @param {string[]} files
 * @returns {Array<{file:string, text:string, nodes:any}>}
 */
export function parseFlowFiles(files) {
  const parser = new XMLParser(PARSER_OPTS);
  const out = [];
  for (const f of files) {
    const text = readOrEmpty(f);
    let nodes = null;
    if (text) {
      try { nodes = parser.parse(text); } catch { nodes = null; }
    }
    out.push({ file: f, text, nodes });
  }
  return out;
}

/**
 * Depth-first walk of a preserveOrder tree, in document order. Invokes
 * `visit(tag, attrs, children)` for every element node.
 * @param {any} nodes
 * @param {(tag:string, attrs:Record<string,string>, children:any)=>void} visit
 */
function walk(nodes, visit) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const attrs = node[':@'] || {};
    for (const tag of Object.keys(node)) {
      if (tag === ':@' || tag === '#text') continue;
      visit(tag, attrs, node[tag]);
      walk(node[tag], visit);
    }
  }
}

/** Strip the `@` attribute prefix and drop doc:/xmlns:/xsi: noise. */
function cleanAttrs(rawAttrs) {
  const out = {};
  for (const [k, v] of Object.entries(rawAttrs || {})) {
    const name = k.startsWith('@') ? k.slice(1) : k;
    if (name === 'xmlns' || name.startsWith('doc:') || name.startsWith('xmlns:') || name.startsWith('xsi:')) continue;
    out[name] = String(v);
  }
  return out;
}

/**
 * Every `<prefix:name>` element name across all files, kebab→camel, unique-sorted.
 * @param {Array<{nodes:any}>} parsed
 * @param {string} prefix
 * @returns {string[]}
 */
export function domElementNames(parsed, prefix) {
  if (!prefix) return [];
  const want = `${prefix}:`;
  const seen = new Set();
  for (const { nodes } of parsed) {
    walk(nodes, (tag) => {
      if (tag.startsWith(want)) seen.add(kebabToCamel(tag.slice(want.length)));
    });
  }
  return [...seen].sort();
}

/**
 * Child element names of every `<prefix:*config>` element, walked recursively
 * (true parentage — not a line window). kebab→camel, first-occurrence order.
 * @param {Array<{nodes:any}>} parsed
 * @param {string} prefix
 * @returns {string[]}
 */
export function domConfigProviderChildren(parsed, prefix) {
  if (!prefix) return [];
  const want = `${prefix}:`;
  const isConfigTag = (tag) => tag.startsWith(want) && /config$/i.test(tag);
  const out = [];
  const seen = new Set();
  const collect = (children) => {
    walk(children, (tag) => {
      if (tag.startsWith(want)) {
        const camel = kebabToCamel(tag.slice(want.length));
        if (!seen.has(camel)) { seen.add(camel); out.push(camel); }
      }
    });
  };
  for (const { nodes } of parsed) {
    walk(nodes, (tag, _attrs, children) => {
      if (isConfigTag(tag)) collect(children);
    });
  }
  return out;
}

/**
 * Per-op usage sites: one row per `<prefix:name>` element with its attributes.
 * Line numbers are re-derived from the raw text (fast-xml-parser has no line
 * info) by locating each opener in document order via an advancing cursor —
 * so a commented-out element is never emitted and lines stay accurate.
 * @param {Array<{file:string, text:string, nodes:any}>} parsed
 * @param {string} prefix
 * @returns {Array<{op:string, op_dsl:string, file:string, line:number, attributes_set:Record<string,string>}>}
 */
export function domUsageSites(parsed, prefix) {
  if (!prefix) return [];
  const want = `${prefix}:`;
  const sites = [];
  for (const { file, text, nodes } of parsed) {
    // Precompute newline offsets → line lookup for this file.
    const lineStarts = [0];
    for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') lineStarts.push(i + 1);
    const lineOf = (idx) => {
      // binary search: last lineStart <= idx
      let lo = 0; let hi = lineStarts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; }
      return lo + 1;
    };
    let cursor = 0;
    walk(nodes, (tag, attrs) => {
      if (!tag.startsWith(want)) return;
      const opDsl = tag.slice(want.length);
      const needle = `<${tag}`; // e.g. `<db:select`
      let at = text.indexOf(needle, cursor);
      if (at < 0) at = text.indexOf(needle); // defensive: don't lose the site
      const line = at >= 0 ? lineOf(at) : 0;
      if (at >= 0) cursor = at + needle.length;
      sites.push({
        op: kebabToCamel(opDsl),
        op_dsl: opDsl,
        file,
        line,
        attributes_set: cleanAttrs(attrs),
      });
    });
  }
  return sites;
}
