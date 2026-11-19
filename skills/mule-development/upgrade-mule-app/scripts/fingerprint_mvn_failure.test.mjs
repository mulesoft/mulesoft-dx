// Run: node --test skills/mule-development/upgrade-mule-app/scripts/fingerprint_mvn_failure.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fingerprint_mvn_failure.mjs');

// Trimmed from a real failed `mvn clean package` (net-tools-api, class 2: XSD parse error in global.xml).
function xsdLog({ line = 44, col = 66, element = 'delegate-security-provider', extra = [] } = {}) {
  return [
    '[INFO] BUILD FAILURE',
    '[INFO] Total time:  5.824 s',
    "[ERROR] Failed to execute goal org.mule.tools.maven:mule-maven-plugin:4.10.4:process-classes (default-process-classes) on project net-tools-api: Execution default-process-classes of goal org.mule.tools.maven:mule-maven-plugin:4.10.4:process-classes failed: There was '1' error while parsing the given file 'global.xml'.",
    '[ERROR] Full list:',
    `[ERROR] org.xml.sax.SAXParseException; lineNumber: ${line}; columnNumber: ${col}; cvc-complex-type.2.4.a: Invalid content was found starting with element '{"http://www.mulesoft.org/schema/mule/spring":${element}}'. One of '{"http://www.mulesoft.org/schema/mule/core":annotations, "http://www.mulesoft.org/schema/mule/spring":delegate-security-providers}' is expected.`,
    ...extra,
    '[ERROR] ',
    '[ERROR] -> [Help 1]',
    '[ERROR] To see the full stack trace of the errors, re-run Maven with the -e switch.',
    '[ERROR] Re-run Maven using the -X switch to enable full debug logging.',
    '',
  ].join('\n');
}

const AUTH_LOG = '[ERROR] Failed to execute goal on project x: Could not transfer artifact a:b:pom:1 from/to anypoint-exchange-v3 (https://maven.anypoint.mulesoft.com/api/v3/maven): status code: 401, reason phrase: Unauthorized (401) -> [Help 1]\n';

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'fingerprint-mvn-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Write <dir>/<name> with `text`, run the script on it and return the parsed JSON.
function check(dir, name, text) {
  writeFileSync(join(dir, name), text);
  const r = spawnSync(process.execPath, [SCRIPT_PATH, join(dir, name)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('first failure is new and records a fingerprint', () => {
  withDir((dir) => {
    const r = check(dir, 'build-1.log', xsdLog());
    assert.equal(r.phase, 'build');
    assert.equal(r.attempt, 1);
    assert.equal(r.kind, 'xsd-parse');
    assert.equal(r.verdict, 'new');
    assert.equal(r.occurrence, 1);
    assert.match(r.signature, /^[0-9a-f]{16}$/);
    assert.match(r.summary[0], /^global\.xml:44:66 cvc-complex-type\.2\.4\.a/);
    assert.ok(existsSync(join(dir, 'fingerprints.jsonl')));
  });
});

test('the same failure repeats on attempt 2 and halts on attempt 3', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    const second = check(dir, 'build-2.log', xsdLog());
    assert.equal(second.verdict, 'repeat');
    assert.equal(second.occurrence, 2);
    assert.match(second.hint, /differs from the last/);
    const third = check(dir, 'build-3.log', xsdLog());
    assert.equal(third.verdict, 'halt');
    assert.equal(third.occurrence, 3);
    assert.match(third.hint, /HALT via AskUserQuestion/);
  });
});

test('a moved line or column is progress, not a repeat', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    assert.equal(check(dir, 'build-2.log', xsdLog({ line: 45 })).verdict, 'new');
    assert.equal(check(dir, 'build-3.log', xsdLog({ line: 45, col: 70 })).verdict, 'new');
  });
});

