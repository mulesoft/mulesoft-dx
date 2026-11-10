// Run: node --test skills/mule-development/upgrade-mule-app/scripts/describe_missing.test.mjs
//
// End-to-end through the real describe_connector.mjs with a fake
// `anypoint-cli-v4` first on PATH (POSIX shell shim, like lib/maven-settings.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConcurrency } from '../lib/describe-runner.mjs';

const SKIP = process.platform === 'win32' ? 'fake CLI shim is a POSIX shell script' : false;
const CAP = defaultConcurrency(os.availableParallelism?.());
const RUNNER = fileURLToPath(new URL('./describe_missing.mjs', import.meta.url));

const MODE_A = {
  namespace: { prefix: 'kafka', namespace: 'http://x', schemaLocation: 'x' },
  operations: ['publish', 'consume'],
  sources: [],
  configs: [{ name: 'producer-config', connectionProviders: ['plain-connection', 'scram-connection'] }],
};

// Fake CLI: logs "start"/"end" per describe call (to measure overlap), sleeps, and
// prints Mode-A JSON for plain calls or a stub for --type calls. FAKE_FAIL=<name>
// makes calls with --name <name> fail; FAKE_FAIL_ONCE=<name> fails only the first time.
const FAKE_CLI = `#!/bin/sh
if [ "$1" != "dx" ]; then exit 1; fi
name=""; type=""
while [ $# -gt 0 ]; do
  case "$1" in --name) name="$2";; --type) type="$2";; esac; shift
done
echo "start" >> "$FAKE_LOG"
sleep "\${FAKE_SLEEP:-0.3}"
echo "end" >> "$FAKE_LOG"
if [ -n "$name" ] && [ "$name" = "$FAKE_FAIL" ]; then echo "boom" >&2; exit 1; fi
if [ -n "$name" ] && [ "$name" = "$FAKE_FAIL_ONCE" ] && [ ! -f "$FAKE_LOG.once" ]; then touch "$FAKE_LOG.once"; echo "boom" >&2; exit 1; fi
if [ -z "$type" ]; then printf '%s' "$FAKE_MODE_A"; else printf '{"described":"%s"}' "$name"; fi
`;

function setup({ nicks = ['kafka'], usage } = {}) {
  const dir = mkdtempSync(join(os.tmpdir(), 'describe-missing-'));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'anypoint-cli-v4'), FAKE_CLI, { mode: 0o755 });
  mkdirSync(join(dir, 'home'));
  const work = join(dir, 'work');
  for (const d of ['connector-choices', 'connector-usage', 'connector-metadata']) mkdirSync(join(work, 'tmp', d), { recursive: true });
  for (const n of nicks) {
    writeFileSync(join(work, 'tmp/connector-choices', `${n}-new.json`), JSON.stringify({ groupId: 'g', assetId: `${n}-asset`, version: '1.0.0' }));
  }
  if (usage) for (const [n, u] of Object.entries(usage)) writeFileSync(join(work, 'tmp/connector-usage', `${n}.json`), JSON.stringify(u));
  const log = join(dir, 'calls.log'); writeFileSync(log, '');
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    HOME: join(dir, 'home'), USERPROFILE: join(dir, 'home'),
    ALLOW_LEGACY_JAVA_FOR_DESCRIBE: '1',
    FAKE_LOG: log, FAKE_MODE_A: JSON.stringify(MODE_A),
  };
  delete env._JAVA_OPTIONS;
  return { dir, work, log, env };
}
const run = (s, args, extraEnv = {}) => spawnSync(process.execPath, [RUNNER, ...args], { cwd: s.work, env: { ...s.env, ...extraEnv }, encoding: 'utf8' });
const maxOverlap = (log) => {
  let cur = 0; let peak = 0;
  for (const l of readFileSync(log, 'utf8').split('\n').filter(Boolean)) { cur += l === 'start' ? 1 : -1; peak = Math.max(peak, cur); }
  return peak;
};
// Never above the cap; actually concurrent when the cap allows it (3 calls each).
const assertOverlap = (log) => {
  const peak = maxOverlap(log);
  assert.ok(peak <= CAP, `peak ${peak} exceeds cap ${CAP}`);
  if (CAP >= 2) assert.ok(peak >= 2, `peak ${peak}: calls did not overlap`);
};
const meta = (s, f) => join(s.work, 'tmp/connector-metadata', f);
const cleanup = (s) => rmSync(s.dir, { recursive: true, force: true });

test('phase a describes Mode-A for every nick, concurrently, then skips on re-run', { skip: SKIP }, () => {
  const s = setup({ nicks: ['a', 'b', 'c'] });
  try {
    const r = run(s, ['--phase', 'a', 'a', 'b', 'c']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const n of ['a', 'b', 'c']) assert.ok(existsSync(meta(s, `${n}-new.json`)));
    assertOverlap(s.log);
    const again = run(s, ['--phase', 'a', 'a', 'b', 'c']);
    assert.match(again.stdout, /nothing to do/);
  } finally { cleanup(s); }
});

