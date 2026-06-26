#!/usr/bin/env node
// build_deps — read connector pins from tmp/connector-versions/ (or the DIR
// argument) and print a comma-joined groupId:assetId:version string on stdout
// for `dx mule project create --dependencies`. Files lacking the flat
// {groupId, assetId, version} shape (e.g. the JDBC driver sidecar) are skipped.
// Usage: node scripts/build_deps.mjs [versions-dir]
// Exit codes:
//   0  emitted at least one GAV
//   1  no usable pins found (dir missing/empty/all filtered out)

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDir } from '../lib/fsx.mjs';

const DIR = process.argv[2] ?? 'tmp/connector-versions';

if (!isDir(DIR)) {
  process.stderr.write(`❌ ${DIR} does not exist. Did you run commit_connectors.sh?\n`);
  process.exit(1);
}

const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => join(DIR, name));

if (files.length === 0) {
  process.stderr.write(`❌ ${DIR} is empty. Did you run commit_connectors.sh?\n`);
  process.exit(1);
}

const gavs = [];
for (const f of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    // Any read/parse failure is treated as a skip.
    continue;
  }
  if (!parsed || typeof parsed !== 'object') continue;
  const { groupId, assetId, version } = parsed;
  if (
    typeof groupId !== 'string' || groupId === '' ||
    typeof assetId !== 'string' || assetId === '' ||
    typeof version !== 'string' || version === ''
  ) {
    continue;
  }
  gavs.push(`${groupId}:${assetId}:${version}`);
}

if (gavs.length === 0) {
  process.stderr.write(
    `❌ No connector pins in ${DIR} (files present but none had groupId/assetId/version).\n`
  );
  process.exit(1);
}

process.stdout.write(gavs.join(',') + '\n');
