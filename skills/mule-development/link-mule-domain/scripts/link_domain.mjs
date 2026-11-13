#!/usr/bin/env node
// link_domain — validate and link a Mule application to a Mule domain, exactly
// as Anypoint Code Builder's Project Properties > Domain does: the domain
// dependency (classifier mule-domain, scope provided) goes into the app pom
// (replacing any previous domain), connectors the domain supplies become
// `provided` at the domain's version, connectors only the previous domain
// supplied go back to compile scope, and the app inherits the domain's runtime
// (pom app.runtime, mule-artifact.json minMuleVersion) and Java version
// (mule-artifact.json javaSpecificationVersions).
//
// Usage:
//   node scripts/link_domain.mjs <app-dir> <domain-dir> [--workspace <root>]... [--dry-run]
// <domain-dir> is a domain project, or an extracted <artifactId>-<version>-mule-domain.jar.
// --workspace roots are scanned for other applications that share the domain.
// Prints the plan JSON (blockers, warnings, actions, cross-project references).
// Exit codes:
//   0  linked (or, with --dry-run, the link is valid)
//   1  bad arguments or unreadable project
//   2  blockers found — nothing was written

import { argv, exit, stderr, stdout } from 'node:process';
import { applyLink, loadApp, loadDomain, planLink, previousDomainPlugins } from '../lib/domain-link.mjs';
import { findMuleProjects } from '../lib/mule-project.mjs';

const positional = [];
const workspace = [];
let dryRun = false;
const args = argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--workspace' && args[i + 1]) workspace.push(args[++i]);
  else positional.push(args[i]);
}
if (positional.length !== 2) {
  stderr.write('❌ usage: link_domain.mjs <app-dir> <domain-dir> [--workspace <root>]... [--dry-run]\n');
  exit(1);
}

try {
  const app = loadApp(positional[0]);
  const domain = loadDomain(positional[1]);
  const projects = findMuleProjects(workspace);
  const plan = planLink(app, domain, { otherApps: projects, previousPlugins: previousDomainPlugins(app, projects) });
  if (!plan.ok) {
    stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    exit(2);
  }
  const written = dryRun || plan.mode === 'already-linked' ? [] : applyLink(app, domain, plan);
  stdout.write(`${JSON.stringify({ ...plan, dryRun, written }, null, 2)}\n`);
} catch (err) {
  stderr.write(`❌ ${err.message}\n`);
  exit(1);
}
