// Run: node --test skills/mule-development/upgrade-mule-app/lib/java-boundary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { javaBoundary } from './java-boundary.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'java_boundary.mjs');

test('8 → 17 crosses: run', () => {
  const r = javaBoundary(8, 17);
  assert.equal(r.verdict, 'run');
  assert.equal(r.crosses, true);
});

test('17 → 17 (the net-tools case) is skipped', () => {
  const r = javaBoundary(17, 17);
  assert.equal(r.verdict, 'skip');
  assert.equal(r.crosses, false);
  assert.match(r.reason, /Java unchanged \(17 → 17\)/);
});

test('numeric strings compare as numbers (11 → 17, not lexicographic)', () => {
  assert.equal(javaBoundary('11', '17').verdict, 'run');
  assert.equal(javaBoundary('8', '11').verdict, 'run');
  assert.equal(javaBoundary('17', '8').verdict, 'skip');
});

test('a lower target is skipped, with the downgrade reason', () => {
  assert.match(javaBoundary(17, 11).reason, /never downgrades/);
});

test('missing or non-numeric values cannot decide, so Step 8 runs', () => {
  for (const [a, b] of [[undefined, 17], [8, null], ['abc', 17], [8, undefined]]) {
    const r = javaBoundary(a, b);
    assert.equal(r.verdict, 'unknown');
    assert.equal(r.crosses, false);
  }
});

function runScript(targets) {
  const app = mkdtempSync(join(tmpdir(), 'jb-'));
  try {
    if (targets !== undefined) {
      mkdirSync(join(app, 'tmp'));
      writeFileSync(join(app, 'tmp', 'upgrade-targets.json'), targets);
    }
    const r = spawnSync(process.execPath, [SCRIPT, app], { encoding: 'utf8' });
    const outFile = join(app, 'tmp', 'java-boundary.json');
    return { r, out: existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null };
  } finally { rmSync(app, { recursive: true, force: true }); }
}

test('script: 17 → 17 writes verdict skip and prints it', () => {
  const { r, out } = runScript(JSON.stringify({ java: { from: 17, to: 17 } }));
  assert.equal(r.status, 0);
  assert.equal(out.verdict, 'skip');
  assert.match(r.stdout, /verdict=skip/);
});

test('script: 8 → 17 writes verdict run', () => {
  const { r, out } = runScript(JSON.stringify({ java: { from: 8, to: 17 } }));
  assert.equal(r.status, 0);
  assert.equal(out.verdict, 'run');
});

test('script: missing or corrupt upgrade-targets.json is unknown, exit 0', () => {
  assert.equal(runScript(undefined).out.verdict, 'unknown');
  const { r, out } = runScript('{not json');
  assert.equal(r.status, 0);
  assert.equal(out.verdict, 'unknown');
});
