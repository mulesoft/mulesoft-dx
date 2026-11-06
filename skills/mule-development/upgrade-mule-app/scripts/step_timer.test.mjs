// Run: node --test skills/mule-development/upgrade-mule-app/scripts/step_timer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'step_timer.mjs');

function run(dir, args, nowMs) {
  const env = { ...process.env, STEP_TIMER_NOW: String(nowMs) };
  delete env.UPGRADE_MULE_APP_TIMING_FILE;
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args, dir], { encoding: 'utf8', env });
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'step-timer-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('init, mark and report produce a per-step table and write it next to the JSONL', () => {
  withDir((dir) => {
    assert.equal(run(dir, ['init'], 1_000_000).status, 0);
    run(dir, ['mark', '1'], 1_000_000);
    run(dir, ['mark', '2'], 1_005_000);
    const r = run(dir, ['report'], 1_065_000);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\| 1 \| 5\.0s \| 7\.7% \| 1 \|/);
    assert.match(r.stdout, /\| 2 \| 1m 00s \| 92\.3% \| 1 \|/);
    assert.match(readFileSync(join(dir, 'upgrade-timing.md'), 'utf8'), /Total wall time/);
    assert.ok(existsSync(join(dir, 'upgrade-timing.jsonl')));
  });
});

test('mark 16 numbers attempts and report is idempotent', () => {
  withDir((dir) => {
    run(dir, ['init'], 0);
    run(dir, ['mark', '16'], 1000);
    run(dir, ['mark', '16'], 2000);
    const a = run(dir, ['report'], 3000).stdout;
    const b = run(dir, ['report'], 3000).stdout;
    assert.match(a, /\| 16#1 \|/);
    assert.match(a, /\| 16#2 \|/);
    assert.equal(a, b);
  });
});

test('wait-start/wait-end are shown as a separate user-wait row', () => {
  withDir((dir) => {
    run(dir, ['init'], 0);
    run(dir, ['mark', '12.4'], 0);
    run(dir, ['wait-start'], 1000);
    run(dir, ['wait-end'], 61000);
    const r = run(dir, ['report'], 62000);
    assert.match(r.stdout, /\| 12\.4 \| 2\.0s \|/);
    assert.match(r.stdout, /\| 12\.4 \(user wait\) \| 1m 00s \|/);
  });
});

test('init starts over: an earlier run in the same directory is discarded', () => {
  withDir((dir) => {
    run(dir, ['init'], 0);
    run(dir, ['mark', '1'], 1000);
    run(dir, ['init'], 60_000);
    assert.doesNotMatch(readFileSync(join(dir, 'upgrade-timing.jsonl'), 'utf8'), /"step":"1"/);
  });
});

test('mark and wait are no-ops unless init ran (timing stays off)', () => {
  withDir((dir) => {
    for (const args of [['mark', '1'], ['wait-start'], ['wait-end']]) assert.equal(run(dir, args, 0).status, 0);
    assert.equal(existsSync(join(dir, 'upgrade-timing.jsonl')), false);
  });
});

test('bad input only warns and exits 0 — timing never breaks the upgrade', () => {
  withDir((dir) => {
    for (const args of [['mark', '../evil'], ['mark'], ['bogus'], [], ['report']]) {
      const r = run(dir, args, 0);
      assert.equal(r.status, 0, args.join(' '));
    }
    assert.equal(existsSync(join(dir, 'upgrade-timing.jsonl')), false);
    run(dir, ['init'], 0);
    assert.match(run(dir, ['mark', '../evil'], 0).stderr, /invalid step label/);
    assert.doesNotMatch(readFileSync(join(dir, 'upgrade-timing.jsonl'), 'utf8'), /evil/);
  });
});

test('a torn JSONL line is skipped and the report still renders', () => {
  withDir((dir) => {
    run(dir, ['init'], 0);
    run(dir, ['mark', '1'], 0);
    writeFileSync(join(dir, 'upgrade-timing.jsonl'), readFileSync(join(dir, 'upgrade-timing.jsonl'), 'utf8') + '{"t":"mark","ste');
    assert.match(run(dir, ['report'], 5000).stdout, /\| 1 \| 5\.0s \|/);
  });
});