test('a different element is progress, and a failure that returns after a change counts from 1 again', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    assert.equal(check(dir, 'build-2.log', xsdLog({ element: 'other-thing' })).verdict, 'new');
    // back to the first failure: the previous attempt differed, so this is occurrence 1
    assert.equal(check(dir, 'build-3.log', xsdLog()).occurrence, 1);
  });
});

test('a shrinking error list is progress; the same list in another order is a repeat', () => {
  const second = "[ERROR] org.xml.sax.SAXParseException; lineNumber: 50; columnNumber: 3; cvc-complex-type.3.2.2: Attribute 'method' is not allowed to appear in element 'http:listener'.";
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog({ extra: [second] }));
    assert.equal(check(dir, 'build-2.log', xsdLog()).verdict, 'new');
  });
  withDir((dir) => {
    const first = '[ERROR] org.xml.sax.SAXParseException; lineNumber: 44';
    const reordered = xsdLog().replace(first, `${second}\n${first}`);
    check(dir, 'build-1.log', xsdLog({ extra: [second] }));
    assert.equal(check(dir, 'build-2.log', reordered).verdict, 'repeat');
  });
});

test('a log with no error text is none and breaks a run of repeats', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    const none = check(dir, 'build-2.log', '[INFO] BUILD FAILURE\n[INFO] Total time:  1.0 s\n');
    assert.equal(none.kind, 'none');
    assert.equal(none.verdict, 'none');
    assert.equal(none.signature, null);
    assert.equal(check(dir, 'build-3.log', xsdLog()).verdict, 'new');
  });
});

test('an auth failure is not compared and not recorded', () => {
  withDir((dir) => {
    const r = check(dir, 'build-1.log', AUTH_LOG);
    assert.equal(r.kind, 'auth');
    assert.equal(r.verdict, 'none');
    assert.ok(!existsSync(join(dir, 'fingerprints.jsonl')));
  });
});

test('other failures fall back to the normalised [ERROR] lines', () => {
  const compile = (n) => `[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.14.1:compile (default-compile) on project app: Compilation failure\n[ERROR] /src/main/java/Foo.java:[${n},5] cannot find symbol\n[ERROR] -> [Help 1]\n`;
  withDir((dir) => {
    const first = check(dir, 'build-1.log', compile(10));
    assert.equal(first.kind, 'generic');
    assert.equal(check(dir, 'build-2.log', compile(10)).verdict, 'repeat');
    assert.equal(check(dir, 'build-3.log', compile(11)).verdict, 'new');
  });
});

test('the plugin version in the failing goal does not make a failure look new', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    const bumped = xsdLog().replaceAll('mule-maven-plugin:4.10.4', 'mule-maven-plugin:4.11.0');
    assert.equal(check(dir, 'build-2.log', bumped).verdict, 'repeat');
  });
});

test('MUnit attempts are compared separately from build attempts, using the Run Summary suite lines and totals', () => {
  // Trimmed from a real batch-template run (MUnit 3.7.6).
  const munit = (suite, errors, failures) => [
    '[ERROR] Failed to execute goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.6:test (test) on project batch-template: Build Failed: There was an error running MUnit tests -> [Help 1]',
    '[INFO] MUnit Run Summary - Product: MULE_EE, Version: 4.9.22',
    `[INFO]  >> ${suite} test result: Tests: 1, Errors: ${errors}, Failures: ${failures}, Skipped: 0`,
    '[INFO] \t',
    '[INFO]  > Tests:   \t1',
    `[INFO]  > Errors:  \t${errors}`,
    `[INFO]  > Failures:\t${failures}`,
    '[INFO]  > Skipped: \t0',
    '',
  ].join('\n');
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    const m1 = check(dir, 'munit-1.log', munit('a-suite.xml', 1, 0));
    assert.equal(m1.phase, 'munit');
    assert.equal(m1.verdict, 'new');
    assert.match(m1.summary.join('\n'), /a-suite\.xml test result: Tests: 1, Errors: 1/);
    assert.equal(check(dir, 'munit-2.log', munit('a-suite.xml', 1, 0)).verdict, 'repeat');
    assert.equal(check(dir, 'munit-3.log', munit('b-suite.xml', 1, 0)).verdict, 'new');
    assert.equal(check(dir, 'munit-4.log', munit('b-suite.xml', 0, 1)).verdict, 'new');
  });
});

