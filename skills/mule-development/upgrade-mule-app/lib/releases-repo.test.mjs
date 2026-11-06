// Run: node --test skills/mule-development/upgrade-mule-app/lib/releases-repo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectReleasesRepo, addReleasesRepo, checkReleasesRepo, applyReleasesRepo, RELEASES_REPO_URL } from './releases-repo.mjs';

const PROFILE_DEFAULT = `<settings><profiles><profile>
  <id>mule-dev</id>
  <activation><activeByDefault>true</activeByDefault></activation>
  <repositories><repository><id>mulesoft-releases</id><url>https://repository.mulesoft.org/releases/</url></repository></repositories>
</profile></profiles></settings>`;

test('covered by an activeByDefault profile', () => {
  assert.deepEqual(inspectReleasesRepo(PROFILE_DEFAULT), { covered: true, via: 'profile', hasSettingsRoot: true });
});

test('url match ignores scheme, trailing slash and case', () => {
  for (const u of ['http://repository.mulesoft.org/releases', 'HTTPS://Repository.MuleSoft.org/releases/']) {
    const xml = PROFILE_DEFAULT.replace('https://repository.mulesoft.org/releases/', u);
    assert.equal(inspectReleasesRepo(xml).covered, true, u);
  }
});

test('covered by a profile listed in <activeProfiles>', () => {
  const xml = `<settings><profiles><profile><id>p</id><repositories><repository><id>x</id><url>${RELEASES_REPO_URL}</url></repository></repositories></profile></profiles><activeProfiles><activeProfile>p</activeProfile></activeProfiles></settings>`;
  assert.equal(inspectReleasesRepo(xml).covered, true);
});

test('NOT covered: repo only in an inactive profile', () => {
  const xml = `<settings><profiles><profile><id>p</id><repositories><repository><id>x</id><url>${RELEASES_REPO_URL}</url></repository></repositories></profile></profiles></settings>`;
  assert.equal(inspectReleasesRepo(xml).covered, false);
});

test('NOT covered: repo only inside an XML comment', () => {
  const xml = `<settings><!-- ${PROFILE_DEFAULT} --></settings>`;
  assert.equal(inspectReleasesRepo(xml).covered, false);
});

test('NOT covered: other mulesoft repos (nexus, releases-ee) do not count', () => {
  const xml = PROFILE_DEFAULT.replace('https://repository.mulesoft.org/releases/', 'https://repository.mulesoft.org/nexus-ee/content/repositories/releases-ee/');
  assert.equal(inspectReleasesRepo(xml).covered, false);
});

test('covered by a catch-all mirror (corporate proxy)', () => {
  const xml = '<settings><mirrors><mirror><id>corp</id><mirrorOf>*</mirrorOf><url>https://nexus.corp/</url></mirror></mirrors></settings>';
  assert.deepEqual(inspectReleasesRepo(xml), { covered: true, via: 'mirror', hasSettingsRoot: true });
  const partial = xml.replace('<mirrorOf>*</mirrorOf>', '<mirrorOf>central</mirrorOf>');
  assert.equal(inspectReleasesRepo(partial).covered, false);
});

test('absent / empty / stripped settings are not covered', () => {
  assert.equal(inspectReleasesRepo(null).covered, false);
  assert.equal(inspectReleasesRepo('').hasSettingsRoot, false);
  assert.equal(inspectReleasesRepo('<settings><servers/></settings>').covered, false);
});

test('addReleasesRepo output is covered, for every settings shape', () => {
  const shapes = [
    null,
    '',
    '<settings/>',
    '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0" />',
    '<settings><servers/></settings>',
    '<settings><profiles/></settings>',
    '<settings><profiles><profile><id>other</id></profile></profiles></settings>',
    '<settings><profiles></profiles><activeProfiles><activeProfile>other</activeProfile></activeProfiles></settings>',
    '<settings><activeProfiles/></settings>',
  ];
  for (const s of shapes) {
    const out = addReleasesRepo(s);
    assert.equal(inspectReleasesRepo(out).covered, true, JSON.stringify(s));
    assert.equal(out.match(/<\/settings>/g).length, 1);
  }
});

test('addReleasesRepo keeps existing content and activates via <activeProfiles>, not activeByDefault', () => {
  const src = '<settings>\n  <servers><server><id>nexus3</id><password>keep$&me</password></server></servers>\n  <activeProfiles><activeProfile>other</activeProfile></activeProfiles>\n</settings>';
  const out = addReleasesRepo(src);
  assert.ok(out.includes('<password>keep$&me</password>'));
  assert.ok(out.includes('<activeProfile>other</activeProfile>'));
  assert.ok(out.includes('<activeProfile>mulesoft-releases-repo</activeProfile>'));
  assert.ok(!out.includes('activeByDefault'));
});

