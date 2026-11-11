// Run: node --test skills/mule-development/upgrade-mule-app/lib/describe-runner.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dedupeTargets, defaultConcurrency, isValidJsonFile, planPhaseA, planPhaseBC, runPool,
} from './describe-runner.mjs';

test('default concurrency is half the cores, capped at 4, at least 1', () => {
  assert.equal(defaultConcurrency(1), 1);
  assert.equal(defaultConcurrency(2), 1);
  assert.equal(defaultConcurrency(4), 2);
  assert.equal(defaultConcurrency(8), 4);
  assert.equal(defaultConcurrency(64), 4);
});

test('default concurrency falls back to 4 when the core count is unusable', () => {
  for (const bad of [undefined, 0, NaN, -2, 3.5]) assert.equal(defaultConcurrency(bad), 4);
});

test('runPool never exceeds the limit, runs everything, and turns throws into errors', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 15));
    inFlight -= 1;
    if (n === 4) throw new Error('boom');
    return n * 2;
  });
  assert.equal(peak, 3);
  assert.deepEqual(out.map((o) => o.result), [2, 4, 6, undefined, 10, 12, 14]);
  assert.equal(out[3].error.message, 'boom');
});

test('dedupeTargets drops exact repeats and flags different calls writing one path', () => {
  const a = { label: 'a', path: 'p/x.json', args: ['n', '--name', 'b-c'] };
  const same = { label: 'a2', path: 'p/x.json', args: ['n', '--name', 'b-c'] };
  const clash = { label: 'b', path: 'p/x.json', args: ['n', '--config-name', 'b', '--name', 'c'] };
  const other = { label: 'c', path: 'p/y.json', args: ['n'] };
  assert.equal(dedupeTargets([a, same, other]).unique.length, 2);
  assert.equal(dedupeTargets([a, same, other]).conflicts.length, 0);
  assert.equal(dedupeTargets([a, clash]).conflicts.length, 1);
});

function scratch() { return mkdtempSync(join(tmpdir(), 'describe-runner-')); }

test('isValidJsonFile rejects missing and truncated files', () => {
  const d = scratch();
  try {
    writeFileSync(join(d, 'ok.json'), '{"a":1}');
    writeFileSync(join(d, 'cut.json'), '{"a":');
    assert.equal(isValidJsonFile(join(d, 'ok.json')), true);
    assert.equal(isValidJsonFile(join(d, 'cut.json')), false);
    assert.equal(isValidJsonFile(join(d, 'nope.json')), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('planPhaseA builds one Mode-A call per nick', () => {
  const [e] = planPhaseA(['kafka'], 'md');
  assert.deepEqual(e.args, ['kafka-new']);
  assert.match(e.path, /kafka-new\.json$/);
});

test('planPhaseBC reports prerequisites instead of planning when usage or Mode-A is missing', () => {
  const d = scratch();
  try {
    const usageDir = join(d, 'usage'); const metadataDir = join(d, 'md');
    assert.match(planPhaseBC({ usageDir, metadataDir }).problems[0], /does not exist/);
    mkdirSync(usageDir); mkdirSync(metadataDir);
    assert.match(planPhaseBC({ usageDir, metadataDir }).problems[0], /no usage files/);
    writeFileSync(join(usageDir, 'kafka.json'), JSON.stringify({ operations_used: ['publish'] }));
    writeFileSync(join(usageDir, 'vm.json'), JSON.stringify({ status: 'not_in_use' }));
    const missing = planPhaseBC({ usageDir, metadataDir });
    assert.equal(missing.entries.length, 0);
    assert.match(missing.problems[0], /kafka: missing or unparseable Mode-A/);
    writeFileSync(join(metadataDir, 'kafka-new.json'), JSON.stringify({
      operations: ['publish'], configs: [{ name: 'producer-config', connectionProviders: ['a-connection', 'b-connection'] }],
    }));
    const plan = planPhaseBC({ usageDir, metadataDir });
    assert.deepEqual(plan.problems, []);
    assert.equal(plan.entries.length, 3); // 1 Mode-B + 2 Mode-C; not_in_use vm skipped
  } finally { rmSync(d, { recursive: true, force: true }); }
});
