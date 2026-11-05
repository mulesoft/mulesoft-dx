// mule-xml.mjs — dependency-free helpers for reading and editing Mule config XML
// as text, so edits preserve the user's formatting and comments.
//
// rootInfo(xml) -> {tag, start, end, openTagEnd, closeStart, namespaces, schemaLocations}
//     Locates the document root element (<mule> or <domain:mule-domain>).
// listGlobalElements(xml) -> [{tag, prefix, local, name, start, end, text}]
//     Every direct child element of the root, in document order.
// collectReferences(text) -> [{attr, value}]
//     Every attribute that names another global element (config-ref, tlsContext, ...).
// collectPlaceholders(text) -> string[]
//     Every ${key} used in the text (deduplicated, document order).
// usedPrefixes(text) -> string[]
//     Every element namespace prefix used in the text.
// addNamespaces(xml, [{prefix, uri, schemaLocation}]) -> xml
//     Adds missing xmlns:prefix declarations and xsi:schemaLocation pairs to the root.
// appendGlobalElements(xml, texts[]) -> xml
//     Inserts element texts just before the root's closing tag.
// removeRanges(xml, [{start, end}]) -> xml
//     Deletes the given ranges (plus the line they leave empty).

// Attributes that point at a global element by name. Mirrors the reference
// patterns manage-global-configurations scans for, plus generic *-ref / *Ref
// attributes used by connectors (e.g. sharedConnectionFactory-ref).
const REFERENCE_ATTRS = new Set([
  'config-ref', 'tlsContext', 'listenerConfig', 'objectStore', 'cachingStrategy-ref',
  'defaultErrorHandler-ref', 'errorHandler-ref', 'requestConfig', 'connectionFactory',
  'transactionManager-ref',
]);
const NON_REFERENCE_ATTRS = new Set(['flow-ref', 'flowRef', 'name', 'doc:name', 'doc:id']);

function isReferenceAttr(attr) {
  if (NON_REFERENCE_ATTRS.has(attr)) return false;
  if (REFERENCE_ATTRS.has(attr)) return true;
  return /(-ref|Ref)$/.test(attr) && !attr.includes(':');
}

/**
 * Tokenize the XML into element tags. Comments, CDATA, processing
 * instructions and DOCTYPE are skipped; attribute values may contain '>'.
 * @returns {Array<{kind:'open'|'close'|'empty', tag:string, start:number, end:number, attrs:string}>}
 */
export function tokenize(xml) {
  const tokens = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;
    if (xml.startsWith('<!--', lt)) {
      const e = xml.indexOf('-->', lt + 4);
      i = e === -1 ? xml.length : e + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const e = xml.indexOf(']]>', lt + 9);
      i = e === -1 ? xml.length : e + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const e = xml.indexOf('?>', lt + 2);
      i = e === -1 ? xml.length : e + 2;
      continue;
    }
    if (xml.startsWith('<!', lt)) {
      const e = xml.indexOf('>', lt + 2);
      i = e === -1 ? xml.length : e + 1;
      continue;
    }
    // Element tag: scan to the closing '>' outside quotes.
    let j = lt + 1;
    let quote = null;
    while (j < xml.length) {
      const c = xml[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    const raw = xml.slice(lt, j + 1);
    const end = j + 1;
    if (raw.startsWith('</')) {
      tokens.push({ kind: 'close', tag: raw.slice(2, -1).trim(), start: lt, end, attrs: '' });
    } else {
      const selfClosing = raw.endsWith('/>');
      const inner = raw.slice(1, selfClosing ? -2 : -1);
      const m = /^([^\s/>]+)/.exec(inner);
      const tag = m ? m[1] : '';
      tokens.push({ kind: selfClosing ? 'empty' : 'open', tag, start: lt, end, attrs: inner.slice(tag.length) });
    }
    i = end;
  }
  return tokens;
}

/** @returns {Array<{name:string, value:string}>} attributes of a tag's attribute string. */
export function parseAttributes(attrs) {
  const out = [];
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrs)) !== null) {
    out.push({ name: m[1], value: m[3] ?? m[4] ?? '' });
  }
  return out;
}

function attr(attrs, name) {
  const found = parseAttributes(attrs).find((a) => a.name === name);
  return found ? found.value : undefined;
}

/** Locate the root element and its namespace declarations. */
export function rootInfo(xml) {
  const tokens = tokenize(xml);
  const open = tokens.find((t) => t.kind === 'open' || t.kind === 'empty');
  if (!open) throw new Error('no root element found');
  let closeStart = xml.length;
  if (open.kind === 'open') {
    for (let k = tokens.length - 1; k >= 0; k--) {
      if (tokens[k].kind === 'close' && tokens[k].tag === open.tag) {
        closeStart = tokens[k].start;
        break;
      }
    }
  }
  const namespaces = {};
  for (const a of parseAttributes(open.attrs)) {
    if (a.name === 'xmlns') namespaces[''] = a.value;
    else if (a.name.startsWith('xmlns:')) namespaces[a.name.slice(6)] = a.value;
  }
  const schemaLocations = {};
  const loc = attr(open.attrs, 'xsi:schemaLocation') ?? '';
  const parts = loc.trim().split(/\s+/).filter(Boolean);
  for (let k = 0; k + 1 < parts.length; k += 2) schemaLocations[parts[k]] = parts[k + 1];
  return { tag: open.tag, start: open.start, openTagEnd: open.end, closeStart, namespaces, schemaLocations };
}

