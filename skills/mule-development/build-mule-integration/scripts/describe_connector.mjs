#!/usr/bin/env node
// describe_connector — fetch and summarize a connector's metadata via anypoint-cli-v4.
//
// Modes:
//   A — Connector summary (no flags). Writes tmp/connector-metadata/<nick>.json
//       and tmp/connector-errors/<nick>.json (connector-wide errorTypes).
//   B — Per-operation / per-source (both flags required). Writes
//       tmp/connector-metadata/<nick>-<name>.json and
//       tmp/connector-errors/<nick>.<name>.json (per-op/source subset).
//
// The GAV is read from tmp/connector-choices/<nick>.json when present, else
// tmp/connector-versions/<nick>.json — drafts take precedence over committed pins.
//
// Usage:
//   node scripts/describe_connector.mjs <nickname>
//   node scripts/describe_connector.mjs <nickname> --type operation|source --name <name>
//
// Exit codes:
//   0  metadata fetched and digest written
//   1  bad arguments, missing GAV file, spawn failure, or describe-connector error
//   5  CLI returned unparseable / degenerate JSON

import { argv, exit, env, stderr, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mkdirp, writeJson } from '../lib/fsx.mjs';
import { sortVersionStrings } from '../lib/platform.mjs';
import { anypointEnv } from '../lib/anypoint.mjs';

// -- usage ------------------------------------------------------------------

function usage() {
  const argv0 = argv[1] || 'describe_connector.mjs';
  stderr.write(`Usage: ${argv0} <nickname>\n`);
  stderr.write(`       ${argv0} <nickname> --type operation|source --name <name>\n`);
  stderr.write(`  e.g. ${argv0} sfdc\n`);
  stderr.write(`       ${argv0} sfdc --type operation --name query\n`);
}

// -- arg parsing ------------------------------------------------------------

const rawArgs = argv.slice(2);
const NICKNAME = rawArgs.shift();
if (!NICKNAME) { usage(); exit(1); }

let TYPE = '';
let NAME = '';

while (rawArgs.length > 0) {
  const a = rawArgs.shift();
  if (a === '--type') {
    if (rawArgs.length < 1) { stderr.write('❌ --type requires a value\n'); usage(); exit(1); }
    TYPE = rawArgs.shift();
  } else if (a === '--name') {
    if (rawArgs.length < 1) { stderr.write('❌ --name requires a value\n'); usage(); exit(1); }
    NAME = rawArgs.shift();
  } else {
    stderr.write(`❌ Unknown argument: ${a}\n`); usage(); exit(1);
  }
}

if (TYPE && !NAME) { stderr.write('❌ --type requires --name (both flags must be set together)\n'); usage(); exit(1); }
if (NAME && !TYPE) { stderr.write('❌ --name requires --type (both flags must be set together)\n'); usage(); exit(1); }
if (TYPE && TYPE !== 'operation' && TYPE !== 'source') {
  stderr.write(`❌ --type must be 'operation' or 'source' (got '${TYPE}')\n`);
  usage();
  exit(1);
}

// Path-traversal guard. NICKNAME and NAME are interpolated into the
// metadata/errors filenames below; reject any value that contains a path
// separator or '..' so a hostile caller can't escape those directories. Real
// nicknames are short alphanumeric tokens (e.g. 'sfdc', 'http'); operation
// names are CLI-side identifiers (e.g. 'query').
function isUnsafeSegment(s) {
  return s.includes('/') || s.includes('\\') || s === '..' || s === '.' || s.split(/[\\/]/).includes('..');
}
if (isUnsafeSegment(NICKNAME)) {
  stderr.write(`❌ Bad nickname: '${NICKNAME}' (must not contain path separators or '..')\n`);
  exit(1);
}
if (NAME && isUnsafeSegment(NAME)) {
  stderr.write(`❌ Bad name: '${NAME}' (must not contain path separators or '..')\n`);
  exit(1);
}

// -- paths (env-overridable) ------------------------------------------------

const CHOICES_DIR  = env.CONNECTOR_CHOICES_DIR  || 'tmp/connector-choices';
const VERSIONS_DIR = env.CONNECTOR_VERSIONS_DIR || 'tmp/connector-versions';
const METADATA_DIR = env.CONNECTOR_METADATA_DIR || 'tmp/connector-metadata';
const ERRORS_DIR   = env.CONNECTOR_ERRORS_DIR   || 'tmp/connector-errors';

const METADATA_JSON = NAME
  ? path.join(METADATA_DIR, `${NICKNAME}-${NAME}.json`)
  : path.join(METADATA_DIR, `${NICKNAME}.json`);
const ERRORS_JSON = NAME
  ? path.join(ERRORS_DIR, `${NICKNAME}.${NAME}.json`)
  : path.join(ERRORS_DIR, `${NICKNAME}.json`);

// -- resolve GAV file (drafts win over commits) -----------------------------

