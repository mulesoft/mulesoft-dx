#!/usr/bin/env node
// get_latest_connector — search Anypoint Exchange and print ranked connector
// candidates (groupId:assetId:version, one per line), best match first.
// Usage: node scripts/get_latest_connector.mjs <search-term> [<nickname>]
// Exit codes: 0 = >=1 candidate; 1 = bad args / search failure / no candidates.

import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const { argv, exit, stderr, stdout } = process;

import { mkdirp } from '../lib/fsx.mjs';
import { anypointEnv } from '../lib/anypoint.mjs';
import { rankCandidates } from '../lib/exchange-rank.mjs';

const args = argv.slice(2);
const SEARCH_TERM = args[0] ?? '';
// Optional nickname argument — accepted for the documented invocation contract
// but not consumed below.
const _NICKNAME = args[1] ?? SEARCH_TERM;

const SCRIPT_NAME = 'scripts/get_latest_connector.mjs';

if (SEARCH_TERM === '') {
    stderr.write(`Usage: ${SCRIPT_NAME} <search-term> [<nickname>]\n`);
    stderr.write(`  e.g. ${SCRIPT_NAME} mule-salesforce-connector sfdc\n`);
    exit(1);
}

// Create a private temp directory for the per-page CLI output.
mkdirp('tmp');
const TMPDIR_ = mkdtempSync(join('tmp', 'mule-dev-exchange-'));

// Remove the whole temp directory on exit.
let _cleaned = false;
function cleanup() {
    if (_cleaned) return;
    _cleaned = true;
    try {
        rmSync(TMPDIR_, { recursive: true, force: true });
    } catch {
        // already gone or permission issue — best effort.
    }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); exit(130); });
process.on('SIGTERM', () => { cleanup(); exit(143); });

// Spawn one `anypoint-cli-v4 exchange asset list` page, writing stdout to
// pageFile and stderr to errFile (NOT merged — DEP0040 punycode warnings on
// stderr would otherwise contaminate the JSON parse target).
function spawnPage(offset, pageFile, errFile) {
    const outFd = openSync(pageFile, 'w');
    const errFd = openSync(errFile, 'w');
    const child = spawn(
        'anypoint-cli-v4',
        [
            'exchange', 'asset', 'list',
            SEARCH_TERM,
            '--limit', '200',
            '--offset', String(offset),
            '--output', 'json',
        ],
        {
            env: anypointEnv(),
            stdio: ['ignore', outFd, errFd],
            shell: false,
        },
    );

    return new Promise((resolve) => {
        child.on('error', (err) => {
            // Spawn-level error (ENOENT for missing CLI, etc.). Surface the
            // message through errFile so the page-A failure path picks it up
            // like a CLI stderr stream would.
            try {
                writeFileSync(errFile, `failed to spawn anypoint-cli-v4: ${err.message}\n`, { flag: 'a' });
            } catch { /* swallow — best-effort diagnostic */ }
            try { closeSync(outFd); } catch { /* already closed */ }
            try { closeSync(errFd); } catch { /* already closed */ }
            resolve({ code: 127, signal: null, error: err });
        });
        child.on('close', (code, signal) => {
            try { closeSync(outFd); } catch { /* fd already auto-closed by stdio */ }
            try { closeSync(errFd); } catch { /* fd already auto-closed by stdio */ }
            resolve({ code, signal, error: null });
        });
    });
}

// Try to parse the page file as JSON. Returns the parsed array, or null if the
// file is missing, empty, invalid JSON, or not an array.
function readPageArray(pageFile) {
    let text;
    try {
        text = readFileSync(pageFile, 'utf8');
    } catch {
        return null;
    }
    if (text.length === 0) return null;
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    return Array.isArray(parsed) ? parsed : null;
}

// Forward a file's bytes to stderr if non-empty. readFileSync returns the
// bytes directly — branching on the result avoids a redundant statSync probe.
function streamFileToStderr(p) {
    let text;
    try {
        text = readFileSync(p, 'utf8');
    } catch {
        return;
    }
    if (text.length > 0) stderr.write(text);
}

const pageAJson = join(TMPDIR_, 'page-a.json');
const pageAErr = join(TMPDIR_, 'page-a.err');
const pageBJson = join(TMPDIR_, 'page-b.json');
const pageBErr = join(TMPDIR_, 'page-b.err');

const [resA, resB] = await Promise.all([
    spawnPage(0, pageAJson, pageAErr),
    spawnPage(200, pageBJson, pageBErr),
]);
// The page is considered usable only if its file parses as a JSON array; the
// process exit code is not used as the gate.
void resA; void resB;

const pageA = readPageArray(pageAJson);
if (pageA === null) {
    stderr.write(`exchange asset list failed for '${SEARCH_TERM}' (page 1):\n`);
    streamFileToStderr(pageAErr);
    streamFileToStderr(pageAJson);
    exit(1);
}

let pageB = readPageArray(pageBJson);
if (pageB === null) {
    stderr.write(
        `exchange asset list page 2 failed for '${SEARCH_TERM}' — proceeding with page 1 only.\n`,
    );
    pageB = [];
}

const ranked = rankCandidates(pageA, pageB, SEARCH_TERM);

if (ranked.length === 0) {
    stderr.write(`No Mule 4 extension matches '${SEARCH_TERM}' on Exchange.\n`);
    stderr.write('Searched all groupIds; no asset of type=extension was returned.\n');
    exit(1);
}

// Ranked list to stdout, one GAV per line. No score, no emoji, no winner cue.
const lines = ranked.map((c) => `${c.groupId}:${c.assetId}:${c.version}`);
stdout.write(lines.join('\n') + '\n');
