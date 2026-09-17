#!/usr/bin/env node
// pick_connector — write a {groupId, assetId, version} draft JSON to
// ${CONNECTOR_CHOICES_DIR:-tmp/connector-choices}/<nickname>.json.
// Usage: node scripts/pick_connector.mjs <nickname> <groupId:assetId:version>
// Exit codes:
//   0  draft written
//   1  bad arguments / malformed GAV

import { join } from 'node:path';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { mkdirp, writeJson } from '../lib/fsx.mjs';

const args = argv.slice(2);
const nickname = args[0] ?? '';
const gav = args[1] ?? '';
const scriptName = 'scripts/pick_connector.mjs';

if (nickname === '' || gav === '') {
  stderr.write(`Usage: ${scriptName} <nickname> <groupId:assetId:version>\n`);
  stderr.write(`  e.g. ${scriptName} slack com.mulesoft.connectors:mule4-slack-connector:2.0.1\n`);
  exit(1);
}

// Path-traversal guard: nickname is interpolated into `${outDir}/${nickname}.json`
// below. Reject any value containing a path separator or `..` so a caller can't
// escape the connector-choices directory. Real nicknames are short tokens like
// 'slack' / 'sfdc' / 'http'.
if (nickname.includes('/') || nickname.includes('\\') || nickname.split(/[\\/]/).includes('..') || nickname === '..' || nickname === '.') {
  stderr.write(`Bad nickname: '${nickname}' (must not contain path separators or '..')\n`);
  exit(1);
}

// Require exactly three colon-separated fields, rejecting both "a:b" (too few)
// and "a:b:c:d" (too many).
const parts = gav.split(':');
if (parts.length !== 3) {
  stderr.write(`Bad GAV format: '${gav}'\n`);
  stderr.write(`Expected exactly 3 non-empty colon-separated parts: groupId:assetId:version\n`);
  exit(1);
}

const [groupId, assetId, version] = parts;
if (groupId === '' || assetId === '' || version === '') {
  stderr.write(`Bad GAV format: '${gav}' (one or more fields empty)\n`);
  exit(1);
}

const outDir = env.CONNECTOR_CHOICES_DIR && env.CONNECTOR_CHOICES_DIR !== ''
  ? env.CONNECTOR_CHOICES_DIR
  : join('tmp', 'connector-choices');

mkdirp(outDir);
const outFile = join(outDir, `${nickname}.json`);
writeJson(outFile, { groupId, assetId, version });

stdout.write(`Drafted: ${nickname} → ${groupId}:${assetId}:${version}\n`);
stdout.write(`Saved to ${outFile}\n`);