let GAV_JSON;
const draftPath  = path.join(CHOICES_DIR,  `${NICKNAME}.json`);
const commitPath = path.join(VERSIONS_DIR, `${NICKNAME}.json`);
if (existsSync(draftPath)) {
  GAV_JSON = draftPath;
} else if (existsSync(commitPath)) {
  GAV_JSON = commitPath;
} else {
  stderr.write(`❌ No GAV file for '${NICKNAME}' in ${CHOICES_DIR}/ or ${VERSIONS_DIR}/\n`);
  stderr.write(`   Run get_latest_connector.sh ${NICKNAME}, then pick_connector.sh ${NICKNAME} <gav>\n`);
  exit(1);
}

let gavObj;
try {
  gavObj = JSON.parse(readFileSync(GAV_JSON, 'utf8'));
} catch (e) {
  stderr.write(`❌ ${GAV_JSON} is not valid JSON: ${e.message}\n`);
  exit(1);
}
// Render the GAV as groupId:assetId:version. Missing/null fields become the
// literal "null" so the downstream CLI invocation receives a stable string.
const jqInterp = (v) => v === undefined || v === null ? 'null' : String(v);
// `let` (not `const`): the version self-heal below may reassign GAV to a
// working prior version when the latest publish is broken.
let GAV = `${jqInterp(gavObj?.groupId)}:${jqInterp(gavObj?.assetId)}:${jqInterp(gavObj?.version)}`;

// -- prepare output dirs ----------------------------------------------------

mkdirp(METADATA_DIR);
mkdirp(ERRORS_DIR);

// -- child env: NODE_NO_WARNINGS=1, append LOOSE flag to _JAVA_OPTIONS -------
//
// An existing _JAVA_OPTIONS value is preserved and the LOOSE enforcement flag
// is appended. Anypoint developer environments commonly inject memory tuning
// (`-Xmx2g`) and TLS roots (`-Djavax.net.ssl.trustStore=...`) via
// _JAVA_OPTIONS; preserving them keeps the CLI working in those environments.

function buildChildEnv() {
  const childEnv = { ...env };
  childEnv.NODE_NO_WARNINGS = '1';
  const priorJavaOpts = env._JAVA_OPTIONS ?? '';
  childEnv._JAVA_OPTIONS = `${priorJavaOpts} -Dmule.jvm.version.extension.enforcement=LOOSE`;
  return childEnv;
}

// -- run the CLI; consume stdout/stderr Buffers in-process ------------------
//
// `maxBuffer: Infinity` lifts the default 1 MiB cap so large OpenAPI-derived
// connector descriptions are captured in full.

function describeOnce(gav) {
  const cmdArgs = ['dx', 'mule', 'describe-connector', '--connector', gav, '--output', 'json'];
  if (TYPE) cmdArgs.push('--type', TYPE, '--name', NAME);
  return spawnSync('anypoint-cli-v4', cmdArgs, {
    env: buildChildEnv(),
    shell: false,
    encoding: 'buffer',
    maxBuffer: Infinity,
  });
}

// -- version self-heal ------------------------------------------------------
//
// A connector's latest published version can be a broken artifact — e.g. a
// jar that omits classes its own mule-artifact.json declares as exported, so
// extension-model loading throws and describe-connector exits non-zero with no
// usable output. When that happens, fall back to the next-lower version of the
// same groupId:assetId, which is deterministic and safe to automate. Capped to
// bound wall-clock on a connector with many bad releases.

const MAX_FALLBACK_ATTEMPTS = 5;

function tryPriorVersions(currentGav) {
  const groupId = currentGav?.groupId;
  const assetId = currentGav?.assetId;
  const version = currentGav?.version;
  if (!groupId || !assetId || typeof version !== 'string') return null;

  // List every published version of this asset (Exchange returns one row per
  // version).
  const listing = spawnSync(
    'anypoint-cli-v4',
    ['exchange', 'asset', 'list', assetId, '--limit', '200', '--offset', '0', '--output', 'json'],
    { env: anypointEnv(), encoding: 'utf8', shell: false, maxBuffer: Infinity },
  );
  if (listing.status !== 0 || !listing.stdout) return null;

  let assets;
  try { assets = JSON.parse(listing.stdout); } catch { return null; }
  if (!Array.isArray(assets)) return null;

  const versions = [...new Set(
    assets
      .filter((a) => a && a.groupId === groupId && a.assetId === assetId && typeof a.version === 'string')
      .map((a) => a.version),
  )];
  // Sort ascending, keep only versions strictly below the broken one, then
  // walk highest-working-first (descending).
  const sorted = sortVersionStrings(versions);
  const idx = sorted.indexOf(version);
  const lower = (idx === -1 ? sorted : sorted.slice(0, idx)).slice().reverse();

  const attempts = lower.slice(0, MAX_FALLBACK_ATTEMPTS);
  if (lower.length > attempts.length) {
    stderr.write(`   (trying newest ${attempts.length} of ${lower.length} prior versions)\n`);
  }
  for (const v of attempts) {
    const gav = `${groupId}:${assetId}:${v}`;
    const attempt = describeOnce(gav);
    if (!attempt.error && attempt.status === 0) {
      return { gav, groupId, assetId, version: v, r: attempt };
    }
  }
  return null;
}

