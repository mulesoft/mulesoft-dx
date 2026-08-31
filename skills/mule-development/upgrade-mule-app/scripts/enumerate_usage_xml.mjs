#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Parser-based twin of enumerate_usage.mjs. Emits the IDENTICAL usage-record
// shape, but element names / config-provider children / usage sites come from
// a real fast-xml-parser parse tree (lib/xml-flow-dom.mjs) instead of regex —
// so config-ref binds to the element that carries it, provider children are
// scoped by true parentage, and commented-out elements are ignored.
//
// The skill is STATELESS, so the workflow installs fast-xml-parser with
// `npm install --no-save fast-xml-parser` into the skill dir, runs this, then
// removes node_modules. If the import fails (offline, npm blocked), FALL BACK
// to the zero-dep grep script enumerate_usage.mjs — the two are interchangeable.
//
// Usage:
//   node scripts/enumerate_usage_xml.mjs <nickname> [<project-dir>]
//
// Exit codes:
//   0  usage file written (may be `not_in_use` mode; digest on stdout)
//   1  bad args / missing metadata / missing flow dir / malformed metadata
//   3  fast-xml-parser not importable — caller should retry with the grep script
import { argv, exit, env, stderr, stdout } from 'node:process';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { mkdirp, writeJson, readJsonOrNull, isDir } from '../lib/fsx.mjs';
import {
  listFlowFiles,
  scanFlowPrefixesForUri,
  countPrefixOpeners,
  grepErrorTypesCaught,
  grepErrorTypesRaised,
} from '../lib/xml-flow.mjs';

// -- parser-lib import (soft) ----------------------------------------------
// Dynamic import so a missing fast-xml-parser exits cleanly with rc=3 (signal
// the caller to fall back to grep) rather than crashing with a stack trace.
let dom;
try {
  dom = await import('../lib/xml-flow-dom.mjs');
} catch (e) {
  stderr.write(`ℹ️  fast-xml-parser not available (${e.code || e.message}); fall back to enumerate_usage.mjs (grep)\n`);
  exit(3);
}

// -- args -------------------------------------------------------------------

function usage() {
  stderr.write(`Usage: ${argv[1] || 'enumerate_usage_xml.mjs'} <nickname> [<project-dir>]\n`);
  stderr.write(`  e.g. ${argv[1] || 'enumerate_usage_xml.mjs'} file .\n`);
}

let NICKNAME = argv[2] || '';
const PROJECT_DIR = argv[3] || '.';
if (!NICKNAME) { usage(); exit(1); }

const METADATA_DIR = env.CONNECTOR_METADATA_DIR || 'tmp/connector-metadata';
const OUT_DIR = env.CONNECTOR_USAGE_DIR || 'tmp/connector-usage';

let newMetaPath = path.join(METADATA_DIR, `${NICKNAME}-new.json`);
let newMeta = readJsonOrNull(newMetaPath);

// Nickname-mismatch fallback: caller may pass the XSD prefix while
// describe_connector persisted under the artifact slug. Match on
// .namespace.prefix — the ground truth for the prefix.
if (!newMeta) {
  let match = null;
  let entries = [];
  try { entries = readdirSync(METADATA_DIR); } catch { entries = []; }
  for (const base of entries.sort()) {
    if (!base.endsWith('-new.json')) continue;
    if (base.includes('-new-')) continue;
    const stem = base.slice(0, -'-new.json'.length);
    const candPath = path.join(METADATA_DIR, base);
    const cand = readJsonOrNull(candPath);
    const candNs = cand && cand.namespace;
    const candPrefix = (candNs && typeof candNs === 'object' && typeof candNs.prefix === 'string') ? candNs.prefix : '';
    if (candPrefix && candPrefix === NICKNAME) {
      match = { stem, candPath, cand };
      stderr.write(`ℹ️  nickname '${NICKNAME}' resolved to ${base} via .namespace.prefix\n`);
      break;
    }
  }
  if (!match) {
    stderr.write(`❌ missing ${METADATA_DIR}/${NICKNAME}-new.json — run describe_connector.mjs ${NICKNAME}-new first\n`);
    stderr.write(`   (also scanned every *-new.json in ${METADATA_DIR} for .namespace.prefix=='${NICKNAME}' — no match)\n`);
    exit(1);
  }
  NICKNAME = match.stem;
  newMetaPath = match.candPath;
  newMeta = match.cand;
}