/** True when the root element is a Mule domain (`<domain:mule-domain>` or any `*:mule-domain`). */
export function isDomainConfig(xml) {
  try {
    const { tag } = rootInfo(xml);
    return tag === 'mule-domain' || tag.endsWith(':mule-domain');
  } catch {
    return false;
  }
}

/** Every direct child element of the root, with its full source text. */
export function listGlobalElements(xml) {
  const tokens = tokenize(xml);
  const elements = [];
  let depth = 0;
  let current = null;
  for (const t of tokens) {
    if (t.kind === 'open') {
      if (depth === 1) current = { token: t };
      depth++;
    } else if (t.kind === 'close') {
      depth--;
      if (depth === 1 && current) {
        elements.push(toElement(xml, current.token, t.end));
        current = null;
      }
    } else if (t.kind === 'empty' && depth === 1) {
      elements.push(toElement(xml, t, t.end));
    }
  }
  return elements;
}

function toElement(xml, token, end) {
  const [prefix, local] = token.tag.includes(':') ? token.tag.split(':', 2) : ['', token.tag];
  return {
    tag: token.tag,
    prefix,
    local,
    name: attr(token.attrs, 'name') ?? null,
    start: token.start,
    end,
    text: xml.slice(token.start, end),
  };
}

/** Attributes inside `text` whose value names another global element. */
export function collectReferences(text) {
  const refs = [];
  for (const t of tokenize(text)) {
    if (t.kind === 'close') continue;
    for (const a of parseAttributes(t.attrs)) {
      if (isReferenceAttr(a.name) && a.value && !a.value.includes('${') && !a.value.includes('#[')) {
        refs.push({ attr: a.name, value: a.value, element: t.tag });
      }
    }
  }
  return refs;
}

/** Every ${key} placeholder in `text`, deduplicated in order of appearance. */
export function collectPlaceholders(text) {
  const keys = [];
  const re = /\$\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!keys.includes(m[1])) keys.push(m[1]);
  }
  return keys;
}

/** Every namespace prefix used by an element in `text` (excluding the default namespace). */
export function usedPrefixes(text) {
  const prefixes = new Set();
  for (const t of tokenize(text)) {
    if (t.kind !== 'close' && t.tag.includes(':')) prefixes.add(t.tag.split(':')[0]);
    if (t.kind === 'close') continue;
    for (const a of parseAttributes(t.attrs)) {
      const p = a.name.includes(':') ? a.name.split(':')[0] : '';
      if (p && p !== 'xmlns' && p !== 'xsi') prefixes.add(p);
    }
  }
  return [...prefixes];
}

function detectEol(text) {
  const i = text.indexOf('\n');
  return i > 0 && text[i - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * Add any missing `xmlns:prefix` declarations and schemaLocation pairs to the root.
 * @param {Array<{prefix:string, uri:string, schemaLocation?:string}>} namespaces
 */
export function addNamespaces(xml, namespaces) {
  const info = rootInfo(xml);
  const eol = detectEol(xml);
  let openTag = xml.slice(info.start, info.openTagEnd);
  const missingDecls = namespaces.filter((n) => n.prefix && !(n.prefix in info.namespaces));
  const missingLocs = namespaces.filter((n) => n.schemaLocation && !(n.uri in info.schemaLocations));
  if (missingDecls.length === 0 && missingLocs.length === 0) return xml;

  if (missingLocs.length > 0) {
    const pairs = missingLocs.map((n) => `${n.uri} ${n.schemaLocation}`);
    const m = /(xsi:schemaLocation\s*=\s*)(["'])([\s\S]*?)\2/.exec(openTag);
    if (m) {
      const value = m[3].replace(/\s+$/, '');
      const replacement = `${m[1]}${m[2]}${value}${pairs.map((p) => `${eol}        ${p}`).join('')}${m[2]}`;
      openTag = openTag.slice(0, m.index) + replacement + openTag.slice(m.index + m[0].length);
    } else {
      openTag = openTag.replace(/(\/?>)$/, ` xsi:schemaLocation="${pairs.join(' ')}"$1`);
    }
  }
  if (missingDecls.length > 0) {
    const decls = missingDecls.map((n) => `xmlns:${n.prefix}="${n.uri}"`).join(`${eol}      `);
    // Insert right after the root tag name so declarations stay grouped.
    const nameEnd = 1 + info.tag.length;
    openTag = `${openTag.slice(0, nameEnd)} ${decls}${openTag.slice(nameEnd)}`;
  }
  return xml.slice(0, info.start) + openTag + xml.slice(info.openTagEnd);
}

/** Insert global element texts immediately before the root's closing tag. */
export function appendGlobalElements(xml, texts) {
  if (texts.length === 0) return xml;
  const info = rootInfo(xml);
  const eol = detectEol(xml);
  const before = xml.slice(0, info.closeStart).replace(/\s*$/, '');
  const block = texts.map((t) => `    ${t.replace(/\r?\n/g, eol)}`).join(eol + eol);
  return `${before}${eol}${eol}${block}${eol}${eol}${xml.slice(info.closeStart)}`;
}

/** Delete the given [start,end) ranges, dropping lines they leave blank. */
export function removeRanges(xml, ranges) {
  let out = xml;
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) {
    let s = r.start;
    let e = r.end;
    while (s > 0 && (out[s - 1] === ' ' || out[s - 1] === '\t')) s--;
    if (out[e] === '\r') e++;
    if (out[e] === '\n') e++;
    out = out.slice(0, s) + out.slice(e);
  }
  return out;
}
