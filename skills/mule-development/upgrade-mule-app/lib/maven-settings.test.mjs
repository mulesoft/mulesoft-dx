// Run: node --test skills/mule-development/upgrade-mule-app/lib/maven-settings.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMavenSettings, looksLikeAuthFailure, cleanupMavenSettings } from './maven-settings.mjs';
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
