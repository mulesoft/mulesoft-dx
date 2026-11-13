// Run: node --test skills/mule-development/upgrade-mule-app/lib/metadata-coverage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCoverageRows, entryName, normalizeElementName, usedProviderPlan } from './metadata-coverage.mjs';

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

test('Mode-C expects every Mode-A config x provider pair when usage lists no providers (Kafka: 14)', () => {
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

// ---- Mode-C limited to the providers the app uses -------------------------------------

// What enumerate_usage reports for the kafka-publisher app: the provider element
// (camelCase) plus provider children that the classifier also files under operations_used.
const kafkaUsage = {
  operations_used: ['bootstrapServer', 'bootstrapServers', 'message', 'publish'],
  sources_used: [],
  config_providers_used: ['bootstrapServer', 'bootstrapServers', 'producerSaslPlainConnection'],
};
const modeC = (rows) => expects(rows).filter((r) => r.kind === 'connection-provider');
const infos = (rows) => rows.filter((r) => r.level === 'INFO').map((r) => r.text);
// Fake Mode-C reader: every provider is described under `elementName(provider)`.
const reader = (elementName) => (file) => {
  const prov = file.replace(/^.*-config-/, '').replace(/\.json$/, '');
  return { connectionProviders: [{ name: prov, elementName: elementName(prov) }] };
};

test('only the provider the app uses needs Mode-C (Kafka: 1 of 14), unused configs are noted', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', usage: kafkaUsage, modeA: kafkaModeA, metadataDir: 'md', readMetadata: () => null,
  });
  assert.deepEqual(modeC(rows).map((r) => r.label), ['kafka/producer-config/producer-sasl-plain-connection']);
  assert.match(infos(rows)[0], /Mode-C skipped for config\(s\) the app does not use: consumer-config \(7\)/);
});

test('used provider whose elementName equals the element in the flows: no widening', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', usage: kafkaUsage, modeA: kafkaModeA, metadataDir: 'md', readMetadata: reader((p) => p),
  });
  assert.equal(modeC(rows).length, 1);
  assert.ok(!infos(rows).some((t) => /possible rename/.test(t)));
});

test('RENAME: used provider now has a different elementName, so every provider of THAT config is described', () => {
  // Old app element `producerSaslPlainConnection`; the new connector calls the same provider
  // `producer-sasl-plain-connection` in Mode-A but its DSL element is `producer-sasl-plain-auth-connection`.
  const rows = computeCoverageRows({
    nick: 'kafka', usage: kafkaUsage, modeA: kafkaModeA, metadataDir: 'md',
    readMetadata: reader((p) => (p === 'producer-sasl-plain-connection' ? 'producer-sasl-plain-auth-connection' : p)),
  });
  const labels = modeC(rows).map((r) => r.label);
  assert.equal(labels.length, 7);
  assert.ok(labels.every((l) => l.startsWith('kafka/producer-config/')), 'the unused consumer-config stays skipped');
  assert.ok(infos(rows).some((t) => /kafka\/producer-config .*possible rename/.test(t)));
});

// ---- implicit connection: a config in the flows with no provider child -----------------

test('a config declared in the flows with no matched provider (implicit connection) falls back to describing everything', () => {
  // producer-config has an explicit provider; consumer-config is in the flows but has no connection child.
  const usage = { ...kafkaUsage, config_elems_used: ['producerConfig', 'consumerConfig'] };
  const rows = computeCoverageRows({ nick: 'kafka', usage, modeA: kafkaModeA, metadataDir: 'md', readMetadata: () => null });
  assert.equal(modeC(rows).length, 14);
  assert.equal(usedProviderPlan(usage, kafkaModeA), null);
});

test('the implicit-connection check also matches a config by its elementName', () => {
  const modeA = { operations: [], sources: [], configs: [
    { name: 'consumer-config', elementName: 'consumer-cfg', connectionProviders: ['consumer-plain-connection'] },
    { name: 'producer-config', connectionProviders: ['producer-sasl-plain-connection'] },
  ] };
  const usage = { ...kafkaUsage, config_elems_used: ['consumerCfg'] };
  assert.equal(usedProviderPlan(usage, modeA), null);
});