function tmpM2() {
  const dir = mkdtempSync(join(tmpdir(), 'releases-repo-'));
  return { dir, settings: join(dir, 'settings.xml') };
}

test('checkReleasesRepo is read-only', () => {
  const { dir, settings } = tmpM2();
  assert.deepEqual(checkReleasesRepo(settings), { settingsPath: settings, exists: false, covered: false, via: null, needsAdd: true });
  assert.equal(existsSync(settings), false);
  assert.equal(existsSync(join(dir, 'repository')), false);
  rmSync(dir, { recursive: true, force: true });
});

test('applyReleasesRepo backs up, adds the repo, creates the local repository dir', () => {
  const { dir, settings } = tmpM2();
  const original = '<settings><servers/></settings>';
  writeFileSync(settings, original);
  const r = applyReleasesRepo(settings);
  assert.equal(r.changed, true);
  assert.equal(r.createdLocalRepo, true);
  assert.equal(readFileSync(r.backupPath, 'utf8'), original);
  assert.equal(checkReleasesRepo(settings).needsAdd, false);
  assert.ok(existsSync(join(dir, 'repository')));
  rmSync(dir, { recursive: true, force: true });
});

test('applyReleasesRepo creates settings.xml when absent, with no backup', () => {
  const { dir, settings } = tmpM2();
  const r = applyReleasesRepo(settings);
  assert.equal(r.changed, true);
  assert.equal(r.backupPath, null);
  assert.equal(checkReleasesRepo(settings).covered, true);
  rmSync(dir, { recursive: true, force: true });
});

test('applyReleasesRepo is a no-op when already covered (file untouched, no backup)', () => {
  const { dir, settings } = tmpM2();
  writeFileSync(settings, PROFILE_DEFAULT);
  const r = applyReleasesRepo(settings);
  assert.equal(r.changed, false);
  assert.equal(readFileSync(settings, 'utf8'), PROFILE_DEFAULT);
  assert.deepEqual(readdirSync(dir).filter((f) => f.includes('.bak-')), []);
  rmSync(dir, { recursive: true, force: true });
});

test('applyReleasesRepo when already covered does not create ~/.m2/repository', () => {
  const { dir, settings } = tmpM2();
  writeFileSync(settings, PROFILE_DEFAULT);
  const r = applyReleasesRepo(settings);
  assert.deepEqual(r, { changed: false, settingsPath: settings, backupPath: null, createdLocalRepo: false });
  assert.equal(existsSync(join(dir, 'repository')), false);
  rmSync(dir, { recursive: true, force: true });
});

test('url match accepts the Nexus-style path of the same repository', () => {
  const xml = PROFILE_DEFAULT.replace('https://repository.mulesoft.org/releases/', 'https://repository.mulesoft.org/nexus/content/repositories/releases/');
  assert.notEqual(xml, PROFILE_DEFAULT);
  assert.equal(inspectReleasesRepo(xml).covered, true);
});

test('addReleasesRepo anchors on live tags, not on commented-out ones', () => {
  const xml = `<settings>
  <!-- <profiles><profile><id>old</id></profile></profiles> -->
  <profiles>
    <profile><id>mine</id></profile>
  </profiles>
  <!-- <activeProfiles><activeProfile>old</activeProfile></activeProfiles> -->
  <activeProfiles>
    <activeProfile>mine</activeProfile>
  </activeProfiles>
</settings>`;
  const out = addReleasesRepo(xml);
  assert.equal(inspectReleasesRepo(out).covered, true);
  // the commented blocks are byte-for-byte untouched
  assert.ok(out.includes('<!-- <profiles><profile><id>old</id></profile></profiles> -->'));
  assert.ok(out.includes('<!-- <activeProfiles><activeProfile>old</activeProfile></activeProfiles> -->'));
  assert.ok(out.includes('<activeProfile>mine</activeProfile>'));
});

test('addReleasesRepo works when the only </settings>, <profiles/> and <activeProfiles/> are in comments', () => {
  const xml = `<settings>
  <!-- <profiles/> <activeProfiles/> </settings> -->
</settings>`;
  const out = addReleasesRepo(xml);
  assert.equal(inspectReleasesRepo(out).covered, true);
  assert.ok(out.includes('<!-- <profiles/> <activeProfiles/> </settings> -->'));
});

test('applyReleasesRepo on a commented-out-heavy file succeeds and leaves one backup', () => {
  const { dir, settings } = tmpM2();
  writeFileSync(settings, '<settings>\n<!-- <profiles></profiles> <activeProfiles></activeProfiles> -->\n<servers/>\n</settings>');
  const r = applyReleasesRepo(settings);
  assert.equal(r.changed, true);
  assert.equal(checkReleasesRepo(settings).covered, true);
  assert.equal(readdirSync(dir).filter((f) => f.includes('.bak-')).length, 1);
  rmSync(dir, { recursive: true, force: true });
});
