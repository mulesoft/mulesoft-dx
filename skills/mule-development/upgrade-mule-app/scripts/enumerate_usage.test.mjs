// Run: node --test skills/mule-development/upgrade-mule-app/scripts/enumerate_usage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));

const FLOW = `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:kafka="http://www.mulesoft.org/schema/mule/kafka">
  <kafka:producer-config name="Producer">
    <kafka:producer-sasl-plain-connection/>
  </kafka:producer-config>
  <flow name="main">
    <kafka:message-listener config-ref="Consumer"/>
    <kafka:publish config-ref="Producer" topic="t"/>
  </flow>
</mule>
`;
// Kebab-case sources / configs / providers, camelCase operations (the real Kafka Mode-A shape).
const MODE_A = {
  namespace: { prefix: 'kafka', namespace: 'http://www.mulesoft.org/schema/mule/kafka', schemaLocation: 'x' },
  operations: ['publish'],
  sources: ['message-listener'],
  configs: [{ name: 'producer-config', connectionProviders: ['producer-sasl-plain-connection'] }],
};

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'enumerate-usage-'));
  mkdirSync(join(dir, 'src/main/mule'), { recursive: true });
  mkdirSync(join(dir, 'tmp/connector-metadata'), { recursive: true });
  writeFileSync(join(dir, 'src/main/mule/flow.xml'), FLOW);
  writeFileSync(join(dir, 'tmp/connector-metadata/kafka-new.json'), JSON.stringify(MODE_A));
  return dir;
}

function fastXmlParserAvailable() {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('fast-xml-parser')"], { cwd: SCRIPTS, encoding: 'utf8' });
  return r.status === 0;
}

for (const script of ['enumerate_usage.mjs', 'enumerate_usage_xml.mjs']) {
  const skip = script.endsWith('_xml.mjs') && !fastXmlParserAvailable() ? 'fast-xml-parser not installed' : false;
  test(`${script}: a kebab-case source is reported under its Mode-A name, not as an operation`, { skip }, () => {
    const dir = project();
    try {
      const r = spawnSync(process.execPath, [join(SCRIPTS, script), 'kafka', '.'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const usage = JSON.parse(readFileSync(join(dir, 'tmp/connector-usage/kafka.json'), 'utf8'));
      assert.deepEqual(usage.sources_used, ['message-listener']);
      assert.deepEqual(usage.operations_used, ['publish']);
      assert.deepEqual(usage.child_elements_used, ['producerSaslPlainConnection']);
      assert.deepEqual(usage.config_providers_used, ['producerSaslPlainConnection']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
