#!/usr/bin/env node
// validate_before_build — pre-mvn static validator. Three checks run in order;
// the first failure exits 1:
//
//   [D]      Error-type allowlist. Every NS:ID used in
//            <on-error-propagate type="...">, <on-error-continue type="...">,
//            or <raise-error type="..."> in src/main/mule/*.xml must appear in
//            the union of tmp/connector-errors/*.json .errorTypes[] (or be
//            locally declared via <error:error-type name="..."/>). Custom
//            namespaces (APP:*, CUSTOM:*) are always valid in both throw and
//            catch positions; connector namespaces can be caught but not thrown
//            via <raise-error>. Falls back to a hardcoded MULE:* set when no
//            error JSON is present, and suggests the nearest member on a miss.
//   [A]      Namespace ↔ dependency parity. Every xmlns:X declared (excluding
//            doc, xsi, mule, ee) must have a matching <dependency> in pom.xml
//            whose <artifactId> contains the prefix as a token.
//   [A-XSD]  Canonical XSD URL shape. xsi:schemaLocation pairs must use
//            mule-<prefix>.xsd (with exceptions for mule.xsd → core and
//            mule-ee.xsd → ee/core).
//
// Usage:
//   node scripts/validate_before_build.mjs [<project-dir>]
//
// Exit codes:
//   0  all three checks pass; safe to invoke `mvn clean package`
//   1  first violation reported on stderr (fix and re-run)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';
import { isDir } from '../lib/fsx.mjs';
import { suggestForMiss } from '../lib/nearest.mjs';

// Default the project directory to `.` when the argument is unset or empty.
const PROJECT_DIR = argv[2] || '.';
// String concat (not path.join) so a leading `./` is preserved in the paths.
const POM_FILE = `${PROJECT_DIR}/pom.xml`;
const FLOW_DIR = `${PROJECT_DIR}/src/main/mule`;
// Connector-error JSONs are written under tmp/ relative to the workspace root
// (the agent's CWD), which is the same CWD this validator runs from — so the
// error files written by the other scripts are found here.
const ERR_DIR = 'tmp/connector-errors';

// --- Sanity: flow directory + flow files -------------------------------------
if (!isDir(FLOW_DIR)) {
    stderr.write(`❌ no flow directory at ${FLOW_DIR}\n`);
    exit(1);
}

// Collect *.xml flow files in lexical order (filenames are ASCII, so the
// default sort is stable and locale-independent).
let flowEntries;
try {
    flowEntries = readdirSync(FLOW_DIR);
} catch (err) {
    stderr.write(`❌ no flow directory at ${FLOW_DIR}\n`);
    exit(1);
}
const FLOW_FILES = flowEntries
    .filter((n) => n.endsWith('.xml'))
    .sort()
    .map((n) => `${FLOW_DIR}/${n}`);
if (FLOW_FILES.length === 0) {
    stderr.write(`✅ no flow XML in ${FLOW_DIR} — nothing to validate\n`);
    exit(0);
}

// Read each flow file once, preserving the lexical file order for all checks.
const flowSources = FLOW_FILES.map((path) => {
    let text = '';
    try { text = readFileSync(path, 'utf8'); } catch { text = ''; }
    return { path, text, lines: text.split('\n') };
});

// ---------------------------------------------------------------------------
// Build error-type allowlist
// ---------------------------------------------------------------------------
// Two source-tagged arrays, then a union for catch-position checks:
//   locallyDeclared[]      — valid in BOTH catch and raise positions
//   connectorJsonTypes[]   — valid in CATCH positions ONLY
//   allowlist[]            — union; used for catch checks + nearest-match seeding

const locallyDeclared = [
    'MULE:ANY', 'MULE:CONNECTIVITY', 'MULE:RETRY_EXHAUSTED', 'MULE:EXPRESSION',
    'MULE:TRANSFORMATION', 'MULE:SECURITY', 'MULE:NOT_PERMITTED',
    'MULE:COMPOSITE_ROUTING', 'MULE:TIMEOUT',
];

// Capture each <error:error-type ... name="NS:ID"> declaration in the flows;
// multiple declarations on one line each surface.
const ERR_TYPE_DECL_RE = /<error:error-type[^/]*name="([A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*)"/g;
{
    const seen = new Set();
    for (const { text } of flowSources) {
        let m;
        while ((m = ERR_TYPE_DECL_RE.exec(text)) !== null) {
            seen.add(m[1]);
        }
    }
    const sorted = [...seen].sort();
    for (const e of sorted) locallyDeclared.push(e);
}

