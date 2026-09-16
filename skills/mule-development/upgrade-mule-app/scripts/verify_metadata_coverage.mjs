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

/** Extract .name from either a string entry or {name} object. @param {any} entry @returns {string} */
function opName(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return String(entry.name || '');
  return '';
}

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

  const modeAOps = (Array.isArray(modeA.operations) ? modeA.operations : []).map(opName).filter(Boolean);
  const modeASrcs = (Array.isArray(modeA.sources) ? modeA.sources : []).map(opName).filter(Boolean);

  // --- Mode-B ops ---
  const opsUsed = Array.isArray(usage.operations_used) ? usage.operations_used : [];
  for (const op of opsUsed) {
    if (!op) continue;
    if (!modeAOps.includes(op)) {
      report.push(`WARN  ${nick}/${op} — op not in Mode-A .operations[] (rename or removed; check <nick>-op-renames.json)`);
      warns += 1;
      continue;
    }
    const modeBPath = path.join(metadataDir, `${nick}-new-${op}.json`);
    if (!isFile(modeBPath)) {
      report.push(`FAIL  ${nick}/${op} — missing Mode-B: ${modeBPath}`);
      missing += 1;
    }
  }

  // --- Mode-B sources ---
  const srcsUsed = Array.isArray(usage.sources_used) ? usage.sources_used : [];
  for (const src of srcsUsed) {
    if (!src) continue;
    if (!modeASrcs.includes(src)) {
      report.push(`WARN  ${nick}/${src} — source not in Mode-A .sources[]`);
      warns += 1;
      continue;
    }
    const modeBPath = path.join(metadataDir, `${nick}-new-${src}.json`);
    if (!isFile(modeBPath)) {
      report.push(`FAIL  ${nick}/${src} — missing Mode-B (source): ${modeBPath}`);
      missing += 1;
    }
  }

  // --- Mode-C providers ---
  // Driven from Mode-A .configs[], per SKILL.md Step 7 (Mode-C),
  // in lockstep with the Step 7 fan-out loop (SKILL.md). The pre-fix gate joined
  // usage.configs_used[] / config_providers_used[] (flow-instance config-ref
  // values + camelCase child names) against Mode-A SDK names — those never
  // matched, so declaredProviders was always [], the FAIL branch was
  // unreachable, and the gate passed green while zero Mode-C files existed
  // (Phase C then missed reparenting like db's <pooling-profile> and the first
  // mvn broke). Now: require a Mode-C file for every (config, provider) pair the
  // fan-out is expected to describe. --config-name is .configs[].name and --name
  // is the .connectionProviders[] entry — identical tokens to the fan-out, so
  // the reconstructed filename matches what describe_connector.mjs wrote.
  const modeAConfigs = Array.isArray(modeA.configs) ? modeA.configs : [];

  for (const cfg of modeAConfigs) {
    // Fan-out passes `--config-name "$cfg.name"`; mirror that exactly (name
    // first, elementName only as a defensive fallback).
    const configName = (cfg && typeof cfg === 'object') ? String(cfg.name || cfg.elementName || '') : '';
    if (!configName) continue;

    const declaredProviders = (cfg && Array.isArray(cfg.connectionProviders))
      ? cfg.connectionProviders
        .map((cp) => (typeof cp === 'string' ? cp : String((cp && (cp.name || cp.elementName)) || '')))
        .filter(Boolean)
      : [];

    if (declaredProviders.length === 0) {
      // Empty connectionProviders[] — Mode-C is un-runnable here (D7 fallback);
      // Phase C reads Mode-A .configs[] directly. Non-fatal.
      report.push(`INFO  ${nick}/${configName} — no providers declared in Mode-A (Phase C reads .configs[] directly)`);
      infoCount += 1;
      continue;
    }

    for (const prov of declaredProviders) {
      const modeCPath = path.join(metadataDir, `${nick}-new-${configName}-${prov}.json`);
      if (!isFile(modeCPath)) {
        report.push(`FAIL  ${nick}/${configName}/${prov} — missing Mode-C: ${modeCPath}`);
        missing += 1;
      }
    }
  }
}

for (const row of report) stdout.write(`${row}\n`);
stdout.write('\n');
stdout.write(`Coverage: ${report.length} rows — ${missing} FAIL, ${warns} WARN, ${infoCount} INFO\n`);

if (missing > 0) {
  stderr.write('\n');
  stderr.write("❌ Metadata coverage incomplete — Step 12's plan will be blind on the FAIL rows above.\n");
  stderr.write('   Re-run describe_connector.mjs for the missing (op, provider) pairs before proceeding.\n');
  exit(1);
}
if (strict && warns > 0) {
  stderr.write('\n');
  stderr.write('❌ --strict: WARN rows are not permitted (renamed/removed ops must be resolved via <nick>-op-renames.json before Step 12).\n');
  exit(1);
}

stdout.write('✅ metadata coverage complete\n');
exit(0);
