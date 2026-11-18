#!/usr/bin/env node
// validate_prerequisites — Step 1: validate the Mule dev environment
// (anypoint-cli-v4, DX plugin, anypoint-cli-v4 logged in, JAVA_HOME or bundled JDK + Java 11+, Mule runtime) and write a
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
import { findBundledJdk, javaHomeFixHint, javaMajorOf, acbJavaDir } from '../lib/jdk.mjs';

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
    errors.push('anypoint-cli-v4 not installed. Install: npm install -g anypoint-cli-v4-public');
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

// 3. anypoint-cli-v4 must be logged in (only checked when anypoint-cli-v4 is present)
if (anypointPresent) {
    const r = runProbe('anypoint-cli-v4', ['account:user:describe', '--output', 'json']);
    if (r.status !== 0) {
        console.log('❌ anypoint-cli-v4 is not logged in');
        errors.push(
            'anypoint-cli-v4 is not authenticated. Fix: configure Connected App credentials: anypoint-cli-v4 conf client_id <client_id> && anypoint-cli-v4 conf client_secret <client_secret>'
        );
    } else {
        let user = 'authenticated';
        try {
            const d = JSON.parse(r.stdout);
            user = d.username || d.email || user;
        } catch { /* keep generic label */ }
        console.log(`✅ anypoint-cli-v4 logged in as: ${user}`);
    }
}

// 4. JAVA_HOME + Java 11+
// Resolve order: $JAVA_HOME, then the JDK bundled with Anypoint Code Builder
// (~/AnypointCodeBuilder/java), then `java` on PATH. The script cannot export
// env vars to the caller, so when JAVA_HOME is unset it reports the resolved
// path (java_home in the JSON) and the platform-correct command to set it.
const MIN_JAVA = 11;
let javaHome = process.env.JAVA_HOME || '';
const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';
if (javaHome && !isFile(path.join(javaHome, 'bin', javaExe))) {
    console.log(`⚠️  JAVA_HOME is set but has no bin/${javaExe}: ${javaHome}`);
    warnings.push(`JAVA_HOME (${javaHome}) does not contain bin/${javaExe}; ignoring it.`);
    javaHome = '';
}
let javaMajor = javaHome ? javaMajorOf(javaHome) : null;
let javaUnset = !process.env.JAVA_HOME;
if (!javaHome || javaMajor === null || javaMajor < MIN_JAVA) {
    const bundled = findBundledJdk(MIN_JAVA);
    if (bundled) {
        if (javaHome) warnings.push(`JAVA_HOME (${javaHome}) is Java ${javaMajor ?? 'unknown'}; the bundled JDK ${bundled.javaHome} is Java ${bundled.major}.`);
        javaHome = bundled.javaHome;
        javaMajor = bundled.major;
        javaUnset = true; // not exported in the caller's shell
    }
}
if (!javaHome) {
    // Last resort: a `java` on PATH (no JAVA_HOME to record).
    const r = runProbe('java', ['-version']);
    const { raw, major } = parseJavaVersion((r.stderr || '') + (r.stdout || ''));
    if (major && major >= MIN_JAVA) {
        javaMajor = major;
        javaVersion = String(major);
        console.log(`✅ Java version: ${javaVersion} (from PATH; JAVA_HOME not set)`);
        warnings.push('JAVA_HOME is not set; using `java` from PATH.');
    } else {
        console.log('❌ JAVA_HOME not set and no Java 11+ found');
        const found = raw ? ` (java on PATH is ${raw})` : '';
        errors.push(`No Java ${MIN_JAVA}+ found${found}: JAVA_HOME is not set and no JDK is bundled under ${acbJavaDir()}. Fix: install a JDK ${MIN_JAVA}+ (or run 'anypoint-cli-v4 dx mule jdk download'), then set JAVA_HOME — ${javaHomeFixHint(MIN_JAVA)}`);
    }
} else if (javaMajor === null || javaMajor < MIN_JAVA) {
    const shown = javaMajor === null ? 'unknown' : String(javaMajor);
    console.log(`❌ Java ${MIN_JAVA}+ required (found: Java ${shown} at ${javaHome})`);
    errors.push(`Java ${MIN_JAVA}+ required, found: ${shown} at ${javaHome}`);
} else {
    javaVersion = String(javaMajor);
    console.log(`✅ JAVA_HOME: ${javaHome}`);
    console.log(`✅ Java version: ${javaVersion}`);
    if (javaUnset) {
        const msg = `JAVA_HOME is not set in this shell. Using the bundled JDK at ${javaHome}. Set it with: ${javaHomeFixHint(MIN_JAVA, javaHome)}`;
        console.log(`⚠️  ${msg}`);
        warnings.push(msg);
    }
}

// 5. Mule runtime — check configured path first, then default location
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