// Accumulate .errorTypes[] from tmp/connector-errors/*.json in lexical order.
// A malformed file stops accumulation: types from earlier files are kept,
// later files are skipped.
let connectorJsonTypes = [];
{
    if (isDir(ERR_DIR)) {
        const errFiles = readdirSync(ERR_DIR)
            .filter((n) => n.endsWith('.json'))
            .sort()
            .map((n) => `${ERR_DIR}/${n}`);
        const seen = new Set();
        for (const f of errFiles) {
            let parsed;
            try { parsed = JSON.parse(readFileSync(f, 'utf8')); } catch { break; }
            const types = parsed && Array.isArray(parsed.errorTypes) ? parsed.errorTypes : [];
            for (const t of types) {
                if (typeof t === 'string' && t.length > 0) seen.add(t);
            }
        }
        connectorJsonTypes = [...seen].sort();
    }
}

const allowlist = [...locallyDeclared, ...connectorJsonTypes];

// Build connector-namespace set:
//   1) non-MULE namespaces from allowlist (authoritative via connector errors)
//   2) uppercased xmlns: prefixes from flow XMLs (fallback when error JSONs
//      missing; excludes doc/xsi/mule/ee framework prefixes)
const connectorNs = [];
const connectorNsSeen = new Set();
function addConnectorNs(cns) {
    if (!connectorNsSeen.has(cns)) {
        connectorNsSeen.add(cns);
        connectorNs.push(cns);
    }
}
for (const w of allowlist) {
    const cns = w.split(':', 1)[0];
    if (cns === 'MULE') continue;
    addConnectorNs(cns);
}
const XMLNS_PREFIX_RE = /xmlns:([a-zA-Z][a-zA-Z0-9_-]*)=/g;
{
    const seen = new Set();
    for (const { text } of flowSources) {
        let m;
        while ((m = XMLNS_PREFIX_RE.exec(text)) !== null) {
            seen.add(m[1]);
        }
    }
    const sorted = [...seen].sort();
    for (const prefix of sorted) {
        if (prefix === 'doc' || prefix === 'xsi' || prefix === 'mule' || prefix === 'ee') continue;
        addConnectorNs(prefix.toUpperCase());
    }
}

// ---------------------------------------------------------------------------
// Check D: error-type allowlist
// ---------------------------------------------------------------------------
//
// PRECEDENCE RULE:
//   (a) Is the type LOCALLY DECLARED (hard-coded MULE:* OR a flow
//       <error:error-type name="..."/> declaration)? → ACCEPT (catch + raise).
//       For catch positions only, also accept any <raise-error type="..."/>
//       target the app already declares (app_raised_types[]).
//   (b) Is it a connector namespace AND the type is in that connector's
//       whitelist? → ACCEPT (catch position only).
//   (c) <raise-error> with a connector namespace → REJECT.
//   (d) Unknown namespace / unknown ID → REJECT, suggest nearest.

// Collect all error types declared via <raise-error type="NS:ID"> across the
// app. These are "app-registered" types valid in on-error-propagate/continue.
const RAISE_TYPE_RE = /<raise-error[^>]*type="([A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*)"/g;
const appRaisedTypes = (() => {
    const seen = new Set();
    for (const { text } of flowSources) {
        let m;
        while ((m = RAISE_TYPE_RE.exec(text)) !== null) seen.add(m[1]);
    }
    return [...seen].sort();
})();

// All D violations are collected into a single ordered list, then the FIRST
// (lowest iteration index, i.e. earliest source-file occurrence) is emitted.
const dViolations = []; // { kind, file, lineno, nsid, nsPool[] }

// Match a line bearing a type="NS:ID" attribute. The leading `^.*` is greedy,
// so when a line carries multiple type="..." attributes the LAST one is
// captured; a null result also serves as the line-presence guard.
const TYPE_LAST_RE = /^.*type="([A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*)"/;

const locallyDeclaredSet = new Set(locallyDeclared);
const appRaisedSet = new Set(appRaisedTypes);
const allowlistSet = new Set(allowlist);
const connectorNsSet = new Set(connectorNs);

// Pre-bucket the allowlist by namespace prefix so the ns-pool lookup at (d)
// below is O(1) per violation.
const allowlistByNs = new Map();
for (const w of allowlist) {
    const colon = w.indexOf(':');
    const wns = colon === -1 ? w : w.slice(0, colon);
    let bucket = allowlistByNs.get(wns);
    if (!bucket) { bucket = []; allowlistByNs.set(wns, bucket); }
    bucket.push(w);
}

