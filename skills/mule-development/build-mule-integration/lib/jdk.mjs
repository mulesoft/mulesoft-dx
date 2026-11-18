// jdk.mjs — locate a usable JDK and print platform-correct JAVA_HOME guidance.
// Keep this file identical in build-mule-integration/lib and upgrade-mule-app/lib
// (skills ship self-contained, so lib/ is duplicated per skill).

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseJavaVersion } from './platform.mjs';

/** @param {string} [home] @returns {string} Anypoint Code Builder's bundled-JDK directory. */
export function acbJavaDir(home = homedir()) {
    return join(home, 'AnypointCodeBuilder', 'java');
}

/** @param {string} root JDK install root. @returns {string|null} The dir containing bin/java[.exe] (handles macOS <root>/Contents/Home), or null. */
export function javaHomeUnder(root, platform = process.platform) {
    const exe = platform === 'win32' ? 'java.exe' : 'java';
    for (const c of [root, join(root, 'Contents', 'Home')]) {
        if (existsSync(join(c, 'bin', exe))) return c;
    }
    return null;
}

/** @param {string} javaHome @returns {number|null} Major version reported by <javaHome>/bin/java -version. */
export function javaMajorOf(javaHome, platform = process.platform) {
    const bin = join(javaHome, 'bin', platform === 'win32' ? 'java.exe' : 'java');
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (r.error) return null;
    return parseJavaVersion((r.stderr || '') + (r.stdout || '')).major;
}

/**
 * Find the newest JDK bundled by Anypoint Code Builder (~/AnypointCodeBuilder/java/jdk-*)
 * whose major version is >= minMajor.
 * @param {number} minMajor
 * @param {{home?: string, platform?: string, majorOf?: (javaHome: string) => number|null}} [opts]
 * @returns {{javaHome: string, major: number}|null}
 */
export function findBundledJdk(minMajor, opts = {}) {
    const { home = homedir(), platform = process.platform } = opts;
    const majorOf = opts.majorOf || ((h) => javaMajorOf(h, platform));
    const dir = acbJavaDir(home);
    if (!existsSync(dir)) return null;
    let names;
    try {
        names = readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && /^jdk-/i.test(d.name))
            .map((d) => d.name);
    } catch {
        return null;
    }
    const found = [];
    for (const name of names) {
        const javaHome = javaHomeUnder(join(dir, name), platform);
        if (!javaHome) continue;
        const major = majorOf(javaHome);
        if (major !== null && major >= minMajor) found.push({ javaHome, major });
    }
    found.sort((a, b) => b.major - a.major || (a.javaHome < b.javaHome ? 1 : -1));
    return found[0] || null;
}

/**
 * Platform-specific text for setting JAVA_HOME. Uses `javaHome` when known
 * (e.g. the bundled JDK); otherwise a placeholder. Never guesses install paths.
 * @param {number} major @param {string} [javaHome] @param {string} [platform]
 * @returns {string}
 */
export function javaHomeFixHint(major, javaHome = '', platform = process.platform) {
    if (platform === 'win32') {
        const p = javaHome || `<path to a JDK ${major}+ install>`;
        return `PowerShell (this session): $env:JAVA_HOME = "${p}"; persist for new terminals: setx JAVA_HOME "${p}"`;
    }
    if (javaHome) return `export JAVA_HOME="${javaHome}"`;
    if (platform === 'darwin') return `export JAVA_HOME=$(/usr/libexec/java_home -v ${major})`;
    return `export JAVA_HOME=<path to a JDK ${major}+ install>`;
}
