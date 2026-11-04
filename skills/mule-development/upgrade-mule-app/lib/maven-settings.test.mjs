// Run: node --test skills/mule-development/upgrade-mule-app/lib/maven-settings.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMavenSettings, looksLikeAuthFailure, classifyMavenFailure, cleanupMavenSettings } from './maven-settings.mjs';
import { existsSync } from 'node:fs';

// These tests exercise the pure settings.xml patching path with a fixture
// source file. They don't depend on a real anypoint-cli-v4 session, so they
// stub readCredentials indirectly by pointing PATH at a fake `anypoint-cli-v4`
// shell shim that prints deterministic conf values.
// Shell-quote a value for safe embedding in the generated script below —
// confValues can contain `"`, `$`, backticks, etc. (e.g. a JSON-stringified
// token), and double-quoting without escaping lets those break out.
function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function withFakeCli(confValues, fn) {
  const binDir = mkdtempSync(join(tmpdir(), 'fake-anypoint-cli-'));
  const script = `#!/bin/sh
if [ "$1" = "conf" ]; then
  case "$2" in
    client_id) printf '%s' ${shQuote(confValues.client_id || '')} ;;
    client_secret) printf '%s' ${shQuote(confValues.client_secret || '')} ;;
    token) printf '%s' ${shQuote(confValues.token || '')} ;;
    *) printf '' ;;
  esac
  exit 0
fi
exit 1
`;
  const binPath = join(binDir, 'anypoint-cli-v4');
  writeFileSync(binPath, script, { mode: 0o755 });
  const prevPath = process.env.PATH;
  process.env.PATH = `${binDir}:${prevPath}`;
  try {
    fn();
  } finally {
    process.env.PATH = prevPath;
    rmSync(binDir, { recursive: true, force: true });
  }
}

function fixtureSettings(dir) {
  const p = join(dir, 'settings.xml');
  writeFileSync(p, `<settings>
  <servers>
    <server>
      <id>nexus3</id>
      <username>marinarivero</username>
      <password>unrelated-nexus-secret</password>
    </server>
    <server>
      <username>stale-user</username>
      <password>stale-expired-token</password>
      <id>anypoint-exchange-v3</id>
    </server>
  </servers>
</settings>
`);
  return p;
}

