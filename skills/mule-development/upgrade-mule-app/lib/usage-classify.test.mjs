// Run: node --test skills/mule-development/upgrade-mule-app/lib/usage-classify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassifier, classifyElements, normalizeName } from './usage-classify.mjs';

const kafka = {
  operations: ['bulkPublish', 'publish', 'getURL'],
  sources: ['batch-message-listener', 'message-listener'],
  configs: [{ name: 'producer-config', connectionProviders: ['producer-sasl-plain-connection'] }],
};
const http = {
  operations: ['basicSecurityFilter', 'request'],
  sources: ['listener'],
  configs: [{ name: 'requestConfig', connectionProviders: ['request'] }],
};

test('normalizeName ignores case, hyphens and underscores', () => {
  assert.equal(normalizeName('message-listener'), normalizeName('messageListener'));
  assert.equal(normalizeName('a_b'), 'ab');
});

test('hyphenated sources, configs and providers are recognised from their camelCase form', () => {
  const c = buildClassifier(kafka);
  assert.deepEqual(c('messageListener'), { bucket: 'source', canonical: 'message-listener' });
  assert.deepEqual(c('batchMessageListener'), { bucket: 'source', canonical: 'batch-message-listener' });
  assert.deepEqual(c('producerConfig'), { bucket: 'config', canonical: 'producer-config' });
  assert.deepEqual(c('producerSaslPlainConnection'), { bucket: 'provider', canonical: 'producer-sasl-plain-connection' });
});

test('operations map to the canonical Mode-A spelling, including acronyms', () => {
  const c = buildClassifier(kafka);
  assert.deepEqual(c('publish'), { bucket: 'operation', canonical: 'publish' });
  assert.deepEqual(c('getUrl'), { bucket: 'operation', canonical: 'getURL' });
});

test('an operation wins over a same-named provider (http request)', () => {
  assert.equal(buildClassifier(http)('request').bucket, 'operation');
});

test('names unknown to Mode-A stay unknown and keep the flow spelling', () => {
  assert.deepEqual(buildClassifier(kafka)('bootstrapServers'), { bucket: 'unknown', canonical: 'bootstrapServers' });
});

test('classifyElements: kebab names no longer leak into operations_used', () => {
  const r = classifyElements(['producerConfig', 'producerSaslPlainConnection', 'publish', 'messageListener', 'bootstrapServers'], kafka);
  assert.deepEqual(r.operations_used, ['publish', 'bootstrapServers']);
  assert.deepEqual(r.sources_used, ['message-listener']);
  assert.deepEqual(r.config_elems_used, ['producerConfig']);
  assert.deepEqual(r.provider_hits_from_classify, ['producerSaslPlainConnection']);
  // providers + unknown names, as before
  assert.deepEqual(r.child_elements_used, ['producerSaslPlainConnection', 'bootstrapServers']);
});

test('classifyElements tolerates missing or empty metadata', () => {
  const r = classifyElements(['foo'], {});
  assert.deepEqual(r.operations_used, ['foo']);
  assert.deepEqual(r.child_elements_used, ['foo']);
});
