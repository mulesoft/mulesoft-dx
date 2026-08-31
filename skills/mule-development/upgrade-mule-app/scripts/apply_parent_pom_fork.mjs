#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Fork the ancestor POM chain so version bumps that are OWNED by a parent/
// grandparent land in the POM that actually owns them, without mutating a shared
// artifact in place. Split into two phases so the fork's own-<version> bump happens
// only AFTER a green build:
//
//   --phase=edit  (Step 14, default): bump the connector/runtime versions each
//     owning ancestor manages, IN PLACE. The ancestor's own <version> is left
//     untouched, so the child's existing <parent><version> still matches and the
//     local build resolves the new versions via <relativePath>. This is what the
//     Step 16/17 build validates.
//   --phase=fork  (Step 18, after a green build + operator confirmation): bump each
//     owning ancestor's own <version> (the fork) and repoint the downstream
//     <parent><version>, deepest-first. No Exchange publish — purely local edits.
//
// The read side (extract_connectors.mjs, Step 5) already walks the full local
// ancestor chain and records, per connector, `resolvedFrom` (child/parent/
// ancestor) and `versionManagedIn` (the POM path whose <dependencyManagement>
// carries the version). This script is the WRITE-side counterpart: for every
// LOCAL ancestor that owns a CONNECTOR version, it
//   1. bumps every connector version that ancestor owns, following ${property} refs;
//   2. forks that ancestor — bumps the ancestor's OWN <version>;
//   3. repoints the downstream POM's <parent><version> to the fork.
// Processed deepest-first (grandparent before parent) so a child->parent->
// grandparent chain re-links cleanly: grandparent forked -> parent's <parent>
// repointed -> parent forked -> child's <parent> repointed.
//
// SCOPE: connectors ONLY. app.runtime / mule.maven.plugin.version / Java props
// are app-scoped decisions, NOT shared-BOM versions — they are always written to
// the CHILD by apply_runtime_bump.mjs (insert-if-absent when a property lives only
// in an ancestor; Maven nearest-wins makes the child override effective without
// touching the shared ancestor). This script never forks an ancestor for them.
//
// Fork, not in-place edit: the edited ancestor becomes a NEW version that ONLY
// the upgraded app repoints to. Every other app still references the OLD ancestor
// version and keeps its old connectors/runtime — sidestepping the shared-BOM
// blast radius.
//
// Connector scope in a forked ancestor: ALL functional connectors declared in
// that ancestor are bumped to their resolved target (not just the subset this app
// resolves), per the fork policy — but only those with a target in
// target-connectors.json; a connector with no resolved target is reported and left
// unchanged. Test-scoped mule-plugins (MUnit tooling) are NOT connectors — they
// are excluded from this scan and upgraded child-only via the MUnit path.
//
// Preconditions handled upstream: a remote-only owning ancestor is a hard stop at
// Step 1 (parent-missing gate) / Step 5 (parentDeclaredButMissing). This script
// operates only on POMs present on the local filesystem.
//
// Inputs (all under <projectDir>/tmp, all produced by earlier steps — offline):
//   connectors.json         Step 5  — provenance (resolvedFrom, versionManagedIn)
//   target-connectors.json  Step 6  — NEW target version per nick
//
// Usage:
//   node scripts/apply_parent_pom_fork.mjs [<child-project-dir>] [--phase=edit|fork] [--fork-bump=minor|major|patch] [--dry-run]
//   Default child-project-dir = cwd; default phase = edit; default fork bump = minor.
//   --fork-bump only applies to --phase=fork.
//
// Output JSON (file): tmp/parent-pom-<phase>[-dryrun].json — { childPomPath, phase,
//   forkBump, dryRun, ancestorsForked[], edits[], backedUp[], verify{}, warnings[] };
//   each ancestorsForked[] entry is { pomPath, depth, artifactId, ownVersion:{from,to},
//   connectors[], repointedIn }. backedUp[] lists the ancestor POMs snapshotted
//   pristine this run (edit phase only, create-if-absent — see snapshotAncestor).
//   Stdout gets a short summary only.
//   Exit 0 on success / no-op / dry-run; exit 1 only when verify fails or inputs
//   are missing/bad (a no-op — no ancestor owns a connector — exits 0).

