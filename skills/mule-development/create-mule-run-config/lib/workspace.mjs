// Copied from link-mule-domain/lib/workspace.mjs — keep in sync (enforced by run-plan.test.mjs).
// workspace.mjs — find domains and applications, and resolve each application's
// domain the way Anypoint Code Builder does: workspace project first, then the
// local Maven repository (~/.m2). Statuses match ACB's domain link report:
//   none | workspace | installed | version-mismatch | missing
//
// scanWorkspace(roots[]) -> {domains[], applications[]}
// resolveDomain(dependency, domains[]) -> {status, dir?, jar?, foundVersion?}

import { existsSync, readFileSync } from 'node:fs';
import { domainArtifactPaths, findMuleProjects, muleConfigFiles, sameGA } from './mule-project.mjs';
import { isDomainConfig, listGlobalElements } from './mule-xml.mjs';

export function resolveDomain(dep, domains) {
  if (!dep) return { status: 'none' };
  const inWorkspace = domains.find((d) => sameGA(d.gav, dep));
  if (inWorkspace && inWorkspace.gav.version === dep.version) return { status: 'workspace', dir: inWorkspace.dir };
  const { jar } = domainArtifactPaths(dep);
  if (existsSync(jar)) return { status: 'installed', jar, ...(inWorkspace ? { workspaceDir: inWorkspace.dir, workspaceVersion: inWorkspace.gav.version } : {}) };
  if (inWorkspace) return { status: 'version-mismatch', dir: inWorkspace.dir, foundVersion: inWorkspace.gav.version, jar };
  return { status: 'missing', jar };
}

function sharedElements(dir) {
  return muleConfigFiles(dir)
    .map((p) => readFileSync(p, 'utf8'))
    .filter(isDomainConfig)
    .flatMap((xml) => listGlobalElements(xml).map((e) => ({ name: e.name, tag: e.tag })));
}

export function scanWorkspace(roots) {
  const projects = findMuleProjects(roots);
  const domains = projects.filter((p) => p.kind === 'domain');
  const applications = projects.filter((p) => p.kind === 'application');
  return {
    domains: domains.map((d) => ({
      ...d,
      installed: existsSync(domainArtifactPaths(d.gav).jar),
      sharedElements: sharedElements(d.dir),
      linkedApplications: applications.filter((a) => a.domainDependency && sameGA(a.domainDependency, d.gav)).map((a) => a.name),
    })),
    applications: applications.map((a) => ({ ...a, domain: resolveDomain(a.domainDependency, domains) })),
  };
}