test('MUnit: a different failing test in the same suite with the same totals is progress', () => {
  // Real failed-assertion summary (MUnit 3.7.6): the per-test `---` line names the failing test.
  const munit = (test) => [
    '[ERROR] Failed to execute goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.6:test (test) on project app: Build Failed: MUnit Tests Failed -> [Help 1]',
    '[INFO] MUnit Run Summary - Product: MULE_CE, Version: 4.9.22',
    '[INFO]  >> tier-test-suite.xml test result: Tests: 2, Errors: 0, Failures: 1, Skipped: 0',
    `[INFO] \t --- ${test} <<< FAILED`,
    '[INFO]  > Tests:   \t2',
    '[INFO]  > Errors:  \t0',
    '[INFO]  > Failures:\t1',
    '[INFO]  > Skipped: \t0',
    '',
  ].join('\n');
  withDir((dir) => {
    const first = check(dir, 'munit-1.log', munit('testA'));
    assert.ok(first.summary.includes('testA <<< FAILED'));
    assert.equal(check(dir, 'munit-2.log', munit('testA')).verdict, 'repeat');
    assert.equal(check(dir, 'munit-3.log', munit('testB')).verdict, 'new');
  });
});

test('running the script twice on the same log does not count the attempt twice', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    const a = check(dir, 'build-2.log', xsdLog());
    const b = check(dir, 'build-2.log', xsdLog());
    assert.equal(a.verdict, 'repeat');
    assert.deepEqual(b, a);
    assert.equal(readFileSync(join(dir, 'fingerprints.jsonl'), 'utf8').trim().split('\n').length, 2);
  });
});

test('fingerprints left by an earlier run are ignored once attempt 1 is run again', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    check(dir, 'build-2.log', xsdLog());
    // a new upgrade run starts over at attempt 1 with the same failure; attempt 2 of the old run must not count
    const again = check(dir, 'build-1.log', xsdLog());
    assert.equal(again.verdict, 'new');
    assert.equal(readFileSync(join(dir, 'fingerprints.jsonl'), 'utf8').trim().split('\n').length, 1);
  });
});

test('an XSD failure keeps halting from the third identical attempt on', () => {
  withDir((dir) => {
    for (const n of [1, 2, 3]) check(dir, `build-${n}.log`, xsdLog());
    const fourth = check(dir, 'build-4.log', xsdLog());
    assert.equal(fourth.verdict, 'halt');
    assert.equal(fourth.occurrence, 4);
  });
});

test('a generic failure can repeat but never halts', () => {
  const log = '[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.14.1:compile (default-compile) on project app: Compilation failure\n[ERROR] /src/main/java/Foo.java:[10,5] cannot find symbol\n';
  withDir((dir) => {
    for (const n of [1, 2]) check(dir, `build-${n}.log`, log);
    const third = check(dir, 'build-3.log', log);
    assert.equal(third.occurrence, 3);
    assert.equal(third.verdict, 'repeat');
  });
});

test('an auth attempt still drops fingerprints left by an earlier run', () => {
  const munit = [
    '[ERROR] Failed to execute goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.6:test (test) on project app: Build Failed: MUnit Tests Failed -> [Help 1]',
    '[INFO] MUnit Run Summary - Product: MULE_CE, Version: 4.9.22',
    '[INFO]  >> tier-test-suite.xml test result: Tests: 1, Errors: 0, Failures: 1, Skipped: 0',
    '[INFO] \t --- tierFlow-returns-standard-tier <<< FAILED',
    '[INFO]  > Tests:   \t1',
    '[INFO]  > Failures:\t1',
    '',
  ].join('\n');
  withDir((dir) => {
    for (const n of [1, 2, 3]) check(dir, `munit-${n}.log`, munit);
    // a new run: attempt 1 is an auth failure, attempt 2 fails like the old run did
    assert.equal(check(dir, 'munit-1.log', AUTH_LOG).kind, 'auth');
    assert.equal(check(dir, 'munit-2.log', munit).verdict, 'new');
  });
});

