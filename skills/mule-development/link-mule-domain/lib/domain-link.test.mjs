// Run: node --test skills/mule-development/link-mule-domain/lib/domain-link.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLink, applyUnlink, loadApp, loadDomain, planLink, planUnlink } from './domain-link.mjs';
import { readPom } from './mule-project.mjs';
import { listGlobalElements, rootInfo } from './mule-xml.mjs';
import { parseProperties } from './properties.mjs';
import { scanWorkspace } from './workspace.mjs';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

const pom = ({ artifactId, packaging, runtime = '4.9.0', deps = '', build = '' }) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.acme</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>${packaging}</packaging>
    <properties>
        <app.runtime>${runtime}</app.runtime>
        <http.version>1.9.0</http.version>
    </properties>
    <build>
        <plugins>
            <plugin>
                <groupId>org.mule.tools.maven</groupId>
                <artifactId>mule-maven-plugin</artifactId>
                <version>4.10.3</version>
                <extensions>true</extensions>
${build}            </plugin>
        </plugins>
    </build>
    <dependencies>
${deps}    </dependencies>
</project>
`;

const dep = (g, a, v, c, scope) => `        <dependency>
            <groupId>${g}</groupId>
            <artifactId>${a}</artifactId>
            <version>${v}</version>
${c ? `            <classifier>${c}</classifier>\n` : ''}${scope ? `            <scope>${scope}</scope>\n` : ''}        </dependency>
`;

const DOMAIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<domain:mule-domain xmlns="http://www.mulesoft.org/schema/mule/core"
  xmlns:domain="http://www.mulesoft.org/schema/mule/ee/domain"
  xmlns:http="http://www.mulesoft.org/schema/mule/http"
  xmlns:tls="http://www.mulesoft.org/schema/mule/tls"
  xmlns:db="http://www.mulesoft.org/schema/mule/db"
  xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
    http://www.mulesoft.org/schema/mule/ee/domain http://www.mulesoft.org/schema/mule/ee/domain/current/mule-domain-ee.xsd
    http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd
    http://www.mulesoft.org/schema/mule/tls http://www.mulesoft.org/schema/mule/tls/current/mule-tls.xsd
    http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd">

  <configuration-properties file="domain.properties" doc:name="Domain Properties" />
  <global-property name="db.port" value="3306" doc:name="Global Property" />

  <!-- shared HTTPS listener -->
  <http:listener-config name="Shared_HTTPS_Listener">
    <http:listener-connection host="0.0.0.0" port="\${https.port}" protocol="HTTPS" tlsContext="Shared_TLS" />
  </http:listener-config>

  <tls:context name="Shared_TLS">
    <tls:key-store path="keystore.jks" password="\${tls.password}" keyPassword="\${tls.password}" />
  </tls:context>

  <db:config name="Shared_DB">
    <db:my-sql-connection host="\${db.host}" port="\${db.port}" user="\${db.user}" password="\${db.password}" />
  </db:config>

  <http:request-config name="Unused_Request" />
</domain:mule-domain>
`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
  xmlns:http="http://www.mulesoft.org/schema/mule/http"
  xmlns:db="http://www.mulesoft.org/schema/mule/db"
  xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd">
  <flow name="orders">
    <http:listener config-ref="Shared_HTTPS_Listener" path="/orders" />
    <db:select config-ref="Shared_DB"><db:sql>SELECT 1</db:sql></db:select>
    <http:request config-ref="Missing_Config" method="GET" />
  </flow>
</mule>
`;

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'domain-link-'));
  const domain = join(root, 'shared-domain');
  write(join(domain, 'pom.xml'), pom({
    artifactId: 'shared-domain',
    packaging: 'mule-domain',
    runtime: '4.9.6',
    deps: dep('org.mule.connectors', 'mule-http-connector', '1.10.3', 'mule-plugin')
      + dep('org.mule.connectors', 'mule-db-connector', '1.14.0', 'mule-plugin')
      + dep('com.mysql', 'mysql-connector-j', '8.4.0'),
    build: `                <configuration>
                    <sharedLibraries>
                        <sharedLibrary>
                            <groupId>com.mysql</groupId>
                            <artifactId>mysql-connector-j</artifactId>
                        </sharedLibrary>
                    </sharedLibraries>
                </configuration>
