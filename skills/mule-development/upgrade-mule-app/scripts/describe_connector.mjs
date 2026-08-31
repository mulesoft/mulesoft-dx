#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill (adapted from
// build-mule-integration/scripts/describe_connector.mjs; adds Mode C and a
// Java-17+ gate).
//
// Runs `anypoint-cli-v4 dx mule describe-connector` for the drafted GAV
// and persists the full response under tmp/connector-metadata/. Echoes a
// human-readable digest to stdout.
//
// Three describe modes:
//   A — Connector summary (no flags)
//   B — Per-operation / per-source (--type operation|source --name <name>)
//   C — Per-config connection provider
//       (--type connection-provider --name <provider> --config-name <config>)
//
// Mode C exists because the connection-provider DSL
// `elementName` isn't in Mode-A output. Mode C's response carries it, so
// Phase C can write the right `<prefix:config>` child element.
//
// Usage:
//   node scripts/describe_connector.mjs <nickname>
//   node scripts/describe_connector.mjs <nickname> --type operation|source --name <name>
//   node scripts/describe_connector.mjs <nickname> --type connection-provider --name <provider> --config-name <config>
//
// Exit codes:
//   0  metadata fetched and digest written
//   1  bad args / missing GAV / Java gate / spawn or CLI failure / structural guard
//   5  CLI returned unparseable JSON
import { argv, exit, env, stderr, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mkdirp } from '../lib/fsx.mjs';
import { parseJavaVersion } from '../lib/platform.mjs';
import { anypointEnv } from '../lib/anypoint.mjs';

// ------------------------------------------------------------------
// Java 17+ gate
// ------------------------------------------------------------------
// Under Java 8/11 the CLI still exits 0 but returns a DEGRADED describe —
// config-provider entries collapse to {name, connectionProviders: []} with
// no `parameters` / `attributes`, hiding required-attribute changes on
// config elements. Downstream Phase-C diffs then silently sign off, and
// mvn's XSD validator fails at process-classes.
// Override for legacy-JDK repro: ALLOW_LEGACY_JAVA_FOR_DESCRIBE=1.
if (!env.ALLOW_LEGACY_JAVA_FOR_DESCRIBE) {
  let javaBin = '';
  if (env.JAVA_HOME) {
    const candidate = path.join(env.JAVA_HOME, 'bin', 'java');
    if (existsSync(candidate)) javaBin = candidate;
  }
  if (!javaBin) {
    const which = spawnSync('/bin/sh', ['-c', 'command -v java'], { encoding: 'utf8' });
    if (which.status === 0) javaBin = which.stdout.trim();
  }
  if (!javaBin) {
    stderr.write('❌ describe_connector.mjs: no `java` on PATH and JAVA_HOME is unset — Java 17+ is required\n');
    exit(1);
  }
  const probe = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
  const versionLine = (probe.stderr || probe.stdout || '').split(/\r?\n/, 1)[0] || '';
  const parsed = parseJavaVersion(versionLine);
  if (parsed.major === null || parsed.major < 17) {
    stderr.write(`❌ describe_connector.mjs: Java ${parsed.major ?? '?'} detected (${versionLine}); Java 17+ is required\n`);
    stderr.write('   Under Java 8/11 the describe returns a degraded schema (empty configs[].parameters) that hides required-attribute changes.\n');
    stderr.write('   Fix: export JAVA_HOME="$(/usr/libexec/java_home -v 17)" (or point at a Java 17+ install) and re-run.\n');
    stderr.write('   Override: set ALLOW_LEGACY_JAVA_FOR_DESCRIBE=1 only if you truly need a legacy-JDK describe.\n');
    exit(1);
  }
}

// ------------------------------------------------------------------
// Usage + arg parsing
// ------------------------------------------------------------------

function usage() {
  const argv0 = argv[1] || 'describe_connector.mjs';
  stderr.write(`Usage: ${argv0} <nickname>\n`);
  stderr.write(`       ${argv0} <nickname> --type operation|source --name <name>\n`);
  stderr.write(`       ${argv0} <nickname> --type connection-provider --name <provider> --config-name <config>\n`);
  stderr.write(`  e.g. ${argv0} sfdc\n`);
  stderr.write(`       ${argv0} sfdc --type operation --name query\n`);
  stderr.write(`       ${argv0} sfdc --type connection-provider --name basic-connection --config-name sfdc-config\n`);
}

