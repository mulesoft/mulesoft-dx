// Run: node --test skills/mule-development/upgrade-mule-app/scripts/check_connector_java_compat.test.mjs
//
// Step 5b wipes tmp/exchange-describe/ before describing, so entries left by an earlier run never reach Step 6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = process.platform === 'win32' ? 'fake CLI shim is a POSIX shell script' : false;
const SCRIPT = fileURLToPath(new URL('./check_connector_java_compat.mjs', import.meta.url));
const FRESH = '{"tags":[{"key":"is-java-17-supported","value":"true"}],"versions":[]}';

test('Step 5b drops a leftover Exchange-describe entry and re-fetches live', { skip: SKIP }, () => {
  const dir = mkdtempSync(join(os.tmpdir(), 'compat-'));
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin);
    const calls = join(dir, 'calls.log');
    writeFileSync(join(bin, 'anypoint-cli-v4'), `#!/bin/sh\necho "$@" >> "${calls}"\nprintf '%s' '${FRESH}'\n`, { mode: 0o755 });
    const app = join(dir, 'app');
    mkdirSync(join(app, 'tmp', 'exchange-describe'), { recursive: true });
    writeFileSync(join(app, 'tmp', 'connectors.json'), JSON.stringify({
      connectors: [{ nick: 'http', groupId: 'g', artifactId: 'a', version: '1.0.0', versionResolved: true }],
    }));
    const stale = join(app, 'tmp', 'exchange-describe', 'g_a_1.0.0.json');
    writeFileSync(stale, JSON.stringify({ coord: 'g/a/1.0.0', out: '{"tags":[],"versions":["stale"]}' }));
    const r = spawnSync(process.execPath, [SCRIPT, app], { env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(calls), 'the stale entry was not served from the cache');
    assert.match(readFileSync(stale, 'utf8'), /is-java-17-supported/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
