// Run: node --test skills/mule-development/upgrade-mule-app/scripts/verify_dependency_tree.test.mjs
//
// verify_dependency_tree.mjs is a CLI script, not a library of exported
// functions — it has no `--settings`/sourcePath override for
// writeMavenSettings(), so it always reads the REAL ~/.m2/settings.xml. We
// can't safely fake a session there, but that doesn't matter for exercising
// authFailureSuspected: the only thing that needs to be fake is `mvn` itself.
// We put a shell shim named `mvn` first on PATH that ignores every argument
// and returns a scripted exit code + output, same technique
// maven-settings.test.mjs uses to fake `anypoint-cli-v4`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'verify_dependency_tree.mjs');

function withFakeMvn(exitCode, output, fn) {
  const binDir = mkdtempSync(join(tmpdir(), 'fake-mvn-'));
  const script = `#!/bin/sh\ncat <<'EOF'\n${output}\nEOF\nexit ${exitCode}\n`;
  writeFileSync(join(binDir, 'mvn'), script, { mode: 0o755 });
  const prevPath = process.env.PATH;
  process.env.PATH = `${binDir}:${prevPath}`;
  try {
    fn();
  } finally {
    process.env.PATH = prevPath;
    rmSync(binDir, { recursive: true, force: true });
  }
}

function fixtureProject(dir) {
  mkdirSync(join(dir, 'tmp'), { recursive: true });
  writeFileSync(
    join(dir, 'tmp', 'connectors.json'),
    JSON.stringify({
      connectors: [
        { groupId: 'com.mulesoft.connectors', artifactId: 'mule-amazon-s3-connector', version: '8.0.4', versionResolved: true },
      ],
    })
  );
}

function runScript(projectDir) {
  const r = spawnSync(process.execPath, [SCRIPT_PATH, projectDir, '--against=existing'], {
    encoding: 'utf8',
    env: process.env,
  });
  const resultPath = join(projectDir, 'tmp', 'dep-tree-verify-existing.json');
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  return { status: r.status, result };
}

test('verify_dependency_tree sets authFailureSuspected on a 401/Unauthorized mvn failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-dep-tree-'));
  fixtureProject(dir);
  withFakeMvn(1, '[ERROR] Could not transfer artifact ... status code: 401, ReasonPhrase: Unauthorized', () => {
    const { status, result } = runScript(dir);
    assert.equal(status, 1);
    assert.equal(result.authFailureSuspected, true);
    assert.equal(result.stop, true);
    assert.equal(result.buildOk, false);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('verify_dependency_tree leaves authFailureSuspected false on an unrelated mvn failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-dep-tree-'));
  fixtureProject(dir);
  withFakeMvn(1, '[ERROR] Could not resolve dependencies for project: could not find artifact', () => {
    const { status, result } = runScript(dir);
    assert.equal(status, 1);
    assert.equal(result.authFailureSuspected, false);
    assert.equal(result.stop, true);
    assert.equal(result.buildOk, false);
  });
  rmSync(dir, { recursive: true, force: true });
});
