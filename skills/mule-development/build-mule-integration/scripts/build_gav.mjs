#!/usr/bin/env node
// build_gav — read a connector JSON file produced by get_latest_connector.mjs
// and print its groupId:assetId:version on stdout.
// Usage: node scripts/build_gav.mjs <connector-json-file>
// Exit codes:
//   0  GAV emitted
//   1  missing/invalid connector JSON

import { argv, stderr, stdout, exit } from 'node:process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const file = argv[2];

if (!file || !existsSync(file) || !statSync(file).isFile()) {
    stderr.write(`Usage: ${argv[1]} <connector-json-file>\n`);
    stderr.write(`  e.g. ${argv[1]} tmp/connector-versions/sfdc.json\n`);
    exit(1);
}

let data;
try {
    data = JSON.parse(readFileSync(file, 'utf8'));
} catch {
    stderr.write(`❌ ${file} is not a valid connector JSON (expected {groupId, assetId, version})\n`);
    exit(1);
}

const { groupId, assetId, version } = data ?? {};
// Fast-fail on a missing/empty field so downstream callers never act on a
// bogus GAV.
if (
    typeof groupId !== 'string' || groupId === '' ||
    typeof assetId !== 'string' || assetId === '' ||
    typeof version !== 'string' || version === ''
) {
    stderr.write(`❌ ${file} is not a valid connector JSON (expected {groupId, assetId, version})\n`);
    exit(1);
}

stdout.write(`${groupId}:${assetId}:${version}\n`);