// -- flow dir + files -------------------------------------------------------
// String concat (not path.join) so the caller's PROJECT_DIR (typically ".")
// survives into FLOW_DIR unchanged — the emitted usage-site file paths must
// match the grep-path shape (`./src/...`) so both scripts are drop-in equal.
const FLOW_DIR = `${PROJECT_DIR.replace(/\/$/, '')}/src/main/mule`;
if (!isDir(FLOW_DIR)) {
  stderr.write(`❌ no flow directory at ${FLOW_DIR}\n`);
  exit(1);
}
const FLOW_FILES = listFlowFiles(FLOW_DIR);
if (FLOW_FILES.length === 0) {
  stderr.write(`❌ no flow XML in ${FLOW_DIR}\n`);
  exit(1);
}

// -- extract prefix from NEW metadata --------------------------------------
const ns = newMeta?.namespace;
const NEW_PREFIX = (ns && typeof ns === 'object' && typeof ns.prefix === 'string') ? ns.prefix : '';
if (!NEW_PREFIX) {
  stderr.write(`❌ ${newMetaPath} has no .namespace.prefix (or .namespace is a bare string, not an object)\n`);
  stderr.write(`   actual: ${JSON.stringify(ns ?? null)}\n`);
  stderr.write('   fix: rewrite as {"prefix": "<xsd-prefix>", "namespace": "<uri>", "schemaLocation": "<uri>/current/<file>.xsd"} and re-run\n');
  exit(1);
}
const NEW_URI = (ns && typeof ns === 'object') ? (ns.uri || ns.namespace || '') : '';

// -- OLD-prefix fallback --------------------------------
let PREFIX = NEW_PREFIX;
let PREFIX_CHANGED_FROM = '';

if (env.PREFIX_OVERRIDE) {
  const candidate = env.PREFIX_OVERRIDE;
  if (countPrefixOpeners(FLOW_FILES, candidate) > 0) {
    PREFIX = candidate;
    PREFIX_CHANGED_FROM = candidate;
    stderr.write(`ℹ️  override: using OLD prefix '${candidate}' (URI-changed connector; PREFIX_OVERRIDE env)\n`);
  }
}

if (!PREFIX_CHANGED_FROM && countPrefixOpeners(FLOW_FILES, NEW_PREFIX) === 0 && NEW_URI) {
  const candidates = scanFlowPrefixesForUri(FLOW_FILES, NEW_URI);
  for (const cand of candidates) {
    if (cand === NEW_PREFIX) continue;
    if (countPrefixOpeners(FLOW_FILES, cand) > 0) {
      PREFIX = cand;
      PREFIX_CHANGED_FROM = cand;
      stderr.write(`ℹ️  fallback: NEW prefix '${NEW_PREFIX}' not found in flow — parsing with OLD prefix '${cand}' (same namespace URI '${NEW_URI}')\n`);
      break;
    }
  }
}

// -- parse every flow file once (DOM) --------------------------------------
const parsed = dom.parseFlowFiles(FLOW_FILES);
for (const { file, nodes, text } of parsed) {
  if (nodes === null && text) stderr.write(`⚠️  parse failed for ${file} — skipped (grep script would still scan it)\n`);
}

// -- extract element names (kebab→camel) from DOM --------------------------
const ELEMS = dom.domElementNames(parsed, PREFIX);

// -- classify against NEW metadata (identical to grep path) ----------------
/** @param {any} v @returns {string} */
function opsName(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return String(v.name || '');
  return '';
}
/** @param {any} cfg @returns {string} */
function configDslName(cfg) {
  if (!cfg || typeof cfg !== 'object') return '';
  return String(cfg.elementName || cfg.name || '');
}

const opsSet = new Set(
  (Array.isArray(newMeta.operations) ? newMeta.operations : []).map(opsName).filter(Boolean),
);
const srcsSet = new Set(
  (Array.isArray(newMeta.sources) ? newMeta.sources : []).map(opsName).filter(Boolean),
);
const cfgElemsSet = new Set(
  (Array.isArray(newMeta.configs) ? newMeta.configs : []).map(configDslName).filter(Boolean),
);
const cfgProvidersSet = new Set();
for (const cfg of (Array.isArray(newMeta.configs) ? newMeta.configs : [])) {
  const providers = (cfg && Array.isArray(cfg.connectionProviders)) ? cfg.connectionProviders : [];
  for (const cp of providers) {
    const n = typeof cp === 'string' ? cp : configDslName(cp);
    if (n) cfgProvidersSet.add(n);
  }
}

const operations_used = [];
const sources_used = [];
const config_elems_used = [];
const provider_hits_from_classify = [];
const child_elements_used = [];

