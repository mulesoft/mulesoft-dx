// Run: node --test skills/mule-development/upgrade-mule-app/scripts/verify_metadata_coverage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./verify_metadata_coverage.mjs', import.meta.url));
const providers = (prefix) => ['plaintext', 'sasl-plain', 'sasl-scram'].map((p) => `${prefix}-${p}-connection`);
const MODE_A = {
  operations: ['publish'],
  sources: ['message-listener'],
  configs: [
    { name: 'consumer-config', connectionProviders: providers('consumer') },
    { name: 'producer-config', connectionProviders: providers('producer') },
  ],
};

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-'));
  mkdirSync(join(dir, 'tmp/connector-usage'), { recursive: true });
  mkdirSync(join(dir, 'tmp/connector-metadata'), { recursive: true });
  writeFileSync(join(dir, 'tmp/connector-usage/kafka.json'), JSON.stringify({ operations_used: ['publish'], sources_used: [] }));
  writeFileSync(join(dir, 'tmp/connector-metadata/kafka-new.json'), JSON.stringify(MODE_A));
  return dir;
}
const gate = (dir, ...args) => spawnSync(process.execPath, [GATE, ...args], { cwd: dir, encoding: 'utf8' });
const md = (dir, f) => writeFileSync(join(dir, 'tmp/connector-metadata', f), '{}');

test('describing only the pair the app uses still FAILs: Mode-C is the whole Mode-A cross-product', () => {
  const dir = project();
  try {
    md(dir, 'kafka-new-publish.json');
    md(dir, 'kafka-new-producer-config-producer-sasl-plain-connection.json');
    const r = gate(dir);
    assert.equal(r.status, 1);
    assert.equal((r.stdout.match(/^FAIL  .*missing Mode-C/gm) || []).length, 5); // 6 pairs - the one described
    assert.match(r.stderr, /describe_missing\.mjs --phase bc/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('passes once every operation and every config x provider pair is described', () => {
  const dir = project();
  try {
    md(dir, 'kafka-new-publish.json');
    for (const cfg of ['consumer', 'producer']) for (const p of providers(cfg)) md(dir, `kafka-new-${cfg}-config-${p}.json`);
    const r = gate(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /0 FAIL/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('exits 2 when there are no usage files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-'));
  try { assert.equal(gate(dir).status, 2); } finally { rmSync(dir, { recursive: true, force: true }); }
});
