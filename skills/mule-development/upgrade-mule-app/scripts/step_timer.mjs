#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Opt-in DEBUG helper — per-step wall-clock timing. Only used when the user
// asked to run the skill with timing; a normal run never calls it. Each call is
// a separate process (every Bash call is a fresh shell), so state lives in an
// append-only JSONL file in the app directory, OUTSIDE tmp/ (Step 19 deletes
// tmp/). A step's duration is the time from its `mark` to the next `mark`.
//
// Usage:
//   node scripts/step_timer.mjs init [projectDir]
//   node scripts/step_timer.mjs mark <step> [projectDir]
//   node scripts/step_timer.mjs wait-start [projectDir]
//   node scripts/step_timer.mjs wait-end [projectDir]
//   node scripts/step_timer.mjs report [projectDir]
//
//   init        Start a timing run (replaces any earlier timing file).
//   mark        Record that <step> is starting. No-op unless `init` ran. Steps 16 and 17 are numbered by
//               the script (`mark 16` -> 16#1, 16#2, ...).
//   wait-start/ Bracket an AskUserQuestion prompt; the wait is carved out of the
//   wait-end    step and shown as its own row.
//   report      Print the per-step table and write it next to the JSONL.
//               Idempotent; safe to call at every STOP/HALT.
//
// Files: <projectDir>/upgrade-timing.jsonl (raw events) and
// <projectDir>/upgrade-timing.md (table). UPGRADE_MULE_APP_TIMING_FILE overrides
// the JSONL path. NOT gitignored — the report says so.
//
// Exit code:
//   0  always — timing must never break an upgrade. Problems go to stderr as
//      warnings; the caller ignores them and never stops on a timer warning.
import { argv, exit, stderr, stdout } from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  appendEvent, computeReport, isValidLabel, nextLabel, now, readEvents, renderReport,
  reportPath, timingActive, timingPath,
} from '../lib/step-timing.mjs';

stdout.on('error', (e) => { if (e.code === 'EPIPE') exit(0); });

function warn(msg) {
  stderr.write(`⚠️  step_timer: ${msg}\n`);
}

function usage() {
  warn('usage: step_timer.mjs init [dir] | mark <step> [dir] | wait-start [dir] | wait-end [dir] | report [dir]');
}

function init(projectDir) {
  const p = timingPath(projectDir);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, '');
  appendEvent(projectDir, { t: 'init', ts: now() });
  stdout.write(`Timing on. Marks go to ${p}\n`);
}

function mark(projectDir, step) {
  if (!timingActive(projectDir)) return;
  if (!isValidLabel(step)) {
    warn(`ignoring invalid step label '${step ?? ''}' (letters, digits, '.', '#', '_', '-'; max 20 chars)`);
    return;
  }
  const label = nextLabel(step, readEvents(projectDir));
  appendEvent(projectDir, { t: 'mark', step: label, ts: now() });
  stdout.write(`marked ${label}\n`);
}

function wait(projectDir, kind) {
  if (!timingActive(projectDir)) return;
  appendEvent(projectDir, { t: 'wait', kind, ts: now() });
  stdout.write(`wait-${kind}\n`);
}

function report(projectDir) {
  const events = readEvents(projectDir);
  if (events.length === 0) {
    warn(`no timing data at ${timingPath(projectDir)} — was 'init' run?`);
    return;
  }
  const md = renderReport(computeReport(events, now()));
  const out = reportPath(timingPath(projectDir));
  writeFileSync(out, md + '\n');
  stdout.write(md + `\nTiming written to ${out} (raw marks: ${timingPath(projectDir)}). These files are not gitignored.\n`);
}

function main() {
  const args = argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1).filter((a) => !a.startsWith('--'));
  const dirArg = (i) => path.resolve(rest[i] ?? '.');
  switch (cmd) {
    case 'init': init(dirArg(0)); break;
    case 'mark': mark(dirArg(1), rest[0]); break;
    case 'wait-start': wait(dirArg(0), 'start'); break;
    case 'wait-end': wait(dirArg(0), 'end'); break;
    case 'report': report(dirArg(0)); break;
    default: usage();
  }
}

try {
  main();
} catch (e) {
  warn(e.message);
}
exit(0);