for (const { path, lines } of flowSources) {
    for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        // Captures the LAST type="..." on the line; a null result means the
        // line carries no error type and is skipped.
        const lastMatch = TYPE_LAST_RE.exec(line);
        if (!lastMatch) continue;
        const lineno = idx + 1;
        const nsid = lastMatch[1];
        const colonIdx = nsid.indexOf(':');
        const ns = colonIdx === -1 ? nsid : nsid.slice(0, colonIdx);
        const isRaise = line.includes('<raise-error');

        // (a) Locally registered — both positions accepted via locally_declared,
        // catch-only also via app-raised types.
        let locallyRegistered = locallyDeclaredSet.has(nsid);
        if (!locallyRegistered && !isRaise) {
            locallyRegistered = appRaisedSet.has(nsid);
        }
        if (locallyRegistered) continue;

        // (b)+(c) Connector-namespace classification.
        if (isRaise) {
            if (connectorNsSet.has(ns)) {
                dViolations.push({ kind: 'connector-raise', file: path, lineno, nsid, nsPool: [] });
                continue;
            }
            // <raise-error> with non-connector namespace other than MULE — valid
            // (registers the type). MULE:* falls through to the allowlist check.
            if (ns !== 'MULE') continue;
        }

        // (d) Final allowlist check + nearest-match suggestion for unknown IDs.
        if (allowlistSet.has(nsid)) continue;
        const nsPool = allowlistByNs.get(ns) ?? [];
        if (nsPool.length === 0) {
            dViolations.push({
                kind: isRaise ? 'invented-mule' : 'invented-ns',
                file: path,
                lineno,
                nsid,
                nsPool: [],
            });
        } else {
            dViolations.push({ kind: 'miss', file: path, lineno, nsid, nsPool });
        }
    }
}

if (dViolations.length > 0) {
    // Resolve nearest-match suggestions for all "miss" violations up front.
    const suggestionByKey = new Map();
    for (const v of dViolations) {
        if (v.kind === 'miss' && !suggestionByKey.has(v.nsid)) {
            suggestionByKey.set(v.nsid, suggestForMiss(v.nsid, allowlist));
        }
    }

    // Emit ONLY the first violation. Fix and re-run.
    const v = dViolations[0];
    const ns = v.nsid.split(':', 1)[0];
    const muleList = (allowlistByNs.get('MULE') ?? []).join(',');

    let msg = '';
    if (v.kind === 'connector-raise') {
        msg = `[D] ${v.file}:${v.lineno} — <raise-error> cannot throw connector error type '${v.nsid}' (the '${ns}' namespace belongs to the connector). Use a MULE:* or custom (e.g. APP:*) error instead. Allowed MULE errors: [${muleList}]`;
    } else if (v.kind === 'invented-mule') {
        msg = `[D] ${v.file}:${v.lineno} — invented MULE error type '${v.nsid}'. Allowed MULE errors: [${muleList}]`;
    } else if (v.kind === 'invented-ns') {
        msg = `[D] ${v.file}:${v.lineno} — error type '${v.nsid}' uses namespace '${ns}' but no '${ns}:*' entries exist in tmp/connector-errors/ and no <raise-error type="${v.nsid}"> was found in the app. Either add a matching <raise-error>, run describe_connector.sh for the '${ns}' connector, or use a known error type.`;
    } else if (v.kind === 'miss') {
        const nsList = v.nsPool.join(',');
        const suggestion = suggestionByKey.get(v.nsid) ?? '';
        msg = `[D] ${v.file}:${v.lineno} — invented error type '${v.nsid}'. Did you mean '${suggestion}'? Whitelist for ${ns}: [${nsList}]`;
    }
    stderr.write(msg + '\n');
    exit(1);
}

// ---------------------------------------------------------------------------
// Check A: xmlns ↔ dependency parity
// ---------------------------------------------------------------------------
if (!existsSync(POM_FILE)) {
    stderr.write(`[A] ${POM_FILE} — missing pom.xml; cannot verify namespace parity\n`);
    exit(1);
}
let pomText = '';
try { pomText = readFileSync(POM_FILE, 'utf8'); } catch { pomText = ''; }
// Collect every <artifactId>…</artifactId> value declared in the pom.
const artifactIds = [];
{
    const re = /<artifactId>([^<]+)<\/artifactId>/g;
    let m;
    while ((m = re.exec(pomText)) !== null) artifactIds.push(m[1]);
}

// Match a line bearing an xmlns:prefix= declaration. The leading `^.*` is
// greedy, so when a line carries multiple declarations the LAST prefix is
// captured.
const XMLNS_LAST_RE = /^.*xmlns:([a-zA-Z][a-zA-Z0-9_-]*)=/;

// Tokenize every artifactId once into a Set, splitting on non-alphanumeric
// boundaries, so each xmlns-prefix parity check is an O(1) token lookup.
const artifactIdTokens = new Set();
for (const aid of artifactIds) {
    for (const tok of aid.split(/[^a-zA-Z0-9]+/)) {
        if (tok.length > 0) artifactIdTokens.add(tok);
    }
}

