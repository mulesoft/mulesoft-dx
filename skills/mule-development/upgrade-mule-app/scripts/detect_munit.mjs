#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 11 gate — does the app use MUnit? When it does not, Step 11 skips the MUnit
// version lookup (11a) and the MUnit release-notes read (11b). See
// lib/munit-presence.mjs for the signals.
//
// Usage:
//   node detect_munit.mjs [projectDir]
//   Output: ${MUNIT_PRESENCE_FILE} or <projectDir>/tmp/munit-presence.json
//
// Output JSON: { hasMunit, pomSignals[], suites, poms[] }. Prints `hasMunit=true|false`.
// Exit code 0 always — the caller branches on hasMunit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { detectMunit } from '../lib/munit-presence.mjs';

process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });

const projectDir = resolve(process.argv[2] || process.cwd());
const outPath = process.env.MUNIT_PRESENCE_FILE || join(projectDir, 'tmp', 'munit-presence.json');
const result = detectMunit(projectDir);
try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));
} catch (e) {
  process.stderr.write(`⚠️  Failed to write ${outPath}: ${e.message}\n`);
}
process.stdout.write(`hasMunit=${result.hasMunit}\n`);
