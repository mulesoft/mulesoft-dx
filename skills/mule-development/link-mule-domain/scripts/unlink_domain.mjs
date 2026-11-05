#!/usr/bin/env node
// unlink_domain — remove an application's domain link and inline every shared
// configuration the application still uses, so it stays valid standalone:
// referenced domain global elements (transitively, plus the global-property /
// secure-properties elements their placeholders need) are copied into
// src/main/mule/global-configs.xml with their namespaces; the property values
// they need go to src/main/resources/<domain-artifactId>.properties (registered
// via <configuration-properties>); referenced resource files (keystores, ...)
// are copied; the domain dependency is removed and its connectors and shared
// libraries are restored at compile scope.
//
// Usage:
//   node scripts/unlink_domain.mjs <app-dir> [--domain-dir <dir>] [--workspace <root>]... [--dry-run] [--force]
// The domain is found among the --workspace projects by groupId:artifactId when
// --domain-dir is omitted. For a domain only installed in ~/.m2, extract the jar
// (path printed on failure) and pass the extracted folder as --domain-dir.
// --force applies a plan that has blockers (blocked items must then be fixed by hand).
// Exit codes:
//   0  unlinked (or, with --dry-run, the plan has no blockers)
//   1  bad arguments, unreadable project, or domain sources not found
//   2  blockers found — nothing was written (unless --force)

import { argv, exit, stderr, stdout } from 'node:process';
import { applyUnlink, loadApp, loadDomain, planUnlink, publicPlan } from '../lib/domain-link.mjs';
import { domainArtifactPaths, findMuleProjects, sameGA } from '../lib/mule-project.mjs';

const positional = [];
const workspace = [];
let domainDir = null;
let dryRun = false;
let force = false;
const args = argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--force') force = true;
  else if (args[i] === '--workspace' && args[i + 1]) workspace.push(args[++i]);
  else if (args[i] === '--domain-dir' && args[i + 1]) domainDir = args[++i];
  else positional.push(args[i]);
}
if (positional.length !== 1) {
  stderr.write('❌ usage: unlink_domain.mjs <app-dir> [--domain-dir <dir>] [--workspace <root>]... [--dry-run] [--force]\n');
  exit(1);
}

try {
  const app = loadApp(positional[0]);
  if (!app.domainDependency) {
    stderr.write(`❌ ${app.name} is not linked to a domain.\n`);
    exit(1);
  }
  const others = findMuleProjects(workspace);
  if (!domainDir) {
    const match = others.find((p) => p.kind === 'domain' && sameGA(p.gav, app.domainDependency));
    if (!match) {
      const { jar } = domainArtifactPaths(app.domainDependency);
      stderr.write(`❌ Domain ${app.domainDependency.groupId}:${app.domainDependency.artifactId} is not in the workspace. Open the domain project and pass --domain-dir, or extract ${jar} (e.g. 'unzip -o <jar> -d tmp/domain-src') and pass --domain-dir tmp/domain-src.\n`);
      exit(1);
    }
    domainDir = match.dir;
  }
  const domain = loadDomain(domainDir);
  const plan = planUnlink(app, domain, { otherApps: others });
  if (!plan.ok && !force) {
    stdout.write(`${JSON.stringify(publicPlan(plan), null, 2)}\n`);
    exit(2);
  }
  const written = dryRun ? [] : applyUnlink(app, domain, plan, { force });
  stdout.write(`${JSON.stringify({ ...publicPlan(plan), dryRun, forced: force && !plan.ok, written }, null, 2)}\n`);
} catch (err) {
  stderr.write(`❌ ${err.message}\n`);
  exit(1);
}
