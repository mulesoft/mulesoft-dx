// Copied from link-mule-domain/lib/mule-project.mjs — keep in sync (enforced by run-plan.test.mjs).
// mule-project.mjs — read and edit Mule application/domain projects on disk.
//
// readPom(text) -> {groupId, artifactId, version, packaging, properties, dependencies[]}
//     Top-level coordinates and <dependencies> only (parent, build plugins,
//     dependencyManagement and profiles are ignored). Each dependency carries
//     its source range and resolved version (${prop} expanded).
// projectKind(dir) -> 'domain' | 'application' | null
//     'domain' when pom packaging is mule-domain (ACB: MULE_DOMAIN_PACKAGING),
//     'application' for mule-application. Falls back to ACB's layout inference.
// describeProject(dir) -> {dir, name, kind, gav, runtime, java, domainDependency, plugins[]}
// findMuleProjects(roots[]) -> describeProject[] for every Mule project at depth 0-2.
// domainArtifactPaths(gav) -> {pom, jar} inside the local Maven repository.
// muleConfigFiles(dir) -> absolute paths of every *.xml under src/main/mule.
// Pom edits (text in, text out, formatting preserved):
//     removeDependency, insertDependency, setDependencyScope, setDependencyVersion, setProperty.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export const DOMAIN_CLASSIFIER = 'mule-domain';
export const PLUGIN_CLASSIFIER = 'mule-plugin';

const MASKED_SECTIONS = ['parent', 'build', 'dependencyManagement', 'profiles', 'reporting', 'repositories', 'pluginRepositories', 'distributionManagement'];

// Replace every non-newline character with a space so offsets stay valid.
const spaces = (s) => s.replace(/[^\n]/g, ' ');

function maskPom(text) {
  let masked = text.replace(/<!--[\s\S]*?-->/g, spaces);
  for (const section of MASKED_SECTIONS) {
    masked = masked.replace(new RegExp(`<${section}(\\s[^>]*)?>[\\s\\S]*?</${section}>`, 'g'), spaces);
  }
  return masked;
}

