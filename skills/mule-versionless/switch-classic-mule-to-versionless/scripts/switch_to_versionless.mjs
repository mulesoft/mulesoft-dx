#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of switch-classic-mule-to-versionless skill.
//
// Standalone translation of DefaultProjectPropertiesService.upgradeProjectToVersionless
// + writeProjectManifest (mule-dx-mule-dev-plugin). Runs with no IDE, no registry,
// no network — pure filesystem.
//
// What it does, in order:
//   1. Reads the project's pom.xml (and its local parent chain) and collects every
//      Mule-plugin dependency (<classifier>mule-plugin</classifier>, non-test scope).
//      These are the app's candidate connectors. Versions are resolved through
//      ${properties} and parent <dependencyManagement>, local files only.
//   2. Derives each connector's versionless `name` (its XML namespace / prefix — the
//      identity the versionless runtime resolves against) and keeps ONLY the ones
//      whose prefix actually appears in the app's Mule XML (the "used in code" gate).
//      Declared-but-unused deps are dropped from the manifest and left in the pom.
//   3. MERGES the surviving connectors into project-manifest.json next to pom.xml
//      (creating it if absent): existing connector names are retained, new ones are
//      appended. A same-named file that is not a valid manifest is never clobbered.
//   4. Comments out each newly-migrated connector <dependency> block in the CHILD
//      pom.xml (parent POMs are never edited). Idempotent: the parser strips
//      comments, so already-migrated deps are invisible on re-run.
//
// The ONLY files this ever writes are project-manifest.json and the child pom.xml.
//
// Usage:
//   node switch_to_versionless.mjs [projectDir] [--dry-run]
//   Default projectDir = cwd. --dry-run prints the plan and the manifest it WOULD
//   write, but touches nothing on disk.
//
// Output: a JSON report on stdout (see the `report` object below for its fields).
// Manifest connectors are written name-only: { "name": "<xml-prefix>" }.
//
// Exit code: 0 on success (including "nothing to migrate"), 1 only on a hard error
// (no pom.xml, unrecognized existing manifest, manifest/pom write failure).

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import {
  child,
  children,
  textOf,
  extractProperties,
  resolveValue,
  findParentPomPath,
  findManagedVersion,
  readPomProject,
} from "./_pom_utils.mjs";

const MULE_PLUGIN_CLASSIFIER = "mule-plugin";
const MANIFEST_FILE_NAME = "project-manifest.json";
const MANIFEST_VERSION = "1.0.0";

// XML namespaces that are the Mule runtime / tooling core, NOT connectors. Their
// prefixes must never be treated as a migratable connector.
const CORE_NAMESPACES = new Set([
  "core", "doc", "ee", "spring", "tls", "api-gateway", "domain",
  "mule", "munit", "munit-tools", "test", "batch", "scripting",
  "secure-properties", "configuration-properties", "java",
]);

// artifactId nickname -> real XML prefix, for the connectors whose namespace prefix
// does not match the nickname derived from the artifactId. Extend as needed; the XML
// cross-check below catches most cases even when a connector is not listed here.
const NAME_ALIASES = {
  objectstore: "os",
};

function log(msg) { process.stdout.write(msg + "\n"); }

// mule-amazon-s3-connector -> s3, mule-http-connector -> http. Strips a leading
// "mule-" and a trailing "-connector"/"-module"/"-extension".
function nickFor(artifactId) {
  let n = String(artifactId || "").trim();
  n = n.replace(/^mule-/, "").replace(/-(connector|module|extension)$/i, "");
  return n || String(artifactId || "").trim();
}

// Collect every <dependency> under a project's <dependencies> that carries the
// mule-plugin classifier, with its version resolved against mergedProps.
function collectPluginDeps(project, mergedProps, resolvedFrom) {
  const out = [];
  const deps = child(project, "dependencies");
  if (!deps) return out;
  for (const dep of children(deps, "dependency")) {
    if (textOf(child(dep, "classifier")) !== MULE_PLUGIN_CLASSIFIER) continue;
    const groupId = textOf(child(dep, "groupId"));
    const artifactId = textOf(child(dep, "artifactId"));
    const rawVersion = textOf(child(dep, "version"));
    const scope = textOf(child(dep, "scope")) || "compile";
    const resolved = rawVersion ? resolveValue(rawVersion, mergedProps) : null;
    out.push({
      groupId, artifactId,
      version: resolved || null,
      versionResolved: !!resolved,
      rawVersion: rawVersion || null,
      scope, resolvedFrom,
    });
  }
  return out;
}

// Recursively list *.xml files under a directory (returns [] if it doesn't exist).
function listXmlFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...listXmlFiles(p));
    else if (entry.toLowerCase().endsWith(".xml")) out.push(p);
  }
  return out;
}

