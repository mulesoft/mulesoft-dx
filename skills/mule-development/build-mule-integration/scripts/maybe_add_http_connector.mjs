#!/usr/bin/env node
// maybe_add_http_connector — Step 6.5 helper: if any selected connection
// provider is OAuth-family, ensure mule-http-connector is present in
// <project>/pom.xml.
// Usage: node scripts/maybe_add_http_connector.mjs --project <dir> <provider> [<provider>...]
// Exit codes:
//   0  no OAuth, or HTTP already present, or HTTP inserted successfully
//   1  OAuth detected but HTTP could not be resolved or pom.xml edit failed
//   2  bad invocation (missing --project or no providers)

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hasArtifact, insertDependency } from '../lib/pom.mjs';
import { readJson, isDir } from '../lib/fsx.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function die(code, msg) {
  if (msg) process.stderr.write(msg + '\n');
  process.exit(code);
}

// argv parsing: --project <dir>, --project=<dir>, -h/--help, positionals are providers.
function parseArgs(argv) {
  let projectDir = '';
  const providers = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--project') {
      const next = argv[i + 1];
      if (next === undefined || next === '') {
        die(2, '❌ --project requires a path argument');
      }
      projectDir = next;
      i += 2;
      continue;
    }
    if (a.startsWith('--project=')) {
      projectDir = a.slice('--project='.length);
      i += 1;
      continue;
    }
    if (a === '--help' || a === '-h') {
      process.stdout.write(`Usage: ${process.argv[1]} --project <dir> <provider> [<provider>...]\n`);
      process.exit(0);
    }
    providers.push(a);
    i += 1;
  }
  return { projectDir, providers };
}

const { projectDir, providers } = parseArgs(process.argv.slice(2));

if (!projectDir) {
  process.stderr.write('❌ --project <dir> is required\n');
  process.stderr.write(`   Usage: ${process.argv[1]} --project <dir> <provider> [<provider>...]\n`);
  process.exit(2);
}

if (!isDir(projectDir)) {
  die(1, `❌ Project directory not found: ${projectDir}`);
}

if (providers.length === 0) {
  process.stdout.write('✅ No connection providers passed — nothing to do.\n');
  process.exit(0);
}

// OAuth detection: case-insensitive match for oauth | jwt | auth-code | authorization-code
const OAUTH_RE = /oauth|jwt|auth-code|authorization-code/i;
let oauthProvider = '';
for (const p of providers) {
  if (OAUTH_RE.test(p)) { oauthProvider = p; break; }
}

if (!oauthProvider) {
  process.stdout.write('✅ No OAuth providers detected — HTTP connector not required.\n');
  process.exit(0);
}

process.stdout.write(`⚠️  OAuth/JWT provider detected: ${oauthProvider}\n`);
process.stdout.write('    → HTTP listener required for OAuth callbacks.\n');

// All file work is anchored to projectDir via absolute paths, so cwd is irrelevant.
const pomPath = join(projectDir, 'pom.xml');
if (!existsSync(pomPath)) {
  process.stderr.write(`❌ pom.xml not found in ${projectDir}\n`);
  process.stderr.write("   --project must point at a directory created by 'dx project create'.\n");
  process.exit(1);
}

let pomText = readFileSync(pomPath, 'utf8');

if (hasArtifact(pomText, 'mule-http-connector')) {
  process.stdout.write('✅ HTTP connector already in pom.xml — nothing to add.\n');
  process.exit(0);
}

process.stdout.write('🔍 Resolving latest HTTP connector from Exchange...\n');

// Prefer the existing draft if HTTP was already picked earlier.
const httpChoiceRel = join('tmp', 'connector-choices', 'http.json');
const httpChoiceAbs = join(projectDir, httpChoiceRel);

let httpGav = '';
if (existsSync(httpChoiceAbs)) {
  process.stdout.write(`✅ Using existing HTTP draft at ${httpChoiceRel}\n`);
  let choice;
  try { choice = readJson(httpChoiceAbs); } catch (e) {
    die(1, `❌ Failed to read ${httpChoiceRel}: ${e?.message || e}`);
  }
  const { groupId, assetId, version } = choice || {};
  if (!groupId || !assetId || !version) {
    die(1, `❌ ${httpChoiceRel} is missing groupId/assetId/version`);
  }
  httpGav = `${groupId}:${assetId}:${version}`;
} else {
  // Invoke get_latest_connector.mjs to list candidates; ignore its stderr and
  // treat empty stdout as "could not resolve".
  const getLatest = resolve(SCRIPT_DIR, 'get_latest_connector.mjs');
  const r = spawnSync(process.execPath, [getLatest, 'mule-http-connector', 'http'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: false,
    cwd: projectDir,
  });
  const list = (r.stdout || '').toString();
  if (!list.trim()) {
    die(1, '❌ Could not resolve HTTP connector — add it manually.');
  }
  // Take the top-ranked candidate.
  httpGav = list.split(/\r?\n/, 1)[0].trim();
  if (!httpGav) {
    die(1, '❌ Could not resolve HTTP connector — add it manually.');
  }
  // Persist as draft via pick_connector.mjs.
  const pick = resolve(SCRIPT_DIR, 'pick_connector.mjs');
  const pickRes = spawnSync(process.execPath, [pick, 'http', httpGav], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: false,
    cwd: projectDir,
  });
  if (pickRes.status !== 0) {
    die(1, `❌ pick_connector.mjs http ${httpGav} failed (exit ${pickRes.status})`);
  }
}

// Parse GAV → groupId / artifactId / version; require all three non-empty.
const gavParts = httpGav.split(':');
const [httpGroup, httpArtifact, httpVersion] = gavParts;
if (gavParts.length !== 3 || !httpGroup || !httpArtifact || !httpVersion) {
  die(1, `❌ HTTP GAV parse failed: '${httpGav}'`);
}

// Atomic edit: build new pom in-memory, verify, write to a sibling .tmp,
// then renameSync over the original. A crash between write and rename leaves
// the original pom.xml intact.
const newPom = insertDependency(pomText, {
  groupId: httpGroup,
  artifactId: httpArtifact,
  version: httpVersion,
  classifier: 'mule-plugin',
});

// Verify in-memory before touching disk.
if (!hasArtifact(newPom, httpArtifact)) {
  process.stderr.write('❌ Failed to insert HTTP connector — pom.xml unchanged.\n');
  process.exit(1);
}

const pomTmp = pomPath + '.tmp';
writeFileSync(pomTmp, newPom);
try {
  renameSync(pomTmp, pomPath);
} catch (err) {
  // Rename failed — clean up tmp file so we don't leave a stale sibling.
  try { unlinkSync(pomTmp); } catch { /* ignore */ }
  process.stderr.write(`❌ Failed to replace pom.xml: ${err?.message || err}\n`);
  process.exit(1);
}

process.stdout.write(`✅ Added ${httpGroup}:${httpArtifact}:${httpVersion} to pom.xml\n`);
