// properties.mjs — minimal Java .properties and flat YAML reader/writer.
//
// parseProperties(text) -> Map<key, value>
//     key=value / key: value / key value lines; '#' and '!' comments;
//     backslash line continuations.
// parseYamlKeys(text) -> Map<dotted.key, value>
//     Nested mapping keys flattened with '.', which is how Mule resolves
//     ${a.b} against config.yaml. Scalars only; sequences are ignored.
// appendProperties(text, entries, header) -> text
//     Appends `key=value` lines under a comment header.

/** @returns {Map<string,string>} */
export function parseProperties(text) {
  const out = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\s+/, '');
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].replace(/^\s+/, '');
    }
    const m = line.match(/^((?:\\.|[^=:\s\\])+)\s*[=:\s]\s*(.*)$/);
    if (m) out.set(m[1].replace(/\\(.)/g, '$1'), m[2]);
    else out.set(line.replace(/\\(.)/g, '$1'), '');
  }
  return out;
}

function unquote(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/** @returns {Map<string,string>} dotted keys of a nested YAML mapping. */
export function parseYamlKeys(text) {
  const out = new Map();
  const stack = []; // [{indent, key}]
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(raw) || /^\s*-/.test(raw) || raw.startsWith('---')) continue;
    const m = raw.match(/^(\s*)("[^"]+"|'[^']+'|[^:#]+?)\s*:(?:\s+(.*?))?\s*$/);
    if (!m) continue;
    const indent = m[1].length;
    const key = unquote(m[2]);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const path = [...stack.map((s) => s.key), key].join('.');
    const value = m[3] ? m[3].replace(/\s+#.*$/, '') : '';
    if (value === '' || value === '|' || value === '>') stack.push({ indent, key });
    else out.set(path, unquote(value));
  }
  return out;
}

/** Append key=value lines (keys/values escaped minimally) under a header comment. */
export function appendProperties(text, entries, header) {
  if (entries.length === 0) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = entries.map(([k, v]) => `${k.replace(/([=:\s])/g, '\\$1')}=${v}`).join(eol);
  const prefix = text === '' || text.endsWith('\n') ? text : text + eol;
  const spacer = prefix === '' ? '' : eol;
  return `${prefix}${spacer}# ${header}${eol}${body}${eol}`;
}
