// Run: node --test skills/mule-development/upgrade-mule-app/lib/platform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJavaVersion } from './platform.mjs';

const VERSION_17 = 'openjdk version "17.0.13" 2024-10-15\nOpenJDK Runtime Environment (build 17.0.13+11)\nOpenJDK 64-Bit Server VM (build 17.0.13+11, mixed mode)\n';

test('parseJavaVersion reads modern and legacy version strings', () => {
  assert.deepEqual(parseJavaVersion(VERSION_17), { raw: '17.0.13', major: 17 });
  assert.equal(parseJavaVersion('java version "11.0.21" 2023-10-17 LTS\n').major, 11);
  assert.equal(parseJavaVersion('openjdk version "1.8.0_321"\n').major, 8);
  assert.equal(parseJavaVersion('openjdk version "21-ea" 2023-09-19\n').major, 21);
});

test('parseJavaVersion skips the `Picked up _JAVA_OPTIONS` banner printed before the version', () => {
  const out = `Picked up _JAVA_OPTIONS: -Xmx512m\n${VERSION_17}`;
  assert.deepEqual(parseJavaVersion(out), { raw: '17.0.13', major: 17 });
});

test('parseJavaVersion skips the JAVA_TOOL_OPTIONS banner, and both banners together', () => {
  assert.equal(parseJavaVersion(`Picked up JAVA_TOOL_OPTIONS: -Dfoo=bar\n${VERSION_17}`).major, 17);
  assert.equal(parseJavaVersion(`Picked up JAVA_TOOL_OPTIONS: -Dfoo=bar\nPicked up _JAVA_OPTIONS: -Xmx512m\n${VERSION_17}`).major, 17);
});

test('parseJavaVersion is not fooled by a quoted flag value inside a banner', () => {
  const out = `Picked up JAVA_TOOL_OPTIONS: -Dx="a b"\nopenjdk version "11.0.25" 2024-10-15\n`;
  assert.deepEqual(parseJavaVersion(out), { raw: '11.0.25', major: 11 });
});

test('parseJavaVersion is not fooled by `version "X"` inside a banner value', () => {
  const out = `Picked up _JAVA_OPTIONS: -Dapp.version "8"\n${VERSION_17}`;
  assert.deepEqual(parseJavaVersion(out), { raw: '17.0.13', major: 17 });
});

test('parseJavaVersion handles CRLF line endings', () => {
  assert.equal(parseJavaVersion(`Picked up _JAVA_OPTIONS: -Xmx512m\r\n${VERSION_17.replace(/\n/g, '\r\n')}`).major, 17);
});

test('parseJavaVersion returns null major for banner-only, garbage, empty and missing input', () => {
  const none = { raw: '', major: null };
  assert.deepEqual(parseJavaVersion('Picked up _JAVA_OPTIONS: -Xmx512m\n'), none);
  assert.deepEqual(parseJavaVersion('command not found: java'), none);
  assert.deepEqual(parseJavaVersion(''), none);
  assert.deepEqual(parseJavaVersion(undefined), none);
});