import { argv, exit, env, stdout, stderr } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, isFile, mkdirp, writeJson } from '../lib/fsx.mjs';
import {
  bumpDependencyVersionSites,
  bumpOwnVersion,
  repointParentVersion,
} from '../lib/pom-edit.mjs';
import {
  parseXml,
  child,
  children,
  textOf,
  projectOf,
  extractProperties,
  resolveValue,
  findParentPomPath,
  findManagedVersion,
  readPomProject,
} from './_pom_utils.mjs';

const MULE_PLUGIN_CLASSIFIER = 'mule-plugin';

// ---- args -----------------------------------------------------------------
let projectDir = '.';
let forkBump = 'minor';
let phase = 'edit';
let dryRun = false;
for (const a of argv.slice(2)) {
  if (a === '--dry-run') dryRun = true;
  else if (a.startsWith('--fork-bump=')) forkBump = a.slice('--fork-bump='.length);
  else if (a.startsWith('--phase=')) phase = a.slice('--phase='.length);
  else if (!a.startsWith('--')) projectDir = a;
}
if (!['edit', 'fork'].includes(phase)) {
  stderr.write(`❌ --phase must be one of edit|fork (got ${phase})\n`);
  exit(1);
}
if (!['major', 'minor', 'patch'].includes(forkBump)) {
  stderr.write(`❌ --fork-bump must be one of major|minor|patch (got ${forkBump})\n`);
  exit(1);
}
projectDir = path.resolve(projectDir);

// ---- helpers --------------------------------------------------------------

/** Bump a semver-ish `x.y.z[-q]` string by the chosen level, dropping any
 *  qualifier. Non-semver input falls back to appending `-fork`. */
function bumpVersion(v, level) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return `${v}-fork`;
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (level === 'major') { maj += 1; min = 0; pat = 0; }
  else if (level === 'minor') { min += 1; pat = 0; }
  else { pat += 1; }
  return `${maj}.${min}.${pat}`;
}

/** Every FUNCTIONAL mule-plugin dependency declared directly in one project's
 *  <dependencies> OR <dependencyManagement>, with its groupId/artifactId. Used
 *  to apply the fork-wide "bump ALL connectors in this ancestor" policy.
 *  Test-scoped mule-plugins (MUnit tooling: munit-runner/munit-tools) are
 *  EXCLUDED — they are not functional connectors and are upgraded child-only via
 *  the MUnit path (editMunitVersion, tied to munit.version), never forked. This
 *  matches extract_connectors.mjs, which routes test-scoped mule-plugins to
 *  excluded[] so they never enter connectors[]. Without this guard an
 *  ancestor-declared munit-runner/munit-tools would surface here with no target
 *  and trigger a false "app-unused connector" warning. */
function declaredPluginDeps(project) {
  const out = [];
  const scan = (depsParent) => {
    if (!depsParent) return;
    for (const dep of children(depsParent, 'dependency')) {
      if (textOf(child(dep, 'classifier')) !== MULE_PLUGIN_CLASSIFIER) continue;
      if ((textOf(child(dep, 'scope')) || 'compile') === 'test') continue;
      out.push({ groupId: textOf(child(dep, 'groupId')), artifactId: textOf(child(dep, 'artifactId')) });
    }
  };
  scan(child(project, 'dependencies'));
  const dm = child(project, 'dependencyManagement');
  if (dm) scan(child(dm, 'dependencies'));
  return out;
}

// Pristine-snapshot directory + per-POM key. A base64url(absolute-pomPath) key
// is collision-free and lets pristineOwnVersion read back exactly what
// snapshotAncestor wrote — the two share this function so the keys can never drift.
const backupDir = path.join(projectDir, 'tmp', 'pom-backups');
function backupFileFor(pomPath) {
  return path.join(backupDir, Buffer.from(pomPath).toString('base64url') + '.pom');
}

