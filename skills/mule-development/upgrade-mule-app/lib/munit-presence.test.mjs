// Run: node --test skills/mule-development/upgrade-mule-app/lib/munit-presence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectMunit } from './munit-presence.mjs';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

const POM = (body = '', parent = '') =>
  `<project><modelVersion>4.0.0</modelVersion>${parent}<groupId>g</groupId><artifactId>app</artifactId><version>1.0.0</version>${body}</project>`;
const PARENT = '<parent><groupId>g</groupId><artifactId>parent</artifactId><version>1</version><relativePath>../parent/pom.xml</relativePath></parent>';
const MUNIT_PLUGIN = '<build><plugins><plugin><groupId>com.mulesoft.munit.tools</groupId><artifactId>munit-maven-plugin</artifactId><version>3.0.0</version></plugin></plugins></build>';

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'munit-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('an app with no MUnit anywhere (the kafka / net-tools case)', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM('<properties><app.runtime>4.9.0</app.runtime></properties>'));
  const r = detectMunit(dir);
  assert.equal(r.hasMunit, false);
  assert.deepEqual(r.pomSignals, []);
  assert.equal(r.suites, 0);
}));

test('munit-maven-plugin in the app pom', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM(MUNIT_PLUGIN));
  const r = detectMunit(dir);
  assert.equal(r.hasMunit, true);
  assert.match(r.pomSignals[0], /munit artifactId/);
}));

test('a <munit.version> property alone counts', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM('<properties><munit.version>3.0.0</munit.version></properties>'));
  assert.equal(detectMunit(dir).hasMunit, true);
}));

test('munit-runner / munit-tools dependencies count', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM('<dependencies><dependency><groupId>com.mulesoft.munit</groupId><artifactId>munit-runner</artifactId></dependency></dependencies>'));
  assert.equal(detectMunit(dir).hasMunit, true);
}));

test('MUnit declared only in an ancestor pom still counts', () => withDir((dir) => {
  mkdirSync(join(dir, 'app'));
  mkdirSync(join(dir, 'parent'));
  writeFileSync(join(dir, 'parent', 'pom.xml'), POM(MUNIT_PLUGIN).replace('<artifactId>app</artifactId>', '<artifactId>parent</artifactId>'));
  writeFileSync(join(dir, 'app', 'pom.xml'), POM('', PARENT));
  const r = detectMunit(join(dir, 'app'));
  assert.equal(r.hasMunit, true);
  assert.equal(r.poms.length, 2);
  assert.match(r.pomSignals[0], /parent/);
}));

test('suites under src/test/munit count even with no pom signal', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM());
  mkdirSync(join(dir, 'src', 'test', 'munit', 'nested'), { recursive: true });
  writeFileSync(join(dir, 'src', 'test', 'munit', 'nested', 'a-test-suite.xml'), '<munit/>');
  const r = detectMunit(dir);
  assert.equal(r.hasMunit, true);
  assert.equal(r.suites, 1);
}));

test('a non-xml file under src/test/munit does not count', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM());
  mkdirSync(join(dir, 'src', 'test', 'munit'), { recursive: true });
  writeFileSync(join(dir, 'src', 'test', 'munit', 'notes.txt'), 'x');
  assert.equal(detectMunit(dir).hasMunit, false);
}));

test('an unparseable pom still reports what the text scan found', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), '<project><artifactId>munit-maven-plugin</artifactId>');
  assert.equal(detectMunit(dir).hasMunit, true);
}));

test('detect_munit.mjs prints the verdict and writes the file', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM());
  const r = spawnSync(process.execPath, [join(SCRIPTS, 'detect_munit.mjs'), dir], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /hasMunit=false/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'tmp', 'munit-presence.json'), 'utf8')).hasMunit, false);
}));

test('apply_runtime_bump stays quiet about munit.to when Step 11a recorded skipped', () => withDir((dir) => {
  writeFileSync(join(dir, 'pom.xml'), POM('<properties><app.runtime>4.6.0</app.runtime></properties>'));
  writeFileSync(join(dir, 'mule-artifact.json'), JSON.stringify({ minMuleVersion: '4.6.0' }));
  mkdirSync(join(dir, 'tmp'));
  const run = (munit) => {
    writeFileSync(join(dir, 'tmp', 'upgrade-targets.json'), JSON.stringify({
      mule: { to: '4.9.0' }, java: { to: 17 }, muleMavenPlugin: { to: '4.3.0' }, ...(munit ? { munit } : {}),
    }));
    return spawnSync(process.execPath, [join(SCRIPTS, 'apply_runtime_bump.mjs'), dir], {
      encoding: 'utf8', cwd: dir, env: { ...process.env, UPGRADE_TARGETS_FILE: join(dir, 'tmp', 'upgrade-targets.json') },
    });
  };
  assert.match(run(undefined).stderr, /has no munit\.to/);
  const skipped = run({ to: null, skipped: true });
  assert.equal(skipped.status, 0);
  assert.doesNotMatch(skipped.stderr, /munit\.to/);
}));
