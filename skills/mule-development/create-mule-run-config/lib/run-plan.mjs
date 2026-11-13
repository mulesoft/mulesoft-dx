// run-plan.mjs — make a run/debug configuration domain-aware before it is
// created with manage_run_configuration.
//
// resolveRunPlan(selected[], workspace[]) -> {
//   ok, projects[], scope, domains[], suggestedApplications[], errors[], warnings[]
// }
//   selected   absolute paths the user picked
//   workspace  absolute paths of every workspace folder (get_workspace_info)
//
// Mirrors Anypoint Code Builder's launch behavior: a launch that contains only
// domains is rejected; each launched application's domain must be a workspace
// project or be installed in ~/.m2; launched domains are `mvn install`ed and
// deployed before any application. `projects` lists the workspace domains
// first, then the applications, so the order matches deploy order.

import { resolve } from 'node:path';
import { describeProject, findMuleProjects, gavString, sameGA } from './mule-project.mjs';
import { resolveDomain } from './workspace.mjs';

export function resolveRunPlan(selected, workspace) {
  const known = findMuleProjects([...workspace, ...selected]);
  const byDir = new Map(known.map((p) => [p.dir, p]));
  const domains = known.filter((p) => p.kind === 'domain');
  const errors = [];
  const warnings = [];

  const picked = [];
  for (const raw of selected) {
    const dir = resolve(raw);
    const project = byDir.get(dir) ?? describeProject(dir);
    if (!project) errors.push(`${dir} is not a Mule application or domain project.`);
    else if (!picked.some((p) => p.dir === project.dir)) picked.push(project);
  }

  const apps = picked.filter((p) => p.kind === 'application');
  const pickedDomains = picked.filter((p) => p.kind === 'domain');
  const domainEntries = new Map(); // key groupId:artifactId -> entry
  const entryFor = (gav, extra) => {
    const key = `${gav.groupId}:${gav.artifactId}`;
    if (!domainEntries.has(key)) domainEntries.set(key, { name: gav.artifactId, gav: gavString(gav), applications: [], ...extra });
    return domainEntries.get(key);
  };

  for (const d of pickedDomains) entryFor(d.gav, { source: 'workspace', dir: d.dir, selected: true });

  for (const app of apps) {
    const dep = app.domainDependency;
    if (!dep) continue;
    const status = resolveDomain(dep, domains);
    const id = gavString(dep);
    if (status.status === 'workspace') {
      entryFor(dep, { source: 'workspace', dir: status.dir, selected: false }).applications.push(app.name);
    } else if (status.status === 'installed') {
      entryFor(dep, { source: 'installed', jar: status.jar }).applications.push(app.name);
      if (status.workspaceDir) {
        warnings.push(`${app.name} uses domain ${id} from ~/.m2, but the workspace has ${dep.artifactId} ${status.workspaceVersion}; changes in the workspace domain are not picked up until the app is re-linked to that version.`);
      }
    } else if (status.status === 'version-mismatch') {
      errors.push(`${app.name} requires domain ${id}, but the workspace has version ${status.foundVersion} and ${dep.version} is not installed in the local Maven repository (expected ${status.jar}). Re-link the app to ${status.foundVersion}, or install ${dep.version} with 'mvn install'.`);
    } else {
      errors.push(`Domain ${id} is not installed in the local Maven repository (expected ${status.jar}). Open the domain project in this workspace, or install it with 'mvn install'. Required by ${app.name}.`);
    }
  }

  // Domains picked on their own: suggest their linked applications.
  const suggestedApplications = [];
  for (const d of pickedDomains) {
    const linked = known.filter((p) => p.kind === 'application' && p.domainDependency && sameGA(p.domainDependency, d.gav));
    for (const a of linked) {
      if (apps.some((x) => x.dir === a.dir)) continue;
      if (!suggestedApplications.some((s) => s.path === a.dir)) suggestedApplications.push({ name: a.name, path: a.dir, domain: d.name });
    }
    if (linked.length === 0) warnings.push(`No application in the workspace is linked to domain ${d.name}.`);
    else if (apps.length && !apps.some((a) => a.domainDependency && sameGA(a.domainDependency, d.gav))) {
      warnings.push(`Domain ${d.name} is selected but none of the selected applications use it; it is deployed anyway.`);
    }
  }
  if (picked.length && apps.length === 0) {
    errors.push(`A run configuration cannot contain only domain projects (${pickedDomains.map((d) => d.name).join(', ')}); add at least one application${suggestedApplications.length ? ` — linked: ${suggestedApplications.map((s) => s.name).join(', ')}` : ''}.`);
  }

  const workspaceDomains = [...domainEntries.values()].filter((e) => e.source === 'workspace').map((e) => e.dir);
  const projects = [...new Set([...workspaceDomains, ...apps.map((a) => a.dir)])];
  return {
    ok: errors.length === 0,
    projects,
    scope: projects.length > 1 ? 'workspace' : 'project',
    domains: [...domainEntries.values()],
    suggestedApplications,
    errors,
    warnings,
  };
}