function tagValue(block, tag) {
  const m = block.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`));
  return m ? m[1] : null;
}

export function resolveValue(value, properties, coords = {}) {
  if (value == null) return value;
  return value.replace(/\$\{([^}]+)\}/g, (whole, key) => {
    if (key === 'project.version' || key === 'version') return coords.version ?? whole;
    if (key === 'project.groupId') return coords.groupId ?? whole;
    return properties[key] ?? whole;
  });
}

/** Parse the parts of a pom.xml this skill reads. */
export function readPom(text) {
  const masked = maskPom(text);
  // Top-level coordinates: strip <dependencies> too so dependency coords don't leak.
  const coordsText = masked.replace(/<dependencies>[\s\S]*?<\/dependencies>/g, '');
  const properties = {};
  const propsBlock = tagValue(coordsText, 'properties');
  if (propsBlock) {
    for (const m of propsBlock.matchAll(/<([A-Za-z0-9_.-]+)>\s*([\s\S]*?)\s*<\/\1>/g)) properties[m[1]] = m[2];
  }
  const parentBlock = text.replace(/<!--[\s\S]*?-->/g, '').match(/<parent>([\s\S]*?)<\/parent>/);
  const coords = {
    groupId: tagValue(coordsText, 'groupId') ?? (parentBlock ? tagValue(parentBlock[1], 'groupId') : null),
    artifactId: tagValue(coordsText, 'artifactId'),
    version: tagValue(coordsText, 'version') ?? (parentBlock ? tagValue(parentBlock[1], 'version') : null),
  };
  const packaging = tagValue(coordsText, 'packaging');

  const dependencies = [];
  for (const dm of masked.matchAll(/<dependencies>([\s\S]*?)<\/dependencies>/g)) {
    const bodyStart = dm.index + '<dependencies>'.length;
    for (const m of dm[1].matchAll(/<dependency>[\s\S]*?<\/dependency>/g)) {
      const start = bodyStart + m.index;
      const end = start + m[0].length;
      const block = text.slice(start, end);
      const rawVersion = tagValue(block, 'version');
      dependencies.push({
        groupId: resolveValue(tagValue(block, 'groupId'), properties, coords),
        artifactId: tagValue(block, 'artifactId'),
        rawVersion,
        version: resolveValue(rawVersion, properties, coords),
        classifier: tagValue(block, 'classifier'),
        scope: tagValue(block, 'scope'),
        start,
        end,
      });
    }
  }
  return { ...coords, packaging, properties, dependencies };
}

/** Same groupId:artifactId (versions may differ). */
export function sameGA(a, b) {
  return a.groupId === b.groupId && a.artifactId === b.artifactId;
}

export function gavString(d) {
  return `${d.groupId}:${d.artifactId}:${d.version}`;
}

const readText = (path) => readFileSync(path, 'utf8');

/** 'domain' | 'application' | null */
export function projectKind(dir) {
  const pomPath = join(dir, 'pom.xml');
  if (!existsSync(pomPath)) return null;
  const { packaging } = readPom(readText(pomPath));
  if (packaging === 'mule-domain') return 'domain';
  if (packaging === 'mule-application') return 'application';
  if (packaging) return null;
  // ACB MavenProjectUtils.inferMulePackaging fallback.
  if (existsSync(join(dir, 'src', 'main', 'domain'))) return 'domain';
  if (existsSync(join(dir, 'src', 'main', 'mule')) || existsSync(join(dir, 'mule-artifact.json'))) return 'application';
  return null;
}

export function readMuleArtifact(dir) {
  const path = join(dir, 'mule-artifact.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readText(path));
}

/** Summarize a Mule project. Returns null for non-Mule folders. */
export function describeProject(dir) {
  const abs = resolve(dir);
  const kind = projectKind(abs);
  if (!kind) return null;
  const pom = readPom(readText(join(abs, 'pom.xml')));
  const artifact = readMuleArtifact(abs) ?? {};
  const domainDep = pom.dependencies.find((d) => d.classifier === DOMAIN_CLASSIFIER) ?? null;
  return {
    dir: abs,
    name: basename(abs),
    kind,
    gav: { groupId: pom.groupId, artifactId: pom.artifactId, version: pom.version },
    runtime: pom.properties['app.runtime'] ?? null,
    minMuleVersion: artifact.minMuleVersion ?? null,
    java: Array.isArray(artifact.javaSpecificationVersions) ? artifact.javaSpecificationVersions : [],
    domainDependency: domainDep && {
      groupId: domainDep.groupId,
      artifactId: domainDep.artifactId,
      version: domainDep.version,
      scope: domainDep.scope,
    },
    plugins: pom.dependencies
      .filter((d) => d.classifier === PLUGIN_CLASSIFIER)
      .map((d) => ({ groupId: d.groupId, artifactId: d.artifactId, version: d.version, scope: d.scope ?? 'compile' })),
  };
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const SKIP_DIRS = new Set(['node_modules', 'target', 'tmp']);

/** Every Mule project at depth 0, 1, or 2 below each root. */
export function findMuleProjects(roots) {
  const seen = new Set();
  const found = [];
  const visit = (dir, depth) => {
    const abs = resolve(dir);
    if (seen.has(abs) || !isDir(abs)) return;
    seen.add(abs);
    const project = describeProject(abs);
    if (project) {
      found.push(project);
      return;
    }
    if (depth >= 2) return;
    for (const entry of readdirSync(abs).sort()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      visit(join(abs, entry), depth + 1);
    }
  };
  for (const root of roots) visit(root, 0);
  return found;
}

/** Local Maven repository root. MULE_DX_M2_REPO overrides (tests, custom localRepository). */
export function m2Repository() {
  return process.env.MULE_DX_M2_REPO || join(homedir(), '.m2', 'repository');
}

export function domainArtifactPaths(gav) {
  const base = join(m2Repository(), ...gav.groupId.split('.'), gav.artifactId, gav.version);
  return {
    pom: join(base, `${gav.artifactId}-${gav.version}.pom`),
    jar: join(base, `${gav.artifactId}-${gav.version}-${DOMAIN_CLASSIFIER}.jar`),
  };
}

/** Every *.xml file under src/main/mule (recursive). */
export function muleConfigFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!isDir(d)) return;
    for (const entry of readdirSync(d).sort()) {
      const p = join(d, entry);
      if (isDir(p)) walk(p);
      else if (entry.endsWith('.xml')) out.push(p);
    }
  };
  walk(join(dir, 'src', 'main', 'mule'));
  return out;
}

// ---------------------------------------------------------------------------
// pom.xml text edits
// ---------------------------------------------------------------------------

function detectEol(text) {
  const i = text.indexOf('\n');
  return i > 0 && text[i - 1] === '\r' ? '\r\n' : '\n';
}

function findDependency(text, match) {
  return readPom(text).dependencies.find(
    (d) => sameGA(d, match) && (match.classifier === undefined || d.classifier === match.classifier),
  );
}

/** Remove the first dependency matching groupId/artifactId (and classifier, if given). */
export function removeDependency(text, match) {
  const dep = findDependency(text, match);
  if (!dep) return text;
  let s = dep.start;
  let e = dep.end;
  while (s > 0 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
  if (text[e] === '\r') e++;
  if (text[e] === '\n') e++;
  return text.slice(0, s) + text.slice(e);
}

/** Insert a <dependency> before the top-level </dependencies> (creating the section if missing). */
export function insertDependency(text, dep) {
  const { groupId, artifactId, version, classifier, scope } = dep;
  if (!groupId || !artifactId || !version) throw new Error('insertDependency: groupId, artifactId and version are required');
  const eol = detectEol(text);
  const lines = [
    '        <dependency>',
    `            <groupId>${groupId}</groupId>`,
    `            <artifactId>${artifactId}</artifactId>`,
    `            <version>${version}</version>`,
  ];
  if (classifier) lines.push(`            <classifier>${classifier}</classifier>`);
  if (scope) lines.push(`            <scope>${scope}</scope>`);
  lines.push('        </dependency>');
  const block = lines.join(eol) + eol;

  const idx = maskPom(text).indexOf('</dependencies>');
  if (idx !== -1) {
    let lineStart = idx;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
    return text.slice(0, lineStart) + block + text.slice(lineStart);
  }
  const close = text.lastIndexOf('</project>');
  if (close === -1) throw new Error('insertDependency: no </project> element');
  return `${text.slice(0, close)}    <dependencies>${eol}${block}    </dependencies>${eol}${text.slice(close)}`;
}

function replaceInDependency(text, dep, tag, value) {
  const block = text.slice(dep.start, dep.end);
  const eol = detectEol(text);
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`);
  let next;
  if (value === null) {
    next = block.replace(new RegExp(`\\s*<${tag}>[\\s\\S]*?</${tag}>`), '');
  } else if (re.test(block)) {
    next = block.replace(re, `<${tag}>${value}</${tag}>`);
  } else {
    next = block.replace(/(\s*)<\/dependency>$/, `${eol}            <${tag}>${value}</${tag}>$1</dependency>`);
  }
  return text.slice(0, dep.start) + next + text.slice(dep.end);
}

