// Run: node --test skills/mule-development/upgrade-mule-app/lib/metadata-coverage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCoverageRows, entryName } from './metadata-coverage.mjs';

const providers = (prefix) => ['plaintext', 'sasl-aws-iam', 'sasl-gssapi', 'sasl-oauth-bearer-cc', 'sasl-plain', 'sasl-scram', 'sasl-token']
  .map((p) => `${prefix}-${p}-connection`);
// Shape of the real Kafka Mode-A: camelCase operations, kebab sources/configs/providers.
const kafkaModeA = {
  operations: ['bulkPublish', 'commit', 'consume', 'publish', 'seek'],
  sources: ['batch-message-listener', 'message-listener'],
  configs: [
    { name: 'consumer-config', connectionProviders: providers('consumer') },
    { name: 'producer-config', connectionProviders: providers('producer') },
  ],
};
const expects = (rows) => rows.filter((r) => r.level === 'EXPECT');

test('Mode-C expects every Mode-A config x provider pair, used or not (Kafka: 14)', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', usage: { operations_used: ['publish'], sources_used: [] }, modeA: kafkaModeA, metadataDir: 'md',
  });
  const modeC = expects(rows).filter((r) => r.kind === 'connection-provider');
  assert.equal(modeC.length, 14);
  assert.deepEqual(modeC[0].args, ['kafka-new', '--type', 'connection-provider', '--name', 'consumer-plaintext-connection', '--config-name', 'consumer-config']);
  assert.match(modeC[0].path, /kafka-new-consumer-config-consumer-plaintext-connection\.json$/);
});

test('Mode-B covers used operations and sources only', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', usage: { operations_used: ['publish'], sources_used: ['message-listener'] }, modeA: kafkaModeA, metadataDir: 'md',
  });
  const modeB = expects(rows).filter((r) => r.kind !== 'connection-provider');
  assert.deepEqual(modeB.map((r) => [r.kind, r.args.slice(1)]), [
    ['operation', ['--type', 'operation', '--name', 'publish']],
    ['source', ['--type', 'source', '--name', 'message-listener']],
  ]);
});

test('names absent from Mode-A produce WARN rows, not expectations', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', usage: { operations_used: ['gone'], sources_used: ['messageListener'] }, modeA: kafkaModeA, metadataDir: 'md',
  });
  assert.equal(expects(rows).filter((r) => r.kind !== 'connection-provider').length, 0);
  assert.deepEqual(rows.filter((r) => r.level === 'WARN').map((r) => r.text.split(' — ')[0]), ['WARN  kafka/gone', 'WARN  kafka/messageListener']);
});

test('a config with no providers is INFO only', () => {
  const rows = computeCoverageRows({
    nick: 'x', usage: {}, modeA: { configs: [{ name: 'cfg', connectionProviders: [] }] }, metadataDir: 'md',
  });
  assert.deepEqual(rows.map((r) => r.level), ['INFO']);
});

test('name falls back to elementName for configs and providers', () => {
  assert.equal(entryName({ elementName: 'e' }), 'e');
  assert.equal(entryName({ name: 'n', elementName: 'e' }), 'n');
  const rows = computeCoverageRows({
    nick: 'x', usage: {}, modeA: { configs: [{ elementName: 'cfg', connectionProviders: [{ elementName: 'prov' }] }] }, metadataDir: 'md',
  });
  assert.match(expects(rows)[0].path, /x-new-cfg-prov\.json$/);
});