let r = describeOnce(GAV);

if (r.error) {
  stderr.write(`❌ failed to spawn anypoint-cli-v4: ${r.error.message}\n`);
  exit(1);
}

let stdoutBuf = r.stdout || Buffer.alloc(0);
let stderrBuf = r.stderr || Buffer.alloc(0);

// Self-heal a broken latest publish by falling back to a working prior version
// of the same asset. Only in summary mode (no --type) and only when the GAV
// came from a mutable draft, so the draft can be re-pinned to the working one.
if (r.status !== 0 && !TYPE && GAV_JSON === draftPath) {
  const healed = tryPriorVersions(gavObj);
  if (healed) {
    GAV = healed.gav;
    r = healed.r;
    stdoutBuf = r.stdout || Buffer.alloc(0);
    stderrBuf = r.stderr || Buffer.alloc(0);
    // Re-pin the draft so the downstream pom builds against the working version.
    writeJson(draftPath, { groupId: healed.groupId, assetId: healed.assetId, version: healed.version });
    stderr.write(
      `⚠️  describe-connector failed for the latest ${gavObj.groupId}:${gavObj.assetId}:${gavObj.version} ` +
      `(broken publish); fell back to working version ${healed.version} and re-pinned ${draftPath}.\n`,
    );
  }
}

// Persist METADATA_JSON for downstream consumers, which read this file.
writeFileSync(METADATA_JSON, stdoutBuf);

if (r.status !== 0) {
  // Forward CLI stderr verbatim, then a one-line summary.
  if (stderrBuf.length > 0) stderr.write(stderrBuf);
  if (TYPE) {
    stderr.write(`❌ describe-connector failed for ${GAV} (--type ${TYPE} --name ${NAME})\n`);
  } else {
    stderr.write(`❌ describe-connector failed for ${GAV}\n`);
  }
  exit(1);
}

// -- parse the saved JSON and print the digest ------------------------------

const rawMetadata = stdoutBuf.toString('utf8');

// Empty CLI stdout: write a 0-byte errors file, print the header, exit 0.
if (rawMetadata.length === 0) {
  writeFileSync(ERRORS_JSON, '');
  if (TYPE) {
    stdout.write(`✅ ${NICKNAME} [${TYPE}/${NAME}] → ${METADATA_JSON}\n`);
    stdout.write(`   GAV:        ${GAV}\n`);
    stdout.write(`   errors →    ${ERRORS_JSON}\n`);
    stdout.write('\n');
    stdout.write(`--- describe digest (--type ${TYPE} --name ${NAME}) ---\n`);
  } else {
    stdout.write(`✅ ${NICKNAME} → ${METADATA_JSON}\n`);
    stdout.write(`   GAV:        ${GAV}\n`);
    stdout.write('\n');
    stdout.write('--- describe digest ---\n');
  }
  exit(0);
}

// Non-empty but unparseable: write a 0-byte errors file, keep the bad metadata
// bytes on disk, and exit 5.
let parsed;
try {
  parsed = JSON.parse(rawMetadata);
} catch (e) {
  writeFileSync(ERRORS_JSON, '');
  // Wording recognized by the downstream error-pattern matchers.
  stderr.write(`jq: parse error: ${e.message}\n`);
  exit(5);
}

// errorTypes allowlist — default to an empty array when absent.
const errorTypes = Array.isArray(parsed.errorTypes) ? parsed.errorTypes : [];
writeFileSync(ERRORS_JSON, JSON.stringify({ errorTypes }, null, 2) + '\n');

// -- print the human digest to stdout ---------------------------------------

if (TYPE) {
  // Per-op / per-source digest — name, prefix, elementName, plus null-safe
  // attributes, childElements and errorTypes (each defaulting to []).
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

// Connector summary — sources[] and configs[] in full, operations truncated
// at 20 with a marker, plus error_types. A missing/null .configs is treated as
// a degenerate response and exits 5 below; operations default to 0/none.
stdout.write(`✅ ${NICKNAME} → ${METADATA_JSON}\n`);
stdout.write(`   GAV:        ${GAV}\n`);
stdout.write('\n');
stdout.write('--- describe digest ---\n');

if (parsed.configs === undefined || parsed.configs === null) {
  // A connector description with no configs is degenerate; report it and exit 5.
  stderr.write(`jq: error (at ${METADATA_JSON}:1): Cannot iterate over null (null)\n`);
  exit(5);
}

const namespace_prefix = parsed.namespace?.prefix ?? null;
// Pass .sources through unchanged — null if absent, the array if present.
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
