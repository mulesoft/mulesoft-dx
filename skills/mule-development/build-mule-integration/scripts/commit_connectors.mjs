#!/usr/bin/env node
// commit_connectors — promote every connector draft in tmp/connector-choices/
// to the pinned tmp/connector-versions/ directory that later scripts read from.
// Usage: node scripts/commit_connectors.mjs
// Exit codes:
//   0  one or more drafts promoted
//   1  no drafts found (tmp/connector-choices/ missing or empty)

import { copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { env, exit, stderr, stdout } from 'node:process';
import { mkdirp, isDir } from '../lib/fsx.mjs';

const choicesDir = env.CONNECTOR_CHOICES_DIR && env.CONNECTOR_CHOICES_DIR !== ''
  ? env.CONNECTOR_CHOICES_DIR
  : join('tmp', 'connector-choices');
const versionsDir = env.CONNECTOR_VERSIONS_DIR && env.CONNECTOR_VERSIONS_DIR !== ''
  ? env.CONNECTOR_VERSIONS_DIR
  : join('tmp', 'connector-versions');

if (!isDir(choicesDir)) {
  stderr.write(`No drafts directory at ${choicesDir}.\n`);
  stderr.write('Run pick_connector.sh for each connector in Step 3 before committing.\n');
  exit(1);
}

// Consider only regular files ending in .json; directory/symlink entries that
// happen to match are skipped.
const drafts = readdirSync(choicesDir)
  .filter((name) => name.endsWith('.json'))
  .filter((name) => {
    try { return statSync(join(choicesDir, name)).isFile(); } catch { return false; }
  });

if (drafts.length === 0) {
  stderr.write(`No drafts in ${choicesDir}.\n`);
  stderr.write('Run pick_connector.sh for each connector in Step 3 before committing.\n');
  exit(1);
}

mkdirp(versionsDir);

const names = [];
for (const base of drafts) {
  copyFileSync(join(choicesDir, base), join(versionsDir, base));
  names.push(base.slice(0, -'.json'.length));
}

// Sort for a stable summary line.
names.sort();

stdout.write(`Committed ${drafts.length} connector pin(s): ${names.join(' ')}\n`);
stdout.write(`From: ${choicesDir}\n`);
stdout.write(`To:   ${versionsDir}\n`);
