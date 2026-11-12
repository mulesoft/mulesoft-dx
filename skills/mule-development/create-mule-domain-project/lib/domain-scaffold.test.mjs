// Run: node --test skills/mule-development/create-mule-domain-project/lib/domain-scaffold.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exchangeUrlForRegion,
  minMuleVersion,
  scaffoldDomain,
  toKebabCase,
} from './domain-scaffold.mjs';

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'scaffold_domain.mjs');

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'domain-scaffold-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('toKebabCase matches ACB paramCase for common names', () => {
  assert.equal(toKebabCase('Shared Resources'), 'shared-resources');
  assert.equal(toKebabCase('ordersDomain'), 'orders-domain');
  assert.equal(toKebabCase('  my_domain  '), 'my-domain');
});

test('minMuleVersion forces the patch to 0', () => {
  assert.equal(minMuleVersion('4.9.5'), '4.9.0');
  assert.throws(() => minMuleVersion('latest'), /not a semver/);
});

test('exchangeUrlForRegion maps control planes and rejects unknown ones', () => {
  assert.equal(exchangeUrlForRegion('us'), 'https://maven.anypoint.mulesoft.com/api/v3/maven');
  assert.equal(exchangeUrlForRegion('EU'), 'https://maven.eu1.anypoint.mulesoft.com/api/v3/maven');
  assert.throws(() => exchangeUrlForRegion('mars'), /unknown region/);
});

test('scaffoldDomain writes the full domain layout', () => withTmp((dir) => {
  const res = scaffoldDomain(dir, 'Shared Resources', { runtime: '4.9.5', java: '17', groupId: 'com.acme' });
  assert.equal(res.artifactId, 'shared-resources');
  const pom = readFileSync(join(res.projectDir, 'pom.xml'), 'utf8');
  assert.match(pom, /<packaging>mule-domain<\/packaging>/);
  assert.match(pom, /<groupId>com\.acme<\/groupId>/);
  assert.match(pom, /<app\.runtime>4\.9\.5<\/app\.runtime>/);
  assert.match(pom, /<version>\$\{mule\.maven\.plugin\.version\}<\/version>/);
  assert.match(pom, /<dependencies>\s*<\/dependencies>/);

  const artifact = JSON.parse(readFileSync(join(res.projectDir, 'mule-artifact.json'), 'utf8'));
  assert.deepEqual(artifact, { minMuleVersion: '4.9.0', javaSpecificationVersions: ['17'] });

  const xml = readFileSync(join(res.projectDir, 'src/main/mule/mule-domain-config.xml'), 'utf8');
  assert.match(xml, /<domain:mule-domain /);
  assert.match(xml, /mule-domain-ee\.xsd/);
  assert.match(xml, /<configuration-properties file="domain\.properties"/);

  const props = readFileSync(join(res.projectDir, 'src/main/resources/domain.properties'), 'utf8');
  assert.match(props, /^# Shared properties/);

  assert.ok(existsSync(join(res.projectDir, 'src/test/munit')));
}));

test('scaffoldDomain refuses to overwrite and validates input', () => withTmp((dir) => {
  scaffoldDomain(dir, 'orders-domain');
  assert.throws(() => scaffoldDomain(dir, 'orders-domain'), /already exists/);
  assert.throws(() => scaffoldDomain(dir, 'ab'), /at least 3 characters/);
  assert.throws(() => scaffoldDomain(dir, 'other-domain', { java: '17.0' }), /invalid Java/);
  assert.throws(() => scaffoldDomain(dir, 'other-domain', { runtime: 'x' }), /not a semver/);
  assert.throws(() => scaffoldDomain(dir, 'other-domain', { runtime: '4.9.0</app.runtime>' }), /not a semver/);
  assert.throws(() => scaffoldDomain(dir, 'other-domain', { version: '1.0</version><x>' }), /invalid version/);
  assert.throws(() => scaffoldDomain(dir, 'other-domain', { exchangeUrl: 'https://x"/><y' }), /invalid Exchange URL/);
}));

test('CLI prints a JSON summary and exits 1 on bad arguments', () => withTmp((dir) => {
  const ok = spawnSync(process.execPath, [SCRIPT_PATH, dir, 'billing-domain', '--region', 'eu'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const summary = JSON.parse(ok.stdout);
  assert.equal(summary.artifactId, 'billing-domain');
  assert.match(readFileSync(join(summary.projectDir, 'pom.xml'), 'utf8'), /maven\.eu1\.anypoint/);

  const bad = spawnSync(process.execPath, [SCRIPT_PATH, dir], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /usage/);
}));