for (const { path, lines } of flowSources) {
    for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        const m = XMLNS_LAST_RE.exec(line);
        if (!m) continue;
        const prefix = m[1];
        if (prefix === 'doc' || prefix === 'xsi' || prefix === 'mule' || prefix === 'ee') continue;
        if (artifactIdTokens.has(prefix)) continue;
        const lineno = idx + 1;
        stderr.write(`[A] ${path}:${lineno} — orphan xmlns:${prefix} — no matching <dependency> in pom.xml. Either remove the namespace declaration or run get_latest_connector.sh + pick_connector.sh + commit_connectors.sh.\n`);
        exit(1);
    }
}

// ---------------------------------------------------------------------------
// Check A-XSD: canonical XSD URL shape
// ---------------------------------------------------------------------------
//
// For each schemaLocation block, the URI/XSD pairs are extracted (see
// collectSchemaLocationBlocks) and each XSD tail is checked against the
// canonical mule-<prefix>.xsd shape derived from its URI.
for (const { path, lines } of flowSources) {
    const blocks = collectSchemaLocationBlocks(lines);
    for (const { lineno, body } of blocks) {
        const tokens = body.split(/\s+/).filter((s) => s.length > 0);
        for (let i = 0; i + 1 < tokens.length; i += 2) {
            const uri = tokens[i];
            const xsd = tokens[i + 1];
            let expectedTail = null;
            if (uri.endsWith('/schema/mule/core')) {
                expectedTail = 'mule.xsd';
            } else if (uri.endsWith('/schema/mule/ee/core')) {
                expectedTail = 'mule-ee.xsd';
            } else {
                const marker = '/schema/mule/';
                const idx = uri.lastIndexOf(marker);
                if (idx !== -1) {
                    const suffix = uri.slice(idx + marker.length);
                    if (suffix.length > 0) expectedTail = `mule-${suffix}.xsd`;
                }
            }
            if (expectedTail === null) continue;
            const slashIdx = xsd.lastIndexOf('/');
            const actualTail = slashIdx === -1 ? xsd : xsd.slice(slashIdx + 1);
            if (actualTail !== expectedTail) {
                const expectedUrl = (slashIdx === -1)
                    ? `/${expectedTail}`
                    : `${xsd.slice(0, slashIdx)}/${expectedTail}`;
                stderr.write(`[A-XSD] ${path}:${lineno} — non-canonical XSD URL '${xsd}'. Expected '${expectedUrl}'.\n`);
                exit(1);
            }
        }
    }
}

stdout.write(`✅ validate_before_build: all checks passed for ${PROJECT_DIR}\n`);
exit(0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Collect every xsi:schemaLocation block. Returns [{ lineno, body }] where
// lineno is the 1-based line that opened the block and body is the content
// between `xsi:schemaLocation="` and the next closing quote, with intermediate
// lines joined by single spaces. Handles both single-line and multi-line
// schemaLocation attributes.
function collectSchemaLocationBlocks(lines) {
    const out = [];
    let startLine = 0; // 1-based; 0 means "not in a block"
    let buffer = '';   // joined content of intermediate lines (with leading space)
    let head = '';     // text after `xsi:schemaLocation="` on the start line
    for (let i = 0; i < lines.length; i += 1) {
        const lineno = i + 1;
        let line = lines[i];
        if (line.includes('xsi:schemaLocation="')) {
            startLine = lineno;
            buffer = '';
            const idx = line.indexOf('xsi:schemaLocation="') + 'xsi:schemaLocation="'.length;
            head = line.slice(idx);
            // Single-line case: the opening line also carries the closing quote.
            if (head.includes('"')) {
                const closeIdx = head.indexOf('"');
                const trailing = head.slice(0, closeIdx);
                out.push({ lineno: startLine, body: ` ${trailing}` });
                startLine = 0;
                buffer = '';
                head = '';
                continue;
            }
            // Multi-line case: seed the buffer with the opening line's tail;
            // subsequent lines are appended until the closing quote is found.
            buffer = ` ${head}`;
            head = '';
            continue;
        }
        if (startLine !== 0) {
            // Closing line: take the text up to the first quote and finish the block.
            if (line.includes('"')) {
                const closeIdx = line.indexOf('"');
                const trailing = line.slice(0, closeIdx);
                out.push({ lineno: startLine, body: `${buffer} ${trailing}` });
                startLine = 0;
                buffer = '';
                continue;
            }
            // Intermediate line: keep accumulating.
            buffer = `${buffer} ${line}`;
        }
    }
    return out;
}
