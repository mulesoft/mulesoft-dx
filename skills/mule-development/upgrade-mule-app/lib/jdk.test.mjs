// Run: node --test build-mule-integration/lib/jdk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBundledJdk, javaHomeFixHint, javaHomeUnder } from './jdk.mjs';

function fakeHome(layout, platform = 'linux') {
  const home = mkdtempSync(join(tmpdir(), 'jdk-test-'));
  const exe = platform === 'win32' ? 'java.exe' : 'java';
  for (const rel of layout) {
    mkdirSync(join(home, 'AnypointCodeBuilder', 'java', rel, 'bin'), { recursive: true });
    writeFileSync(join(home, 'AnypointCodeBuilder', 'java', rel, 'bin', exe), '');
  }
  return home;
}
const majorFromPath = (h) => Number((/jdk-(\d+)/.exec(h) || [])[1]) || null;

test('finds nothing when the ACB java dir is absent', () => {
  const home = mkdtempSync(join(tmpdir(), 'jdk-test-'));
  try { assert.equal(findBundledJdk(11, { home }), null); } finally { rmSync(home, { recursive: true }); }
});

test('picks the newest JDK >= minMajor and skips older ones', () => {
  const home = fakeHome(['jdk-8.0.472+8', 'jdk-11.0.21+9', 'jdk-17.0.9+9']);
  try {
    const r = findBundledJdk(11, { home, platform: 'linux', majorOf: majorFromPath });
    assert.equal(r.major, 17);
    assert.equal(findBundledJdk(21, { home, platform: 'linux', majorOf: majorFromPath }), null);
  } finally { rmSync(home, { recursive: true }); }
});

test('handles the macOS Contents/Home layout', () => {
  const home = fakeHome(['jdk-17.0.9+9/Contents/Home'], 'darwin');
  try {
    const r = findBundledJdk(11, { home, platform: 'darwin', majorOf: () => 17 });
    assert.ok(r.javaHome.endsWith(join('Contents', 'Home')));
  } finally { rmSync(home, { recursive: true }); }
});

test('handles java.exe on win32', () => {
  const home = fakeHome(['jdk-11.0.21+9'], 'win32');
  try {
    assert.ok(findBundledJdk(11, { home, platform: 'win32', majorOf: () => 11 }));
    assert.equal(javaHomeUnder(join(home, 'AnypointCodeBuilder', 'java', 'jdk-11.0.21+9'), 'linux'), null);
  } finally { rmSync(home, { recursive: true }); }
});

test('fix hints are platform-specific and never macOS-only on Windows', () => {
  const win = javaHomeFixHint(11, 'C:\\jdk', 'win32');
  assert.match(win, /\$env:JAVA_HOME/);
  assert.match(win, /setx JAVA_HOME/);
  assert.doesNotMatch(win, /libexec/);
  assert.match(javaHomeFixHint(17, '', 'darwin'), /java_home -v 17/);
  assert.doesNotMatch(javaHomeFixHint(17, '', 'linux'), /libexec/);
  assert.equal(javaHomeFixHint(11, '/opt/jdk', 'linux'), 'export JAVA_HOME="/opt/jdk"');
});