test('MUnit: a different assertion in the same failing test is progress, and MUnit never halts', () => {
  const munit = (actual) => [
    '[ERROR] Failed to execute goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.6:test (test) on project app: Build Failed: MUnit Tests Failed -> [Help 1]',
    '[INFO] MUnit Run Summary - Product: MULE_CE, Version: 4.9.22',
    '[INFO]  >> tier-test-suite.xml test result: Tests: 1, Errors: 0, Failures: 1, Skipped: 0',
    '[INFO] \t --- tierFlow <<< FAILED',
    'java.lang.AssertionError:  at file: [tier-test-suite.xml], line: [9]',
    'Expected: "standard"',
    `     but: "${actual}" as String {}`,
    '',
  ].join('\n');
  withDir((dir) => {
    check(dir, 'munit-1.log', munit('extended'));
    assert.equal(check(dir, 'munit-2.log', munit('basic')).verdict, 'new');
    assert.equal(check(dir, 'munit-3.log', munit('basic')).verdict, 'repeat');
    const fourth = check(dir, 'munit-4.log', munit('basic'));
    assert.equal(fourth.verdict, 'repeat');
    assert.match(fourth.hint, /compare the failing assertion text/);
    assert.doesNotMatch(fourth.hint, /probe|HALT via/);
  });
});

test('re-running an earlier attempt keeps the later attempts', () => {
  withDir((dir) => {
    for (const n of [1, 2, 3]) check(dir, `build-${n}.log`, xsdLog());
    assert.equal(check(dir, 'build-2.log', xsdLog()).verdict, 'repeat');
    assert.equal(readFileSync(join(dir, 'fingerprints.jsonl'), 'utf8').trim().split('\n').length, 3);
    assert.equal(check(dir, 'build-3.log', xsdLog()).verdict, 'halt');
  });
});

test('an auth failure printed with colour codes is still recognised as auth', () => {
  withDir((dir) => {
    const coloured = AUTH_LOG.replace('[ERROR]', '\x1b[1;31m[ERROR]\x1b[m');
    assert.equal(check(dir, 'build-1.log', coloured).kind, 'auth');
  });
});

