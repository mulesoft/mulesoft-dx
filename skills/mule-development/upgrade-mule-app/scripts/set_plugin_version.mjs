#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 3c helper (Case B) — deterministically set a plugin's LITERAL <version>
// in pom.xml, in place. Use this when the mule-maven-plugin version is hardcoded
// (e.g. <version>3.4.0</version>) rather than a ${property}: the -D command-line
// override cannot change a literal, so the element must be edited to make the
// baseline build run on a Maven-3.9-compatible MMP.
//
// Matches the plugin block by artifactId (+ groupId when the block declares one),
// so POMs with multiple plugin blocks (build/plugins + pluginManagement) are safe
// — only the matched plugin's <version> is rewritten, never a bare <version>
// elsewhere. Whitespace/tabs inside the block are irrelevant. A ${property}
// version is a no-op skip (that is the -D path, handled on the command line).
//
// Usage:
//   node scripts/set_plugin_version.mjs <artifactId> <version> [<project-dir>] [--group-id <gid>]
//   e.g. set_plugin_version.mjs mule-maven-plugin 4.10.1 . --group-id org.mule.tools.maven
//
// Exit 0 when a version was written OR the block was already at the target
// (no-op); exit 1 when the plugin/pom was not found or an error occurred. Step 3c
// callers should revert the pom after the throwaway baseline build regardless.
import { argv, exit, stderr, stdout } from 'node:process';
import path from 'node:path';
import { editPluginVersion } from '../lib/pom-edit.mjs';

const positional = [];
let groupId;
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--group-id') { groupId = argv[++i]; continue; }
  positional.push(a);
}
const [artifactId, version, rawProjectDir] = positional;

if (!artifactId || !version) {
  stderr.write(`Usage: ${path.basename(argv[1])} <artifactId> <version> [<project-dir>] [--group-id <gid>]\n`);
  stderr.write('  e.g. set_plugin_version.mjs mule-maven-plugin 4.10.1 . --group-id org.mule.tools.maven\n');
  exit(1);
}
const projectDir = rawProjectDir || '.';

const log = [];
editPluginVersion(path.join(projectDir, 'pom.xml'), { groupId, artifactId, version }, log);
stdout.write(JSON.stringify({ artifactId, version, groupId: groupId || null, edits: log }, null, 2) + '\n');

const entry = log[0] || {};
exit(entry.status === 'ok' || entry.status === 'no-op' ? 0 : 1);
