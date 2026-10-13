#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 5a helper — extract the connector dependencies from the app's pom.xml so
// Step 5b (check_connector_java_compat.mjs) can look each one up in Exchange.
// Deterministic: parses the POM and its full local parent chain (parent,
// grandparent, ...) for ${...}/inherited values, with no CLI and no network.
//
// A Mule connector is a <dependency> with <classifier>mule-plugin</classifier>
// that is NOT test-scoped. MUnit tooling is always test-scoped, so that filter
// already excludes it. Test-scoped mule-plugins are moved to `excluded[]` (with a
// reason) rather than dropped silently.
//
// Version resolution walks the local POMs only: inline <version>, a ${property}
// from any local POM's <properties>, or a version-less dependency managed in a
// local <dependencyManagement> (this POM's or an ancestor's). version stays null
// ONLY when it lives somewhere we do not read without Maven: a parent not on the
// filesystem (remote/~/.m2), an imported BOM, or a <profiles> block.
//
// Usage:
//   node extract_connectors.mjs [projectDir]
//   Default projectDir = cwd. Output path: ${CONNECTORS_FILE} when set,
//   otherwise <projectDir>/tmp/connectors.json.
//
// Output JSON (file): { projectDir, connectors[], excluded[], customLibraries[],
//   needsUserPrompt, warnings[], notes[] }. Each connector: { nick, groupId,
//   artifactId, version, versionResolved, scope, resolvedFrom, versionManagedIn? }.
//   `resolvedFrom` is "child" | "parent" | "ancestor" (grandparent+). `version` is
//   null ONLY when it could not be resolved from any local POM (remote-only parent
//   or imported BOM). `versionManagedIn` is set (to the ancestor POM path) when the
//   version came from an ancestor's <dependencyManagement> — i.e. where an edit
//   must happen.
//
// `customLibraries[]` holds the app's non-connector, non-test, non-platform
// dependencies (a shared error-handler jar, a util lib, a direct third-party jar):
// { groupId, artifactId, version, versionResolved, rawVersion, scope, classifier,
//   resolvedFrom }. The skill does NOT auto-upgrade these (no Exchange target
//   exists); they are surfaced so Step 12 can flag them for the operator — they may
//   have been compiled against the old Java/runtime and break after the upgrade.
//   Platform groups (org.mule.*, com.mulesoft.*) and test/provided scopes are
//   suppressed as non-customer noise.
//
// Exit code:
//   0  always — extraction is advisory; the caller branches on connectors /
//      needsUserPrompt rather than the exit status.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
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
} from "./_pom_utils.mjs";

// Don't crash if a downstream consumer (e.g. `head`) closes stdout early.
process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

function log(msg) {
  process.stdout.write(msg + "\n");
}

// The classifier that marks a dependency as a Mule 4 plugin (connector or
// plugin tooling). Connectors and MUnit tooling both use it.
const MULE_PLUGIN_CLASSIFIER = "mule-plugin";

// GroupId prefixes that are platform-provided (the Mule runtime / MuleSoft ship
// them) — a non-connector dependency under these is NOT a customer library, so it
// is suppressed from customLibraries[]. Everything else that is a plain jar
// (no mule-plugin classifier) and not test-scoped is a candidate custom library:
// a shared error-handler jar, a util lib, a third-party dependency the app pulls
// in directly. The skill cannot introspect or upgrade these (not on Exchange), so
// they are collected here to be flagged for the operator at plan time (Step 12),
// never auto-bumped.
const PLATFORM_GROUP_PREFIXES = ["org.mule", "com.mulesoft"];

function isPlatformGroup(groupId) {
  const g = String(groupId || "");
  return PLATFORM_GROUP_PREFIXES.some((p) => g === p || g.startsWith(p + "."));
}

