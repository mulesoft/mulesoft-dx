// domain-scaffold.mjs — templates and writer for a new Mule 4 domain project.
//
// The layout and file contents mirror Anypoint Code Builder's "Create a Mule
// Domain Project" command (pom.xml with <packaging>mule-domain</packaging>,
// mule-artifact.json, src/main/mule/mule-domain-config.xml, .vscode/settings.json),
// plus src/main/resources/domain.properties registered through
// <configuration-properties> so shared resources can use ${placeholders}, and
// an empty src/test/munit folder (mule-maven-plugin's generate-test-sources
// fails without it once the domain has a connector dependency).
//
// scaffoldDomain(parentDir, name, opts) -> {projectDir, artifactId, ..., files[]}
//     Throws on invalid input or when the target folder exists; never overwrites.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const MULE_MAVEN_PLUGIN_VERSION = '4.10.3';
export const DEFAULT_RUNTIME = '4.9.0';
export const DEFAULT_JAVA = '17';

const EMPTY_DIRS = ['src/test/munit'];

const EXCHANGE_HOSTS = {
  us: 'anypoint',
  eu: 'eu1.anypoint',
  ca: 'ca1.platform',
  jp: 'jp1.platform',
};

/** @param {string} name Free-form project name. @returns {string} kebab-case form (ACB's paramCase). */
export function toKebabCase(name) {
  return String(name)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** @param {string} region us|eu|ca|jp. @returns {string} Exchange Maven facade URL. */
export function exchangeUrlForRegion(region) {
  const host = EXCHANGE_HOSTS[String(region || 'us').toLowerCase()];
  if (!host) {
    throw new Error(`unknown region "${region}" (expected one of ${Object.keys(EXCHANGE_HOSTS).join(', ')})`);
  }
  return `https://maven.${host}.mulesoft.com/api/v3/maven`;
}

/** @param {string} runtime e.g. 4.9.5. @returns {string} minMuleVersion with patch forced to 0 (4.9.0). */
export function minMuleVersion(runtime) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(runtime));
  if (!m) throw new Error(`runtime "${runtime}" is not a semver version`);
  return `${m[1]}.${m[2]}.0`;
}

export function domainPom({ groupId, artifactId, version, name, runtime, exchangeUrl }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/maven-v4_0_0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>${groupId}</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>${version}</version>
    <packaging>mule-domain</packaging>

    <name>${name}</name>

    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
        <app.runtime>${runtime}</app.runtime>
        <mule.maven.plugin.version>${MULE_MAVEN_PLUGIN_VERSION}</mule.maven.plugin.version>
    </properties>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-clean-plugin</artifactId>
                <version>3.1.0</version>
            </plugin>
            <plugin>
                <groupId>org.mule.tools.maven</groupId>
                <artifactId>mule-maven-plugin</artifactId>
                <version>\${mule.maven.plugin.version}</version>
                <extensions>true</extensions>
                <configuration>
                </configuration>
            </plugin>
        </plugins>
    </build>

    <dependencies>
    </dependencies>

    <repositories>
        <repository>
            <id>anypoint-exchange-v3</id>
            <name>Anypoint Exchange</name>
            <url>${exchangeUrl}</url>
            <layout>default</layout>
        </repository>
        <repository>
            <id>mulesoft-releases</id>
            <name>MuleSoft Releases Repository</name>
            <url>https://repository.mulesoft.org/releases/</url>
            <layout>default</layout>
        </repository>
    </repositories>
    <pluginRepositories>
        <pluginRepository>
            <id>mulesoft-releases</id>
            <name>mulesoft release repository</name>
            <layout>default</layout>
            <url>https://repository.mulesoft.org/releases/</url>
            <snapshots>
                <enabled>false</enabled>
            </snapshots>
        </pluginRepository>
    </pluginRepositories>
</project>
`;
}

export function domainConfigXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<domain:mule-domain xmlns="http://www.mulesoft.org/schema/mule/core"
  xmlns:domain="http://www.mulesoft.org/schema/mule/ee/domain"
  xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
    http://www.mulesoft.org/schema/mule/ee/domain http://www.mulesoft.org/schema/mule/ee/domain/current/mule-domain-ee.xsd">

  <configuration-properties file="domain.properties" doc:name="Domain Properties" />

</domain:mule-domain>
`;
}

export function muleArtifactJson(runtime, java) {
  return `${JSON.stringify({ minMuleVersion: minMuleVersion(runtime), javaSpecificationVersions: [String(java)] }, null, 2)}\n`;
}

export function domainProperties(name) {
  return `# Shared properties for the ${name} Mule domain.
# Every application linked to this domain resolves these \${placeholders}.
`;
}

/**
 * Write the domain project. Throws on validation failure; never overwrites.
 * @returns {{projectDir:string, artifactId:string, files:string[]}}
 */
export function scaffoldDomain(parentDir, rawName, opts = {}) {
  if (String(rawName ?? '').trim().length < 3) {
    throw new Error('domain name must be at least 3 characters');
  }
  const artifactId = toKebabCase(rawName);
  if (artifactId === '') throw new Error(`domain name "${rawName}" has no usable characters`);
  const groupId = opts.groupId || 'com.mycompany';
  if (!/^[A-Za-z0-9_.-]+$/.test(groupId)) throw new Error(`invalid groupId "${groupId}"`);
  const version = opts.version || '1.0.0-SNAPSHOT';
  const runtime = opts.runtime || DEFAULT_RUNTIME;
  minMuleVersion(runtime); // validates semver
  const java = String(opts.java || DEFAULT_JAVA);
  if (!/^[1-9]\d*$/.test(java)) throw new Error(`invalid Java version "${java}" (expected e.g. 17)`);
  const exchangeUrl = opts.exchangeUrl || exchangeUrlForRegion(opts.region || 'us');

  const projectDir = resolve(parentDir, artifactId);
  if (existsSync(projectDir)) throw new Error(`${projectDir} already exists`);

  const files = {
    'pom.xml': domainPom({ groupId, artifactId, version, name: artifactId, runtime, exchangeUrl }),
    'mule-artifact.json': muleArtifactJson(runtime, java),
    'src/main/mule/mule-domain-config.xml': domainConfigXml(),
    'src/main/resources/domain.properties': domainProperties(artifactId),
    '.vscode/settings.json': `${JSON.stringify({ 'files.exclude': { target: true } }, null, 2)}\n`,
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(projectDir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  for (const rel of EMPTY_DIRS) mkdirSync(join(projectDir, rel), { recursive: true });
  return { projectDir, artifactId, groupId, version, runtime, java, files: Object.keys(files) };
}
