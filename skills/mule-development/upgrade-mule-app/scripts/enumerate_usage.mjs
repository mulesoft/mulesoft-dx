#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Phase B0 helper — enumerate the connector's actual usage in a Mule
// project's flow XMLs. Deterministic; no LLM.
//
// What it grep's for, per <prefix> pulled from the NEW connector metadata:
//   - Operations / sources used  → <prefix:...> element names
//   - Configs referenced         → config-ref="..." values
//   - Config providers used      → child elements of each <prefix:config>
//   - Error types caught         → type="PREFIX:..." on <on-error-*>
//   - Error types raised         → type="PREFIX:..." on <raise-error>
//   - Line-numbered usage sites  → per-op file+line+attributes_set
//
// Regex-based grep + kebab→camel + prefix fallback.
//
// Usage:
//   node scripts/enumerate_usage.mjs <nickname> [<project-dir>]
//
// Exit codes:
//   0  usage file written (may be `not_in_use` mode; digest on stdout)
//   1  bad args / missing metadata / missing flow dir / malformed metadata
import { argv, exit, env, stderr, stdout } from 'node:process';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { mkdirp, writeJson, readJsonOrNull, isDir } from '../lib/fsx.mjs';
import {
  listFlowFiles,
  scanFlowPrefixesForUri,
  countPrefixOpeners,
  grepElementNames,
  grepErrorTypesCaught,
  grepErrorTypesRaised,
  extractConfigProviderChildren,
  extractUsageSites,
} from '../lib/xml-flow.mjs';

// -- args -------------------------------------------------------------------

function usage() {
  stderr.write(`Usage: ${argv[1] || 'enumerate_usage.mjs'} <nickname> [<project-dir>]\n`);
  stderr.write(`  e.g. ${argv[1] || 'enumerate_usage.mjs'} file .\n`);
}

let NICKNAME = argv[2] || '';
const PROJECT_DIR = argv[3] || '.';
if (!NICKNAME) { usage(); exit(1); }

const METADATA_DIR = env.CONNECTOR_METADATA_DIR || 'tmp/connector-metadata';
const OUT_DIR = env.CONNECTOR_USAGE_DIR || 'tmp/connector-usage';

let newMetaPath = path.join(METADATA_DIR, `${NICKNAME}-new.json`);
let newMeta = readJsonOrNull(newMetaPath);

// Nickname-mismatch fallback: the caller may pass the XSD prefix (`crypto`,
// `os`, `xml-module`) while describe_connector persisted under the artifact
// slug (`cryptography-new.json`). Scan every *-new.json in $METADATA_DIR
// and match on .namespace.prefix — that's the ground truth for the prefix.
if (!newMeta) {
  let match = null;
  let entries = [];
  try { entries = readdirSync(METADATA_DIR); } catch { entries = []; }
  for (const base of entries.sort()) {
    if (!base.endsWith('-new.json')) continue;
    // Reject per-op / per-provider files (they have `-new-` in the middle).
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

// String concat (not path.join) — the caller's PROJECT_DIR (typically ".")
// must survive into FLOW_DIR unchanged so the emitted usage-site file paths
// keep their leading `./` (`./src/...`), which downstream readers depend on.
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
// Guard: .namespace must be an object with .prefix. Bare-string namespaces
// (from hand-drafted metadata) get rejected up-front so Phase C doesn't
// inherit a corrupt state.
const ns = newMeta?.namespace;
const NEW_PREFIX = (ns && typeof ns === 'object' && typeof ns.prefix === 'string') ? ns.prefix : '';
if (!NEW_PREFIX) {
  stderr.write(`❌ ${newMetaPath} has no .namespace.prefix (or .namespace is a bare string, not an object)\n`);
  stderr.write(`   actual: ${JSON.stringify(ns ?? null)}\n`);
  stderr.write('   fix: rewrite as {"prefix": "<xsd-prefix>", "namespace": "<uri>", "schemaLocation": "<uri>/current/<file>.xsd"} and re-run\n');
  exit(1);
}
// URI is the stable identity across version-rename cases (SFDC 10 `sfdc` →
// SFDC 11 `salesforce` under the same URI).
const NEW_URI = (ns && typeof ns === 'object')
  ? (ns.uri || ns.namespace || '')
  : '';

// -- OLD-prefix fallback --------------------------------

let PREFIX = NEW_PREFIX;
let PREFIX_CHANGED_FROM = '';

// Manual override: PREFIX_OVERRIDE env var forces a specific OLD prefix
// (URI-changed connectors where namespace URI itself moved).
if (env.PREFIX_OVERRIDE) {
  const candidate = env.PREFIX_OVERRIDE;
  if (countPrefixOpeners(FLOW_FILES, candidate) > 0) {
    PREFIX = candidate;
    PREFIX_CHANGED_FROM = candidate;
    stderr.write(`ℹ️  override: using OLD prefix '${candidate}' (URI-changed connector; PREFIX_OVERRIDE env)\n`);
  }
}

// Automatic fallback: if NEW prefix has zero flow hits, walk every prefix
// bound to the NEW namespace URI and pick the first that appears as an
// element opener. This must tolerate zero hits without exiting.
if (!PREFIX_CHANGED_FROM && countPrefixOpeners(FLOW_FILES, NEW_PREFIX) === 0 && NEW_URI) {
  const candidates = scanFlowPrefixesForUri(FLOW_FILES, NEW_URI);
  for (const cand of candidates) {
    if (cand === NEW_PREFIX) continue;
    if (countPrefixOpeners(FLOW_FILES, cand) > 0) {
      PREFIX = cand;
      PREFIX_CHANGED_FROM = cand;
      stderr.write(`ℹ️  fallback: NEW prefix '${NEW_PREFIX}' not found in flow — grepping with OLD prefix '${cand}' (same namespace URI '${NEW_URI}')\n`);
      break;
    }
  }
}

// -- extract element names (kebab→camel) -----------------------------------

const ELEMS = grepElementNames(FLOW_FILES, PREFIX);

// -- classify against NEW metadata -----------------------------------------
// .operations / .sources may be array of strings OR array of {name: ...}.
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
  (Array.isArray(newMeta.operations) ? newMeta.operations : [])
    .map(opsName).filter(Boolean),
);
const srcsSet = new Set(
  (Array.isArray(newMeta.sources) ? newMeta.sources : [])
    .map(opsName).filter(Boolean),
);
const cfgElemsSet = new Set(
  (Array.isArray(newMeta.configs) ? newMeta.configs : [])
    .map(configDslName).filter(Boolean),
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
    // Known child element of <prefix:config> — bucket into
    // child_elements_used only.
    provider_hits_from_classify.push(name);
    child_elements_used.push(name);
  } else {
    // Unknown to NEW metadata — treat as ambiguous op/child. Downstream
    // Phase B intersect filters these before per-op describe.
    operations_used.push(name);
    child_elements_used.push(name);
  }
}

