#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 11.5 gate — verify Mode-A/B/C metadata coverage before Step 12
// plan synthesis. Runs deterministically; no LLM. Includes the
// empty-connectionProviders fallback for degraded describes.
//
// Usage:
//   node scripts/verify_metadata_coverage.mjs [--strict]
//
// Exit codes: 0 clean, 1 missing (or --strict warn), 2 no usage files.
import { argv, exit, env, stderr, stdout } from 'node:process';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { isDir, isFile, readJsonOrNull } from '../lib/fsx.mjs';
import { computeCoverageRows } from '../lib/metadata-coverage.mjs';

const strict = argv.slice(2).includes('--strict');

const usageDir = env.CONNECTOR_USAGE_DIR || 'tmp/connector-usage';
const metadataDir = env.CONNECTOR_METADATA_DIR || 'tmp/connector-metadata';

if (!isDir(usageDir)) {
  stderr.write(`❌ ${usageDir} does not exist — run enumerate_usage.mjs (Step 7) first\n`);
  exit(2);
}

let usageFiles;
try {
  usageFiles = readdirSync(usageDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(usageDir, f));
} catch (e) {
  stderr.write(`❌ failed to list ${usageDir}: ${e.message}\n`);
  exit(2);
}
if (usageFiles.length === 0) {
  stderr.write(`❌ no usage files in ${usageDir} — run enumerate_usage.mjs (Step 7) first\n`);
  exit(2);
}

let missing = 0;
let warns = 0;
let infoCount = 0;
const report = [];

for (const usageFile of usageFiles) {
  const nick = path.basename(usageFile, '.json');
  const usage = readJsonOrNull(usageFile);
  if (!usage) {
    report.push(`FAIL  ${nick} — could not parse ${usageFile}`);
    missing += 1;
    continue;
  }

  if (usage.status === 'not_in_use') {
    report.push(`INFO  ${nick} — not_in_use, skipping`);
    infoCount += 1;
    continue;
  }

  const modeAPath = path.join(metadataDir, `${nick}-new.json`);
  if (!isFile(modeAPath)) {
    report.push(`FAIL  ${nick} — missing Mode-A: ${modeAPath}`);
    missing += 1;
    continue;
  }
  const modeA = readJsonOrNull(modeAPath);
  if (!modeA) {
    report.push(`FAIL  ${nick} — could not parse ${modeAPath}`);
    missing += 1;
    continue;
  }

  for (const row of computeCoverageRows({ nick, usage, modeA, metadataDir })) {
    if (row.level === 'WARN') { report.push(row.text); warns += 1; continue; }
    if (row.level === 'INFO') { report.push(row.text); infoCount += 1; continue; }
    if (!isFile(row.path)) { report.push(row.missingText); missing += 1; }
  }
}

for (const row of report) stdout.write(`${row}\n`);
stdout.write('\n');
stdout.write(`Coverage: ${report.length} rows — ${missing} FAIL, ${warns} WARN, ${infoCount} INFO\n`);

if (missing > 0) {
  stderr.write('\n');
  stderr.write("❌ Metadata coverage incomplete — Step 12's plan will be blind on the FAIL rows above.\n");
  stderr.write('   Run `node scripts/describe_missing.mjs --phase bc` to describe the missing files, then re-run this gate.\n');
  exit(1);
}
if (strict && warns > 0) {
  stderr.write('\n');
  stderr.write('❌ --strict: WARN rows are not permitted (renamed/removed ops must be resolved via <nick>-op-renames.json before Step 12).\n');
  exit(1);
}

stdout.write('✅ metadata coverage complete\n');
exit(0);
