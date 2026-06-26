#!/usr/bin/env node
// search_templates — Step 1b: search Anypoint Exchange for Mule template assets
// and print a ranked, enriched JSON array of up to 10 candidates (private /
// org-scoped first) to stdout. Writes nothing to the workspace.
// Usage: node scripts/search_templates.mjs <search-term>
// Exit codes: 0 = >=1 candidate (JSON array on stdout); 1 = bad args /
// search failure / no env / no candidates.

import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { rankTemplates } from '../lib/template-rank.mjs';

const { argv, exit, stderr, stdout } = process;

const args = argv.slice(2);
const SEARCH_TERM = args[0] ?? '';
const TOP_N = 10;
const SCRIPT_NAME = 'scripts/search_templates.mjs';

if (SEARCH_TERM === '') {
    stderr.write(`Usage: ${SCRIPT_NAME} <search-term>\n`);
    stderr.write(`  e.g. ${SCRIPT_NAME} "salesforce database sync"\n`);
    exit(1);
}

// Always strip ANYPOINT_ENV (the CLI rejects the "prod" value some shells
// inject); when a bearer is present, also strip the client-cred / user-pass
// vars so the bearer auth wins.
function templateEnv() {
    const env = { ...process.env };
    delete env.ANYPOINT_ENV;
    env.NODE_NO_WARNINGS = '1';
    if (process.env.ANYPOINT_BEARER) {
        delete env.ANYPOINT_CLIENT_ID;
        delete env.ANYPOINT_CLIENT_SECRET;
        delete env.ANYPOINT_USERNAME;
        delete env.ANYPOINT_PASSWORD;
    }
    return env;
}

// Spawn anypoint-cli-v4 with the given argv, capturing stdout/stderr as strings.
// Never rejects — spawn errors resolve as a non-zero code with the message on
// stderr.
function runCli(cliArgs) {
    return new Promise((resolve) => {
        const child = spawn('anypoint-cli-v4', cliArgs, {
            env: templateEnv(),
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
        });
        let out = '';
        let err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('error', (e) => { resolve({ code: 127, stdout: out, stderr: `${err}failed to spawn anypoint-cli-v4: ${e.message}\n` }); });
        child.on('close', (code) => { resolve({ code, stdout: out, stderr: err }); });
    });
}

function parseArray(text) {
    if (!text) return null;
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    return Array.isArray(parsed) ? parsed : null;
}

function parseObject(text) {
    if (!text) return null;
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

// Resolve org id + env name from the CLI session.
async function readSession() {
    const r = await runCli(['conf', 'session']);
    return parseObject(r.stdout);
}

let session = await readSession();
if (!session || !('selectedOrganization' in session) || !('selectedEnvironment' in session)) {
    // Cold session: empty --environment makes the CLI auto-pick a default env,
    // firing the password/bearer login and persisting a session as a side effect.
    await runCli(['account', 'environment', 'list', '--environment', '', '--output', 'json']);
    session = await readSession();
}

const ORG_ID = session?.selectedOrganization?.id || '';
const ENV_NAME = session?.selectedEnvironment?.name || '';

if (!ENV_NAME) {
    stderr.write('Could not resolve an Anypoint environment for the current CLI session.\n');
    stderr.write('Run one of:\n');
    stderr.write('  anypoint-cli-v4 conf username <user> && anypoint-cli-v4 conf password <pwd>\n');
    stderr.write('or set ANYPOINT_BEARER (with ANYPOINT_HOST), then retry.\n');
    exit(1);
}

const TMPDIR_ = mkdtempSync(join(tmpdir(), 'mule-dev-templates-'));
let _cleaned = false;
function cleanup() {
    if (_cleaned) return;
    _cleaned = true;
    try { rmSync(TMPDIR_, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); exit(130); });
process.on('SIGTERM', () => { cleanup(); exit(143); });

// Four parallel asset-list pages.
function listPage(offset, scoped) {
    const cliArgs = ['exchange', 'asset', 'list', SEARCH_TERM, '--environment', ENV_NAME, '--limit', '200', '--offset', String(offset), '--output', 'json'];
    // Insert after the --environment value (index 6) so the flags pair
    // correctly: `--environment <ENV_NAME> --organizationId <ORG_ID> ...`.
    if (scoped) cliArgs.splice(6, 0, '--organizationId', ORG_ID);
    return runCli(cliArgs);
}

const wantPrivate = ORG_ID !== '';
const [pubA, pubB, privA, privB] = await Promise.all([
    listPage(0, false),
    listPage(200, false),
    wantPrivate ? listPage(0, true) : Promise.resolve({ code: 0, stdout: '[]', stderr: '' }),
    wantPrivate ? listPage(200, true) : Promise.resolve({ code: 0, stdout: '[]', stderr: '' }),
]);

// Public page A is authoritative — its failure is fatal.
const publicA = parseArray(pubA.stdout);
if (publicA === null) {
    stderr.write(`exchange asset list failed for '${SEARCH_TERM}' (public, page 1):\n`);
    if (pubA.stdout) stderr.write(pubA.stdout);
    if (pubA.stderr) stderr.write(pubA.stderr);
    exit(1);
}

// The other three pages are non-fatal — lose those candidates and continue.
function softArray(res, label) {
    const arr = parseArray(res.stdout);
    if (arr === null) {
        stderr.write(`exchange asset list page failed (${label}) for '${SEARCH_TERM}' — skipping that page.\n`);
        return [];
    }
    return arr;
}
const publicB = softArray(pubB, 'public-b');
const privateA = softArray(privA, 'private-a');
const privateB = softArray(privB, 'private-b');

// Rank candidates.
const publicRows = [...publicA, ...publicB];
const privateRows = [...privateA, ...privateB];
const ranked = rankTemplates(publicRows, privateRows, SEARCH_TERM);

if (ranked.length === 0) {
    stderr.write(`No Mule template matches '${SEARCH_TERM}' on Exchange.\n`);
    stderr.write('Searched private (org-scoped) and public; no asset of type=template was returned.\n');
    exit(1);
}

const topList = ranked.slice(0, TOP_N);

// Describe the top rows in parallel and enrich each candidate.
const describes = await Promise.all(topList.map((row) => {
    const gav = `${row.groupId}/${row.assetId}/${row.version}`;
    return runCli(['exchange', 'asset', 'describe', gav, '--environment', ENV_NAME, '--output', 'json'])
        .then((res) => parseObject(res.stdout) ?? {});
}));

// minMuleVersion comes from the "min-mule-version" attribute, falling back to
// runtimeVersion, then null.
const enriched = topList.map((row, i) => {
    const d = describes[i] ?? {};
    const attrs = Array.isArray(d.attributes) ? d.attributes : [];
    const minAttr = attrs.find((a) => a && a.key === 'min-mule-version');
    const minMuleVersion = (minAttr ? minAttr.value : undefined) ?? d.runtimeVersion ?? null;
    return {
        name: d.name ?? row.name,
        groupId: row.groupId,
        assetId: row.assetId,
        version: row.version,
        minMuleVersion,
        description: d.description ?? null,
        sourceLocation: row.sourceLocation,
    };
});

// Pretty-print with 2-space indent and no trailing newline.
stdout.write(JSON.stringify(enriched, null, 2));