// -- usage sites (needed before configs_used) ------------------------------
// Extract usage sites first: config-ref is an attribute on THIS connector's
// own operation/source elements, so the prefix-scoped usage_sites are the
// authoritative source for configs_used. Grepping every `config-ref="..."`
// across all flow files would leak the app-wide config union into every
// connector's file — making configs_used meaningless
// per-connector and, worse, never-empty, so the not_in_use gate below could
// never fire for a genuinely-unused connector (e.g. vm declared-but-unused).
const usage_sites = extractUsageSites(FLOW_FILES, PREFIX);

// -- config-ref values, error types, config-provider children --------------

const configs_used = [
  ...new Set(
    usage_sites
      .map((s) => s.attributes_set && s.attributes_set['config-ref'])
      .filter(Boolean),
  ),
].sort();

const config_providers_used = [];
const cpSeen = new Set();
for (const elem of provider_hits_from_classify) {
  if (!cpSeen.has(elem)) { cpSeen.add(elem); config_providers_used.push(elem); }
}
for (const elem of extractConfigProviderChildren(FLOW_FILES, PREFIX)) {
  if (!cpSeen.has(elem)) { cpSeen.add(elem); config_providers_used.push(elem); }
}

const PREFIX_UPPER = PREFIX.toUpperCase();
const errorTypes_caught = grepErrorTypesCaught(FLOW_FILES, PREFIX_UPPER);
const errorTypes_raised = grepErrorTypesRaised(FLOW_FILES, PREFIX_UPPER);

// -- dedup / assemble output ------------------------------------------------

/** @param {string[]} xs @returns {string[]} sorted-unique */
function unique(xs) {
  return [...new Set(xs.filter((x) => x != null && x !== ''))].sort();
}

mkdirp(OUT_DIR);
const OUT_FILE = path.join(OUT_DIR, `${NICKNAME}.json`);

const record = {
  connector: NICKNAME,
  namespace_prefix: PREFIX,
  namespace_prefix_changed: PREFIX_CHANGED_FROM
    ? { from: PREFIX_CHANGED_FROM, to: NEW_PREFIX }
    : null,
  operations_used: unique(operations_used),
  sources_used: unique(sources_used),
  configs_used: unique(configs_used),
  config_providers_used: unique(config_providers_used),
  // Known-provider hits + unknown-to-metadata hits. config_elems_used lives
  // in the classification tree but is NOT emitted into this array — Phase C
  // reads .configs[] instead.
  child_elements_used: unique(child_elements_used),
  errorTypes_caught,
  errorTypes_raised,
  usage_sites,
};

// -- not_in_use detection --------------------------------------------------
// If the connector is declared in pom.xml but no <prefix:...> element is
// present in any flow XML, emit an explicit `not_in_use` status so Phase C
// can skip cleanly (Phase D still runs to bump the pom version).
const empty = record.operations_used.length === 0
  && record.sources_used.length === 0
  && record.configs_used.length === 0
  && record.config_providers_used.length === 0
  && record.usage_sites.length === 0;

// Persist `not_in_use` INTO the file (not just the stdout JSON below) so every
// downstream reader of `.status` skips cleanly: verify_metadata_coverage.mjs's
// gate (line ~70), SKILL.md's Step-7 fan-out loop (`jq '.status'`), and Phase
// C/D. Pre-fix, the status lived only on stdout, so the file was status-less
// and the gate demanded Mode-C describes for zero-usage connectors.
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

stdout.write(`✅ ${NICKNAME} → ${OUT_FILE}\n`);
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
