// Run: node --test skills/mule-development/upgrade-mule-app/lib/anypoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDxPluginVersion, isDxPluginAtLeastMin, checkDxPluginVersion, DX_PLUGIN_MIN_LABEL, stripJvmOptionsBanners, hasNoCliErrorText } from './anypoint.mjs';

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

// The CLI re-wraps the plugin's error (` › ` prefixes, a break after the colon), as captured from a real
// describe-connector run with a bad connector version.
const LOOSE = '-Dmule.jvm.version.extension.enforcement=LOOSE';
const WRAPPED_BANNER = ` ›   Error: Failed to describe connector: Picked up _JAVA_OPTIONS:  \n ›   ${LOOSE}\n ›\n`;

test('stripJvmOptionsBanners removes the wrapped banner the CLI prints for a failed describe', () => {
  const cleaned = stripJvmOptionsBanners(WRAPPED_BANNER, { _JAVA_OPTIONS: ` ${LOOSE}` });
  assert.doesNotMatch(cleaned, /Picked up|enforcement/);
  assert.match(cleaned, /Error: Failed to describe connector:/);
});

test('stripJvmOptionsBanners keeps the real error text that follows the banner', () => {
  const text = `${WRAPPED_BANNER} ›   Caused by: boom\n`;
  const cleaned = stripJvmOptionsBanners(text, { _JAVA_OPTIONS: LOOSE });
  assert.match(cleaned, /Caused by: boom/);
  assert.doesNotMatch(cleaned, /Picked up/);
});

test('stripJvmOptionsBanners leaves text without a banner untouched', () => {
  const text = 'Error: Failed to describe connector: Java exited with code 1\n';
  assert.equal(stripJvmOptionsBanners(text, { _JAVA_OPTIONS: LOOSE }), text);
});

test('stripJvmOptionsBanners handles a caller value with regex characters, wrapped mid-value', () => {
  const opts = `-Xlog:exceptions*=info:file=/tmp/x.log ${LOOSE}`;
  const text = 'Error: Picked up _JAVA_OPTIONS: -Xlog:exceptions*=info:\n \u203A   file=/tmp/x.log -Dmule.jvm.version.extension.enforcement=LOOSE\n';
  assert.doesNotMatch(stripJvmOptionsBanners(text, { _JAVA_OPTIONS: opts }), /Picked up|Xlog|LOOSE/);
});

test('stripJvmOptionsBanners strips JAVA_TOOL_OPTIONS and JDK_JAVA_OPTIONS banners when those are set', () => {
  const text = 'Picked up JAVA_TOOL_OPTIONS: -Dfoo=bar\nNOTE: Picked up JDK_JAVA_OPTIONS: -Dbaz=qux\nreal error\n';
  const cleaned = stripJvmOptionsBanners(text, { JAVA_TOOL_OPTIONS: '-Dfoo=bar', JDK_JAVA_OPTIONS: '-Dbaz=qux' });
  assert.equal(cleaned.trim(), 'real error');
});

test('stripJvmOptionsBanners ignores variables that are unset or blank', () => {
  const text = 'Picked up _JAVA_OPTIONS: -Dfoo=bar\n';
  assert.equal(stripJvmOptionsBanners(text, {}), text);
  assert.equal(stripJvmOptionsBanners(text, { _JAVA_OPTIONS: '  ' }), text);
});

test('hasNoCliErrorText: only the header and prefixes left means no cause was printed', () => {
  assert.equal(hasNoCliErrorText(stripJvmOptionsBanners(WRAPPED_BANNER, { _JAVA_OPTIONS: LOOSE })), true);
  assert.equal(hasNoCliErrorText(''), true);
});

test('hasNoCliErrorText: any other text counts as an error message', () => {
  assert.equal(hasNoCliErrorText(' \u203A   Error: Failed to describe connector: Java exited with code 1\n'), false);
  assert.equal(hasNoCliErrorText(' \u203A   Error: Failed to describe connector: \n \u203A   Caused by: boom\n'), false);
});

test('stripJvmOptionsBanners strips a banner wrapped inside `Picked up` or after `NOTE:`', () => {
  const env = { _JAVA_OPTIONS: LOOSE, JDK_JAVA_OPTIONS: '-Dbaz=qux' };
  const text = ` \u203A   Error: Failed to describe connector: Picked\n \u203A   up _JAVA_OPTIONS: ${LOOSE}\n \u203A   NOTE:\n \u203A   Picked up JDK_JAVA_OPTIONS: -Dbaz=qux\n`;
  const cleaned = stripJvmOptionsBanners(text, env);
  assert.doesNotMatch(cleaned, /Picked|up _JAVA|NOTE|LOOSE|baz/);
  assert.equal(hasNoCliErrorText(cleaned), true);
});

test('stripJvmOptionsBanners handles CRLF line endings', () => {
  assert.equal(stripJvmOptionsBanners(`Picked up _JAVA_OPTIONS: ${LOOSE}\r\nreal\r\n`, { _JAVA_OPTIONS: LOOSE }), '\r\nreal\r\n');
});

test('stripJvmOptionsBanners does not backtrack exponentially on a value containing `\u203A`', () => {
  const value = `-Dx=${'\u203A'.repeat(12)}z`;
  const text = `Picked up _JAVA_OPTIONS: ${'\u203A'.repeat(40)}\n`;
  const t0 = Date.now();
  assert.equal(stripJvmOptionsBanners(text, { _JAVA_OPTIONS: value }), text); // no match, and quickly
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
});

test('hasNoCliErrorText: the header wrapped between words still counts as no error text', () => {
  assert.equal(hasNoCliErrorText(' \u203A   Error: Failed to describe\n \u203A   connector:\n \u203A\n'), true);
});