// emptyAcbTempDir() is declared below (used by the ACB-fallback tests) —
// hoisted here via function declaration, usable before its lexical position.
test('writeMavenSettings refreshes only the anypoint-exchange-v3 server, leaves others untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.patched, true);
    assert.equal(result.credentialKind, 'token');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<id>anypoint-exchange-v3<\/id>/);
    assert.match(out, /<username>~~~Token~~~<\/username>/);
    assert.match(out, /<password>fresh-session-token<\/password>/);
    // Nexus entry is untouched.
    assert.match(out, /<username>marinarivero<\/username>/);
    assert.match(out, /<password>unrelated-nexus-secret<\/password>/);
    assert.doesNotMatch(out, /stale-expired-token/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

function fixtureSettingsV2Only(dir) {
  const p = join(dir, 'settings.xml');
  writeFileSync(p, `<settings>
  <servers>
    <server>
      <id>nexus3</id>
      <username>marinarivero</username>
      <password>unrelated-nexus-secret</password>
    </server>
    <server>
      <username>stale-user</username>
      <password>stale-expired-token</password>
      <id>anypoint-exchange-v2</id>
    </server>
  </servers>
</settings>
`);
  return p;
}

function fixtureSettingsV2AndV3(dir) {
  const p = join(dir, 'settings.xml');
  writeFileSync(p, `<settings>
  <servers>
    <server>
      <id>nexus3</id>
      <username>marinarivero</username>
      <password>unrelated-nexus-secret</password>
    </server>
    <server>
      <username>stale-user</username>
      <password>stale-expired-token</password>
      <id>anypoint-exchange-v2</id>
    </server>
    <server>
      <username>stale-user</username>
      <password>stale-expired-token</password>
      <id>anypoint-exchange-v3</id>
    </server>
  </servers>
</settings>
`);
  return p;
}

test('writeMavenSettings refreshes a legacy anypoint-exchange-v2 server when v3 is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettingsV2Only(dir);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.patched, true);
    assert.equal(result.credentialKind, 'token');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<id>anypoint-exchange-v2<\/id>/);
    assert.match(out, /<password>fresh-session-token<\/password>/);
    assert.doesNotMatch(out, /stale-expired-token/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings refreshes both anypoint-exchange-v2 and anypoint-exchange-v3 when both are present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettingsV2AndV3(dir);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.patched, true);
    const out = readFileSync(result.path, 'utf8');
    const matches = out.match(/<password>fresh-session-token<\/password>/g) || [];
    assert.equal(matches.length, 2);
    assert.doesNotMatch(out, /stale-expired-token/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings prefers a Connected App over a bearer token', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ client_id: 'abc', client_secret: 'def', token: 'should-not-be-used' }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.credentialKind, 'client');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<username>~~~Client~~~<\/username>/);
    assert.match(out, /<password>abc~\?~def<\/password>/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings unwraps a JSON-object-shaped token from `anypoint-cli-v4 conf token`', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ token: JSON.stringify({ token: 'wrapped-session-token' }) }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.credentialKind, 'token');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<password>wrapped-session-token<\/password>/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings XML-escapes a credential value and is immune to $-pattern replacement expansion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  // A token containing both an XML-special character and a String.replace
  // special pattern ($&) — a naive implementation would either corrupt the
  // XML or expand $& into the full matched substring. (No literal double
  // quote here: this value also has to survive the fake CLI's own shell
  // script, which wraps it in double quotes.)
  withFakeCli({ token: `wei<rd&'$&token` }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<password>wei&lt;rd&amp;&apos;\$&amp;token<\/password>/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings does not treat a commented-out anypoint-exchange-v3 block as live', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = join(dir, 'settings.xml');
  writeFileSync(sourcePath, `<settings>
  <servers>
    <!--
    <server>
      <id>anypoint-exchange-v3</id>
      <username>disabled-user</username>
      <password>disabled-password</password>
    </server>
    -->
    <server>
      <id>nexus3</id>
      <username>marinarivero</username>
      <password>unrelated-nexus-secret</password>
    </server>
  </servers>
</settings>
`);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.patched, true);
    const out = readFileSync(result.path, 'utf8');
    // The commented block is left byte-for-byte alone...
    assert.match(out, /<!--\s*\n\s*<server>\s*\n\s*<id>anypoint-exchange-v3<\/id>\s*\n\s*<username>disabled-user<\/username>\s*\n\s*<password>disabled-password<\/password>/);
    // ...and a brand-new, real block was added instead of being skipped.
    const matches = out.match(/<password>fresh-session-token<\/password>/g) || [];
    assert.equal(matches.length, 2);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

// No acbTempDir override here is deliberately wrong — a real ACB install can
// have a live acb_settings.xml under ~/AnypointCodeBuilder/.tmp, and this
// function is the "no session anywhere" case, so it must point at a
// guaranteed-empty directory instead of trusting the ambient default.
function emptyAcbTempDir() {
  return mkdtempSync(join(tmpdir(), 'acb-tmp-empty-'));
}

function writeAcbSettingsFixture(acbTempDir, pidDirName, username, password, mtimeOffsetMs = 0) {
  const pidDir = join(acbTempDir, pidDirName);
  mkdirSync(pidDir, { recursive: true });
  const p = join(pidDir, 'acb_settings.xml');
  writeFileSync(p, `<settings>
  <servers>
    <server>
      <id>nexus3</id>
      <username>acb-nexus-user</username>
      <password>acb-nexus-secret</password>
    </server>
    <server>
      <username>${username}</username>
      <password>${password}</password>
      <id>anypoint-exchange-v3</id>
    </server>
  </servers>
</settings>
`);
  if (mtimeOffsetMs !== 0) {
    const t = new Date(Date.now() + mtimeOffsetMs);
    utimesSync(p, t, t);
  }
  return p;
}

test('writeMavenSettings is a no-op (warning, original path) when no CLI credentials and no acb_settings.xml exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({}, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.patched, false);
    assert.equal(result.credentialKind, null);
    assert.equal(result.path, sourcePath);
    assert.ok(result.warning);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings falls back to acb_settings.xml when the CLI session is empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  writeAcbSettingsFixture(acbTempDir, '12345', '~~~Token~~~', 'acb-live-session-token');
  withFakeCli({}, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.patched, true);
    assert.equal(result.credentialKind, 'acb');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<username>~~~Token~~~<\/username>/);
    assert.match(out, /<password>acb-live-session-token<\/password>/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings prefers the anypoint-cli-v4 session over acb_settings.xml when both exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  writeAcbSettingsFixture(acbTempDir, '12345', '~~~Token~~~', 'acb-session-should-not-be-used');
  withFakeCli({ token: 'cli-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.credentialKind, 'token');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<password>cli-session-token<\/password>/);
    assert.doesNotMatch(out, /acb-session-should-not-be-used/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings picks the most recently modified acb_settings.xml when several PID dirs exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  writeAcbSettingsFixture(acbTempDir, 'old-pid', '~~~Token~~~', 'stale-backend-session', -60_000);
  writeAcbSettingsFixture(acbTempDir, 'new-pid', '~~~Token~~~', 'active-backend-session', 0);
  withFakeCli({}, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.equal(result.credentialKind, 'acb');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<password>active-backend-session<\/password>/);
    assert.doesNotMatch(out, /stale-backend-session/);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings synthesizes both exchange blocks from scratch when settings.xml has neither (Scenario H)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = join(dir, 'settings.xml');
  writeFileSync(sourcePath, '<settings><servers><server><id>nexus3</id><username>u</username><password>p</password></server></servers></settings>\n');
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath });
    assert.equal(result.patched, true);
    assert.equal(result.credentialKind, 'token');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<id>anypoint-exchange-v2<\/id>/);
    assert.match(out, /<id>anypoint-exchange-v3<\/id>/);
    const matches = out.match(/<password>fresh-session-token<\/password>/g) || [];
    assert.equal(matches.length, 2);
    // nexus3 and the real settings.xml on disk are both untouched.
    assert.match(out, /<id>nexus3<\/id>/);
    assert.equal(readFileSync(sourcePath, 'utf8'), '<settings><servers><server><id>nexus3</id><username>u</username><password>p</password></server></servers></settings>\n');
  });
  rmSync(dir, { recursive: true, force: true });
});