// Derive a short, stable nickname from an artifactId, matching the sibling
// build-mule-integration convention (e.g. mule-amazon-s3-connector -> s3,
// mule-http-connector -> http). Strips a leading "mule-" and a trailing
// "-connector"/"-module"; falls back to the full artifactId when that leaves
// nothing. Collisions are disambiguated by the caller if needed.
function nickFor(artifactId) {
  let n = String(artifactId || "").trim();
  n = n.replace(/^mule-/, "").replace(/-(connector|module|extension)$/i, "");
  return n || String(artifactId || "").trim();
}

// Collect every <dependency> under a project's <dependencies> that carries the
// mule-plugin classifier. Version is resolved against the merged props; a value
// that stays a ${...} ref or is absent yields { version: null, versionResolved:
// false } (inherited from a parent BOM).
function collectPluginDeps(project, mergedProps, resolvedFrom) {
  const out = [];
  const deps = child(project, "dependencies");
  if (!deps) return out;
  for (const dep of children(deps, "dependency")) {
    const classifier = textOf(child(dep, "classifier"));
    if (classifier !== MULE_PLUGIN_CLASSIFIER) continue;

    const groupId = textOf(child(dep, "groupId"));
    const artifactId = textOf(child(dep, "artifactId"));
    const rawVersion = textOf(child(dep, "version"));
    const scope = textOf(child(dep, "scope")) || "compile";

    // resolveValue returns null unless the version is FULLY resolved (all ${...}
    // substituted); a partial like "${major}.${minor}" comes back null, not emitted.
    const resolved = rawVersion ? resolveValue(rawVersion, mergedProps) : null;
    const versionResolved = !!resolved;

    out.push({
      groupId,
      artifactId,
      version: versionResolved ? resolved : null,
      versionResolved,
      rawVersion: rawVersion || null,
      scope,
      resolvedFrom,
    });
  }
  return out;
}

