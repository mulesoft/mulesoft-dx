#!/usr/bin/env node
// scan_workspace — list every Mule domain and application under the given
// roots (depth 0-2), with each application's linked domain and where it
// resolves (workspace | installed in ~/.m2 | version-mismatch | missing), and
// each domain's shared global elements and linked applications.
//
// Usage:
//   node scripts/scan_workspace.mjs <root> [<root> ...]
// Pass every workspace folder from get_workspace_info (or the workspace root).
// Prints JSON {domains[], applications[]} on stdout.
// Exit codes:
//   0  scan completed (even when nothing was found)
//   1  bad arguments

import { argv, exit, stderr, stdout } from 'node:process';
import { scanWorkspace } from '../lib/workspace.mjs';

const roots = argv.slice(2);
if (roots.length === 0) {
  stderr.write('❌ usage: scan_workspace.mjs <root> [<root> ...]\n');
  exit(1);
}
stdout.write(`${JSON.stringify(scanWorkspace(roots), null, 2)}\n`);
