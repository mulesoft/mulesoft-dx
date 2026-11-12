// domain-link.mjs — plan and apply linking/unlinking a Mule application to a
// Mule domain. Mirrors Anypoint Code Builder's ProjectDomainProperties so the
// result is identical to linking through Project Properties in the IDE:
//
//   link   -> app pom gets <classifier>mule-domain</classifier><scope>provided</scope>
//             (replacing any previous domain), app connectors the domain also
//             supplies become `provided` at the domain's version, `provided`
//             connectors the domain no longer supplies go back to compile, and
//             the app inherits the domain's runtime (pom app.runtime +
//             mule-artifact.json minMuleVersion) and Java version
//             (javaSpecificationVersions). mule-artifact.json has no domain key.
//   unlink -> domain dependency removed, connectors restored to compile scope,
//             and every domain global element the app still uses (transitively)
//             is copied into src/main/mule/global-configs.xml together with its
//             namespaces, property values and referenced resource files.
//
// loadDomain(dir), loadApp(dir) -> snapshots read from disk
// planLink(app, domain, {otherApps}) / planUnlink(app, domain, {otherApps})
//     -> {ok, blockers[], warnings[], ...actions}   (pure, no writes)
// applyLink(app, domain, plan) / applyUnlink(app, domain, plan) -> files written[]

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import {
  DOMAIN_CLASSIFIER,
  PLUGIN_CLASSIFIER,
  describeProject,
  insertDependency,
  muleConfigFiles,
  readMuleArtifact,
  readPom,
  removeDependency,
  sameGA,
  setDependencyScope,
  setDependencyVersion,
  setProperty,
} from './mule-project.mjs';
import {
  addNamespaces,
  appendGlobalElements,
  collectPlaceholders,
  collectReferences,
  isDomainConfig,
  listGlobalElements,
  parseAttributes,
  rootInfo,
  tokenize,
  usedPrefixes,
} from './mule-xml.mjs';
import { appendProperties, parseProperties, parseYamlKeys } from './properties.mjs';

// Placeholders the runtime resolves per artifact. Inside a domain they resolve
// to the domain; after inlining they would resolve to the application.
const ARTIFACT_SCOPED_PLACEHOLDERS = new Set(['domain', 'fullDomain']);
// Runtime-provided placeholders that need no property file entry.
const RUNTIME_PLACEHOLDERS = new Set([
  'app.name', 'app.home', 'mule.home', 'mule.env', 'mule.version', 'mule.nodeId', 'mule.clusterId',
  'server.host', 'server.ip', 'os.name', 'user.home', 'user.dir', 'java.version',
]);
const RESOURCE_EXTENSIONS = /\.(jks|jceks|p12|pfx|pem|crt|cer|key|keystore|truststore|properties|ya?ml|json|txt|wsdl|xsd|dwl)$/i;

const readText = (p) => readFileSync(p, 'utf8');

// `file` resolved under `base`, or null when it escapes it (`..`, absolute path).
function insideDir(base, file) {
  const path = resolve(base, file);
  const rel = relative(base, path);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? path : null;
}

function semverOk(v) {
  return typeof v === 'string' && /^\d+\.\d+\.\d+([-+].*)?$/.test(v);
}

