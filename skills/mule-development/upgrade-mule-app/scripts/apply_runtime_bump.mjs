#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Phase D.5 helper — deterministic Mule runtime + Java bumps to pom.xml
// and mule-artifact.json. Reads tmp/upgrade-targets.json (Phase A).
//
// Version rewrites only — does NOT run java. The build is pinned to the
// ACB-resolved target JDK via the inline `JAVA_HOME=... mvn` prefix (Step 16),
// mirroring the baseline build; there is no separate JDK guard here.
//
// Exit 0 on success, 1 for missing/malformed inputs.
//
// Usage:
//   node scripts/apply_runtime_bump.mjs [<project-dir>]
import { argv, exit, env, stderr, stdout } from 'node:process';
import path from 'node:path';
import { readJson, isFile } from '../lib/fsx.mjs';
import {
  editPomRuntime,
  editMuleArtifact,
  editMunitVersion,
  editMunitRuntimeVersion,
} from '../lib/pom-edit.mjs';

const projectDir = argv[2] || '.';

const targetsFile = env.UPGRADE_TARGETS_FILE || 'tmp/upgrade-targets.json';

if (!isFile(targetsFile)) {
  stderr.write(`❌ missing ${targetsFile} — write this in Phase A of the skill\n`);
  exit(1);
}

let targets;
try {
  targets = readJson(targetsFile);
} catch (e) {
  stderr.write(`❌ failed to parse ${targetsFile}: ${e.message}\n`);
  exit(1);
}

const targetMule = targets?.mule?.to;
const targetJava = targets?.java?.to;
if (!targetMule || !targetJava) {
  stderr.write(`❌ ${targetsFile} is missing mule.to or java.to\n`);
  exit(1);
}

// Latest MMP version resolved live from Maven metadata in Step 11a and written
// into upgrade-targets by the agent. Optional: when absent, editPomRuntime leaves
// <mule.maven.plugin.version> untouched (and warns).
const targetMmp = targets?.muleMavenPlugin?.to || null;
if (!targetMmp) {
  stderr.write(
    `⚠️  ${targetsFile} has no muleMavenPlugin.to — resolve the latest MMP (Step 11a) and add it, ` +
    `or <mule.maven.plugin.version> will be left unchanged.\n`
  );
}

// Latest MUnit resolved live in Step 11a and written back by the agent. Optional:
// when absent, editMunitVersion leaves the MUnit version sites untouched (and warns).
const targetMunit = targets?.munit?.to || null;
if (!targetMunit) {
  stderr.write(
    `⚠️  ${targetsFile} has no munit.to — resolve the latest MUnit (Step 11a) and add it, ` +
    `or the MUnit versions (property/plugin/dependencies) will be left unchanged.\n`
  );
}

const log = [];
editPomRuntime(path.join(projectDir, 'pom.xml'), targetMule, targetJava, targetMmp, log);
editMunitVersion(path.join(projectDir, 'pom.xml'), targetMunit, log);
// Pin MUnit's embedded test runtime to <app.runtime> so it doesn't fall back to
// the x.y.0 minMuleVersion floor (which would boot an older runtime and fail
// JAVA_25-annotated connectors). Runs regardless of whether a MUnit version was
// supplied, since the pin is about the runtime, not the plugin version. When the
// pin already exists as a ${prop} reference (e.g. ${munit.runtime}), that property
// is bumped to the target runtime; a literal pin is left untouched.
editMunitRuntimeVersion(path.join(projectDir, 'pom.xml'), targetMule, log);
editMuleArtifact(path.join(projectDir, 'mule-artifact.json'), targetMule, targetJava, log);

const summary = {
  targets: {
    mule: targetMule,
    java: targetJava,
    mule_maven_plugin: targetMmp,
    munit: targetMunit,
  },
  applied: log,
};
stdout.write(JSON.stringify(summary, null, 2) + '\n');

exit(0);
