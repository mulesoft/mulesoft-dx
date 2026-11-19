// Run: node --test skills/mule-development/upgrade-mule-app/lib/anypoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDxPluginVersion, isDxPluginAtLeastMin, checkDxPluginVersion, DX_PLUGIN_MIN_LABEL } from './anypoint.mjs';

test('parseDxPluginVersion reads "name x.y.z" from plugins output', () => {
  const out = '@salesforce/anypoint-cli-dx-mule-plugin 1.3.1\nanother-plugin 2.0.0\n';
  assert.deepEqual(parseDxPluginVersion(out), { major: 1, minor: 3, patch: 1, version: '1.3.1' });
});

test('parseDxPluginVersion accepts an optional leading "v"', () => {
  assert.deepEqual(
    parseDxPluginVersion('@salesforce/anypoint-cli-dx-mule-plugin v1.3.1'),
    { major: 1, minor: 3, patch: 1, version: '1.3.1' }
  );
});

test('parseDxPluginVersion returns null when the plugin line is absent', () => {
  assert.equal(parseDxPluginVersion('some-other-plugin 1.0.0\n'), null);
  assert.equal(parseDxPluginVersion(''), null);
});

test('isDxPluginAtLeastMin: exactly at the floor passes', () => {
  assert.equal(isDxPluginAtLeastMin({ major: 1, minor: 3, patch: 2 }), true);
  assert.equal(DX_PLUGIN_MIN_LABEL, '1.3.2');
});

test('isDxPluginAtLeastMin: below the floor on patch/minor fails', () => {
  assert.equal(isDxPluginAtLeastMin({ major: 1, minor: 3, patch: 1 }), false);
  assert.equal(isDxPluginAtLeastMin({ major: 1, minor: 3, patch: 0 }), false);
  assert.equal(isDxPluginAtLeastMin({ major: 1, minor: 2, patch: 9 }), false);
});

test('isDxPluginAtLeastMin: above the floor on minor/major passes', () => {
  assert.equal(isDxPluginAtLeastMin({ major: 1, minor: 4, patch: 0 }), true);
  assert.equal(isDxPluginAtLeastMin({ major: 2, minor: 0, patch: 0 }), true);
});

// `plugins` lists only user-installed plugins; a fresh CLI carries the plugin as a
// core plugin that only `plugins --core` shows.
// Strict about argv so a typo in either probe fails the test; records calls so tests can assert order.
const fakeCli = ({ user = '', core = '' }, calls = []) => (args) => {
  calls.push(args.join(' '));
  if (args.length === 1 && args[0] === 'plugins') return user;
  if (args.length === 2 && args[0] === 'plugins' && args[1] === '--core') return core;
  throw new Error(`unexpected argv: ${args.join(' ')}`);
};

test('checkDxPluginVersion: core-only install below the floor is detected', () => {
  const r = checkDxPluginVersion(fakeCli({ user: 'No plugins installed.\n', core: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.1 (core)\n' }));
  assert.equal(r.parsed.version, '1.3.1');
  assert.equal(r.inRange, false);
});

test('checkDxPluginVersion: core-only install at the floor passes', () => {
  const r = checkDxPluginVersion(fakeCli({ user: 'No plugins installed.\n', core: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.2 (core)\n' }));
  assert.equal(r.inRange, true);
});

test('checkDxPluginVersion: user-installed copy wins over the core one', () => {
  const r = checkDxPluginVersion(fakeCli({
    user: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.2\n',
    core: '@salesforce/anypoint-cli-dx-mule-plugin 1.1.0 (core)\n',
  }));
  assert.equal(r.parsed.version, '1.3.2');
  assert.equal(r.inRange, true);
});

test('checkDxPluginVersion: old user copy is reported even when core is newer (user overrides core)', () => {
  const r = checkDxPluginVersion(fakeCli({
    user: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.1 (1.3.1)\n',
    core: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.2 (core)\n',
  }));
  assert.equal(r.parsed.version, '1.3.1');
  assert.equal(r.inRange, false);
});

test('checkDxPluginVersion: nothing readable yields null', () => {
  assert.deepEqual(checkDxPluginVersion(fakeCli({})), { parsed: null, inRange: false });
});

test('checkDxPluginVersion: probes `plugins` then `plugins --core`, and skips --core when the user copy parses', () => {
  const calls = [];
  checkDxPluginVersion(fakeCli({ user: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.2\n', core: '@salesforce/anypoint-cli-dx-mule-plugin 1.1.0 (core)\n' }, calls));
  assert.deepEqual(calls, ['plugins']);
  calls.length = 0;
  checkDxPluginVersion(fakeCli({ user: 'No plugins installed.\n', core: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.2 (core)\n' }, calls));
  assert.deepEqual(calls, ['plugins', 'plugins --core']);
});

test('checkDxPluginVersion: other user plugins but not the DX one still falls back to core', () => {
  const r = checkDxPluginVersion(fakeCli({
    user: 'some-other-plugin 2.0.0 (2.0.0)\nyet-another 1.0.0 (1.0.0)\n',
    core: '@salesforce/anypoint-cli-dx-mule-plugin 1.3.1 (core)\n',
  }));
  assert.equal(r.parsed.version, '1.3.1');
  assert.equal(r.inRange, false);
});