/** Snapshot an ancestor POM to tmp/pom-backups/ BEFORE its first edit-phase write,
 *  CREATE-IF-ABSENT: an existing snapshot is never overwritten, so the pristine
 *  baseline survives an edit-phase re-run and is still pristine when the fork phase
 *  (Step 18) reads it. The script owns this — it backs up exactly the POMs it is
 *  about to mutate (the ancestors that own a connector), so the snapshot set can
 *  never drift from the edited set (the failure mode of scavenging paths out of a
 *  human-readable notes[] array). Enables two guarantees: a Step-16 build give-up
 *  can restore a pristine ancestor (never leave a SHARED POM dirty), and the fork
 *  <version> is computed from the original, not an already-forked value. */
function snapshotAncestor(pomPath) {
  const dest = backupFileFor(pomPath);
  if (isFile(dest)) return false; // already snapshotted — keep the pristine copy
  mkdirp(backupDir);
  fs.copyFileSync(pomPath, dest);
  return true;
}

/** The ancestor's PRISTINE own <version> — read from the edit-phase snapshot in
 *  tmp/pom-backups/ (see snapshotAncestor) if present, else from the live file. The
 *  fork <version> MUST be computed from this pristine baseline, not the current
 *  on-disk value: the edit phase leaves <version> untouched, but a re-run of the
 *  fork phase (or a --fork-bump change) would otherwise bump an ALREADY-forked
 *  version and climb 1.1.0 → 1.2.0 → …. Reading the snapshot makes the fork phase
 *  idempotent and lets --fork-bump be re-chosen without a manual restore. Returns
 *  the pristine own-version string, or null if unreadable. */
function pristineOwnVersion(pomPath, liveProject) {
  const backupFile = backupFileFor(pomPath);
  if (isFile(backupFile)) {
    try {
      const proj = projectOf(parseXml(fs.readFileSync(backupFile, 'utf8')));
      const v = textOf(child(proj, 'version')) || textOf(child(child(proj, 'parent'), 'version'));
      if (v) return v;
    } catch { /* fall through to live */ }
  }
  return textOf(child(liveProject, 'version')) || textOf(child(child(liveProject, 'parent'), 'version'));
}

// ---- load inputs ----------------------------------------------------------
const childPomPath = path.join(projectDir, 'pom.xml');
if (!isFile(childPomPath)) {
  stderr.write(`❌ no pom.xml at ${childPomPath}\n`);
  exit(1);
}

const connectorsFile = env.CONNECTORS_FILE || path.join(projectDir, 'tmp', 'connectors.json');
const targetConnectorsFile = env.TARGET_CONNECTORS_FILE || path.join(projectDir, 'tmp', 'target-connectors.json');

// Per-phase result file; dry-run gets its own name so it never clobbers a real run.
const resultFile = path.join(
  projectDir, 'tmp',
  `parent-pom-${phase}${dryRun ? '-dryrun' : ''}.json`,
);

const result = {
  childPomPath,
  phase,
  forkBump,
  dryRun,
  ancestorsForked: [],
  edits: [],
  backedUp: [], // ancestor POMs snapshotted pristine this run (edit phase, create-if-absent)
  verify: { checks: [], ok: true },
  warnings: [],
};

// Write the full result to tmp/ and print a short summary to stdout (never the blob).
function emit() {
  const dry = dryRun ? ' (dry-run)' : '';
  if (result.ancestorsForked.length) {
    stdout.write(`✅ ${phase} phase${dry}: ${result.ancestorsForked.length} ancestor(s)\n`);
    for (const a of result.ancestorsForked) {
      const ver = phase === 'fork' || dryRun ? ` ${a.ownVersion.from} → ${a.ownVersion.to}` : '';
      const changes = a.connectors;
      stdout.write(`   • ${a.artifactId}${ver}${changes.length ? ` — ${changes.join(', ')}` : ''}\n`);
    }
  } else {
    stdout.write(`ℹ️  ${phase} phase${dry}: no owning ancestor — nothing to do.\n`);
  }
  if (result.backedUp.length) {
    stdout.write(`   backed up ${result.backedUp.length} ancestor POM(s) pristine → ${path.relative(projectDir, backupDir) || backupDir}/\n`);
  }
  if (result.verify.checks.length) {
    stdout.write(`   verify: ${result.verify.ok ? 'OK' : 'FAILED'} (${result.verify.checks.length} check(s))\n`);
  }
  for (const w of result.warnings) stdout.write(`   ⚠️  ${w}\n`);
  try {
    mkdirp(path.dirname(resultFile));
    writeJson(resultFile, result);
    stdout.write(`Saved to ${resultFile}\n`);
  } catch (e) {
    stdout.write(`⚠️  Failed to write ${resultFile}: ${e.message}\n`);
  }
}