for (const name of ELEMS) {
  if (!name) continue;
  if (opsSet.has(name)) {
    operations_used.push(name);
  } else if (srcsSet.has(name)) {
    sources_used.push(name);
  } else if (cfgElemsSet.has(name)) {
    config_elems_used.push(name);
  } else if (cfgProvidersSet.has(name)) {
    provider_hits_from_classify.push(name);
    child_elements_used.push(name);
  } else {
    operations_used.push(name);
    child_elements_used.push(name);
  }
}

// -- usage sites (DOM) — needed before configs_used ------------------------
// config-ref is an attribute on THIS connector's own elements, so the
// prefix-scoped usage_sites are the authoritative source for configs_used.
const usage_sites = dom.domUsageSites(parsed, PREFIX);

const configs_used = [
  ...new Set(usage_sites.map((s) => s.attributes_set && s.attributes_set['config-ref']).filter(Boolean)),
].sort();

// -- config-provider children (DOM) + classified provider hits -------------
const config_providers_used = [];
const cpSeen = new Set();
for (const elem of provider_hits_from_classify) {
  if (!cpSeen.has(elem)) { cpSeen.add(elem); config_providers_used.push(elem); }
}
for (const elem of dom.domConfigProviderChildren(parsed, PREFIX)) {
  if (!cpSeen.has(elem)) { cpSeen.add(elem); config_providers_used.push(elem); }
}

// error-type extraction is attribute-exact regex — reuse the grep helpers.
const PREFIX_UPPER = PREFIX.toUpperCase();
const errorTypes_caught = grepErrorTypesCaught(FLOW_FILES, PREFIX_UPPER);
const errorTypes_raised = grepErrorTypesRaised(FLOW_FILES, PREFIX_UPPER);

// -- dedup / assemble output (identical shape) -----------------------------
/** @param {string[]} xs @returns {string[]} sorted-unique */
function unique(xs) {
  return [...new Set(xs.filter((x) => x != null && x !== ''))].sort();
}

mkdirp(OUT_DIR);
const OUT_FILE = path.join(OUT_DIR, `${NICKNAME}.json`);

const record = {
  connector: NICKNAME,
  namespace_prefix: PREFIX,
  namespace_prefix_changed: PREFIX_CHANGED_FROM ? { from: PREFIX_CHANGED_FROM, to: NEW_PREFIX } : null,
  operations_used: unique(operations_used),
  sources_used: unique(sources_used),
  configs_used: unique(configs_used),
  config_providers_used: unique(config_providers_used),
  child_elements_used: unique(child_elements_used),
  errorTypes_caught,
  errorTypes_raised,
  usage_sites,
};

// -- not_in_use detection --------------------------------------------------
const empty = record.operations_used.length === 0
  && record.sources_used.length === 0
  && record.configs_used.length === 0
  && record.config_providers_used.length === 0
  && record.usage_sites.length === 0;

// Persist `not_in_use` INTO the file (not just the stdout JSON below) so every
// downstream reader of `.status` skips cleanly: verify_metadata_coverage.mjs's
// gate, SKILL.md's Step-7 fan-out loop (`jq '.status'`), and Phase C/D. Keeps
// the parser record byte-identical to the grep twin (enumerate_usage.mjs).
if (empty) record.status = 'not_in_use';

writeJson(OUT_FILE, record);

if (empty) {
  const notInUse = {
    status: 'not_in_use',
    connector: NICKNAME,
    expected_prefix: NEW_PREFIX,
    note: 'connector is declared in pom.xml but no <prefix:...> element was found in any flow XML — Phase C can skip this connector; Phase D still runs to bump the pom version.',
    usage_file: OUT_FILE,
  };
  stdout.write(JSON.stringify(notInUse, null, 2) + '\n');
  stderr.write(`ℹ️  ${NICKNAME} → not_in_use (usage file written empty at ${OUT_FILE})\n`);
  exit(0);
}

// -- digest ---------------------------------------------------------------
stdout.write(`✅ ${NICKNAME} → ${OUT_FILE} (parser)\n`);
const digest = {
  operations_used: record.operations_used,
  sources_used: record.sources_used,
  configs_used: record.configs_used,
  config_providers_used: record.config_providers_used,
  child_elements_used: record.child_elements_used,
  errorTypes_caught: record.errorTypes_caught,
  sites: record.usage_sites.length,
};
stdout.write(JSON.stringify(digest, null, 2) + '\n');

exit(0);