// Collect the set of Mule schema namespace prefixes actually declared across the
// app's Mule XML under src/main/mule (xmlns:<prefix>="http://www.mulesoft.org/schema/mule/<ns>"),
// minus the known core namespaces. These are the authoritative connector names, and
// the "used in code" set that gates what may be migrated. Only src/main/mule is
// scanned — that is where Mule 4 flows and global configs live; confirming a
// connector from anywhere else could wrongly comment its dependency out of the pom.
function collectXmlPrefixes(projectDir) {
  const prefixes = new Set();
  const files = listXmlFiles(join(projectDir, "src", "main", "mule"));
  const re = /xmlns:([\w.-]+)\s*=\s*"https?:\/\/www\.mulesoft\.org\/schema\/mule\/([\w./-]+?)"/g;
  for (const f of files) {
    let text;
    try { text = readFileSync(f, "utf8"); } catch { continue; }
    let m;
    while ((m = re.exec(text)) !== null) {
      const prefix = m[1];
      if (!CORE_NAMESPACES.has(prefix)) prefixes.add(prefix);
    }
  }
  return prefixes;
}

// Derive the versionless connector name and whether the XML confirmed it.
function deriveName(artifactId, xmlPrefixes) {
  const nick = nickFor(artifactId);
  const aliased = NAME_ALIASES[nick] || nick;
  if (xmlPrefixes.has(aliased)) return { name: aliased, nameConfirmed: true };
  if (aliased !== nick && xmlPrefixes.has(nick)) return { name: nick, nameConfirmed: true };
  // Not directly present. Try a unique fuzzy match on a "-"-separated boundary only,
  // so one side is the other plus a hyphenated suffix (e.g. artifact "salesforce-composite"
  // vs prefix "salesforce"). A plain substring test is NOT used: it would bind unrelated
  // names like nick "db" to prefix "mongodb".
  const boundaryMatch = (p) =>
    p === nick || nick.startsWith(p + "-") || p.startsWith(nick + "-");
  const fuzzy = [...xmlPrefixes].filter(boundaryMatch);
  if (fuzzy.length === 1) return { name: fuzzy[0], nameConfirmed: true };
  return { name: aliased, nameConfirmed: false };
}

// Comment out the migrated connector <dependency> blocks in the child pom's raw
// text. Only blocks whose groupId:artifactId is in `migratedKeys` are wrapped.
// Idempotent (skips already-commented blocks) and safe (skips blocks containing a
// nested comment, which would break XML). Returns { text, edits[], warnings[] }.
function commentOutDeps(raw, migratedKeys) {
  const edits = [];
  const warnings = [];

  // Spans covered by <dependencyManagement>...</dependencyManagement>. The <dependency>
  // blocks inside only PIN versions (for this or inheriting modules) and must never be
  // commented out — migratedKeys are collected from <dependencies> only, so a GA that
  // also happens to be pinned here would otherwise be silently un-managed.
  const dmRanges = [];
  const dmRe = /<dependencyManagement\b[\s\S]*?<\/dependencyManagement>/g;
  let dm;
  while ((dm = dmRe.exec(raw)) !== null) dmRanges.push([dm.index, dm.index + dm[0].length]);
  const insideDm = (i) => dmRanges.some(([s, e]) => i >= s && i < e);

  const depRe = /<dependency\b[\s\S]*?<\/dependency>/g;
  let result = "";
  let cursor = 0;
  let m;
  while ((m = depRe.exec(raw)) !== null) {
    const block = m[0];
    const start = m.index;
    if (insideDm(start)) continue; // a <dependencyManagement> pin, not a real dependency
    const ga = `${(block.match(/<groupId>\s*([^<]*?)\s*<\/groupId>/) || [])[1] || ""}:${(block.match(/<artifactId>\s*([^<]*?)\s*<\/artifactId>/) || [])[1] || ""}`;
    if (!migratedKeys.has(ga)) continue;

    // Already inside a comment? (an unclosed <!-- precedes this block)
    const before = raw.slice(0, start);
    if (before.lastIndexOf("<!--") > before.lastIndexOf("-->")) continue;

    // XML comments cannot nest, so an inline <!-- note --> inside the block would break
    // the wrapping comment. Strip such notes first (the dependency coordinates — all that
    // matters for recovery — are preserved). If a literal "--" still remains afterward
    // (e.g. inside a version), we cannot wrap it safely: warn and leave it for manual work.
    const stripped = block.replace(/<!--[\s\S]*?-->/g, "");
    if (stripped.includes("--")) {
      warnings.push(`Skipped commenting ${ga}: block contains "--" (would break XML comment). Comment it out manually.`);
      continue;
    }
    result += raw.slice(cursor, start);
    result += `<!-- [versionless] moved to ${MANIFEST_FILE_NAME}\n${stripped}\n-->`;
    cursor = start + block.length;
    edits.push(ga);
  }
  result += raw.slice(cursor);
  return { text: result, edits, warnings };
}

