// Run: node --test skills/mule-development/upgrade-mule-app/scripts/skill_mvn_settings_idiom.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// W-24908151: `${MVN_SETTINGS:+-s "$MVN_SETTINGS"}` relies on word-splitting the literal
// text inside the expansion. zsh (the macOS default) does not split it, so Maven got one
// argument `-s /path` and failed. The two-expansion form below works in zsh and bash.
const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const OLD_IDIOM = '${MVN_SETTINGS:+-s "$MVN_SETTINGS"}';
const NEW_IDIOM = '${MVN_SETTINGS:+-s} ${MVN_SETTINGS:+"$MVN_SETTINGS"}';
const FILES = ['SKILL.md', 'scripts/write_maven_settings.mjs', 'lib/maven-settings.mjs'];

test('the single-expansion MVN_SETTINGS idiom is not used', () => {
  for (const f of FILES) {
    assert.ok(!readFileSync(join(skillDir, f), 'utf8').includes(OLD_IDIOM), `${f} still uses the zsh-broken idiom`);
  }
});

test('SKILL.md uses the two-expansion idiom for its mvn commands', () => {
  assert.ok(readFileSync(join(skillDir, 'SKILL.md'), 'utf8').includes(NEW_IDIOM));
});

const argv = (shell, settings) => spawnSync(shell, ['-c', `printf '[%s]' mvn ${NEW_IDIOM} clean`], {
  env: { ...process.env, MVN_SETTINGS: settings }, encoding: 'utf8',
});

for (const shell of ['bash', 'zsh', 'sh']) {
  const available = spawnSync(shell, ['-c', 'true']).status === 0;
  test(`two-expansion idiom gives the same argv in ${shell}`, { skip: !available && `${shell} not installed` }, () => {
    assert.equal(argv(shell, '/tmp/a b/settings.xml').stdout, '[mvn][-s][/tmp/a b/settings.xml][clean]');
    assert.equal(argv(shell, '').stdout, '[mvn][clean]');
  });
}