function minMule(runtime) {
  const m = String(runtime).match(/^(\d+)\.(\d+)\./);
  return m ? `${m[1]}.${m[2]}.0` : null;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

function readConfig(path) {
  const xml = readText(path);
  const info = rootInfo(xml);
  return { path, xml, namespaces: info.namespaces, schemaLocations: info.schemaLocations, elements: listGlobalElements(xml) };
}

function loadPropertyFiles(elements, resourcesDir) {
  const files = [];
  for (const el of elements) {
    if (el.local !== 'configuration-properties' || el.prefix !== '') continue;
    const file = ownAttr(el, 'file');
    if (!file) continue;
    const path = insideDir(resourcesDir, file);
    if (file.includes('${') || !path || !existsSync(path)) {
      files.push({ file, path: path ?? join(resourcesDir, file), values: new Map(), missing: true });
      continue;
    }
    const text = readText(path);
    const values = /\.ya?ml$/i.test(file) ? parseYamlKeys(text) : parseProperties(text);
    files.push({ file, path, values, missing: false });
  }
  return files;
}

function mergedValues(propertyFiles) {
  const out = new Map();
  for (const f of propertyFiles) for (const [k, v] of f.values) if (!out.has(k)) out.set(k, v);
  return out;
}

function findJarPom(dir) {
  const mavenDir = join(dir, 'META-INF', 'maven');
  if (!existsSync(mavenDir)) return null;
  for (const g of readdirSync(mavenDir)) {
    for (const a of readdirSync(join(mavenDir, g))) {
      const p = join(mavenDir, g, a, 'pom.xml');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Load a domain from a project folder or from an extracted
 * `<artifactId>-<version>-mule-domain.jar` (configs at the jar root).
 */
export function loadDomain(dir) {
  const abs = resolve(dir);
  const isProject = existsSync(join(abs, 'pom.xml'));
  const pomPath = isProject ? join(abs, 'pom.xml') : findJarPom(abs);
  if (!pomPath) throw new Error(`${abs} is neither a domain project nor an extracted domain jar`);
  const pom = readPom(readText(pomPath));
  const configRoot = isProject ? join(abs, 'src', 'main', 'mule') : abs;
  const resourcesDir = isProject ? join(abs, 'src', 'main', 'resources') : abs;
  const xmlFiles = isProject
    ? muleConfigFiles(abs)
    : readdirSync(configRoot).filter((f) => f.endsWith('.xml')).map((f) => join(configRoot, f));
  const configs = xmlFiles.filter((p) => isDomainConfig(readText(p))).map(readConfig);
  const elements = configs.flatMap((c) => c.elements.map((e) => ({ ...e, file: c.path })));
  const artifact = isProject
    ? readMuleArtifact(abs)
    : (existsSync(join(abs, 'META-INF', 'mule-artifact', 'mule-artifact.json'))
      ? JSON.parse(readText(join(abs, 'META-INF', 'mule-artifact', 'mule-artifact.json')))
      : null);
  const propertyFiles = loadPropertyFiles(elements, resourcesDir);
  return {
    dir: abs,
    isProject,
    pomText: readText(pomPath),
    pom,
    gav: { groupId: pom.groupId, artifactId: pom.artifactId, version: pom.version },
    runtime: pom.properties['app.runtime'] ?? null,
    minMuleVersion: artifact?.minMuleVersion ?? null,
    java: artifact?.javaSpecificationVersions ?? [],
    configs,
    elements,
    resourcesDir,
    propertyFiles,
    properties: mergedValues(propertyFiles),
  };
}

export function loadApp(dir) {
  const abs = resolve(dir);
  const project = describeProject(abs);
  if (!project) throw new Error(`${abs} is not a Mule project (no pom.xml with mule packaging)`);
  const configs = muleConfigFiles(abs).filter((p) => !isDomainConfig(readText(p))).map(readConfig);
  const elements = configs.flatMap((c) => c.elements.map((e) => ({ ...e, file: c.path })));
  const references = configs.flatMap((c) => collectReferences(c.xml).map((r) => ({ ...r, file: c.path })));
  const resourcesDir = join(abs, 'src', 'main', 'resources');
  const propertyFiles = loadPropertyFiles(elements, resourcesDir);
  return {
    ...project,
    pomText: readText(join(abs, 'pom.xml')),
    pom: readPom(readText(join(abs, 'pom.xml'))),
    artifact: readMuleArtifact(abs),
    configs,
    elements,
    references,
    resourcesDir,
    propertyFiles,
    properties: mergedValues(propertyFiles),
  };
}

/** Attribute of an element's own start tag (children are ignored). */
function ownAttr(el, name) {
  const first = tokenize(el.text)[0];
  return first ? parseAttributes(first.attrs).find((a) => a.name === name)?.value : undefined;
}

const named = (elements) => new Map(elements.filter((e) => e.name).map((e) => [e.name, e]));

function domainPlugins(domain) {
  return domain.pom.dependencies.filter((d) => d.classifier === PLUGIN_CLASSIFIER);
}

function sameDomain(dep, domain) {
  return dep && sameGA(dep, domain.gav);
}

function listenerPorts(elements) {
  const out = [];
  for (const el of elements) {
    if (el.local !== 'listener-config') continue;
    for (const t of tokenize(el.text)) {
      if (!t.tag.endsWith('listener-connection')) continue;
      const port = parseAttributes(t.attrs).find((a) => a.name === 'port')?.value;
      if (port) out.push({ name: el.name, port, file: el.file });
    }
  }
  return out;
}

function resolvePort(port, props) {
  const m = port.match(/^\$\{([^}]+)\}$/);
  return m ? props.get(m[1]) ?? port : port;
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

/** Validate and plan linking `app` to `domain`. Pure. */
export function planLink(app, domain, { otherApps = [] } = {}) {
  const blockers = [];
  const warnings = [];

  if (app.kind !== 'application') blockers.push(`${app.name} is a Mule domain; a domain cannot be linked to another domain.`);
  if (domain.pom.packaging !== 'mule-domain') blockers.push(`${domain.gav.artifactId} is not a Mule domain (pom packaging is "${domain.pom.packaging}").`);
  if (!semverOk(domain.runtime)) blockers.push(`Domain runtime "${domain.runtime}" (pom app.runtime) is not a valid version.`);
  const domainJava = domain.java[0] ?? null;
  if (!domainJava || !/^[1-9]\d*$/.test(String(domainJava))) blockers.push(`Domain Java version "${domainJava}" (mule-artifact.json javaSpecificationVersions) is not valid.`);

  const current = app.domainDependency;
  let mode = 'link';
  if (current && sameDomain(current, domain)) mode = current.version === domain.gav.version ? 'already-linked' : 'change-version';
  else if (current) mode = 'change';

  // Runtime / Java inheritance.
  const runtimeChange = app.runtime !== domain.runtime ? { from: app.runtime, to: domain.runtime } : null;
  const targetMin = domain.minMuleVersion ?? minMule(domain.runtime);
  const minMuleChange = app.minMuleVersion !== targetMin ? { from: app.minMuleVersion, to: targetMin } : null;
  const javaChange = domainJava && JSON.stringify(app.java) !== JSON.stringify([String(domainJava)])
    ? { from: app.java, to: [String(domainJava)] } : null;

  // Connector alignment (ACB alignConnectors).
  const supplied = domainPlugins(domain);
  const connectorChanges = [];
  for (const p of app.pom.dependencies.filter((d) => d.classifier === PLUGIN_CLASSIFIER)) {
    const fromDomain = supplied.find((s) => sameGA(s, p));
    if (fromDomain && (p.scope !== 'provided' || p.version !== fromDomain.version)) {
      connectorChanges.push({ groupId: p.groupId, artifactId: p.artifactId, scope: { from: p.scope ?? 'compile', to: 'provided' }, version: { from: p.version, to: fromDomain.version } });
    } else if (!fromDomain && p.scope === 'provided') {
      connectorChanges.push({ groupId: p.groupId, artifactId: p.artifactId, scope: { from: 'provided', to: 'compile' }, version: { from: p.version, to: p.version } });
    }
  }

  // Cross-project reference validation.
  const appNames = named(app.elements);
  const domainNames = named(domain.elements);
  const resolvedByDomain = [];
  const dangling = [];
  for (const r of app.references) {
    if (appNames.has(r.value)) continue;
    if (domainNames.has(r.value)) resolvedByDomain.push({ ...r, domainElement: domainNames.get(r.value).tag });
    else dangling.push(r);
  }
  for (const r of dangling) {
    warnings.push(`${basename(r.file)}: ${r.attr}="${r.value}" on <${r.element}> resolves to no global element in the application or the domain.`);
  }
  const shadowed = [];
  for (const [name, el] of appNames) {
    if (domainNames.has(name)) {
      shadowed.push({ name, appElement: el.tag, domainElement: domainNames.get(name).tag, file: el.file });
      warnings.push(`Application global "${name}" (<${el.tag}> in ${basename(el.file)}) hides the domain's <${domainNames.get(name).tag}> of the same name; the application keeps using its own.`);
    }
  }
  // An app listener on the same port as a shared listener fails to bind at deploy time.
  const domainPorts = listenerPorts(domain.elements).map((p) => ({ ...p, port: resolvePort(p.port, domain.properties) }));
  for (const ap of listenerPorts(app.elements)) {
    const port = resolvePort(ap.port, app.properties);
    const clash = domainPorts.find((d) => d.port === port && d.name !== ap.name);
    if (clash) warnings.push(`Application listener "${ap.name}" binds port ${port}, which the domain's shared listener "${clash.name}" already binds. Point the application's listeners at "${clash.name}" and remove "${ap.name}".`);
  }
  // Domain placeholders the domain itself cannot resolve.
  for (const el of domain.elements) {
    for (const key of collectPlaceholders(el.text)) {
      if (key.startsWith('secure::') || RUNTIME_PLACEHOLDERS.has(key) || ARTIFACT_SCOPED_PLACEHOLDERS.has(key)) continue;
      if (!domain.properties.has(key) && !domainNames.has(key)) {
        warnings.push(`Domain element "${el.name ?? el.tag}" uses \${${key}}, which no domain properties file defines; it must come from a system property at deploy time.`);
      }
    }
  }
  if (/<cloudhub2?Deployment>/.test(app.pomText)) {
    warnings.push('The application pom configures a CloudHub deployment. CloudHub does not support domains: deploy linked applications to a customer-hosted Mule runtime, or unlink the domain before deploying to CloudHub.');
  }
  const linkedSiblings = otherApps.filter((o) => o.dir !== app.dir && sameDomain(o.domainDependency, domain)).map((o) => o.name);

  return {
    ok: blockers.length === 0,
    mode,
    app: app.dir,
    domain: { dir: domain.dir, ...domain.gav },
    previousDomain: mode === 'change' ? current : null,
    blockers,
    warnings,
    actions: {
      pomDependency: { groupId: domain.gav.groupId, artifactId: domain.gav.artifactId, version: domain.gav.version, classifier: DOMAIN_CLASSIFIER, scope: 'provided' },
      runtimeChange,
      minMuleChange,
      javaChange,
      connectorChanges,
    },
    references: { resolvedByDomain, dangling, shadowed },
    linkedSiblings,
  };
}

/** Write the link plan to the app's pom.xml and mule-artifact.json. */
export function applyLink(app, _domain, plan) {
  if (!plan.ok) throw new Error(`refusing to link: ${plan.blockers.join(' ')}`);
  let pom = app.pomText;
  for (const d of readPom(pom).dependencies.filter((x) => x.classifier === DOMAIN_CLASSIFIER)) {
    pom = removeDependency(pom, { groupId: d.groupId, artifactId: d.artifactId, classifier: DOMAIN_CLASSIFIER });
  }
  pom = insertDependency(pom, plan.actions.pomDependency);
  for (const c of plan.actions.connectorChanges) {
    const match = { groupId: c.groupId, artifactId: c.artifactId, classifier: PLUGIN_CLASSIFIER };
    pom = setDependencyScope(pom, match, c.scope.to === 'compile' ? null : c.scope.to);
    if (c.version.to !== c.version.from) pom = setDependencyVersion(pom, match, c.version.to);
  }
  if (plan.actions.runtimeChange) pom = setProperty(pom, 'app.runtime', plan.actions.runtimeChange.to);
  const written = [];
  writeFileSync(join(app.dir, 'pom.xml'), pom);
  written.push(join(app.dir, 'pom.xml'));

  if (plan.actions.minMuleChange || plan.actions.javaChange) {
    const path = join(app.dir, 'mule-artifact.json');
    const artifact = app.artifact ?? {};
    if (plan.actions.minMuleChange) artifact.minMuleVersion = plan.actions.minMuleChange.to;
    if (plan.actions.javaChange) artifact.javaSpecificationVersions = plan.actions.javaChange.to;
    writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
    written.push(path);
  }
  return written;
}

// ---------------------------------------------------------------------------
// Unlink
// ---------------------------------------------------------------------------

function elementAttrValues(text) {
  return tokenize(text).filter((t) => t.kind !== 'close').flatMap((t) => parseAttributes(t.attrs).map((a) => a.value));
}

/** Plan unlinking `app` from `domain`, inlining the shared configs it still uses. Pure. */
export function planUnlink(app, domain, { otherApps = [] } = {}) {
  const blockers = [];
  const warnings = [];
  if (!app.domainDependency) blockers.push(`${app.name} is not linked to a domain (no <classifier>mule-domain</classifier> dependency in pom.xml).`);
  else if (!sameDomain(app.domainDependency, domain)) {
    blockers.push(`${app.name} is linked to ${app.domainDependency.groupId}:${app.domainDependency.artifactId}, not ${domain.gav.groupId}:${domain.gav.artifactId}.`);
  }

  const appNames = named(app.elements);
  const domainNames = named(domain.elements);

  // Transitive closure of domain elements the application still uses.
  const used = new Map();
  const queue = app.references.filter((r) => !appNames.has(r.value) && domainNames.has(r.value)).map((r) => r.value);
  while (queue.length) {
    const name = queue.shift();
    if (used.has(name)) continue;
    const el = domainNames.get(name);
    used.set(name, el);
    for (const r of collectReferences(el.text)) {
      if (domainNames.has(r.value) && !appNames.has(r.value)) queue.push(r.value);
      else if (appNames.has(r.value)) {
        blockers.push(`Shared "${name}" references "${r.value}", which the application also defines; once inlined it would use the application's "${r.value}" (<${appNames.get(r.value).tag}>) instead of the domain's. Rename one of them first.`);
      }
    }
  }
  // Global properties and secure-properties configs are used through placeholders, not references.
  const globalProps = new Map(domain.elements
    .filter((e) => e.local === 'global-property' && e.prefix === '')
    .map((e) => [ownAttr(e, 'name'), e]));
  const secureConfigs = domain.elements.filter((e) => e.local === 'config' && e.prefix === 'secure-properties');

  const inlineElements = [...used.values()].sort((a, b) => (a.file === b.file ? a.start - b.start : a.file.localeCompare(b.file)));
  const properties = [];
  const extraElements = [];
  const resourceFiles = [];
  let needsSecure = false;
  const inlineProperty = (key, owner) => {
    const value = domain.properties.get(key);
    if (app.properties.has(key)) {
      if (app.properties.get(key) !== value) {
        blockers.push(`Property "${key}" is "${value}" in the domain but "${app.properties.get(key)}" in the application; the inlined "${owner}" would silently change behavior. Decide which value to keep.`);
      }
    } else if (!properties.some(([k]) => k === key)) {
      properties.push([key, value]);
    }
  };

  for (const el of inlineElements) {
    for (const key of collectPlaceholders(el.text)) {
      if (ARTIFACT_SCOPED_PLACEHOLDERS.has(key)) {
        blockers.push(`Shared "${el.name}" uses \${${key}}, which resolves to the domain name inside a domain but to nothing inside an application. Replace it with a literal or a property before unlinking.`);
        continue;
      }
      if (key.startsWith('secure::')) {
        needsSecure = true;
        continue;
      }
      if (RUNTIME_PLACEHOLDERS.has(key)) continue;
      if (domain.properties.has(key)) {
        inlineProperty(key, el.name);
      } else if (globalProps.has(key)) {
        if (!appNames.has(key) && !extraElements.includes(globalProps.get(key))) extraElements.push(globalProps.get(key));
      } else if (!app.properties.has(key)) {
        warnings.push(`Shared "${el.name}" uses \${${key}}, which neither the domain nor the application defines; supply it as a system property or add it to the application's properties.`);
      }
    }
    for (const value of elementAttrValues(el.text)) {
      if (!RESOURCE_EXTENSIONS.test(value) || value.includes('${')) continue;
      const src = insideDir(domain.resourcesDir, value);
      const dest = insideDir(app.resourcesDir, value);
      if (!src || !dest) {
        warnings.push(`Shared "${el.name}" references resource "${value}" outside src/main/resources; it is not copied. Copy it into the application manually if needed.`);
        continue;
      }
      if (!existsSync(src)) continue;
      if (existsSync(dest)) {
        if (readFileSync(dest).equals(readFileSync(src))) continue;
        blockers.push(`Shared "${el.name}" needs resource "${value}", but the application already has a different file at that path.`);
      } else if (!resourceFiles.some((f) => f.dest === dest)) {
        resourceFiles.push({ src, dest, file: value });
      }
    }
  }
  if (needsSecure) {
    if (secureConfigs.length === 0) {
      blockers.push('Inlined configs use ${secure::...} placeholders but the domain has no <secure-properties:config>; the values cannot be resolved after unlinking.');
    } else {
      for (const sc of secureConfigs) {
        if (!appNames.has(sc.name)) extraElements.push(sc);
        const file = ownAttr(sc, 'file');
        if (file && !file.includes('${')) {
          const src = insideDir(domain.resourcesDir, file);
          const dest = insideDir(app.resourcesDir, file);
          if (!src || !dest) {
            warnings.push(`Secure properties "${sc.name}" reads "${file}" outside src/main/resources; it is not copied. Copy it into the application manually if needed.`);
          } else if (existsSync(src) && !existsSync(dest) && !resourceFiles.some((f) => f.dest === dest)) {
            resourceFiles.push({ src, dest, file });
          }
        }
        for (const key of collectPlaceholders(sc.text)) if (domain.properties.has(key)) inlineProperty(key, sc.name);
      }
      warnings.push('Inlined configs read encrypted ${secure::...} values: the application must now be started with the same secure-properties encryption key the domain used.');
    }
  }

  // Apps that keep sharing this domain and use the same listener would now bind its port twice.
  const siblings = otherApps.filter((o) => o.dir !== app.dir && sameDomain(o.domainDependency, domain));
  for (const el of inlineElements.filter((e) => e.local === 'listener-config')) {
    for (const p of listenerPorts([el])) {
      warnings.push(`Inlined listener "${el.name}" binds port ${resolvePort(p.port, domain.properties)}. While the domain stays deployed${siblings.length ? ` (still linked: ${siblings.map((s) => s.name).join(', ')})` : ''}, both cannot run in the same Mule runtime on that port; change the port in the application if they will.`);
    }
  }

  // Connectors: provided -> compile; domain-only connectors and shared libraries re-added at compile scope.
  const connectorChanges = [];
  for (const d of domain.pom.dependencies) {
    if (d.scope === 'test' || d.classifier === DOMAIN_CLASSIFIER) continue;
    const mine = app.pom.dependencies.find((a) => sameGA(a, d) && (a.classifier ?? null) === (d.classifier ?? null));
    if (mine) {
      if (mine.scope === 'provided' && d.classifier === PLUGIN_CLASSIFIER) connectorChanges.push({ action: 'compile-scope', groupId: d.groupId, artifactId: d.artifactId, version: mine.version });
    } else {
      connectorChanges.push({ action: 'add', groupId: d.groupId, artifactId: d.artifactId, version: d.version, classifier: d.classifier ?? undefined });
    }
  }
  const appLibraries = readSharedLibraries(app.pomText);
  const sharedLibraries = readSharedLibraries(domain.pomText).filter((s) => !appLibraries.some((a) => sameGA(a, s)));
  if (sharedLibraries.length) {
    warnings.push(`The domain declares shared libraries (${sharedLibraries.map((s) => s.artifactId).join(', ')}) in its mule-maven-plugin <sharedLibraries>; they are added to the application's mule-maven-plugin configuration.`);
  }

  const propertiesFile = `${domain.gav.artifactId}.properties`;
  return {
    ok: blockers.length === 0,
    app: app.dir,
    domain: { dir: domain.dir, ...domain.gav },
    blockers,
    warnings,
    actions: {
      removeDependency: app.domainDependency,
      inline: [...inlineElements, ...extraElements].map((e) => ({ name: e.name, tag: e.tag, from: e.file })),
      properties: { file: propertiesFile, entries: properties },
      resourceFiles: resourceFiles.map((f) => ({ file: f.file, from: f.src, to: f.dest })),
      connectorChanges,
      sharedLibraries,
    },
    unused: domain.elements.filter((e) => e.name && !used.has(e.name) && !extraElements.includes(e)).map((e) => ({ name: e.name, tag: e.tag })),
    _inline: [...inlineElements, ...extraElements],
  };
}

const GLOBAL_CONFIGS_SKELETON = `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd">

</mule>
`;

function readSharedLibraries(pomText) {
  return [...pomText.matchAll(/<sharedLibrary>\s*([\s\S]*?)<\/sharedLibrary>/g)].map((m) => ({
    groupId: m[1].match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/)?.[1],
    artifactId: m[1].match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1],
  })).filter((l) => l.groupId && l.artifactId);
}

function namespacesFor(elements, domain) {
  const out = new Map();
  for (const el of elements) {
    const config = domain.configs.find((c) => c.path === el.file);
    for (const prefix of usedPrefixes(el.text)) {
      if (prefix === 'doc' || out.has(prefix)) continue;
      const uri = config?.namespaces[prefix];
      if (!uri) continue;
      out.set(prefix, { prefix, uri, schemaLocation: config.schemaLocations[uri] });
    }
  }
  if (!out.has('doc')) out.set('doc', { prefix: 'doc', uri: 'http://www.mulesoft.org/schema/mule/documentation' });
  return [...out.values()];
}

function addSharedLibraries(pom, libs) {
  if (libs.length === 0) return pom;
  const entries = libs.map((l) => `                        <sharedLibrary>\n                            <groupId>${l.groupId}</groupId>\n                            <artifactId>${l.artifactId}</artifactId>\n                        </sharedLibrary>`).join('\n');
  const plugin = pom.match(/<plugin>\s*<groupId>org\.mule\.tools\.maven<\/groupId>\s*<artifactId>mule-maven-plugin<\/artifactId>[\s\S]*?<\/plugin>/);
  if (!plugin) throw new Error('application pom.xml has no mule-maven-plugin to add <sharedLibraries> to');
  let block = plugin[0];
  if (/<\/sharedLibraries>/.test(block)) block = block.replace(/(\s*)<\/sharedLibraries>/, `\n${entries}$1</sharedLibraries>`);
  else if (/<configuration\s*\/>/.test(block)) block = block.replace(/<configuration\s*\/>/, `<configuration>\n                    <sharedLibraries>\n${entries}\n                    </sharedLibraries>\n                </configuration>`);
  else if (/<configuration>/.test(block)) block = block.replace(/<configuration>/, `<configuration>\n                    <sharedLibraries>\n${entries}\n                    </sharedLibraries>`);
  else block = block.replace(/(\s*)<\/plugin>$/, `\n                <configuration>\n                    <sharedLibraries>\n${entries}\n                    </sharedLibraries>\n                </configuration>$1</plugin>`);
  return pom.slice(0, plugin.index) + block + pom.slice(plugin.index + plugin[0].length);
}

/** Apply an unlink plan. Refuses when the plan has blockers unless `force`. */
export function applyUnlink(app, domain, plan, { force = false } = {}) {
  if (!plan.ok && !force) throw new Error(`refusing to unlink: ${plan.blockers.join(' ')}`);
  const written = [];

  // 1. Inline shared configs into global-configs.xml.
  if (plan._inline.length || plan.actions.properties.entries.length) {
    const target = join(app.dir, 'src', 'main', 'mule', 'global-configs.xml');
    mkdirSync(join(app.dir, 'src', 'main', 'mule'), { recursive: true });
    let xml = existsSync(target) ? readText(target) : GLOBAL_CONFIGS_SKELETON;
    xml = addNamespaces(xml, namespacesFor(plan._inline, domain));
    const texts = [];
    const { file, entries } = plan.actions.properties;
    if (entries.length && !app.propertyFiles.some((f) => f.file === file)) {
      texts.push(`<configuration-properties file="${file}" doc:name="Properties inlined from ${domain.gav.artifactId}" />`);
    }
    texts.push(...plan._inline.map((e) => e.text));
    xml = appendGlobalElements(xml, texts);
    writeFileSync(target, xml);
    written.push(target);

    if (entries.length) {
      mkdirSync(app.resourcesDir, { recursive: true });
      const propsPath = join(app.resourcesDir, file);
      const existing = existsSync(propsPath) ? readText(propsPath) : '';
      writeFileSync(propsPath, appendProperties(existing, entries, `Inlined from Mule domain ${domain.gav.groupId}:${domain.gav.artifactId}:${domain.gav.version}`));
      written.push(propsPath);
    }
  }

  // 2. Resource files (keystores, truststores, ...).
  for (const f of plan.actions.resourceFiles) {
    mkdirSync(join(f.to, '..'), { recursive: true });
    copyFileSync(f.from, f.to);
    written.push(f.to);
  }

  // 3. pom.xml.
  let pom = app.pomText;
  if (plan.actions.removeDependency) {
    pom = removeDependency(pom, { ...plan.actions.removeDependency, classifier: DOMAIN_CLASSIFIER });
  }
  for (const c of plan.actions.connectorChanges) {
    if (c.action === 'compile-scope') pom = setDependencyScope(pom, { groupId: c.groupId, artifactId: c.artifactId, classifier: PLUGIN_CLASSIFIER }, null);
    else pom = insertDependency(pom, { groupId: c.groupId, artifactId: c.artifactId, version: c.version, classifier: c.classifier });
  }
  pom = addSharedLibraries(pom, plan.actions.sharedLibraries);
  writeFileSync(join(app.dir, 'pom.xml'), pom);
  written.push(join(app.dir, 'pom.xml'));
  return written;
}

/** Drop internal fields before printing a plan. */
export function publicPlan(plan) {
  const { _inline, ...rest } = plan;
  return rest;
}
