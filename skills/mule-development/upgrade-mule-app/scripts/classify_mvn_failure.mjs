#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Classify a FAILED mvn run by whose credential was rejected, so Step 16/17 can
// stop on a credential problem instead of spending a code/test-fix retry on it.
//
// Usage: node scripts/classify_mvn_failure.mjs <mvn-log-file>
// Output JSON (stdout): { kind, repoId, url, artifact, hint }
//   kind: 'mulesoft-ee-auth' | 'exchange-auth' | 'other-repo-auth' | 'none'
// Exit code is always 0 for a readable log (the answer is in `kind`).
import { readFileSync } from 'node:fs';
import { classifyMavenFailure } from '../lib/maven-settings.mjs';

const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: classify_mvn_failure.mjs <mvn-log-file>\n');
  process.exit(2);
}
let text;
try {
  text = readFileSync(file, 'utf8');
} catch (e) {
  process.stderr.write(`cannot read ${file}: ${e.message}\n`);
  process.exit(2);
}
process.stdout.write(JSON.stringify(classifyMavenFailure(text)) + '\n');
