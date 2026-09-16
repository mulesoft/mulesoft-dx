#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Phase E helper — promote every `<nick>-new` draft in
// tmp/connector-choices/ to tmp/connector-versions/<nick>.json. Strips a
// trailing `-new` so the canonical tmp/connector-versions/<nick>.json path
// is fed correctly.
//
// Usage:
//   node scripts/promote_new_connector_pins.mjs
//
// Exit code: 0 promoted at least one, 1 no drafts found.
import { argv, exit, env, stderr, stdout } from 'node:process';
import { copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { mkdirp, isDir } from '../lib/fsx.mjs';

const choicesDir = env.CONNECTOR_CHOICES_DIR || 'tmp/connector-choices';
const versionsDir = env.CONNECTOR_VERSIONS_DIR || 'tmp/connector-versions';

if (!isDir(choicesDir)) {
  stderr.write(`❌ no drafts directory at ${choicesDir}\n`);
  stderr.write('   write tmp/connector-choices/<nick>-new.json (Step 6.5) first\n');
  exit(1);
}

let newDrafts;
try {
  newDrafts = readdirSync(choicesDir)
    .filter((f) => f.endsWith('-new.json'))
    .sort()
    .map((f) => path.join(choicesDir, f));
} catch (e) {
  stderr.write(`❌ failed to list ${choicesDir}: ${e.message}\n`);
  exit(1);
}

if (newDrafts.length === 0) {
  stderr.write(`❌ no *-new.json drafts in ${choicesDir}\n`);
  stderr.write('   write tmp/connector-choices/<nick>-new.json (Step 6.5) first\n');
  exit(1);
}

mkdirp(versionsDir);

const names = [];
for (const draft of newDrafts) {
  const base = path.basename(draft);
  let stem = base.slice(0, -'.json'.length);
  if (stem.endsWith('-new')) stem = stem.slice(0, -'-new'.length);
  copyFileSync(draft, path.join(versionsDir, `${stem}.json`));
  names.push(stem);
}
names.sort();

stdout.write(`✅ promoted ${newDrafts.length} pin(s): ${names.join(' ')}\n`);
stdout.write(`   from: ${choicesDir}\n`);
stdout.write(`   to:   ${versionsDir} (basename with -new stripped)\n`);
exit(0);