const rawArgs = argv.slice(2);
const NICKNAME = rawArgs.shift();
if (!NICKNAME) { usage(); exit(1); }

let TYPE = '';
let NAME = '';
let CONFIG_NAME = '';

while (rawArgs.length > 0) {
  const a = rawArgs.shift();
  if (a === '--type') {
    if (rawArgs.length < 1) { stderr.write('❌ --type requires a value\n'); usage(); exit(1); }
    TYPE = rawArgs.shift();
  } else if (a === '--name') {
    if (rawArgs.length < 1) { stderr.write('❌ --name requires a value\n'); usage(); exit(1); }
    NAME = rawArgs.shift();
  } else if (a === '--config-name') {
    if (rawArgs.length < 1) { stderr.write('❌ --config-name requires a value\n'); usage(); exit(1); }
    CONFIG_NAME = rawArgs.shift();
  } else {
    stderr.write(`❌ Unknown argument: ${a}\n`); usage(); exit(1);
  }
}

if (TYPE && !NAME) { stderr.write('❌ --type requires --name (both flags must be set together)\n'); usage(); exit(1); }
if (NAME && !TYPE) { stderr.write('❌ --name requires --type (both flags must be set together)\n'); usage(); exit(1); }
if (TYPE && TYPE !== 'operation' && TYPE !== 'source' && TYPE !== 'connection-provider') {
  stderr.write(`❌ --type must be 'operation', 'source', or 'connection-provider' (got '${TYPE}')\n`);
  usage();
  exit(1);
}
if (TYPE === 'connection-provider' && !CONFIG_NAME) {
  stderr.write('❌ --type connection-provider requires --config-name <config>\n');
  usage();
  exit(1);
}
if (CONFIG_NAME && TYPE !== 'connection-provider') {
  stderr.write('❌ --config-name is only valid with --type connection-provider\n');
  usage();
  exit(1);
}

// Path-traversal guards — NICKNAME/NAME/CONFIG_NAME land in filenames below.
function isUnsafeSegment(s) {
  return !s || s.includes('/') || s.includes('\\') || s === '..' || s === '.' || s.split(/[\\/]/).includes('..');
}
if (isUnsafeSegment(NICKNAME)) {
  stderr.write(`❌ Bad nickname: '${NICKNAME}' (must not contain path separators or '..')\n`);
  exit(1);
}
if (NAME && isUnsafeSegment(NAME)) {
  stderr.write(`❌ Bad name: '${NAME}' (must not contain path separators or '..')\n`);
  exit(1);
}
if (CONFIG_NAME && isUnsafeSegment(CONFIG_NAME)) {
  stderr.write(`❌ Bad config-name: '${CONFIG_NAME}' (must not contain path separators or '..')\n`);
  exit(1);
}

// ------------------------------------------------------------------
// Paths + GAV resolution
// ------------------------------------------------------------------

const CHOICES_DIR  = env.CONNECTOR_CHOICES_DIR  || 'tmp/connector-choices';
const VERSIONS_DIR = env.CONNECTOR_VERSIONS_DIR || 'tmp/connector-versions';
const METADATA_DIR = env.CONNECTOR_METADATA_DIR || 'tmp/connector-metadata';
const ERRORS_DIR   = env.CONNECTOR_ERRORS_DIR   || 'tmp/connector-errors';

let METADATA_JSON;
let ERRORS_JSON;
if (TYPE === 'connection-provider') {
  METADATA_JSON = path.join(METADATA_DIR, `${NICKNAME}-${CONFIG_NAME}-${NAME}.json`);
  ERRORS_JSON = path.join(ERRORS_DIR, `${NICKNAME}.${CONFIG_NAME}.${NAME}.json`);
} else if (NAME) {
  METADATA_JSON = path.join(METADATA_DIR, `${NICKNAME}-${NAME}.json`);
  ERRORS_JSON = path.join(ERRORS_DIR, `${NICKNAME}.${NAME}.json`);
} else {
  METADATA_JSON = path.join(METADATA_DIR, `${NICKNAME}.json`);
  ERRORS_JSON = path.join(ERRORS_DIR, `${NICKNAME}.json`);
}

