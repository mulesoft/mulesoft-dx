#!/usr/bin/env node
// validate_prerequisites — Step 1: validate the Mule dev environment
// (anypoint-cli-v4, DX plugin, JAVA_HOME + Java 11+, Mule runtime) and write a
// JSON report. Validates only — never installs or modifies anything.
// Output path: $MULE_DEV_ENV_FILE when set, otherwise tmp/mule-dev-env.json.
// Output JSON shape:
//   {"ok": true/false, "errors": [...], "warnings": [...],
//    "mule_version": "...", "runtime_path": "...",
//    "java_home": "...", "java_version": "..."}
// Exit codes: 0 = all checks passed; 1 = one or more fatal checks failed.

import * as path from 'node:path';
import { homedir } from 'node:os';
import { mkdirp, writeJson, isDir, listDir, readJsonOrNull, isFile } from '../lib/fsx.mjs';
import { commandExists, runProbe } from '../lib/anypoint.mjs';
import { parseJavaVersion, sortVersionStrings } from '../lib/platform.mjs';

const OUT_FILE = process.env.MULE_DEV_ENV_FILE || path.join('tmp', 'mule-dev-env.json');
// Reject `..` segments in the override to keep a hostile MULE_DEV_ENV_FILE
// from writing the env report outside the workspace tree.
if (OUT_FILE.split(/[\\/]/).includes('..')) {
    process.stderr.write(`❌ Bad MULE_DEV_ENV_FILE: '${OUT_FILE}' (path must not contain '..')\n`);
    process.exit(1);
}
mkdirp(path.dirname(OUT_FILE));

const errors = [];
const warnings = [];
let muleVersion = '';
let runtimePath = '';
let javaVersion = '';

console.log('Validating prerequisites...');

// 1. anypoint-cli-v4
const anypointPresent = commandExists('anypoint-cli-v4');
if (!anypointPresent) {
    console.log('❌ anypoint-cli-v4 not installed');
    errors.push('anypoint-cli-v4 not installed. Install: npm install -g @mulesoft/anypoint-cli-v4');
} else {
    console.log('✅ anypoint-cli-v4 found');
}

// 2. DX plugin (only checked when anypoint-cli-v4 is present)
if (anypointPresent) {
    const r = runProbe('anypoint-cli-v4', ['dx', 'mule', '--help']);
    if (r.status !== 0) {
        console.log('❌ DX plugin not installed');
        errors.push('DX plugin not installed. Install: npm install -g @salesforce/anypoint-cli-dx-mule-plugin');
    } else {
        console.log('✅ DX plugin found');
    }
}

// 3. JAVA_HOME + Java 11+
const javaHome = process.env.JAVA_HOME || '';
if (!javaHome) {
    console.log('❌ JAVA_HOME not set');
    errors.push('JAVA_HOME not set. Fix: export JAVA_HOME=$(/usr/libexec/java_home -v 11)');
} else {
    console.log(`✅ JAVA_HOME: ${javaHome}`);
    // `java -version` writes to stderr by convention.
    const r = runProbe('java', ['-version']);
    const out = (r.stderr || '') + (r.stdout || '');
    const { raw, major } = parseJavaVersion(out);
    if (!major || major < 11) {
        const shown = raw || 'unknown';
        console.log(`❌ Java 11+ required (found: Java ${shown})`);
        errors.push(`Java 11+ required, found: ${shown}`);
    } else {
        javaVersion = String(major);
        console.log(`✅ Java version: ${javaVersion}`);
    }
}

// 4. Mule runtime — check configured path first, then default location
const configFile = path.join(homedir(), '.mule-dx', 'config.json');
if (isFile(configFile)) {
    const cfg = readJsonOrNull(configFile);
    const configured = cfg && typeof cfg.runtimePath === 'string' ? cfg.runtimePath : '';
    if (configured && isDir(configured)) {
        runtimePath = configured;
    }
}

if (!runtimePath) {
    const defaultRoot = path.join(homedir(), 'AnypointCodeBuilder', 'runtime');
    const candidates = listDir(defaultRoot)
        .filter((d) => d.isDirectory() && d.name.startsWith('mule-'))
        .map((d) => d.name);
    if (candidates.length > 0) {
        const sorted = sortVersionStrings(candidates);
        runtimePath = path.join(defaultRoot, sorted[sorted.length - 1]);
    }
}

if (runtimePath) {
    const runtimeName = path.basename(runtimePath);
    const m = runtimeName.match(/[0-9]+\.[0-9]+\.[0-9]+/);
    muleVersion = m ? m[0] : '';
    console.log(`✅ Runtime detected: ${runtimeName} (Mule ${muleVersion})`);
} else {
    console.log('❌ No Mule runtime found');
    console.log("   ACTION REQUIRED: Run 'anypoint-cli-v4 dx mule runtime download' to download the Mule runtime before proceeding.");
    console.log("   After download, run 'anypoint-cli-v4 dx mule runtime path --set <path>' to configure the runtime path.");
    errors.push("No Mule runtime found. You MUST run 'anypoint-cli-v4 dx mule runtime download' to install it, then 'anypoint-cli-v4 dx mule runtime path --set <path>' to configure. No describe-connector commands will work until this is resolved.");
}

const ok = errors.length === 0;

writeJson(OUT_FILE, {
    ok,
    errors,
    warnings,
    mule_version: muleVersion,
    runtime_path: runtimePath,
    java_home: javaHome,
    java_version: javaVersion,
});

console.log(`📝 Wrote ${OUT_FILE}`);

if (!ok) process.exit(1);
