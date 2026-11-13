// munit-presence.mjs — does the app use MUnit at all?
//
// Step 11 resolves the latest MUnit version (a Maven-metadata fetch) and reads its
// release notes (a docs page) so Step 12 can show the Java/Maven/Mule envelope and
// Step 14 can bump the app's MUnit version sites. An app with no MUnit has neither
// version sites to bump nor tests the envelope would apply to, so both lookups are
// wasted. This is the deterministic signal for skipping them.
//
// "Has MUnit" is deliberately generous — any one signal is enough to look MUnit up:
//   - a pom in the chain (the app pom and every local ancestor) mentions a
//     `munit*` artifactId or a `munit.*` property, or
//   - src/test/munit holds at least one .xml suite.
// Only when NONE is found is the app treated as having no MUnit.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { child, findParentPomPath, readPomProject } from '../scripts/_pom_utils.mjs';

const POM_SIGNALS = [
  [/<artifactId>\s*munit[^<]*<\/artifactId>/i, 'munit artifactId'],
  [/<munit[\w.-]*>/i, 'munit property'],
  [/\$\{\s*munit[\w.-]*\s*\}/i, 'munit property reference'],
];

function countSuites(dir) {
  let n = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += countSuites(p);
    else if (e.name.endsWith('.xml')) n += 1;
  }
  return n;
}

/**
 * @param {string} projectDir App root.
 * @returns {{ hasMunit: boolean, pomSignals: string[], suites: number, poms: string[] }}
 *   `pomSignals` is "<signal> in <pom path>" per hit; `poms` are the poms inspected.
 */
export function detectMunit(projectDir) {
  const pomSignals = [];
  const poms = [];
  const seen = new Set();
  let pomPath = join(projectDir, 'pom.xml');
  while (pomPath && existsSync(pomPath) && !seen.has(pomPath)) {
    seen.add(pomPath);
    poms.push(pomPath);
    let text = '';
    try { text = readFileSync(pomPath, 'utf8'); } catch { break; }
    for (const [re, label] of POM_SIGNALS) {
      if (re.test(text)) pomSignals.push(`${label} in ${pomPath}`);
    }
    let next = null;
    try {
      const project = readPomProject(pomPath);
      next = child(project, 'parent') ? findParentPomPath(project, pomPath) : null;
    } catch { /* unparseable pom: stop walking, keep what was found */ }
    pomPath = next;
  }
  const suites = countSuites(join(projectDir, 'src', 'test', 'munit'));
  return { hasMunit: pomSignals.length > 0 || suites > 0, pomSignals, suites, poms };
}
