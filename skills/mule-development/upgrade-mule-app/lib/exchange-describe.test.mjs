// Run: node --test skills/mule-development/upgrade-mule-app/lib/exchange-describe.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESCRIBE_ATTEMPTS, describeWithRetry, parseCliJson } from './exchange-describe.mjs';

const COORD = 'com.mulesoft.connectors/mule-http-connector/1.7.3';
const BODY = 'Fetching...\n{"tags":[{"key":"is-java-17-supported","value":"true"}],"versions":[]}';

function fakeSpawn(responses) {
  const calls = [];
  const fn = (cmd, args) => {
    calls.push([cmd, ...args]);
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return r;
  };
  fn.calls = calls;
  return fn;
}
const ok = (stdout = BODY) => ({ status: 0, stdout, stderr: '' });
const fail = (stderr = 'boom') => ({ status: 1, stdout: '', stderr });
const noSleep = () => {};

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'exdesc-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('parseCliJson skips the preamble and returns null on garbage', () => {
  assert.deepEqual(parseCliJson('Fetching...\n{"a":1}'), { a: 1 });
  assert.equal(parseCliJson('no json here'), null);
  assert.equal(parseCliJson('{not json'), null);
});

test('without a cacheDir every call hits the CLI', () => {
  const spawn = fakeSpawn([ok()]);
  describeWithRetry(COORD, { spawn, sleep: noSleep });
  describeWithRetry(COORD, { spawn, sleep: noSleep });
  assert.equal(spawn.calls.length, 2);
});

test('second call for the same coordinate is served from the cache (one CLI call total)', () => withDir((dir) => {
  const spawn = fakeSpawn([ok()]);
  const first = describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  const second = describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(spawn.calls.length, 1);
  assert.equal(first.cached, undefined);
  assert.equal(second.cached, true);
  assert.deepEqual(parseCliJson(second.out), parseCliJson(first.out));
  assert.deepEqual(spawn.calls[0].slice(0, 5), ['anypoint-cli-v4', 'exchange', 'asset', 'describe', COORD]);
}));

test('a different coordinate is a miss', () => withDir((dir) => {
  const spawn = fakeSpawn([ok()]);
  describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  describeWithRetry('g/a/2.0.0', { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(spawn.calls.length, 2);
}));

test('a corrupt cache entry is a miss and is rewritten', () => withDir((dir) => {
  const spawn = fakeSpawn([ok()]);
  describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  const [file] = readdirSync(dir);
  writeFileSync(join(dir, file), '{truncated');
  const r = describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(spawn.calls.length, 2);
  assert.equal(r.ok, true);
  assert.equal(describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep }).cached, true);
}));

test('a cache entry whose payload does not parse is a miss', () => withDir((dir) => {
  const spawn = fakeSpawn([ok()]);
  describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  const [file] = readdirSync(dir);
  writeFileSync(join(dir, file), JSON.stringify({ coord: COORD, out: 'not json' }));
  describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(spawn.calls.length, 2);
}));

test('failures are retried and never cached', () => withDir((dir) => {
  const spawn = fakeSpawn([fail('nope')]);
  const r = describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.err, 'nope');
  assert.equal(spawn.calls.length, DESCRIBE_ATTEMPTS);
  assert.equal(existsSync(dir) ? readdirSync(dir).length : 0, 0);
  // a later call retries live
  describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(spawn.calls.length, DESCRIBE_ATTEMPTS * 2);
}));

test('a transient failure followed by success is returned and cached', () => withDir((dir) => {
  const spawn = fakeSpawn([fail(), ok()]);
  const r = describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(spawn.calls.length, 2);
  assert.equal(describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep }).cached, true);
}));

test('an unparseable success is returned but not cached', () => withDir((dir) => {
  const spawn = fakeSpawn([ok('garbage')]);
  const r = describeWithRetry(COORD, { cacheDir: dir, spawn, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.equal(existsSync(dir) ? readdirSync(dir).length : 0, 0);
}));

test('a spawn error is reported as a failure', () => {
  const spawn = fakeSpawn([{ error: new Error('ENOENT') }]);
  const r = describeWithRetry(COORD, { spawn, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.err, 'ENOENT');
});