if (!isFile(connectorsFile)) {
  stderr.write(`❌ missing ${connectorsFile} — run Step 5 (extract_connectors.mjs) first\n`);
  exit(1);
}
const connectors = readJson(connectorsFile).connectors || [];

// target version per nick (Step 6). This script forks ancestors for CONNECTOR
// versions only; a missing file means there is nothing for it to do.
let targetByNick = new Map();
if (isFile(targetConnectorsFile)) {
  for (const c of (readJson(targetConnectorsFile).connectors || [])) {
    if (c.targetVersion) targetByNick.set(c.nick, c.targetVersion);
  }
} else {
  result.warnings.push(`${targetConnectorsFile} not found — connector target versions unavailable; nothing to fork.`);
}

// ---- build the local ancestor chain (nearest first) -----------------------
const childProject = readPomProject(childPomPath);
const chain = []; // { pomPath, project, depth }  depth 1 = direct parent
{
  let curProject = childProject;
  let curPath = childPomPath;
  const seen = new Set([childPomPath]);
  let depth = 0;
  while (true) {
    const nextPath = findParentPomPath(curProject, curPath);
    if (!nextPath || seen.has(nextPath)) break;
    seen.add(nextPath);
    let nextProject;
    try {
      nextProject = readPomProject(nextPath);
    } catch (e) {
      result.warnings.push(`Failed to read ancestor POM ${nextPath}: ${e.message}`);
      break;
    }
    depth += 1;
    chain.push({ pomPath: nextPath, project: nextProject, depth });
    curProject = nextProject;
    curPath = nextPath;
  }
}

// Map a POM path to its position so we know which downstream POM must repoint to
// it after a fork. downstreamOf[ancestorPath] = the POM that declares it as parent.
const downstreamOf = new Map();
{
  let prevPath = childPomPath;
  for (const a of chain) {
    downstreamOf.set(a.pomPath, prevPath);
    prevPath = a.pomPath;
  }
}

// ---- determine what each ancestor owns ------------------------------------
// For every ancestor (deepest first for correct re-linking), collect the
// CONNECTOR versions it owns: every mule-plugin declared in THIS ancestor
// (fork-wide scope), mapped to a target version (by matching child-connector nick
// when the app uses it; otherwise the connector is app-unused and flagged if no
// target). A connector owned by the CHILD is NOT handled here — Step 14 owns the
// child. This script only touches ancestors, and only for connector versions:
// app.runtime / mule.maven.plugin.version / Java props are always child-written by
// apply_runtime_bump.mjs (see header), never forked into a shared ancestor.

// nick lookup by groupId:artifactId for connectors the app resolves.
const nickByGa = new Map();
for (const c of connectors) nickByGa.set(`${c.groupId}:${c.artifactId}`, c.nick);

const ancestorsDeepestFirst = [...chain].sort((a, b) => b.depth - a.depth);

let anyAncestorOwnsSomething = false;

