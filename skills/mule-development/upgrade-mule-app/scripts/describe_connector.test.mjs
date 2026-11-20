// Run: node --test skills/mule-development/upgrade-mule-app/scripts/describe_connector.test.mjs
//
// End-to-end through the real describe_connector.mjs with a fake `java` (JAVA_HOME/bin/java)
// and a fake `anypoint-cli-v4` first on PATH (POSIX shell shims, like describe_missing.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import * as os from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = process.platform === 'win32' ? 'fake java/CLI shims are POSIX shell scripts' : false;
const SCRIPT = fileURLToPath(new URL('./describe_connector.mjs', import.meta.url));

// `java -version` prints to stderr; FAKE_JAVA_OUT is what it prints.
const FAKE_JAVA = '#!/bin/sh\nprintf \'%s\\n\' "$FAKE_JAVA_OUT" >&2\n';
// Fails the way a real describe does: oclif wraps the JVM options banner (the only text the
// Flow Design Service leaves) across lines; FAKE_TAIL is optional real error text after it.
// FAKE_MODE=empty-ok exits 0 with empty stdout and only the banner on stderr; FAKE_MODE=signal kills itself.
const FAKE_CLI = `#!/bin/sh
if [ "$1" != "dx" ]; then exit 1; fi
[ "$FAKE_MODE" = "signal" ] && kill -TERM $$
if [ "$FAKE_MODE" = "empty-ok" ]; then
  printf ' ›   Error: Failed to describe connector: Picked up _JAVA_OPTIONS: \\n ›   %s\\n ›\\n' "$_JAVA_OPTIONS" >&2
  exit 0
fi
printf ' ›   Error: Failed to describe connector: Picked up _JAVA_OPTIONS: \\n ›   %s\\n ›\\n' "$_JAVA_OPTIONS" >&2
[ -n "$FAKE_TAIL" ] && printf ' ›   %s\\n' "$FAKE_TAIL" >&2
exit 2
`;

const JAVA_17 = 'openjdk version "17.0.13" 2024-10-15\nOpenJDK Runtime Environment (build 17.0.13+11)';
const JAVA_11 = 'openjdk version "11.0.25" 2024-10-15\nOpenJDK Runtime Environment (build 11.0.25+9)';
const BANNER = 'Picked up _JAVA_OPTIONS: -Xmx512m';

function setup() {
  const dir = mkdtempSync(join(os.tmpdir(), 'describe-connector-'));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'anypoint-cli-v4'), FAKE_CLI, { mode: 0o755 });
  const javaHome = join(dir, 'jdk'); mkdirSync(join(javaHome, 'bin'), { recursive: true });
  writeFileSync(join(javaHome, 'bin', 'java'), FAKE_JAVA, { mode: 0o755 });
  mkdirSync(join(dir, 'home'));
  const work = join(dir, 'work');
  mkdirSync(join(work, 'tmp', 'connector-choices'), { recursive: true });
  writeFileSync(join(work, 'tmp/connector-choices/x-new.json'), JSON.stringify({ groupId: 'g', assetId: 'x-asset', version: '1.0.0' }));
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    HOME: join(dir, 'home'), USERPROFILE: join(dir, 'home'),
    JAVA_HOME: javaHome,
    FAKE_JAVA_OUT: JAVA_17,
  };
  delete env._JAVA_OPTIONS; delete env.JAVA_TOOL_OPTIONS; delete env.ALLOW_LEGACY_JAVA_FOR_DESCRIBE;
  return { dir, work, env };
}
const run = (s, extraEnv = {}) => spawnSync(process.execPath, [SCRIPT, 'x-new'], { cwd: s.work, env: { ...s.env, ...extraEnv }, encoding: 'utf8' });
const cleanup = (s) => rmSync(s.dir, { recursive: true, force: true });

test('Java gate passes on a JDK 17 whose `java -version` starts with a `Picked up` banner', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { FAKE_JAVA_OUT: `${BANNER}\n${JAVA_17}` });
    assert.doesNotMatch(r.stderr, /Java 17\+ is required/);
    assert.match(r.stderr, /describe-connector failed for g:x-asset:1\.0\.0/); // got past the gate to the CLI
  } finally { cleanup(s); }
});

test('Java gate still refuses Java 11 behind a banner, and names the version line, not the banner', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { FAKE_JAVA_OUT: `${BANNER}\n${JAVA_11}` });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Java 11 detected \(openjdk version "11\.0\.25"/);
    assert.match(r.stderr, /Java 17\+ is required/);
  } finally { cleanup(s); }
});

test('Java gate reports unreadable `java -version` output instead of "Java ? detected"', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { FAKE_JAVA_OUT: BANNER });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not read a Java version/);
    assert.match(r.stderr, /Picked up _JAVA_OPTIONS: -Xmx512m/); // the raw output is shown so the cause is visible
    assert.doesNotMatch(r.stderr, /Java \? detected/);
  } finally { cleanup(s); }
});

test('a failed describe whose only error text is the JVM options banner says there is no error text', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s);
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stderr, /Picked up|enforcement=LOOSE/);
    assert.match(r.stderr, /no error text/);
    assert.match(r.stderr, /describe-connector failed for g:x-asset:1\.0\.0/);
  } finally { cleanup(s); }
});

test('a caller-set _JAVA_OPTIONS is forwarded to the CLI but stripped from the reported error', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { _JAVA_OPTIONS: '-Xmx512m', FAKE_JAVA_OUT: `${BANNER}\n${JAVA_17}` });
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stderr, /Picked up|Xmx512m|enforcement=LOOSE/);
    assert.match(r.stderr, /no error text/);
  } finally { cleanup(s); }
});

test('real error text after the banner is kept', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { FAKE_TAIL: 'Caused by: boom' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Caused by: boom/);
    assert.doesNotMatch(r.stderr, /Picked up|no error text/);
  } finally { cleanup(s); }
});

test('an exit-0 describe with empty stdout and only the banner on stderr reports the empty JSON, without banner residue', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { FAKE_MODE: 'empty-ok' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /describe-connector returned empty JSON for g:x-asset:1\.0\.0/);
    assert.doesNotMatch(r.stderr, /Picked up|Failed to describe connector|\u203A/);
  } finally { cleanup(s); }
});

test('a CLI killed by a signal is reported as terminated, not as a silent Flow Design Service failure', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { FAKE_MODE: 'signal' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /terminated by SIGTERM/);
    assert.doesNotMatch(r.stderr, /no error text/);
  } finally { cleanup(s); }
});

test('a signal-killed CLI does not also get the "fails silently" releases-repo hint', { skip: SKIP }, () => {
  const s = setup();
  try {
    const r = run(s, { FAKE_MODE: 'signal' });
    assert.match(r.stderr, /terminated by SIGTERM/);
    assert.doesNotMatch(r.stderr, /fails silently/);
  } finally { cleanup(s); }
});

test('Java gate shows why `java -version` could not run (e.g. not executable)', { skip: SKIP }, () => {
  const s = setup();
  try {
    chmodSync(join(s.env.JAVA_HOME, 'bin', 'java'), 0o644);
    const r = run(s);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not read a Java version/);
    assert.match(r.stderr, /EACCES/);
  } finally { cleanup(s); }
});