// Collect every <dependency> that is NOT a mule-plugin and NOT test-scoped and
// NOT platform-provided — the custom / third-party libraries the app depends on
// directly (a shared error-handler jar, a util lib, etc.). The skill cannot
// resolve a "latest compatible" for these (they are not Exchange connectors), so
// it never bumps them; it collects them so Step 12 can flag them for the operator
// (they were likely compiled against the old Java/runtime and may break after the
// upgrade). Version resolution mirrors connectors: a value that stays a ${...}
// ref yields version: null (still worth flagging by GA).
function collectCustomLibs(project, mergedProps, resolvedFrom) {
  const out = [];
  const deps = child(project, "dependencies");
  if (!deps) return out;
  for (const dep of children(deps, "dependency")) {
    const classifier = textOf(child(dep, "classifier"));
    if (classifier === MULE_PLUGIN_CLASSIFIER) continue; // connectors handled elsewhere

    const scope = textOf(child(dep, "scope")) || "compile";
    if (scope === "test" || scope === "provided") continue; // test/provided are not shipped app libs

    const groupId = textOf(child(dep, "groupId"));
    if (isPlatformGroup(groupId)) continue; // platform-provided, not a customer lib

    const artifactId = textOf(child(dep, "artifactId"));
    const rawVersion = textOf(child(dep, "version"));
    const resolved = rawVersion ? resolveValue(rawVersion, mergedProps) : null;

    out.push({
      groupId,
      artifactId,
      version: resolved || null,
      versionResolved: !!resolved,
      rawVersion: rawVersion || null,
      scope,
      classifier: classifier || null,
      resolvedFrom,
    });
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) projectDir = resolve(argv[i]);
  }
  projectDir = resolve(projectDir);
  const outPath = process.env.CONNECTORS_FILE || join(projectDir, "tmp", "connectors.json");

  const result = {
    projectDir,
    connectors: [],        // real, Exchange-resolvable connectors (Step 5b input)
    excluded: [],          // mule-plugin deps that are NOT connectors, with a reason
    customLibraries: [],   // non-connector app jars — flagged for operator at Step 12, never auto-bumped
    needsUserPrompt: false,
    warnings: [],
    notes: [],
  };

  // Child pom.xml is required.
  const childPomPath = join(projectDir, "pom.xml");
  if (!existsSync(childPomPath)) {
    result.warnings.push(`No pom.xml found at ${childPomPath}`);
    result.needsUserPrompt = true;
    return emit(result, outPath);
  }
  const childProject = projectOf(parseXml(readFileSync(childPomPath, "utf8")));
  const childProps = extractProperties(childProject);

  // Walk the local parent chain (parent, grandparent, ...) as far as the POMs are
  // readable on disk. Each level supplies inherited <dependencies> and ${...}
  // properties. Following Maven inheritance, a connector may be declared on ANY
  // ancestor's <dependencies>, not just the direct parent.
  // ancestors[0] is the direct parent, [1] the grandparent, etc.
  const ancestors = []; // { project, props, path }
  let curProject = childProject;
  let curPath = childPomPath;
  const seenPoms = new Set([childPomPath]);
  while (true) {
    const nextPath = findParentPomPath(curProject, curPath);
    if (!nextPath || seenPoms.has(nextPath)) break; // no parent, or a chain cycle
    seenPoms.add(nextPath);
    let nextProject;
    try {
      nextProject = readPomProject(nextPath);
    } catch (e) {
      result.warnings.push(`Failed to read parent POM ${nextPath}: ${e.message}`);
      break;
    }
    ancestors.push({ project: nextProject, props: extractProperties(nextProject), path: nextPath });
    result.notes.push(`Parent POM: ${nextPath}`);
    curProject = nextProject;
    curPath = nextPath;
  }
  // The direct parent was declared but could not be read locally.
  const parentDeclaredButMissing = ancestors.length === 0 && !!child(childProject, "parent");

  // Merged property table for ${...} resolution: nearer wins over farther, child
  // wins over all. Spread farthest-first so the child assignment lands last.
  const mergedProps = {};
  for (let i = ancestors.length - 1; i >= 0; i--) Object.assign(mergedProps, ancestors[i].props);
  Object.assign(mergedProps, childProps);

  // Collect mule-plugin deps from child, then each ancestor (nearest first).
  // Dedupe by groupId:artifactId — the NEAREST declaration wins (child over
  // parent over grandparent), so keep the first one seen.
  const raw = [
    ...collectPluginDeps(childProject, mergedProps, "child"),
    ...ancestors.map((a, i) =>
      collectPluginDeps(a.project, mergedProps, i === 0 ? "parent" : "ancestor")
    ).flat(),
  ];
  const byGa = new Map();
  for (const d of raw) {
    const key = `${d.groupId}:${d.artifactId}`;
    if (!byGa.has(key)) byGa.set(key, d); // nearest declaration wins
  }

  // Managed-version resolution (local files only): a version-less
  // child <dependency> gets its version from an ancestor's <dependencyManagement>.
  // Walk the local parent chain to resolve it. Whatever is NOT available locally
  // (remote-only parent, imported BOM) stays version: null and is the only case
  // that blocks — anything readable on disk is resolved correctly here.
  for (const d of byGa.values()) {
    if (d.versionResolved) continue;
    const managed = findManagedVersion(childProject, childPomPath, d.groupId, d.artifactId, childProps);
    if (managed) {
      d.version = managed.version;
      d.versionResolved = true;
      d.versionManagedIn = managed.definedIn; // where an edit must happen
    }
  }

  // Categorise: test-scoped plugins (MUnit tooling and the like) are not
  // application connectors. This is the sole exclusion.
  const usedNicks = new Map();
  for (const d of byGa.values()) {
    if (d.scope === "test") {
      result.excluded.push({ ...d, reason: "Test-scoped mule-plugin (e.g. MUnit tooling) — not an application connector; plugin version handled by Step 11, not Exchange resolution." });
      continue;
    }
    // Real connector. Assign a unique nickname.
    let nick = nickFor(d.artifactId);
    if (usedNicks.has(nick)) {
      const n = usedNicks.get(nick) + 1;
      usedNicks.set(nick, n);
      nick = `${nick}-${n}`;
    } else {
      usedNicks.set(nick, 1);
    }
    result.connectors.push({ nick, ...d });
    if (!d.versionResolved) {
      if (parentDeclaredButMissing) {
        // Version unresolved AND the declared parent POM is not on disk — it
        // likely defines the version (and may be hiding connectors too). Warn
        // rather than note, matching the current-version detector.
        result.warnings.push(
          `${d.groupId}:${d.artifactId} has an unresolvable version ` +
          `(${d.rawVersion || "no <version>"}), and the declared parent POM was ` +
          `not found locally. The parent likely defines this version (property or ` +
          `<dependencyManagement>). Ask the user to make the parent POM available ` +
          `locally and re-run so connector versions can be read.`
        );
      } else {
        result.notes.push(
          `${d.groupId}:${d.artifactId} has no locally-resolvable version ` +
          `(not in any local POM — likely an imported BOM or a parent not on disk).`
        );
      }
    }
  }

  // Custom / third-party libraries: non-connector app jars from child + ancestors,
  // deduped by groupId:artifactId (nearest declaration wins, same as connectors).
  // These are collected, warned about, and flagged for the operator at Step 12 —
  // never auto-upgraded (the skill can't resolve a target for a non-Exchange jar).
  const customByGa = new Map();
  for (const d of [
    ...collectCustomLibs(childProject, mergedProps, "child"),
    ...ancestors.map((a, i) =>
      collectCustomLibs(a.project, mergedProps, i === 0 ? "parent" : "ancestor")
    ).flat(),
  ]) {
    const key = `${d.groupId}:${d.artifactId}`;
    if (!customByGa.has(key)) customByGa.set(key, d); // nearest declaration wins
  }
  for (const d of customByGa.values()) {
    result.customLibraries.push(d);
    const v = d.versionResolved ? d.version : (d.rawVersion || "version inherited");
    result.warnings.push(
      `Non-connector dependency ${d.groupId}:${d.artifactId} (${v}) found — the skill ` +
      `will NOT auto-upgrade it (not an Exchange connector). It may have been compiled ` +
      `against the old Java/runtime; flagged for operator confirmation at plan time (Step 12).`
    );
  }

  if (result.connectors.length === 0) {
    result.needsUserPrompt = true;
    if (parentDeclaredButMissing) {
      result.warnings.push(
        "No connector (mule-plugin) dependencies found in the child pom.xml, and " +
        "the declared parent POM was not found locally — connectors declared on the " +
        "parent cannot be read. Ask the user to make the parent POM available and re-run."
      );
    } else {
      result.warnings.push(
        "No connector (mule-plugin) dependencies found in pom.xml. If the app really " +
        "uses connectors, confirm they are declared with <classifier>mule-plugin</classifier>."
      );
    }
  }

  return emit(result, outPath);
}