for (const anc of ancestorsDeepestFirst) {
  const owns = { connectors: [] };

  // Connectors declared directly in this ancestor (fork-wide: ALL of them).
  for (const ga of declaredPluginDeps(anc.project)) {
    const key = `${ga.groupId}:${ga.artifactId}`;
    const nick = nickByGa.get(key);
    const target = nick ? targetByNick.get(nick) : null;
    if (target) {
      owns.connectors.push({ ...ga, nick: nick || null, targetVersion: target });
    } else {
      // Declared in the ancestor but the app doesn't resolve it (or no target
      // computed). Flag for operator attention — never a hard stop here.
      result.warnings.push(
        `${key} is declared in ${anc.pomPath} but has no resolved target version ` +
        `(app-unused connector, or Step 6 produced no candidate). Left unchanged — operator attention.`
      );
    }
  }

  if (owns.connectors.length === 0) {
    continue; // this ancestor owns no connector we need to bump — no fork
  }
  anyAncestorOwnsSomething = true;

  // Baseline own <version> for the fork = the PRISTINE value (from the Step-14
  // snapshot when present), NOT the current on-disk value — so a fork re-run or a
  // --fork-bump change recomputes from the original version instead of climbing on
  // top of an already-forked one. The edit phase never touches <version>, so its
  // baseline equals the live value regardless.
  const currentOwnVersion = phase === 'fork'
    ? pristineOwnVersion(anc.pomPath, anc.project)
    : (textOf(child(anc.project, 'version')) || textOf(child(child(anc.project, 'parent'), 'version')));
  // The fork <version> is only computed/applied in the fork phase. In the edit
  // phase the ancestor's own <version> stays put so the child's existing <parent>
  // ref still matches and the local build resolves the new versions via relativePath.
  const forkedVersion = phase === 'fork' ? bumpVersion(currentOwnVersion, forkBump) : currentOwnVersion;
  const parentGroupId = textOf(child(anc.project, 'groupId'))
    || textOf(child(child(anc.project, 'parent'), 'groupId'));
  const parentArtifactId = textOf(child(anc.project, 'artifactId'));

  const ancEntry = {
    pomPath: anc.pomPath,
    depth: anc.depth,
    artifactId: parentArtifactId,
    ownVersion: { from: currentOwnVersion, to: forkedVersion },
    connectors: owns.connectors.map((c) => `${c.artifactId} -> ${c.targetVersion}`),
    repointedIn: phase === 'fork' ? downstreamOf.get(anc.pomPath) : null,
  };

  if (dryRun) {
    result.ancestorsForked.push(ancEntry);
    continue;
  }

  const log = [];
  if (phase === 'edit') {
    // Snapshot this ancestor pristine BEFORE the first write (create-if-absent, so
    // an edit-phase re-run keeps the original). NEVER snapshot in the fork phase —
    // by then the POM is already edited, and capturing it would poison the pristine
    // baseline pristineOwnVersion depends on.
    if (snapshotAncestor(anc.pomPath)) result.backedUp.push(anc.pomPath);
    // Bump owned connector versions IN PLACE. The ancestor's own <version> and the
    // downstream <parent> ref are left untouched.
    for (const c of owns.connectors) {
      bumpDependencyVersionSites(anc.pomPath, { groupId: c.groupId, artifactId: c.artifactId, version: c.targetVersion }, log);
    }
  } else {
    // fork phase: connector versions were already written in the edit phase. Now
    // (1) bump this ancestor's own <version> and (2) repoint the downstream
    // <parent> ref to the fork. Deepest-first ordering re-links the chain.
    bumpOwnVersion(anc.pomPath, forkedVersion, log);
    const downstream = downstreamOf.get(anc.pomPath);
    if (downstream) {
      repointParentVersion(downstream, forkedVersion, log, { groupId: parentGroupId, artifactId: parentArtifactId });
    }
  }

  result.edits.push(...log);
  result.ancestorsForked.push(ancEntry);
}

if (!anyAncestorOwnsSomething) {
  result.warnings.push('No ancestor owns any connector version — nothing to do. (All connectors are child-owned; the child writers in Step 14 handle those, and runtime/plugin properties are always child-written.)');
  emit();
  exit(0);
}

if (dryRun) {
  emit();
  exit(0);
}

