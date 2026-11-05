// Run: node --test skills/mule-development/create-mule-run-config/lib/run-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRunPlan } from './run-plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const pom = (artifactId, packaging, deps = '') => `<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.acme</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>1.0.0</version>
    <packaging>${packaging}</packaging>
    <dependencies>
${deps}    </dependencies>
</project>
`;
const domainDep = (version = '1.0.0') => `        <dependency>
            <groupId>com.acme</groupId>
            <artifactId>shared-domain</artifactId>
            <version>${version}</version>
            <classifier>mule-domain</classifier>
            <scope>provided</scope>
        </dependency>
`;

function project(root, name, packaging, deps) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'src/main/mule'), { recursive: true });
  writeFileSync(join(dir, 'pom.xml'), pom(name, packaging, deps));
  return dir;
}

function withWorkspace(fn) {
  const root = mkdtempSync(join(tmpdir(), 'run-plan-'));
  const prev = process.env.MULE_DX_M2_REPO;
  process.env.MULE_DX_M2_REPO = join(root, 'm2');
  try {
    const ws = {
      root,
      domain: project(root, 'shared-domain', 'mule-domain'),
      orders: project(root, 'orders-app', 'mule-application', domainDep()),
      billing: project(root, 'billing-app', 'mule-application', domainDep()),
      solo: project(root, 'solo-app', 'mule-application'),
    };
    fn(ws, [ws.domain, ws.orders, ws.billing, ws.solo]);
  } finally {
    if (prev === undefined) delete process.env.MULE_DX_M2_REPO;
    else process.env.MULE_DX_M2_REPO = prev;
    rmSync(root, { recursive: true, force: true });
  }
}

test('selecting an app adds its workspace domain first, in workspace scope', () => {
  withWorkspace((ws, all) => {
    const plan = resolveRunPlan([ws.orders], all);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.projects, [ws.domain, ws.orders]);
    assert.equal(plan.scope, 'workspace');
    assert.deepEqual(plan.domains.map((d) => [d.name, d.source, d.applications]), [['shared-domain', 'workspace', ['orders-app']]]);
  });
});

test('domain-only selection is rejected and linked apps are suggested', () => {
  withWorkspace((ws, all) => {
    const plan = resolveRunPlan([ws.domain], all);
    assert.equal(plan.ok, false);
    assert.match(plan.errors[0], /only domain projects/);
    assert.deepEqual(plan.suggestedApplications.map((s) => s.name).sort(), ['billing-app', 'orders-app']);
  });
});

test('domain plus some apps suggests the remaining linked apps; apps without a domain pass through', () => {
  withWorkspace((ws, all) => {
    const plan = resolveRunPlan([ws.solo, ws.orders, ws.domain], all);
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.projects, [ws.domain, ws.solo, ws.orders]);
    assert.deepEqual(plan.suggestedApplications.map((s) => s.name), ['billing-app']);
  });
});

test('missing domain produces the ACB error; installed domain deploys from ~/.m2', () => {
  withWorkspace((ws) => {
    const plan = resolveRunPlan([ws.orders], [ws.orders, ws.solo]);
    assert.equal(plan.ok, false);
    assert.match(plan.errors[0], /Domain com\.acme:shared-domain:1\.0\.0 is not installed in the local Maven repository .*mvn install/);

    const jar = join(ws.root, 'm2/com/acme/shared-domain/1.0.0/shared-domain-1.0.0-mule-domain.jar');
    mkdirSync(dirname(jar), { recursive: true });
    writeFileSync(jar, 'jar');
    const ok = resolveRunPlan([ws.orders], [ws.orders, ws.solo]);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.projects, [ws.orders]);
    assert.equal(ok.scope, 'project');
    assert.equal(ok.domains[0].source, 'installed');
  });
});

test('version mismatch with the workspace domain is an error unless that version is installed', () => {
  withWorkspace((ws, all) => {
    writeFileSync(join(ws.orders, 'pom.xml'), pom('orders-app', 'mule-application', domainDep('0.9.0')));
    const plan = resolveRunPlan([ws.orders], all);
    assert.equal(plan.ok, false);
    assert.match(plan.errors[0], /requires domain com\.acme:shared-domain:0\.9\.0, but the workspace has version 1\.0\.0/);
  });
});

test('non-Mule selections are reported', () => {
  withWorkspace((ws, all) => {
    const plan = resolveRunPlan([join(ws.root, 'nope')], all);
    assert.equal(plan.ok, false);
    assert.match(plan.errors[0], /is not a Mule application or domain project/);
  });
});

test('copied libs match link-mule-domain/lib (keep in sync)', () => {
  const source = join(HERE, '..', '..', 'link-mule-domain', 'lib');
  if (!existsSync(source)) return;
  for (const f of ['mule-project.mjs', 'mule-xml.mjs', 'workspace.mjs']) {
    const copy = readFileSync(join(HERE, f), 'utf8').replace(/^\/\/ Copied from .*\n/, '');
    assert.equal(copy, readFileSync(join(source, f), 'utf8'), `${f} drifted from link-mule-domain/lib/${f}`);
  }
});
