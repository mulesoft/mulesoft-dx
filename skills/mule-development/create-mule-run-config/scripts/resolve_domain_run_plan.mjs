#!/usr/bin/env node
// resolve_domain_run_plan — validate and order the projects of a run/debug
// configuration when Mule domains are involved, before calling
// manage_run_configuration.
//
// Usage:
//   node scripts/resolve_domain_run_plan.mjs --select <path> [--select <path>]... \
//     --workspace <path> [--workspace <path>]...
// --select     each project the user picked (absolute path)
// --workspace  each workspace folder from get_workspace_info (absolute path)
//
// Prints JSON {ok, projects[], scope, domains[], suggestedApplications[], errors[], warnings[]}.
// `projects` is the ordered list (workspace domains first, then applications)
// to pass to manage_run_configuration; `scope` is the matching execute scope.
// Exit codes:
//   0  plan is valid (may still carry warnings or suggestions)
//   1  bad arguments
//   2  plan has errors (domain-only selection, missing or uninstalled domain)

import { argv, exit, stderr, stdout } from 'node:process';
import { resolveRunPlan } from '../lib/run-plan.mjs';

const selected = [];
const workspace = [];
const args = argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--select' && args[i + 1]) selected.push(args[++i]);
  else if (args[i] === '--workspace' && args[i + 1]) workspace.push(args[++i]);
  else {
    stderr.write(`❌ unexpected argument ${args[i]}\n`);
    exit(1);
  }
}
if (selected.length === 0) {
  stderr.write('❌ usage: resolve_domain_run_plan.mjs --select <path>... [--workspace <path>]...\n');
  exit(1);
}

try {
  const plan = resolveRunPlan(selected, workspace);
  stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  exit(plan.ok ? 0 : 2);
} catch (err) {
  stderr.write(`❌ ${err.message}\n`);
  exit(1);
}