test('a config element that does have a matched provider does not trigger the fallback', () => {
  const usage = { ...kafkaUsage, config_elems_used: ['producerConfig'] };
  assert.equal(modeC(computeCoverageRows({ nick: 'kafka', usage, modeA: kafkaModeA, metadataDir: 'md', readMetadata: () => null })).length, 1);
});

test('an older usage file without config_elems_used keeps the narrowed plan', () => {
  assert.ok(usedProviderPlan(kafkaUsage, kafkaModeA));
});

test('provider names are matched ignoring case and separators when reading the Mode-C file', () => {
  // The file lists two providers; the used one is spelled camelCase there but kebab-case in Mode-A.
  const readMetadata = () => ({
    connectionProviders: [
      { name: 'someOtherConnection', elementName: 'some-other-connection' },
      { name: 'producerSaslPlainConnection', elementName: 'producer-sasl-plain-connection' },
    ],
  });
  const rows = computeCoverageRows({ nick: 'kafka', usage: kafkaUsage, modeA: kafkaModeA, metadataDir: 'md', readMetadata });
  assert.equal(modeC(rows).length, 1);
  assert.ok(!infos(rows).some((t) => /possible rename/.test(t)));
});

test('RENAME with an id that only prefix-matches (http listener -> listener-secure-connection)', () => {
  const httpModeA = {
    operations: [], sources: ['listener'],
    configs: [
      { name: 'listenerConfig', connectionProviders: ['listener', 'listenerSecure'] },
      { name: 'requestConfig', connectionProviders: ['request'] },
    ],
  };
  const usage = { operations_used: [], sources_used: [], config_providers_used: ['listenerConnection'] };
  const same = computeCoverageRows({ nick: 'http', usage, modeA: httpModeA, metadataDir: 'md', readMetadata: reader((p) => (p === 'listener' ? 'listener-connection' : p)) });
  // `listener` matches; `listenerSecure` also matches by prefix (over-matching only costs a describe)
  assert.deepEqual(modeC(same).map((r) => r.label), ['http/listenerConfig/listener', 'http/listenerConfig/listenerSecure']);
  assert.ok(!modeC(same).some((r) => r.label.includes('requestConfig')), 'unused request config skipped');
  const renamed = computeCoverageRows({ nick: 'http', usage, modeA: httpModeA, metadataDir: 'md', readMetadata: reader(() => 'listener-tls-connection') });
  assert.deepEqual(modeC(renamed).map((r) => r.label), ['http/listenerConfig/listener', 'http/listenerConfig/listenerSecure']);
  assert.ok(infos(renamed).some((t) => /possible rename/.test(t)));
});

test('http: provider id `listener` matches element `listenerConnection`; unused request config is skipped', () => {
  const httpModeA = {
    operations: [], sources: ['listener'],
    configs: [
      { name: 'listenerConfig', connectionProviders: ['listener'] },
      { name: 'requestConfig', connectionProviders: ['request'] },
    ],
  };
  const rows = computeCoverageRows({
    nick: 'http', usage: { operations_used: [], sources_used: ['listener'], config_providers_used: ['listenerConnection'] },
    modeA: httpModeA, metadataDir: 'md', readMetadata: reader((p) => (p === 'listener' ? 'listener-connection' : p)),
  });
  assert.deepEqual(modeC(rows).map((r) => r.label), ['http/listenerConfig/listener']);
});

test('an old provider element that matches no new provider falls back to describing everything', () => {
  // `legacyAuthConnection` was removed or renamed beyond recognition.
  const rows = computeCoverageRows({
    nick: 'kafka', modeA: kafkaModeA, metadataDir: 'md', readMetadata: () => null,
    usage: { ...kafkaUsage, config_providers_used: [...kafkaUsage.config_providers_used, 'legacyAuthConnection'] },
  });
  assert.equal(modeC(rows).length, 14);
});