test('phase bc runs Mode-B for used ops and Mode-C for every pair, within the default cap', { skip: SKIP }, () => {
  const s = setup({ usage: { kafka: { operations_used: ['publish'], sources_used: [] } } });
  try {
    writeFileSync(meta(s, 'kafka-new.json'), JSON.stringify(MODE_A));
    const r = run(s, ['--phase', 'bc']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(meta(s, 'kafka-new-publish.json')));
    assert.ok(existsSync(meta(s, 'kafka-new-producer-config-plain-connection.json')));
    assert.ok(existsSync(meta(s, 'kafka-new-producer-config-scram-connection.json')));
    assert.ok(!existsSync(meta(s, 'kafka-new-consume.json')), 'unused op is not described');
    assertOverlap(s.log);
    // the gate agrees
    const gate = spawnSync(process.execPath, [join(RUNNER, '..', 'verify_metadata_coverage.mjs')], { cwd: s.work, env: s.env, encoding: 'utf8' });
    assert.equal(gate.status, 0, gate.stdout + gate.stderr);
  } finally { cleanup(s); }
});

test('a truncated existing file is re-described, a valid one is kept', { skip: SKIP }, () => {
  const s = setup({ usage: { kafka: { operations_used: ['publish'] } } });
  try {
    writeFileSync(meta(s, 'kafka-new.json'), JSON.stringify(MODE_A));
    writeFileSync(meta(s, 'kafka-new-publish.json'), '{"cut":');
    writeFileSync(meta(s, 'kafka-new-producer-config-plain-connection.json'), '{"keep":true}');
    const r = run(s, ['--phase', 'bc']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(meta(s, 'kafka-new-publish.json'), 'utf8')), { described: 'publish' });
    assert.deepEqual(JSON.parse(readFileSync(meta(s, 'kafka-new-producer-config-plain-connection.json'), 'utf8')), { keep: true });
  } finally { cleanup(s); }
});

test('a call that fails once is retried and succeeds', { skip: SKIP }, () => {
  const s = setup({ usage: { kafka: { operations_used: ['publish'] } } });
  try {
    writeFileSync(meta(s, 'kafka-new.json'), JSON.stringify(MODE_A));
    const r = run(s, ['--phase', 'bc'], { FAKE_FAIL_ONCE: 'publish', FAKE_SLEEP: '0.05' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /retrying 1 failed call/);
    assert.ok(existsSync(meta(s, 'kafka-new-publish.json')));
  } finally { cleanup(s); }
});

test('a call that keeps failing exits 1, names the pair, and keeps its output in tmp/describe-logs', { skip: SKIP }, () => {
  const s = setup({ usage: { kafka: { operations_used: ['publish'] } } });
  try {
    writeFileSync(meta(s, 'kafka-new.json'), JSON.stringify(MODE_A));
    const r = run(s, ['--phase', 'bc'], { FAKE_FAIL: 'publish', FAKE_SLEEP: '0.05' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FAILED kafka\/publish/);
    assert.ok(!existsSync(meta(s, 'kafka-new-publish.json')));
    assert.match(readFileSync(join(s.work, 'tmp/describe-logs/kafka-new-publish.log'), 'utf8'), /boom/);
    // the other calls still completed
    assert.ok(existsSync(meta(s, 'kafka-new-producer-config-plain-connection.json')));
  } finally { cleanup(s); }
});

test('phase bc exits 2 without running anything when Mode-A or usage is missing', { skip: SKIP }, () => {
  const s = setup();
  try {
    const noUsage = run(s, ['--phase', 'bc']);
    assert.equal(noUsage.status, 2);
    assert.match(noUsage.stderr, /no usage files/);
    writeFileSync(join(s.work, 'tmp/connector-usage/kafka.json'), JSON.stringify({ operations_used: ['publish'] }));
    const noModeA = run(s, ['--phase', 'bc']);
    assert.equal(noModeA.status, 2);
    assert.match(noModeA.stderr, /kafka: missing or unparseable Mode-A/);
    assert.equal(readFileSync(s.log, 'utf8'), '', 'no describe was started');
  } finally { cleanup(s); }
});

test('bad arguments exit 2', { skip: SKIP }, () => {
  const s = setup();
  try {
    for (const args of [[], ['--phase', 'x'], ['--phase', 'a'], ['--phase', 'bc', 'kafka']]) {
      assert.equal(run(s, args).status, 2, args.join(' '));
    }
  } finally { cleanup(s); }
});