/** Set (or with scope=null, remove) the <scope> of a dependency. */
export function setDependencyScope(text, match, scope) {
  const dep = findDependency(text, match);
  if (!dep) return text;
  return replaceInDependency(text, dep, 'scope', scope);
}

/**
 * Set a dependency's version. When the version is a ${property} reference the
 * property is updated instead, matching ACB's alignConnectors behavior.
 */
export function setDependencyVersion(text, match, version) {
  const dep = findDependency(text, match);
  if (!dep) return text;
  const prop = (dep.rawVersion ?? '').match(/^\$\{([^}]+)\}$/);
  if (prop && prop[1] in readPom(text).properties) return setProperty(text, prop[1], version);
  return replaceInDependency(text, dep, 'version', version);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Set a top-level <properties> entry, adding it when missing. */
export function setProperty(text, name, value) {
  const masked = maskPom(text);
  const open = masked.indexOf('<properties>');
  const close = masked.indexOf('</properties>');
  const eol = detectEol(text);
  if (open === -1 || close === -1) {
    const deps = masked.indexOf('<dependencies>');
    const anchor = deps !== -1 ? deps : text.lastIndexOf('</project>');
    return `${text.slice(0, anchor)}<properties>${eol}        <${name}>${value}</${name}>${eol}    </properties>${eol}${eol}    ${text.slice(anchor)}`;
  }
  const body = text.slice(open, close);
  const re = new RegExp(`<${escapeRe(name)}>[\\s\\S]*?</${escapeRe(name)}>`);
  if (re.test(body)) {
    return text.slice(0, open) + body.replace(re, `<${name}>${value}</${name}>`) + text.slice(close);
  }
  let lineStart = close;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  return `${text.slice(0, lineStart)}        <${name}>${value}</${name}>${eol}${text.slice(lineStart)}`;
}