test('munit-<N>-local.log counts as attempt N; a -debug log is rejected', () => {
  withDir((dir) => {
    const failing = '[ERROR] Failed to execute goal munit on project app: There are test failures.\n';
    check(dir, 'munit-1.log', failing);
    assert.equal(check(dir, 'munit-2-local.log', failing).attempt, 2);
    writeFileSync(join(dir, 'build-3-debug.log'), failing);
    const r = spawnSync(process.execPath, [SCRIPT_PATH, join(dir, 'build-3-debug.log')], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  });
});

test('usage errors exit 2', () => {
  const noArg = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' });
  assert.equal(noArg.status, 2);
  withDir((dir) => {
    writeFileSync(join(dir, 'other.log'), xsdLog());
    const badName = spawnSync(process.execPath, [SCRIPT_PATH, join(dir, 'other.log')], { encoding: 'utf8' });
    assert.equal(badName.status, 2);
    assert.match(badName.stderr, /build-<N>\.log or munit-<N>\.log/);
    const missing = spawnSync(process.execPath, [SCRIPT_PATH, join(dir, 'build-9.log')], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
  });
});

test('UUIDs, hex addresses and temp paths in [ERROR] lines do not make a repeat look new', () => {
  const log = (id, hex, dir) => `[ERROR] Failed to execute goal org.mule.tools.maven:mule-maven-plugin:4.10.4:deploy (default) on project app: Container ${id} at ${hex} failed to start from ${dir}/mule-app -> [Help 1]\n`;
  withDir((d) => {
    check(d, 'build-1.log', log('3f2b8c1e-9a4d-4e0b-8f6a-1c2d3e4f5a6b', '0x7f3a9c', '/var/folders/ab/cd12/T/mvn-111'));
    assert.equal(check(d, 'build-2.log', log('a1b2c3d4-0000-4000-8000-123456789abc', '0x1b2c3d', '/var/folders/zz/yy99/T/mvn-222')).verdict, 'repeat');
  });
});

test('a damaged line in fingerprints.jsonl is skipped', () => {
  withDir((dir) => {
    check(dir, 'build-1.log', xsdLog());
    writeFileSync(join(dir, 'fingerprints.jsonl'), readFileSync(join(dir, 'fingerprints.jsonl'), 'utf8') + '{not json\n');
    assert.equal(check(dir, 'build-2.log', xsdLog()).verdict, 'repeat');
  });
});

test('MUnit: a change in an assertion shape the fingerprint does not capture still reads as a repeat (known limit)', () => {
  const munit = (extra) => [
    '[ERROR] Failed to execute goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.6:test (test) on project app: Build Failed: MUnit Tests Failed -> [Help 1]',
    '[INFO] MUnit Run Summary - Product: MULE_CE, Version: 4.9.22',
    '[INFO]  >> s.xml test result: Tests: 1, Errors: 0, Failures: 1, Skipped: 0',
    '[INFO] \t --- t <<< FAILED',
    extra,
    '',
  ].join('\n');
  withDir((dir) => {
    check(dir, 'munit-1.log', munit('Payload mismatch at $.a'));
    const second = check(dir, 'munit-2.log', munit('Payload mismatch at $.b'));
    assert.equal(second.verdict, 'repeat');
    assert.match(second.hint, /by eye/);
  });
});

test('two different files under a /tmp checkout stay different failures', () => {
  const log = (file, n) => `[ERROR] /tmp/app-1234/src/main/java/${file}:[${n},5] cannot find symbol\n[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.14.1:compile (default-compile) on project app: Compilation failure -> [Help 1]\n`;
  withDir((d) => {
    check(d, 'build-1.log', log('Foo.java', 10));
    assert.equal(check(d, 'build-2.log', log('Bar.java', 22)).verdict, 'new');
    // same file and line from a different random temp dir is still a repeat
    assert.equal(check(d, 'build-3.log', log('Bar.java', 22).replace('app-1234', 'app-9876')).verdict, 'repeat');
  });
});

test('MUnit: temp paths in Caused by lines do not make a repeat look new', () => {
  const munit = (dir) => [
    '[ERROR] Failed to execute goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.6:test (test) on project app: Build Failed: MUnit Tests Failed -> [Help 1]',
    '[INFO] MUnit Run Summary - Product: MULE_CE, Version: 4.9.22',
    '[INFO]  >> s.xml test result: Tests: 1, Errors: 1, Failures: 0, Skipped: 0',
    `Caused by: java.io.IOException: cannot open ${dir}/app.jar`,
    '',
  ].join('\n');
  withDir((d) => {
    check(d, 'munit-1.log', munit('/var/folders/ab/cd12/T/mule-111'));
    assert.equal(check(d, 'munit-2.log', munit('/var/folders/zz/yy99/T/mule-222')).verdict, 'repeat');
  });
});

test('an auth attempt leaves the earlier attempts alone, and the retry reusing its number keeps the chain', () => {
  withDir((d) => {
    check(d, 'build-1.log', xsdLog());
    assert.equal(check(d, 'build-2.log', AUTH_LOG).kind, 'auth');
    assert.deepEqual(readFileSync(join(d, 'fingerprints.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).attempt), [1]);
    // the retry after the credentials were fixed reuses attempt 2 and still compares with attempt 1
    assert.equal(check(d, 'build-2.log', xsdLog()).verdict, 'repeat');
  });
});