const draftPath  = path.join(CHOICES_DIR,  `${NICKNAME}.json`);
const commitPath = path.join(VERSIONS_DIR, `${NICKNAME}.json`);
let GAV_JSON;
if (existsSync(draftPath)) {
  GAV_JSON = draftPath;
} else if (existsSync(commitPath)) {
  GAV_JSON = commitPath;
} else {
  stderr.write(`❌ No GAV file for '${NICKNAME}' in ${CHOICES_DIR}/ or ${VERSIONS_DIR}/\n`);
  stderr.write(`   Resolve the target version (resolve_target_connectors.mjs) and write tmp/connector-choices/${NICKNAME}-new.json first\n`);
  exit(1);
}

let gavObj;
try {
  gavObj = JSON.parse(readFileSync(GAV_JSON, 'utf8'));
} catch (e) {
  stderr.write(`❌ ${GAV_JSON} is not valid JSON: ${e.message}\n`);
  exit(1);
}
const jqInterp = (v) => v === undefined || v === null ? 'null' : String(v);
const GAV = `${jqInterp(gavObj?.groupId)}:${jqInterp(gavObj?.assetId)}:${jqInterp(gavObj?.version)}`;

mkdirp(METADATA_DIR);
mkdirp(ERRORS_DIR);

// ------------------------------------------------------------------
// Run the CLI
// ------------------------------------------------------------------
// Preserve caller's _JAVA_OPTIONS and append the LOOSE-enforcement flag so
// older-connector describes work under the CLI's bundled Java 17 runtime.
function buildChildEnv() {
  const childEnv = anypointEnv();
  const priorJavaOpts = env._JAVA_OPTIONS ?? '';
  childEnv._JAVA_OPTIONS = `${priorJavaOpts} -Dmule.jvm.version.extension.enforcement=LOOSE`;
  return childEnv;
}

const cmdArgs = ['dx', 'mule', 'describe-connector', '--connector', GAV, '--output', 'json'];
if (TYPE) cmdArgs.push('--type', TYPE, '--name', NAME);
if (CONFIG_NAME) cmdArgs.push('--config-name', CONFIG_NAME);

const r = spawnSync('anypoint-cli-v4', cmdArgs, {
  env: buildChildEnv(),
  shell: false,
  encoding: 'buffer',
  maxBuffer: Infinity,
});

if (r.error) {
  stderr.write(`❌ failed to spawn anypoint-cli-v4: ${r.error.message}\n`);
  exit(1);
}

const stdoutBuf = r.stdout || Buffer.alloc(0);
const stderrBuf = r.stderr || Buffer.alloc(0);

if (r.status !== 0) {
  if (stderrBuf.length > 0) stderr.write(stderrBuf);
  if (TYPE === 'connection-provider') {
    stderr.write(`❌ describe-connector failed for ${GAV} (--type ${TYPE} --name ${NAME} --config-name ${CONFIG_NAME})\n`);
    stderr.write(`   hint: --name and --config-name must be the SDK-side names from ${METADATA_DIR}/${NICKNAME}.json — .configs[].name for --config-name, .configs[].connectionProviders[] entry for --name. Do NOT use flow XML names like 'Warehouse_DB_Config' or 'basic-connection'.\n`);
  } else if (TYPE) {
    stderr.write(`❌ describe-connector failed for ${GAV} (--type ${TYPE} --name ${NAME})\n`);
  } else {
    stderr.write(`❌ describe-connector failed for ${GAV}\n`);
  }
  exit(1);
}

// Empty-stdout guard: CLI's error formatter sometimes exits 0 with empty stdout
// (LOOSE-flag banner absorbed the real error). Refuse to persist a 0-byte file.
if (stdoutBuf.length === 0) {
  if (stderrBuf.length > 0) stderr.write(stderrBuf);
  stderr.write(`❌ describe-connector returned empty JSON for ${GAV} (args: ${cmdArgs.join(' ')})\n`);
  stderr.write(`   hint: check --name / --config-name spelling against ${METADATA_DIR}/${NICKNAME}.json (SDK names, not flow XML names)\n`);
  exit(1);
}

const rawMetadata = stdoutBuf.toString('utf8');

let parsed;
try {
  parsed = JSON.parse(rawMetadata);
} catch (e) {
  stderr.write(`jq: parse error: ${e.message}\n`);
  exit(5);
}