// Read the connector names already declared in an existing project-manifest.json,
// in order. Returns { names: string[], parseError: string|null }. A missing file is
// { names: [] , parseError: null }. A malformed/unexpected file returns an empty
// list WITH a parseError set, so the caller can refuse to overwrite rather than
// silently wiping a hand-edited manifest.
function readExistingManifest(manifestPath) {
  if (!existsSync(manifestPath)) return { names: [], parseError: null };
  let raw;
  try { raw = readFileSync(manifestPath, "utf8"); }
  catch (e) { return { names: [], parseError: `could not read: ${e.message}` }; }
  let doc;
  try { doc = JSON.parse(raw); }
  catch (e) { return { names: [], parseError: `invalid JSON: ${e.message}` }; }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.connectors)) {
    return { names: [], parseError: "not a project-manifest.json (missing connectors array)" };
  }
  const names = [];
  for (const entry of doc.connectors) {
    if (entry && typeof entry === "object" && typeof entry.name === "string" && entry.name.trim()) {
      names.push(entry.name.trim());
    }
  }
  return { names, parseError: null };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  let projectDir = process.cwd();
  for (const a of argv) if (!a.startsWith("--")) projectDir = resolve(a);
  projectDir = resolve(projectDir);

  const report = {
    projectDir,
    pomPath: null,
    manifestPath: null,
    connectors: [],        // final, merged manifest connectors (name-only): existing + newly added
    existingRetained: [],  // connector names carried over from a pre-existing manifest
    newlyAdded: [],         // connectors migrated on THIS run (detailed), from uncommented pom deps
    declaredButUnused: [],  // mule-plugin deps whose namespace is NOT used in src/main/mule — excluded from the manifest, left in the pom
    skipped: [],
    xmlPrefixes: [],
    pomEdits: [],
    warnings: [],
    dryRun,
    wrote: false,
  };

  const childPomPath = join(projectDir, "pom.xml");
  if (!existsSync(childPomPath)) {
    report.warnings.push(`No pom.xml found at ${childPomPath} — not a Mule project root.`);
    log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.pomPath = childPomPath;

  const childProject = readPomProject(childPomPath);
  const childProps = extractProperties(childProject);

  // Walk the local parent chain for inherited deps / properties.
  const ancestors = [];
  let curProject = childProject;
  let curPath = childPomPath;
  const seen = new Set([childPomPath]);
  while (true) {
    const nextPath = findParentPomPath(curProject, curPath);
    if (!nextPath || seen.has(nextPath)) break;
    seen.add(nextPath);
    let nextProject;
    try { nextProject = readPomProject(nextPath); }
    catch (e) { report.warnings.push(`Failed to read parent POM ${nextPath}: ${e.message}`); break; }
    ancestors.push({ project: nextProject, props: extractProperties(nextProject), path: nextPath });
    curProject = nextProject;
    curPath = nextPath;
  }

  const mergedProps = {};
  for (let i = ancestors.length - 1; i >= 0; i--) Object.assign(mergedProps, ancestors[i].props);
  Object.assign(mergedProps, childProps);

  // Collect plugin deps: child first, then ancestors (nearest wins on dedupe).
  const raw = [
    ...collectPluginDeps(childProject, mergedProps, "child"),
    ...ancestors.map((a, i) => collectPluginDeps(a.project, mergedProps, i === 0 ? "parent" : "ancestor")).flat(),
  ];
  const byGa = new Map();
  for (const d of raw) {
    const key = `${d.groupId}:${d.artifactId}`;
    if (!byGa.has(key)) byGa.set(key, d);
  }
  // Resolve any still-unresolved versions from local dependencyManagement.
  for (const d of byGa.values()) {
    if (d.versionResolved) continue;
    const managed = findManagedVersion(childProject, childPomPath, d.groupId, d.artifactId, childProps);
    if (managed) { d.version = managed.version; d.versionResolved = true; }
  }

  const xmlPrefixes = collectXmlPrefixes(projectDir);
  report.xmlPrefixes = [...xmlPrefixes].sort();

  // Derive this run's connectors from the pom deps the parser could see (child pom +
  // local parent chain). NOTE: the XML parser strips comments, so connectors already
  // commented out by a previous run are invisible here — that is exactly what makes the
  // switch idempotent. Only the NEW (still-uncommented) connectors surface.
  //
  // A connector is migrated ONLY when it is BOTH declared as a mule-plugin dependency
  // AND actually used in the app's Mule code — i.e. its XML namespace prefix appears in
  // src/main/mule. This is the "used in code" gate: a dependency declared (in the child
  // or an inherited parent pom) but never referenced in a flow is dropped from the
  // manifest, not resolved by the versionless runtime for nothing. Test-scoped
  // mule-plugins (MUnit tooling) are not application connectors and are skipped,
  // mirroring the plugin.
  const migratedKeys = new Set();
  for (const d of byGa.values()) {
    if (d.scope === "test") {
      report.skipped.push({ groupId: d.groupId, artifactId: d.artifactId, reason: "test-scoped mule-plugin (e.g. MUnit tooling)" });
      continue;
    }
    const { name, nameConfirmed } = deriveName(d.artifactId, xmlPrefixes);
    if (!nameConfirmed) {
      // Declared as a dependency but its namespace is not used anywhere in
      // src/main/mule — leave the pom alone and keep it OUT of the manifest.
      report.declaredButUnused.push({
        groupId: d.groupId, artifactId: d.artifactId, derivedName: name, resolvedFrom: d.resolvedFrom,
      });
      report.warnings.push(`${d.groupId}:${d.artifactId} is declared (${d.resolvedFrom} pom) but its namespace is not used in src/main/mule — excluded from the manifest and left in the pom. If it IS used, its XML prefix may differ from the artifactId; add it to the manifest manually.`);
      continue;
    }
    report.newlyAdded.push({
      name,
      groupId: d.groupId,
      artifactId: d.artifactId,
      version: d.version || null,
      resolvedFrom: d.resolvedFrom,
    });
    // Only child-pom deps can be commented out here (parent POMs are left untouched).
    if (d.resolvedFrom === "child") migratedKeys.add(`${d.groupId}:${d.artifactId}`);
    else report.warnings.push(`${d.groupId}:${d.artifactId} is used in code but declared in a parent POM (${d.resolvedFrom}); added to the manifest, but the dependency is left in place — comment it out in the parent manually if desired.`);
  }

  // MERGE, never overwrite: read the existing manifest and keep its connectors, then
  // append this run's new ones (deduped by name). This preserves connectors that were
  // migrated on earlier runs (whose pom deps are now commented out and thus invisible)
  // and makes re-running a no-op once everything is migrated.
  const manifestPath = join(projectDir, MANIFEST_FILE_NAME);
  report.manifestPath = manifestPath;
  const existing = readExistingManifest(manifestPath);
  if (existing.parseError) {
    // A same-named file we don't recognise as our manifest — refuse to clobber it.
    report.warnings.push(`Existing ${MANIFEST_FILE_NAME} ${existing.parseError} — refusing to overwrite. Remove or fix it, then re-run.`);
    log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.existingRetained = existing.names;

  // Ordered union: existing names first (order preserved), then new names not already present.
  const seenNames = new Set(existing.names);
  const mergedNames = [...existing.names];
  for (const c of report.newlyAdded) {
    if (seenNames.has(c.name)) continue;
    seenNames.add(c.name);
    mergedNames.push(c.name);
  }

  // Connectors are written name-only — the connector's versionless name (its XML
  // namespace / prefix) is the identity the runtime resolves against; GAV is not
  // part of the manifest schema.
  report.connectors = mergedNames.map((name) => ({ name }));
  const manifestDoc = {
    version: MANIFEST_VERSION,
    connectors: report.connectors,
  };

  // Comment out the child-pom connector deps.
  const rawPom = readFileSync(childPomPath, "utf8");
  const { text: newPom, edits, warnings: pomWarnings } = commentOutDeps(rawPom, migratedKeys);
  report.pomEdits = edits;
  report.warnings.push(...pomWarnings);

  if (dryRun) {
    log(JSON.stringify({ ...report, manifestPreview: manifestDoc }, null, 2));
    process.exit(0);
  }

  const manifestText = JSON.stringify(manifestDoc, null, 2) + "\n";
  let currentManifestText = null;
  if (existsSync(manifestPath)) {
    try { currentManifestText = readFileSync(manifestPath, "utf8"); } catch { /* rewrite below */ }
  }
  try {
    // Only touch the file when the content actually changes, so a no-op re-run of a
    // fully-migrated project leaves it byte-for-byte untouched.
    if (manifestText !== currentManifestText) writeFileSync(manifestPath, manifestText, "utf8");
  } catch (e) {
    report.warnings.push(`Failed to write ${manifestPath}: ${e.message}`);
    log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  try {
    if (edits.length) writeFileSync(childPomPath, newPom, "utf8");
  } catch (e) {
    report.warnings.push(`Manifest written, but failed to update ${childPomPath}: ${e.message}`);
    log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.wrote = true;
  log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main();