`,
  }));
  write(join(domain, 'mule-artifact.json'), JSON.stringify({ minMuleVersion: '4.9.0', javaSpecificationVersions: ['17'] }));
  write(join(domain, 'src/main/mule/mule-domain-config.xml'), DOMAIN_XML);
  write(join(domain, 'src/main/resources/domain.properties'), 'https.port=8443\ntls.password=changeit\ndb.host=localhost\ndb.user=app\ndb.password=secret\n');
  write(join(domain, 'src/main/resources/keystore.jks'), 'fake-keystore');

  const app = join(root, 'orders-app');
  write(join(app, 'pom.xml'), pom({
    artifactId: 'orders-app',
    packaging: 'mule-application',
    runtime: '4.8.0',
    deps: dep('org.mule.connectors', 'mule-http-connector', '${http.version}', 'mule-plugin'),
  }));
  write(join(app, 'mule-artifact.json'), JSON.stringify({ minMuleVersion: '4.8.0', javaSpecificationVersions: ['11'], secureProperties: ['x'] }));
  write(join(app, 'src/main/mule/orders.xml'), APP_XML);
  return { root, domain, app };
}

test('planLink validates references and plans ACB-equivalent pom/artifact changes', () => {
  const fx = fixture();
  try {
    const plan = planLink(loadApp(fx.app), loadDomain(fx.domain));
    assert.equal(plan.ok, true);
    assert.equal(plan.mode, 'link');
    assert.deepEqual(plan.actions.runtimeChange, { from: '4.8.0', to: '4.9.6' });
    assert.deepEqual(plan.actions.javaChange, { from: ['11'], to: ['17'] });
    assert.deepEqual(plan.actions.connectorChanges.map((c) => [c.artifactId, c.scope.to, c.version.to]), [['mule-http-connector', 'provided', '1.10.3']]);
    assert.deepEqual(plan.references.resolvedByDomain.map((r) => r.value).sort(), ['Shared_DB', 'Shared_HTTPS_Listener']);
    assert.deepEqual(plan.references.dangling.map((r) => r.value), ['Missing_Config']);
    assert.ok(plan.warnings.some((w) => w.includes('Missing_Config')));
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('applyLink writes the domain dependency, aligns connectors via property, keeps other artifact keys', () => {
  const fx = fixture();
  try {
    const app = loadApp(fx.app);
    const domain = loadDomain(fx.domain);
    applyLink(app, domain, planLink(app, domain));
    const pomText = readFileSync(join(fx.app, 'pom.xml'), 'utf8');
    const parsed = readPom(pomText);
    const domainDep = parsed.dependencies.find((d) => d.classifier === 'mule-domain');
    assert.deepEqual([domainDep.artifactId, domainDep.version, domainDep.scope], ['shared-domain', '1.0.0-SNAPSHOT', 'provided']);
    const http = parsed.dependencies.find((d) => d.artifactId === 'mule-http-connector');
    assert.equal(http.rawVersion, '${http.version}');
    assert.equal(http.version, '1.10.3');
    assert.equal(http.scope, 'provided');
    assert.equal(parsed.properties['app.runtime'], '4.9.6');
    const artifact = JSON.parse(readFileSync(join(fx.app, 'mule-artifact.json'), 'utf8'));
    assert.deepEqual(artifact, { minMuleVersion: '4.9.0', javaSpecificationVersions: ['17'], secureProperties: ['x'] });

    // Re-linking the same domain is a no-op.
    assert.equal(planLink(loadApp(fx.app), domain).mode, 'already-linked');
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('planLink blocks domain-to-domain links and flags shadowing and port clashes', () => {
  const fx = fixture();
  try {
    const domain = loadDomain(fx.domain);
    assert.equal(planLink({ ...loadApp(fx.domain), kind: 'domain' }, domain).ok, false);

    write(join(fx.app, 'src/main/mule/global-configs.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:http="http://www.mulesoft.org/schema/mule/http">
  <configuration-properties file="config.properties" />
  <http:listener-config name="Shared_DB"><http:listener-connection host="0.0.0.0" port="8443" /></http:listener-config>
</mule>
`);
    write(join(fx.app, 'src/main/resources/config.properties'), 'x=1\n');
    const plan = planLink(loadApp(fx.app), domain);
    assert.ok(plan.references.shadowed.some((s) => s.name === 'Shared_DB'));
    assert.ok(plan.warnings.some((w) => w.includes('binds port 8443')));
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('unlink inlines used shared configs transitively with properties, resources and connectors', () => {
  const fx = fixture();
  try {
    let app = loadApp(fx.app);
    const domain = loadDomain(fx.domain);
    applyLink(app, domain, planLink(app, domain));
    app = loadApp(fx.app);

    const plan = planUnlink(app, domain);
    assert.equal(plan.ok, true, plan.blockers.join('\n'));
    assert.deepEqual(plan.actions.inline.map((e) => e.name), ['Shared_HTTPS_Listener', 'Shared_TLS', 'Shared_DB', 'db.port']);
    assert.deepEqual(plan.unused.map((e) => e.name), ['Unused_Request']);
    applyUnlink(app, domain, plan);

    const xml = readFileSync(join(fx.app, 'src/main/mule/global-configs.xml'), 'utf8');
    const names = listGlobalElements(xml).map((e) => e.name ?? e.tag);
    assert.deepEqual(names, ['configuration-properties', 'Shared_HTTPS_Listener', 'Shared_TLS', 'Shared_DB', 'db.port']);
    const ns = rootInfo(xml);
    for (const p of ['http', 'tls', 'db', 'doc']) assert.ok(ns.namespaces[p], `missing xmlns:${p}`);
    assert.ok(ns.schemaLocations['http://www.mulesoft.org/schema/mule/tls']);
    assert.equal(ns.namespaces.domain, undefined);

    const props = parseProperties(readFileSync(join(fx.app, 'src/main/resources/shared-domain.properties'), 'utf8'));
    assert.deepEqual([...props.keys()].sort(), ['db.host', 'db.password', 'db.user', 'https.port', 'tls.password']);
    assert.ok(existsSync(join(fx.app, 'src/main/resources/keystore.jks')));

    const parsed = readPom(readFileSync(join(fx.app, 'pom.xml'), 'utf8'));
    assert.equal(parsed.dependencies.some((d) => d.classifier === 'mule-domain'), false);
    const byId = Object.fromEntries(parsed.dependencies.map((d) => [d.artifactId, d]));
    assert.equal(byId['mule-http-connector'].scope, null);
    assert.equal(byId['mule-db-connector'].version, '1.14.0');
    assert.equal(byId['mysql-connector-j'].version, '8.4.0');
    assert.match(readFileSync(join(fx.app, 'pom.xml'), 'utf8'), /<sharedLibrary>\s*<groupId>com\.mysql<\/groupId>/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('unlink surfaces configs that cannot be inlined safely', () => {
  const fx = fixture();
  try {
    let app = loadApp(fx.app);
    const domain = loadDomain(fx.domain);
    applyLink(app, domain, planLink(app, domain));
    // App defines the same property with another value, and its own Shared_TLS.
    write(join(fx.app, 'src/main/mule/global-configs.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core" xmlns:tls="http://www.mulesoft.org/schema/mule/tls">
  <configuration-properties file="config.properties" />
  <tls:context name="Shared_TLS" />
</mule>
`);
    write(join(fx.app, 'src/main/resources/config.properties'), 'db.host=prod-db\n');
    app = loadApp(fx.app);
    const plan = planUnlink(app, domain);
    assert.equal(plan.ok, false);
    assert.ok(plan.blockers.some((b) => b.includes('"db.host"')));
    assert.ok(plan.blockers.some((b) => b.includes('references "Shared_TLS"')));
    assert.throws(() => applyUnlink(app, domain, plan), /refusing to unlink/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('scanWorkspace resolves domains from the workspace and ~/.m2', () => {
  const fx = fixture();
  const prev = process.env.MULE_DX_M2_REPO;
  process.env.MULE_DX_M2_REPO = join(fx.root, 'm2');
  try {
    const app = loadApp(fx.app);
    const domain = loadDomain(fx.domain);
    applyLink(app, domain, planLink(app, domain));
    let scan = scanWorkspace([fx.root]);
    assert.equal(scan.domains[0].linkedApplications[0], 'orders-app');
    assert.equal(scan.applications[0].domain.status, 'workspace');

    rmSync(fx.domain, { recursive: true, force: true });
    scan = scanWorkspace([fx.root]);
    assert.equal(scan.applications[0].domain.status, 'missing');

    write(join(fx.root, 'm2/com/acme/shared-domain/1.0.0-SNAPSHOT/shared-domain-1.0.0-SNAPSHOT-mule-domain.jar'), 'jar');
    scan = scanWorkspace([fx.root]);
    assert.equal(scan.applications[0].domain.status, 'installed');
  } finally {
    if (prev === undefined) delete process.env.MULE_DX_M2_REPO;
    else process.env.MULE_DX_M2_REPO = prev;
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test('CLI scripts: dry-run writes nothing, blockers exit 2', () => {
  const fx = fixture();
  try {
    const before = readFileSync(join(fx.app, 'pom.xml'), 'utf8');
    const dry = spawnSync(process.execPath, [join(SCRIPTS, 'link_domain.mjs'), fx.app, fx.domain, '--dry-run'], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout).dryRun, true);
    assert.equal(readFileSync(join(fx.app, 'pom.xml'), 'utf8'), before);

    const link = spawnSync(process.execPath, [join(SCRIPTS, 'link_domain.mjs'), fx.app, fx.domain], { encoding: 'utf8' });
    assert.equal(link.status, 0, link.stderr);

    const toDomain = spawnSync(process.execPath, [join(SCRIPTS, 'link_domain.mjs'), fx.domain, fx.domain], { encoding: 'utf8' });
    assert.equal(toDomain.status, 2);

    const unlink = spawnSync(process.execPath, [join(SCRIPTS, 'unlink_domain.mjs'), fx.app, '--workspace', fx.root], { encoding: 'utf8' });
    assert.equal(unlink.status, 0, unlink.stderr);
    assert.ok(JSON.parse(unlink.stdout).written.length > 0);

    const scan = spawnSync(process.execPath, [join(SCRIPTS, 'scan_workspace.mjs'), fx.root], { encoding: 'utf8' });
    assert.equal(scan.status, 0);
    assert.equal(JSON.parse(scan.stdout).applications[0].domain.status, 'none');
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