// ---- verify: re-resolve from the child's perspective ----------------------
// Re-read the whole chain fresh from disk (edits are written) and confirm every
// bumped connector version now resolves to its target from the child's point of
// view. This is the "did the write actually take" gate, and — crucially for the
// edit phase — it proves the child resolves the NEW versions through the unchanged
// <parent> link + relativePath, exactly as the Step 16/17 build will. In the fork
// phase it additionally confirms each downstream <parent> link now points at the
// forked <version> (edit phase leaves repointedIn null, so that check is skipped).
{
  const freshChild = readPomProject(childPomPath);

  // connector resolution check (only for connectors we had a target for)
  for (const c of connectors) {
    const target = targetByNick.get(c.nick);
    if (!target) continue;
    // Only verify connectors that were ancestor-owned (child-owned are Step 14's).
    if (c.resolvedFrom === 'child' && !c.versionManagedIn) continue;

    const resolved = resolveConnectorFromChain(freshChild, childPomPath, c.groupId, c.artifactId);
    const ok = resolved === target;
    if (!ok) result.verify.ok = false;
    result.verify.checks.push({ kind: 'connector', nick: c.nick, expected: target, got: resolved, ok });
  }

  // parent-link check: each forked ancestor's downstream POM points at the fork.
  for (const anc of result.ancestorsForked) {
    const downstream = anc.repointedIn;
    if (!downstream) continue;
    const dsProject = readPomProject(downstream);
    const gotParentVer = textOf(child(child(dsProject, 'parent'), 'version'));
    const ok = gotParentVer === anc.ownVersion.to;
    if (!ok) result.verify.ok = false;
    result.verify.checks.push({ kind: 'parent-link', downstream, expected: anc.ownVersion.to, got: gotParentVer, ok });
  }
}

emit();
exit(result.verify.ok ? 0 : 1);

// Resolve a connector's effective version from the child's perspective exactly
// as the read side (extract_connectors.mjs) does: walk the local chain's
// <dependencies> nearest-first (child wins), resolving ${...} against the merged
// chain props; if it is version-less everywhere, fall back to the managed-version
// walk over <dependencyManagement>. Returns the resolved version or null.
function resolveConnectorFromChain(freshChild, freshChildPath, groupId, artifactId) {
  const merged = mergedChainProps(freshChild, freshChildPath);
  // nearest-first: child, then each ancestor
  const projects = [{ project: freshChild, path: freshChildPath }];
  {
    let curProject = freshChild;
    let curPath = freshChildPath;
    const seen = new Set([freshChildPath]);
    while (true) {
      const nextPath = findParentPomPath(curProject, curPath);
      if (!nextPath || seen.has(nextPath)) break;
      seen.add(nextPath);
      let nextProject;
      try { nextProject = readPomProject(nextPath); } catch { break; }
      projects.push({ project: nextProject, path: nextPath });
      curProject = nextProject;
      curPath = nextPath;
    }
  }
  for (const { project } of projects) {
    const deps = child(project, 'dependencies');
    if (!deps) continue;
    for (const dep of children(deps, 'dependency')) {
      if (textOf(child(dep, 'groupId')) !== groupId) continue;
      if (textOf(child(dep, 'artifactId')) !== artifactId) continue;
      const raw = textOf(child(dep, 'version'));
      if (!raw) break; // version-less here → try managed below (nearest wins is done)
      return resolveValue(raw, merged);
    }
  }
  const managed = findManagedVersion(freshChild, freshChildPath, groupId, artifactId, extractProperties(freshChild));
  return managed ? managed.version : null;
}

// Merge the whole local chain's <properties> (nearest wins) for ${...}
// resolution from the child's perspective — same order as the read side.
function mergedChainProps(freshChild, freshChildPath) {
  const stack = [];
  let curProject = freshChild;
  let curPath = freshChildPath;
  const seen = new Set([freshChildPath]);
  while (true) {
    const nextPath = findParentPomPath(curProject, curPath);
    if (!nextPath || seen.has(nextPath)) break;
    seen.add(nextPath);
    let nextProject;
    try { nextProject = readPomProject(nextPath); } catch { break; }
    stack.push(nextProject);
    curProject = nextProject;
    curPath = nextPath;
  }
  const merged = {};
  for (let i = stack.length - 1; i >= 0; i--) Object.assign(merged, extractProperties(stack[i]));
  Object.assign(merged, extractProperties(freshChild));
  return merged;
}