test('writeMavenSettings synthesizes a <servers> container when settings.xml has none at all', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = join(dir, 'settings.xml');
  writeFileSync(sourcePath, '<settings></settings>\n');
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath });
    assert.equal(result.patched, true);
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<id>anypoint-exchange-v2<\/id>/);
    assert.match(out, /<id>anypoint-exchange-v3<\/id>/);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('writeMavenSettings is a no-op when the source settings.xml has no <settings> root at all (Scenario F)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = join(dir, 'settings.xml');
  writeFileSync(sourcePath, '');
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath });
    assert.equal(result.patched, false);
    assert.equal(result.path, sourcePath);
    assert.ok(result.warning);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('writeMavenSettings returns path: null when the source file does not exist AND no credential is found', () => {
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({}, () => {
    const result = writeMavenSettings({ sourcePath: '/nonexistent/path/settings.xml', acbTempDir });
    assert.equal(result.patched, false);
    assert.equal(result.path, null);
    assert.ok(result.warning);
  });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings synthesizes a brand-new settings.xml from a CLI token when the source file does not exist', () => {
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath: '/nonexistent/path/settings.xml', acbTempDir });
    assert.ok(result.path);
    assert.equal(result.patched, true);
    assert.equal(result.credentialKind, 'token');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<id>anypoint-exchange-v3<\/id>/);
    assert.match(out, /<password>fresh-session-token<\/password>/);
    cleanupMavenSettings(result.path);
  });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('writeMavenSettings synthesizes a brand-new settings.xml from ACB session when the source file does not exist and the CLI has none', () => {
  const acbTempDir = emptyAcbTempDir();
  writeAcbSettingsFixture(acbTempDir, '12345', '~~~Token~~~', 'acb-live-session-token');
  withFakeCli({}, () => {
    const result = writeMavenSettings({ sourcePath: '/nonexistent/path/settings.xml', acbTempDir });
    assert.ok(result.path);
    assert.equal(result.patched, true);
    assert.equal(result.credentialKind, 'acb');
    const out = readFileSync(result.path, 'utf8');
    assert.match(out, /<password>acb-live-session-token<\/password>/);
    cleanupMavenSettings(result.path);
  });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('cleanupMavenSettings removes a temp settings dir writeMavenSettings created', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  const acbTempDir = emptyAcbTempDir();
  withFakeCli({ token: 'fresh-session-token' }, () => {
    const result = writeMavenSettings({ sourcePath, acbTempDir });
    assert.ok(existsSync(result.path));
    cleanupMavenSettings(result.path);
    assert.equal(existsSync(result.path), false);
  });
  rmSync(dir, { recursive: true, force: true });
  rmSync(acbTempDir, { recursive: true, force: true });
});

test('cleanupMavenSettings is a no-op for a path it did not create (real settings.xml, or null)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maven-settings-fixture-'));
  const sourcePath = fixtureSettings(dir);
  cleanupMavenSettings(sourcePath);
  assert.ok(existsSync(sourcePath)); // still there — not a dir this function created
  cleanupMavenSettings(null);
  cleanupMavenSettings(undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('looksLikeAuthFailure detects common Maven 401/Unauthorized phrasings', () => {
  assert.ok(looksLikeAuthFailure(
    'Could not transfer artifact ... from/to anypoint-exchange-v3: status code: 401, reason phrase: Unauthorized (401)'
  ));
  assert.ok(looksLikeAuthFailure('Return code is: 401, ReasonPhrase: Unauthorized.'));
  assert.ok(looksLikeAuthFailure('Not authorized to access group com.mulesoft.connectors'));
  assert.ok(looksLikeAuthFailure('401 Unauthorized'));
});

test('looksLikeAuthFailure does not flag an unrelated build failure', () => {
  assert.equal(looksLikeAuthFailure(
    '[ERROR] cvc-complex-type.3.2.2: Attribute \'method\' is not allowed to appear in element \'http:listener\''
  ), false);
  assert.equal(looksLikeAuthFailure(''), false);
  assert.equal(looksLikeAuthFailure(undefined), false);
});

test('looksLikeAuthFailure does not flag a bare 401/Unauthorized that appears in unrelated Maven output', () => {
  // A download-speed log line that happens to contain "401" (kB), not a 401 response.
  assert.equal(looksLikeAuthFailure(
    'Downloaded from central: https://repo.maven.apache.org/maven2/.../foo-1.2.3.jar (401 kB at 2.0 MB/s)'
  ), false);
  // An XSD validation error citing a line/column of 401 — nothing to do with auth.
  assert.equal(looksLikeAuthFailure(
    "[ERROR] flows.xml:[401,25] cvc-elt.1.a: Cannot find the declaration of element 'flow'."
  ), false);
});

// --- classifyMavenFailure ---------------------------------------------------

test('classifyMavenFailure: private/EE Nexus 401 is mulesoft-ee-auth, with repo id and url', () => {
  const log = [
    '[INFO] Downloading from mulesoft-private: https://repository.mulesoft.org/nexus/content/repositories/private/com/mulesoft/licm/licm/2.1.13/licm-2.1.13.pom',
    '[INFO] BUILD FAILURE',
    '[ERROR] Failed to execute goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.3:test (test) on project batch-template: Execution test of goal com.mulesoft.munit.tools:munit-maven-plugin:3.7.3:test failed: Could not transfer artifact com.mulesoft.licm:licm:pom:2.1.13 from/to mulesoft-private (https://repository.mulesoft.org/nexus/content/repositories/private): status code: 401, reason phrase: Unauthorized (401) -> [Help 1]',
  ].join('\n');
  const r = classifyMavenFailure(log);
  assert.equal(r.kind, 'mulesoft-ee-auth');
  assert.equal(r.repoId, 'mulesoft-private');
  assert.equal(r.url, 'https://repository.mulesoft.org/nexus/content/repositories/private');
  assert.equal(r.artifact, 'com.mulesoft.licm:licm:pom:2.1.13');
  assert.match(r.hint, /<id>mulesoft-private<\/id>/);
  assert.match(r.hint, /NOT the Anypoint\/Exchange token/);
});

test('classifyMavenFailure: releases-ee 403 under MuleRepository is mulesoft-ee-auth', () => {
  const r = classifyMavenFailure(
    '[ERROR] Could not transfer artifact com.mulesoft.mule.distributions:mule-runtime-impl-no-services-bom:pom:4.6.14 from/to MuleRepository (https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/): status code: 403, reason phrase: Forbidden (403)'
  );
  assert.equal(r.kind, 'mulesoft-ee-auth');
  assert.equal(r.repoId, 'MuleRepository');
});

test('classifyMavenFailure: Exchange 401 is exchange-auth (CLI session expired)', () => {
  const r = classifyMavenFailure(
    '[ERROR] Failed to read artifact descriptor for org.mule.connectors:mule-http-connector:jar:1.10.3: Could not transfer artifact org.mule.connectors:mule-http-connector:pom:1.10.3 from/to anypoint-exchange-v3 (https://maven.anypoint.mulesoft.com/api/v3/maven): status code: 401, reason phrase: Unauthorized (401)'
  );
  assert.equal(r.kind, 'exchange-auth');
  assert.equal(r.repoId, 'anypoint-exchange-v3');
  assert.match(r.hint, /anypoint-cli-v4 login/);
});

test('classifyMavenFailure: plugin-resolution "Failed to transfer file" form is parsed by url', () => {
  const r = classifyMavenFailure(
    '[ERROR] Plugin x:y:1 or one of its dependencies could not be resolved: Failed to transfer file https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/a/b/1/b-1.pom with status code 401'
  );
  assert.equal(r.kind, 'mulesoft-ee-auth');
  assert.equal(r.repoId, null);
});

test('classifyMavenFailure: an unknown repo 401 is other-repo-auth, not an Exchange re-login', () => {
  const r = classifyMavenFailure(
    '[ERROR] Could not transfer artifact a:b:jar:1 from/to corp-nexus (https://nexus.corp.example/repo): status code: 401, reason phrase: Unauthorized (401)'
  );
  assert.equal(r.kind, 'other-repo-auth');
  assert.match(r.hint, /<id>corp-nexus<\/id>/);
});

test('classifyMavenFailure: ignores harmless 401s on INFO lines of a build that failed for another reason', () => {
  const log = [
    '[INFO] Downloading from MuleRepository: https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/org/x/y/1/y-1.pom',
    '[WARNING] Could not transfer artifact org.x:y:pom:1 from/to MuleRepository (https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/): status code: 401, reason phrase: Unauthorized (401)',
    '[INFO] BUILD FAILURE',
    '[ERROR] Failed to execute goal munit:test: Build Failed: There was an error running MUnit tests',
  ].join('\n');
  assert.equal(classifyMavenFailure(log).kind, 'none');
});

test('classifyMavenFailure: ordinary test/XSD failures and empty input are none', () => {
  assert.equal(classifyMavenFailure("[ERROR] cvc-complex-type.3.2.2: Attribute 'method' is not allowed").kind, 'none');
  assert.equal(classifyMavenFailure('flows.xml:[401,25] (401 kB at 2.0 MB/s)').kind, 'none');
  assert.equal(classifyMavenFailure('').kind, 'none');
  assert.equal(classifyMavenFailure(undefined).kind, 'none');
});

test('classifyMavenFailure: a bare legacy 401 with no repo falls back to exchange-auth only on a failed build', () => {
  assert.equal(classifyMavenFailure('[ERROR] Return code is: 401, ReasonPhrase: Unauthorized.').kind, 'exchange-auth');
  assert.equal(classifyMavenFailure('[INFO] Return code is: 401, ReasonPhrase: Unauthorized.').kind, 'none');
});