// Mode-A structural guard: .namespace must be an object with a non-empty .prefix.
// enumerate_usage reads it via jq/native indexing and errors out on a bare-string
// or null shape. Fail before writing so P5 can't inherit a corrupt file.
if (!TYPE) {
  const ns = parsed.namespace;
  const nsPrefix = (ns && typeof ns === 'object' && typeof ns.prefix === 'string') ? ns.prefix : '';
  if (!nsPrefix) {
    stderr.write(`❌ describe-connector output for ${GAV} has malformed .namespace (must be an object with a non-empty .prefix)\n`);
    stderr.write(`   actual: ${JSON.stringify(ns ?? null)}\n`);
    stderr.write('   expected: {"prefix": "<xsd-prefix>", "namespace": "...", "schemaLocation": "..."}\n');
    stderr.write(`   Refusing to persist ${METADATA_JSON} — P5 would blow up on indexing.\n`);
    exit(1);
  }
}

// Persist metadata + error-type cache.
writeFileSync(METADATA_JSON, stdoutBuf);
const errorTypes = Array.isArray(parsed.errorTypes) ? parsed.errorTypes : [];
writeFileSync(ERRORS_JSON, JSON.stringify({ errorTypes }, null, 2) + '\n');

// ------------------------------------------------------------------
// Digest to stdout
// ------------------------------------------------------------------

if (TYPE === 'connection-provider') {
  stdout.write(`✅ ${NICKNAME} [${TYPE}/${CONFIG_NAME}/${NAME}] → ${METADATA_JSON}\n`);
  stdout.write(`   GAV:        ${GAV}\n`);
  stdout.write(`   errors →    ${ERRORS_JSON}\n`);
  stdout.write('\n');
  stdout.write(`--- describe digest (--type ${TYPE} --config-name ${CONFIG_NAME} --name ${NAME}) ---\n`);
  const providers = Array.isArray(parsed.connectionProviders) ? parsed.connectionProviders : [];
  const selected = providers.find((p) => p && p.name === NAME) ?? null;
  const digest = {
    config: {
      name: parsed.name ?? '',
      prefix: parsed.prefix ?? '',
      elementName: parsed.elementName ?? '',
      attributes: Array.isArray(parsed.attributes) ? parsed.attributes : [],
      childElements: Array.isArray(parsed.childElements) ? parsed.childElements : [],
    },
    selected_provider: selected,
  };
  stdout.write(JSON.stringify(digest, null, 2) + '\n');
  exit(0);
}

if (TYPE) {
  stdout.write(`✅ ${NICKNAME} [${TYPE}/${NAME}] → ${METADATA_JSON}\n`);
  stdout.write(`   GAV:        ${GAV}\n`);
  stdout.write(`   errors →    ${ERRORS_JSON}\n`);
  stdout.write('\n');
  stdout.write(`--- describe digest (--type ${TYPE} --name ${NAME}) ---\n`);
  const digest = {
    name: parsed.name ?? null,
    prefix: parsed.prefix ?? null,
    elementName: parsed.elementName ?? null,
    attributes: Array.isArray(parsed.attributes) ? parsed.attributes : [],
    childElements: Array.isArray(parsed.childElements) ? parsed.childElements : [],
    errorTypes,
  };
  stdout.write(JSON.stringify(digest, null, 2) + '\n');
  exit(0);
}

// Mode-A digest.
stdout.write(`✅ ${NICKNAME} → ${METADATA_JSON}\n`);
stdout.write(`   GAV:        ${GAV}\n`);
stdout.write('\n');
stdout.write('--- describe digest ---\n');

const namespace_prefix = parsed.namespace?.prefix ?? null;
const sources = parsed.sources === undefined ? null : parsed.sources;
const configsArr = Array.isArray(parsed.configs) ? parsed.configs : [];
const configs = configsArr.map((c) => ({
  name: c?.name ?? null,
  providers: Array.isArray(c?.connectionProviders) ? c.connectionProviders : [],
}));
const opsArr = Array.isArray(parsed.operations) ? parsed.operations : [];
const operations_count = opsArr.length;
let operations_sample;
if (parsed.operations === undefined || parsed.operations === null) {
  operations_sample = null;
} else if (opsArr.length > 20) {
  operations_sample = [...opsArr.slice(0, 20), `... (see tmp/connector-metadata/${NICKNAME}.json for full list)`];
} else {
  operations_sample = opsArr;
}

const digest = {
  namespace_prefix,
  sources,
  configs,
  operations_count,
  operations_sample,
  error_types: errorTypes,
};
stdout.write(JSON.stringify(digest, null, 2) + '\n');

exit(0);
