#!/usr/bin/env node
// write_mule_artifact_env — set minMuleVersion and javaSpecificationVersions in
// a project's mule-artifact.json from the validated runtime and Java version,
// so the artifact descriptor matches the environment the project was validated
// against. Other keys in the descriptor are preserved (existing keys updated in
// place, new keys appended).
//
// Reads tmp/mule-dev-env.json (or the env-json argument), which carries
// {"mule_version": "...", "java_version": "..."}.
//
// Usage:
//   node scripts/write_mule_artifact_env.mjs <project-dir>
//   node scripts/write_mule_artifact_env.mjs <project-dir> tmp/mule-dev-env.json
// Exit codes:
//   0  mule-artifact.json updated with the resolved runtime and Java version
//   1  bad arguments, missing env cache, missing/empty resolved values, or
//      missing project mule-artifact.json

import { join } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { isFile, readJson, writeJson } from '../lib/fsx.mjs';

const args = argv.slice(2);
const projectDir = args[0] ?? '';
const envFile = args[1] && args[1] !== '' ? args[1] : join('tmp', 'mule-dev-env.json');

if (projectDir === '') {
  stderr.write('❌ usage: write_mule_artifact_env.mjs <project-dir> [env-json]\n');
  exit(1);
}

if (!isFile(envFile)) {
  stderr.write(`❌ ${envFile} not found. Did you run validate_prerequisites?\n`);
  exit(1);
}

const artifactPath = join(projectDir, 'mule-artifact.json');
if (!isFile(artifactPath)) {
  stderr.write(`❌ ${artifactPath} not found. Run this after 'dx mule project create'.\n`);
  exit(1);
}

const envCache = readJson(envFile);
const muleVersion = typeof envCache?.mule_version === 'string' ? envCache.mule_version : '';
const javaVersion = typeof envCache?.java_version === 'string' ? envCache.java_version : '';

// Reduce a possibly-dotted java version ("17.0.13") to its major ("17") —
// mule-artifact.json's javaSpecificationVersions uses the major only.
const javaMajor = javaVersion.split('.')[0] ?? '';

if (muleVersion === '') {
  stderr.write(
    `❌ mule_version is empty in ${envFile}. No runtime was detected; cannot update mule-artifact.json.\n`
  );
  exit(1);
}

if (javaMajor === '') {
  stderr.write(`❌ java_version is empty in ${envFile}. Cannot update mule-artifact.json.\n`);
  exit(1);
}

// Merge into the existing descriptor so any scaffolder keys (name,
// requiredProduct, classLoaderModelLoaderDescriptor, ...) are preserved.
// Mutating in place keeps existing-key positions and appends new keys at the end.
const artifact = readJson(artifactPath);
artifact.minMuleVersion = muleVersion;
artifact.javaSpecificationVersions = [javaMajor];
writeJson(artifactPath, artifact);

stdout.write(
  `✅ Updated ${artifactPath} → minMuleVersion=${muleVersion}, javaSpecificationVersions=["${javaMajor}"]\n`
);
