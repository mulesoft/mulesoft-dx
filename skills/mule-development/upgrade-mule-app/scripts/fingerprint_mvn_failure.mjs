#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Repeat guard for the Step 16 build loop and the Step 17 MUnit loop: tell the
// caller whether a FAILED `mvn` log shows the same failure as the previous
// attempt, so the skill stops rebuilding an unchanged failure instead of
// spending the whole retry cap on it. The comparison is done here, not by the
// model, so the same logs always give the same answer.
//
// Usage: node scripts/fingerprint_mvn_failure.mjs <tmp/mvn-failures/build-N.log | munit-N.log>
//   The file name must be build-<N>.log or munit-<N>.log (munit-<N>-local.log, the Step 17
//   local-runtime substitute run, counts as attempt N). The script compares
//   attempt N with attempts N-1, N-2, ... of the same loop, using the
//   fingerprints it saved in fingerprints.jsonl next to the log. Running it again
//   on the latest log gives the same answer (it never counts an attempt twice). Running
//   attempt N, of any kind (also an auth failure), replaces the saved fingerprint of attempt N;
//   attempt 1 also drops the fingerprints of every later attempt (a new run starts over), so
//   fingerprints left by an earlier run are never compared with this one.
// Output JSON (stdout): { phase, attempt, kind, signature, occurrence, verdict, summary[], hint }
//   kind: 'xsd-parse' | 'generic' | 'auth' | 'none'
//     xsd-parse - the mule-maven-plugin XSD error list (`SAXParseException; lineNumber..`).
//                 The fingerprint is the failing goal plus every error with its file, line,
//                 column and message, so any change (fewer errors, a moved line) is progress.
//     generic   - any other failure that has [ERROR] lines: the normalised [ERROR] lines
//                 plus, for a munit log, the MUnit Run Summary suite lines, failing test names and
//                 totals and the assertion / `Caused by` / schema-error text. These lines do not
//                 reliably name the failing element, so a generic failure can say 'repeat' but
//                 never 'halt'. UUIDs, 0x addresses and temp-dir paths are normalised; any other
//                 volatile text (ports, timings) makes every attempt look 'new', which is the
//                 safe direction but means the guard does nothing for such a failure.
//     auth      - a credential failure (see classify_mvn_failure.mjs). Not recorded and not
//                 compared: it never counts as a repeat. The skill gives an auth failure no
//                 attempt number (the retry reuses it, so the chain stays intact); a caller that
//                 numbers it anyway leaves a gap that restarts the count at 1 (a missed halt,
//                 never a wrong one).
//     none      - no comparable error text. Recorded, so it breaks a run of repeats.
//   verdict: 'new'    - first time this failure was seen, or it changed since the last attempt
//            'repeat' - identical to the previous attempt (2nd occurrence in a row)
//            'halt'   - identical for 3 attempts in a row: stop and ask the user (xsd-parse in a
//                       build-N.log only; a munit log never halts)
//            'none'   - nothing to compare (kind none / auth)
// Exit code is 0 for a readable log, 2 for a usage error or an unreadable file. A failure to
// save the state file is reported on stderr and does not change the exit code or the output.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { classifyMavenFailure } from '../lib/maven-settings.mjs';

// Identical repeats allowed after the first occurrence. 1 = one more attempt with a
// different edit, then halt on the third identical failure in a row.
const TOLERANCE = 1;
const STATE_FILE = 'fingerprints.jsonl';
const ANSI_RE = /\x1b\[[0-9;]*m/g;
// [ERROR] lines Maven prints after every failed build; they say nothing about the failure.
const BOILERPLATE_RES = [
  /^->\s*\[Help \d+\]/,
  /^\[Help \d+\]/,
  /^To see the full stack trace/,
  /^Re-run Maven using/,
  /^For more information about the errors/,
  /^After correcting the problems/,
  /^mvn\b.*\s-rf\s/,
  /^Full list:$/,
];

// Text that changes on every run without meaning a different failure.
const VOLATILE_RES = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b0x[0-9a-f]+\b/gi, '<hex>'],
  // Only the random temp root (`/var/folders/<xx>/<yyyy>/T/<dir>`, `/tmp/<dir>`) is replaced; the
  // rest of the path, the file name and any `:[line,col]` stay, so different files stay different.
  [/(?<![\w.\/-])\/(?:private\/)?(?:var\/folders\/[^\/\s'"\]]+\/[^\/\s'"\]]+\/[A-Za-z]|tmp)\/[^\/\s'"\[\]:,]+/g, '<tmp>'],
];
function normalise(line) {
  return VOLATILE_RES.reduce((l, [re, to]) => l.replace(re, to), line);
}

function errorLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\[ERROR\]\s?(.*)$/);
    if (!m) continue;
    const line = normalise(m[1].replace(/\s+/g, ' ').trim());
    if (line && !BOILERPLATE_RES.some((re) => re.test(line))) out.push(line);
  }
  return out;
}

// `org.mule.tools.maven:mule-maven-plugin:4.10.4:process-classes` -> `mule-maven-plugin:process-classes`
// (the version is dropped for the XSD fingerprint so a plugin bump between attempts is not
// mistaken for a changed failure; the generic fingerprint keeps the full [ERROR] lines).
function failedGoal(lines) {
  for (const l of lines) {
    const m = l.match(/Failed to execute goal (\S+) \(/);
    if (!m) continue;
    const parts = m[1].split(':');
    return parts.length === 4 ? `${parts[1]}:${parts[3]}` : m[1];
  }
  return null;
}

function xsdParseErrors(lines) {
  const errors = [];
  let file = null;
  for (const l of lines) {
    const header = l.match(/errors? while parsing the given file '([^']+)'/);
    if (header) file = header[1];
    const sax = l.match(/SAXParseException;\s*lineNumber:\s*(\d+);\s*columnNumber:\s*(\d+);\s*(.*)$/);
    if (sax) errors.push({ file, line: Number(sax[1]), col: Number(sax[2]), message: sax[3] });
  }
  const key = (e) => `${e.file}|${String(e.line).padStart(8, '0')}|${String(e.col).padStart(8, '0')}|${e.message}`;
  return errors.sort((a, b) => key(a).localeCompare(key(b)));
}

// The real summary block (MUnit 3.7.6; the first two lines are from a batch-template run, the
// `---` line from a failed assertion):
//   [INFO] MUnit Run Summary - Product: MULE_EE, Version: 4.9.22
//   [INFO]  >> tier-test-suite.xml test result: Tests: 1, Errors: 0, Failures: 1, Skipped: 0
//   [INFO] <tab> --- tierFlow-returns-standard-tier <<< FAILED
//   [INFO]  > Tests:   <tab>N      (then Errors / Failures / Skipped)
// The `>>` lines name the failing suite and the `---` lines name each failing test.
function munitSummary(text) {
  const i = text.indexOf('MUnit Run Summary');
  if (i < 0) return null;
  const tail = text.slice(i);
  const suites = [];
  const failed = [];
  const totals = {};
  for (const raw of tail.split(/\r?\n/)) {
    const suite = raw.match(/^\[INFO\]\s+>>\s+(.*test result:.*)$/);
    if (suite) suites.push(suite[1].replace(/\s+/g, ' ').trim());
    const test = raw.match(/^\[INFO\]\s+---\s+(.+?)\s+<<<\s+(\w+)/);
    if (test) failed.push(`${test[1]} <<< ${test[2]}`);
    const total = raw.match(/^\[INFO\]\s+>\s+(Tests|Errors|Failures|Skipped):\s*(\d+)/);
    if (total) totals[total[1].toLowerCase()] = Number(total[2]);
  }
  return { suites: suites.sort(), failed: failed.sort(), totals };
}

// Lines MUnit prints without an `[ERROR]` prefix that tell one failing assertion or deployment
// error from another: the assertion header and its Expected/but text, `Caused by`, schema errors.
const DETAIL_RE = /^(java\.lang\.AssertionError|Expected:|but:|Caused by:|org\.xml\.sax\.SAXParseException)|\bcvc-/;
function detailLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = normalise(raw.replace(/\s+/g, ' ').trim());
    if (DETAIL_RE.test(line)) out.push(line);
  }
  return out;
}

function fingerprint(text, phase) {
  const clean = text.replace(ANSI_RE, '');
  const lines = errorLines(clean);
  const goal = failedGoal(lines);
  const xsd = xsdParseErrors(lines);
  if (xsd.length) {
    return {
      kind: 'xsd-parse',
      parts: { goal, errors: xsd },
      summary: xsd.map((e) => `${e.file ?? '?'}:${e.line}:${e.col} ${e.message}`),
    };
  }
  const munit = munitSummary(clean);
  if (!lines.length && !munit) return { kind: 'none', parts: null, summary: [] };
  const sorted = [...lines].sort();
  const summary = sorted.slice(0, 5);
  if (munit) summary.push(...munit.suites, ...munit.failed);
  const details = phase === 'munit' ? detailLines(clean) : [];
  summary.push(...details.slice(0, 3));
  return { kind: 'generic', parts: { goal, lines: sorted, munit, details }, summary };
}