function emit(result, outPath) {
  if (result.connectors.length) {
    log(`✅ Found ${result.connectors.length} connector(s):`);
    for (const c of result.connectors) {
      const v = c.versionResolved ? c.version : "(version inherited — not resolvable locally)";
      log(`   • ${c.nick}: ${c.groupId}:${c.artifactId} ${v}`);
    }
  } else if (result.needsUserPrompt) {
    log("⚠️  No connectors extracted — the agent must confirm with the user.");
  }
  if (result.excluded.length) {
    log(`ℹ️  Excluded ${result.excluded.length} test-scoped mule-plugin dep(s) (e.g. MUnit tooling).`);
  }
  if (result.customLibraries.length) {
    log(`⚠️  Found ${result.customLibraries.length} non-connector dependency(ies) — NOT auto-upgraded, flagged for operator at Step 12:`);
    for (const d of result.customLibraries) {
      const v = d.versionResolved ? d.version : (d.rawVersion || "(version inherited)");
      log(`   • ${d.groupId}:${d.artifactId} ${v}`);
    }
  }
  for (const w of result.warnings) log(`   • ${w}`);

  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    result.outPath = outPath;
    log(`Saved to ${outPath}`);
  } catch (e) {
    result.warnings.push(`Failed to write ${outPath}: ${e.message}`);
    log(`⚠️  Failed to write ${outPath}: ${e.message}`);
  }
  return result;
}

main();
