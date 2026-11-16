#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 8 gate — decide deterministically whether the upgrade crosses a Java
// version boundary, BEFORE any custom-Java source is read. Compares `java.from`
// and `java.to` in tmp/upgrade-targets.json (written by Step 6.5b).
//
// Usage:
//   node java_boundary.mjs [projectDir]
//   Input:  ${UPGRADE_TARGETS_FILE} or <projectDir>/tmp/upgrade-targets.json
//   Output: ${JAVA_BOUNDARY_FILE} or <projectDir>/tmp/java-boundary.json
//
// Output JSON: { from, to, crosses, verdict: 'run'|'skip'|'unknown', reason }.
// Prints one line, `Step 8: <reason>`. Exit code 0 always — the caller branches on
// `verdict`: skip → run no other Step 8 command; run or unknown → do Step 8.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { javaBoundary } from '../lib/java-boundary.mjs';

process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

const projectDir = resolve(process.argv[2] || process.cwd());
const inPath = process.env.UPGRADE_TARGETS_FILE || join(projectDir, 'tmp', 'upgrade-targets.json');
const outPath = process.env.JAVA_BOUNDARY_FILE || join(projectDir, 'tmp', 'java-boundary.json');

let targets = {};
if (existsSync(inPath)) {
  try { targets = JSON.parse(readFileSync(inPath, 'utf8')); } catch { /* verdict becomes unknown */ }
}
const result = javaBoundary(targets?.java?.from, targets?.java?.to);

try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));
} catch (e) {
  process.stderr.write(`⚠️  Failed to write ${outPath}: ${e.message}\n`);
}
process.stdout.write(`Step 8: ${result.reason}\nverdict=${result.verdict}\n`);