test('no used element matches any provider: describe everything', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', modeA: kafkaModeA, metadataDir: 'md', readMetadata: () => null,
    usage: { operations_used: [], config_providers_used: ['somethingElse'] },
  });
  assert.equal(modeC(rows).length, 14);
});

test('empty config_providers_used (nothing mapped) describes everything', () => {
  const rows = computeCoverageRows({
    nick: 'os', usage: { operations_used: [], config_providers_used: [] }, metadataDir: 'md', readMetadata: () => null,
    modeA: { operations: [], configs: [{ name: 'config', connectionProviders: ['connection'] }] },
  });
  assert.equal(modeC(rows).length, 1);
});

test('missing used-provider file: only the used pair is required (it reports itself missing)', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', usage: kafkaUsage, modeA: kafkaModeA, metadataDir: 'md', readMetadata: () => null,
  });
  assert.equal(modeC(rows).length, 1);
});

test('names compare case- and punctuation-insensitively', () => {
  assert.equal(normalizeElementName('producerSaslPlainConnection'), normalizeElementName('producer-sasl-plain-connection'));
  assert.equal(normalizeElementName(undefined), '');
});

test('usedProviderPlan returns null for unmappable usage and the matched pairs otherwise', () => {
  assert.equal(usedProviderPlan({}, kafkaModeA), null);
  assert.equal(usedProviderPlan({ config_providers_used: ['nope'] }, kafkaModeA), null);
  const plan = usedProviderPlan(kafkaUsage, kafkaModeA);
  assert.deepEqual([...plan.byConfig], [['producer-config', ['producer-sasl-plain-connection']]]);
});

// Real rename, verified with describe-connector: mule-amazon-s3-connector 5.8.4 declares providers
// [basic, role] (DSL `basic-connection`, `role-connection`); 6.0.0+ declares one provider `connection`.
// An app on 5.8.4 using <s3:basic-connection> therefore maps to NO provider of the new connector.
const s3NewModeA = { operations: ['listBuckets'], sources: [], configs: [{ name: 'config', connectionProviders: ['connection'] }] };

test('real S3 5.8.4 -> 6.0.0 rename: the old element matches no new provider, so the plan falls back to describing all', () => {
  const usage = { operations_used: ['listBuckets'], sources_used: [], config_providers_used: ['basicConnection'] };
  assert.equal(usedProviderPlan(usage, s3NewModeA), null);
  const rows = computeCoverageRows({ nick: 's3', usage, modeA: s3NewModeA, metadataDir: 'md' });
  assert.deepEqual(expects(rows).filter((r) => r.kind === 'connection-provider').map((r) => r.args[4]), ['connection']);
});

test('real S3 6.0.0 -> 8.0.10 (no rename): the used provider is the only Mode-C expected', () => {
  const usage = { operations_used: ['listBuckets'], sources_used: [], config_providers_used: ['connection'] };
  assert.ok(usedProviderPlan(usage, s3NewModeA));
});

test('an unmatched *Connection element still falls back to everything when the classifier also filed it under operations_used', () => {
  // Real enumerator output: the removed provider element is ALSO in operations_used.
  const rows = computeCoverageRows({
    nick: 'kafka', modeA: kafkaModeA, metadataDir: 'md', readMetadata: () => null,
    usage: {
      ...kafkaUsage,
      operations_used: [...kafkaUsage.operations_used, 'legacyAuthConnection'],
      config_providers_used: [...kafkaUsage.config_providers_used, 'legacyAuthConnection'],
    },
  });
  assert.equal(modeC(rows).length, 14);
});

test('a Mode-C file that parses but has no elementName widens (a rename cannot be ruled out)', () => {
  const rows = computeCoverageRows({
    nick: 'kafka', usage: kafkaUsage, modeA: kafkaModeA, metadataDir: 'md',
    readMetadata: () => ({ connectionProviders: [{ name: 'producer-sasl-plain-connection' }] }),
  });
  assert.equal(modeC(rows).length, 7);
  assert.ok(infos(rows).some((t) => /possible rename/.test(t)));
});