function signatureOf(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

function readState(stateFile) {
  if (!existsSync(stateFile)) return [];
  const out = [];
  for (const l of readFileSync(stateFile, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* skip a damaged line */ }
  }
  return out;
}

const HINTS = {
  new: 'First time this failure was seen, or it changed since the last attempt: fix it as usual.',
  none: 'No comparable error text in this log; only the retry cap limits this loop.',
  auth: 'Credential failure, not a code defect: handle it as Step 16.1 class 0. It is not compared and not recorded.',
};

function hintFor(verdict, phase, attempt, occurrence) {
  if (verdict === 'repeat' && phase === 'munit') {
    return `Same failure as attempt ${attempt - 1} as far as the fingerprint can tell: compare the failing assertion text with the previous log by eye (it can miss a changed assertion shape); if it differs, fix it as new. Otherwise make ONE edit that differs from the last. The 6-attempt cap ends this loop, not a halt.`;
  }
  if (verdict === 'repeat') {
    return `Same failure as attempt ${attempt - 1}: the last edit did not change it. Run any escalation probe not yet run, then make ONE edit that differs from the last. If no different edit is backed by the metadata or the plan (or the last edit was a Trigger C plan directive), HALT via AskUserQuestion instead of guessing.`;
  }
  if (verdict === 'halt') {
    return `The same failure came back ${occurrence} attempts in a row: stop retrying and HALT via AskUserQuestion with the last three logs.`;
  }
  return HINTS[verdict];
}

const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: fingerprint_mvn_failure.mjs <build-N.log | munit-N.log>\n');
  process.exit(2);
}
const logPath = resolve(file);
const nameMatch = basename(logPath).match(/^(build|munit)-(\d+)(?:-local)?\.log$/);
if (!nameMatch) {
  process.stderr.write(`log file name must be build-<N>.log or munit-<N>.log (or munit-<N>-local.log), got ${basename(logPath)}\n`);
  process.exit(2);
}
const phase = nameMatch[1];
const attempt = Number(nameMatch[2]);
let text;
try {
  text = readFileSync(logPath, 'utf8');
} catch (e) {
  process.stderr.write(`cannot read ${file}: ${e.message}\n`);
  process.exit(2);
}

const base = { phase, attempt };
const stateFile = join(dirname(logPath), STATE_FILE);
// Replace the saved fingerprint of attempt N (this log re-run). Attempt 1 starts a new run, so it
// also drops every later attempt left by an earlier run.
const kept = readState(stateFile).filter((e) => e.phase !== phase || (attempt === 1 ? false : e.attempt !== attempt));
function saveState() {
  try {
    writeFileSync(stateFile, kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''));
  } catch (e) {
    process.stderr.write(`cannot save ${stateFile}: ${e.message}\n`);
  }
}

if (classifyMavenFailure(text.replace(ANSI_RE, '')).kind !== 'none') {
  if (existsSync(stateFile)) saveState();
  process.stdout.write(JSON.stringify({
    ...base, kind: 'auth', signature: null, occurrence: 0, verdict: 'none', summary: [], hint: HINTS.auth,
  }) + '\n');
  process.exit(0);
}

const fp = fingerprint(text, phase);
const signature = fp.parts ? signatureOf(fp.parts) : null;
let previous = 0;
for (let k = attempt - 1; signature; k--) {
  const prior = kept.find((e) => e.phase === phase && e.attempt === k);
  if (!prior || prior.signature !== signature) break;
  previous++;
}
const occurrence = signature ? previous + 1 : 0;
let verdict = 'none';
if (signature) {
  const canHalt = fp.kind === 'xsd-parse' && phase === 'build';
  verdict = occurrence === 1 ? 'new' : (occurrence <= TOLERANCE + 1 || !canHalt) ? 'repeat' : 'halt';
}

kept.push({ phase, attempt, kind: fp.kind, signature });
saveState();
process.stdout.write(JSON.stringify({
  ...base, kind: fp.kind, signature, occurrence, verdict, summary: fp.summary, hint: hintFor(verdict, phase, attempt, occurrence),
}) + '\n');
