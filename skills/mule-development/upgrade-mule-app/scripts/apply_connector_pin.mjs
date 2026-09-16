#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Phase D.6 helper — deterministic connector version + XSD bump.
// Reads:
//   tmp/connector-choices/<nick>-new.json     (NEW GAV)
//   tmp/connector-metadata/<nick>-new.json    (namespace metadata)
// Rewrites:
//   pom.xml — <version> for matching groupId+artifactId
//   src/main/mule/*.xml — xsi:schemaLocation pairs for the connector namespace
//
// Usage:
//   node scripts/apply_connector_pin.mjs <nickname> [<project-dir>]
//
// Exit 0 on success.
import { argv, exit, stderr, stdout } from 'node:process';
import path from 'node:path';
import { readJson, isFile } from '../lib/fsx.mjs';
import { editPomDependency, editFlowXsdUrls } from '../lib/pom-edit.mjs';

/** @param {string} s @returns {boolean} */
function isUnsafeSegment(s) {
  return !s || s.includes('/') || s.includes('\\') || s.includes('..');
}

/** True when an editPomDependency error reason is the expected "the version
 *  lives in an ancestor POM" miss (inherited dep absent from the child, or a
 *  version-less child dep managed by an ancestor's <dependencyManagement>) —
 *  NOT a genuine write failure. @param {string=} reason @returns {boolean} */
function isAncestorOwnedMiss(reason) {
  if (!reason) return false;
  return / not found$/.test(reason) || /missing <version> element$/.test(reason);
}

/** The Step-5 ownership for this connector, read from tmp/connectors.json
 *  (matched by nick, else by groupId:artifactId). A connector is ancestor-owned
 *  in TWO shapes: (a) `resolvedFrom` is "parent"/"ancestor" — declared in an
 *  ancestor's <dependencies>, absent from the child; (b) `resolvedFrom` is
 *  "child" but `versionManagedIn` points at an ancestor POM — declared
 *  version-less in the child, version managed by an ancestor's
 *  <dependencyManagement>. Both mean the child writer legitimately can't edit a
 *  version. Returns { owner } where owner is a human label of the owning POM, or
 *  null when the connector is child-owned / the file is absent / not found — in
 *  which case the caller keeps the raw edit status. @returns {{owner:string}|null} */
function ancestorOwner(projectDir, nick, gav) {
  const file = path.join(projectDir, 'tmp', 'connectors.json');
  if (!isFile(file)) return null;
  let data;
  try {
    data = readJson(file);
  } catch {
    return null;
  }
  const list = data.connectors || [];
  const hit =
    list.find((c) => c.nick === nick) ||
    list.find((c) => c.groupId === gav.groupId && c.artifactId === gav.assetId);
  if (!hit) return null;
  // Label the owning POM as "<dir>/<file>" (e.g. parent/pom.xml) — a bare
  // basename is ambiguous since every ancestor POM is named pom.xml.
  const managedIn = hit.versionManagedIn
    ? path.join(path.basename(path.dirname(hit.versionManagedIn)), path.basename(hit.versionManagedIn))
    : null;
  if (hit.resolvedFrom && hit.resolvedFrom !== 'child') return { owner: managedIn || hit.resolvedFrom };
  if (managedIn) return { owner: managedIn };
  return null; // child-owned — a miss here is a real failure
}

const [, , nickname, rawProjectDir] = argv;
if (!nickname) {
  stderr.write(`Usage: ${path.basename(argv[1])} <nickname> [<project-dir>]\n`);
  stderr.write('  e.g. apply_connector_pin.mjs s3\n');
  exit(1);
}
if (isUnsafeSegment(nickname)) {
  stderr.write(`❌ unsafe nickname: ${nickname}\n`);
  exit(1);
}
const projectDir = rawProjectDir || '.';

const choiceFile = path.join(projectDir, 'tmp/connector-choices', `${nickname}-new.json`);
const metadataFile = path.join(projectDir, 'tmp/connector-metadata', `${nickname}-new.json`);

if (!isFile(choiceFile)) {
  stderr.write(`❌ missing ${choiceFile} — run Phase C to write connector choices\n`);
  exit(1);
}

let gav;
// metadata is OPTIONAL: pom-only connectors (no flow usage, so no Mode-A describe)
// get a choices file but no metadata file. editFlowXsdUrls is null-safe and no-ops
// the XSD rewrite when metadata is null — the pom <version> bump only needs the GAV.
let metadata = null;
try {
  gav = readJson(choiceFile);
} catch (e) {
  stderr.write(`❌ failed to parse ${choiceFile}: ${e.message}\n`);
  exit(1);
}
if (isFile(metadataFile)) {
  try {
    metadata = readJson(metadataFile);
  } catch (e) {
    stderr.write(`❌ failed to parse ${metadataFile}: ${e.message}\n`);
    exit(1);
  }
}

const pomLog = [];
const xsdLog = [];

editPomDependency(path.join(projectDir, 'pom.xml'), gav, pomLog);
editFlowXsdUrls(projectDir, nickname, metadata, xsdLog);

// Provenance-aware reinterpretation. editPomDependency edits the CHILD pom.xml
// only; it has no chain awareness, so a connector whose version lives in an
// ancestor POM surfaces as a raw edit miss ("dependency … not found" for an
// inherited dep, or "missing <version> element" for a version-less child dep
// managed by an ancestor's <dependencyManagement>). Both are the EXPECTED path —
// those bumps are owned by apply_parent_pom_fork.mjs --phase=edit — not failures.
// Relabel them `deferred-to-parent` using the Step-5 provenance so `status:error`
// stays reserved for a genuine child-owned write failure that must halt Step 14.
const owned = ancestorOwner(projectDir, nickname, gav);
if (owned) {
  for (const entry of pomLog) {
    if (entry.status === 'error' && isAncestorOwnedMiss(entry.reason)) {
      entry.status = 'deferred-to-parent';
      entry.ownedBy = owned.owner;
      entry.note =
        `version is managed by an ancestor POM (${owned.owner}); ` +
        `bumped by apply_parent_pom_fork.mjs --phase=edit, not the child writer`;
      delete entry.reason;
    }
  }
}

const summary = {
  nick: nickname,
  pom_edits: pomLog,
  xsd_edits: xsdLog,
};
stdout.write(JSON.stringify(summary, null, 2) + '\n');
exit(0);
