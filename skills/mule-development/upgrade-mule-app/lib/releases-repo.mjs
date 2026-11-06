// releases-repo.mjs — preflight for the MuleSoft *releases* Maven repository
// in ~/.m2/settings.xml.
//
// Why: `anypoint-cli-v4 dx mule describe-connector` resolves a connector's
// parent POMs (mule-http-connector-common, mule-modules-parent, ...) through
// its own embedded resolver. Those live only on
// https://repository.mulesoft.org/releases/, and the plugin adds just the
// Exchange repository to the settings it builds. With a settings.xml that
// does not declare the releases repo, describe-connector exits 1 with no
// output (the plugin hard-disables its own logging), which is
// indistinguishable from any other failure. This module detects that gap
// before Step 7 and can add the repo, in the real settings.xml, ONLY when the
// caller has the user's confirmation (see scripts/ensure_mulesoft_releases_repo.mjs).
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const RELEASES_REPO_ID = 'mulesoft-releases';
export const RELEASES_REPO_URL = 'https://repository.mulesoft.org/releases/';
const PROFILE_ID = 'mulesoft-releases-repo';

export function defaultSettingsPath() {
  return join(homedir(), '.m2', 'settings.xml');
}

function stripComments(xml) {
  return (xml || '').replace(/<!--[\s\S]*?-->/g, '');
}

// Same repo regardless of scheme, trailing slash, or case. The Nexus-style
// path (/nexus/content/repositories/releases/) is the same repository: both
// URLs serve identical content.
function isReleasesUrl(url) {
  return /^https?:\/\/repository\.mulesoft\.org\/(?:nexus\/content\/repositories\/)?releases\/?$/i.test(String(url).trim());
}

// Same length as the input, with every XML comment blanked out (newlines kept),
// so a regex run on the result gives offsets that are valid in the original
// text and can never land inside a comment.
function maskComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
}

// Replace the first LIVE (non-commented) match of `re` with fn(matchedText).
// `re` must match only a literal tag (e.g. /<\/profiles>/), never content.
function replaceLive(xml, re, fn) {
  const m = re.exec(maskComments(xml));
  if (!m) return xml;
  return xml.slice(0, m.index) + fn(xml.slice(m.index, m.index + m[0].length), m) + xml.slice(m.index + m[0].length);
}

function profileBlocks(xml) {
  return [...xml.matchAll(/<profile\b[^>]*>[\s\S]*?<\/profile>/g)].map((m) => m[0]);
}

function activeProfileIds(xml) {
  const block = /<activeProfiles>([\s\S]*?)<\/activeProfiles>/.exec(xml)?.[1] || '';
  return [...block.matchAll(/<activeProfile>\s*([^<]*?)\s*<\/activeProfile>/g)].map((m) => m[1]);
}

/**
 * Inspect a settings.xml (text) for the MuleSoft releases repository.
 *
 * `covered` is true when nothing needs adding:
 *   - an ACTIVE profile (activeByDefault, or listed in <activeProfiles>)
 *     declares a <repository> whose <url> is the releases repo, or
 *   - a <mirror> with mirrorOf `*` routes every repository elsewhere (a
 *     corporate proxy) — adding a repo would be bypassed, and the proxy owns
 *     the decision.
 * A repo declared only in an INACTIVE profile or inside an XML comment does
 * not count.
 *
 * @param {string|null} xml settings.xml contents, or null when the file is absent
 * @returns {{ covered: boolean, via: 'profile'|'mirror'|null, hasSettingsRoot: boolean }}
 */
export function inspectReleasesRepo(xml) {
  if (xml == null) return { covered: false, via: null, hasSettingsRoot: false };
  const live = stripComments(xml);
  const hasSettingsRoot = /<settings\b[^>]*>/.test(live);

  const active = new Set(activeProfileIds(live));
  for (const block of profileBlocks(live)) {
    const id = /<id>\s*([^<]*?)\s*<\/id>/.exec(block.replace(/<activation>[\s\S]*?<\/activation>|<repositories>[\s\S]*?<\/repositories>|<pluginRepositories>[\s\S]*?<\/pluginRepositories>|<properties>[\s\S]*?<\/properties>/g, ''))?.[1];
    const activeByDefault = /<activeByDefault>\s*true\s*<\/activeByDefault>/i.test(block);
    if (!activeByDefault && !(id && active.has(id))) continue;
    const repos = /<repositories>([\s\S]*?)<\/repositories>/.exec(block)?.[1] || '';
    for (const r of repos.matchAll(/<repository\b[^>]*>[\s\S]*?<\/repository>/g)) {
      const url = /<url>\s*([^<]*?)\s*<\/url>/.exec(r[0])?.[1];
      if (url && isReleasesUrl(url)) return { covered: true, via: 'profile', hasSettingsRoot };
    }
  }

  for (const m of live.matchAll(/<mirror\b[^>]*>[\s\S]*?<\/mirror>/g)) {
    const of = /<mirrorOf>\s*([^<]*?)\s*<\/mirrorOf>/.exec(m[0])?.[1] || '';
    if (of.split(',').map((s) => s.trim()).includes('*')) return { covered: true, via: 'mirror', hasSettingsRoot };
  }
  return { covered: false, via: null, hasSettingsRoot };
}

const PROFILE_XML = `    <profile>
      <id>${PROFILE_ID}</id>
      <repositories>
        <repository>
          <id>${RELEASES_REPO_ID}</id>
          <name>MuleSoft Releases Repository</name>
          <url>${RELEASES_REPO_URL}</url>
        </repository>
      </repositories>
    </profile>
`;

/**
 * Returns settings.xml text with the releases repo added. Activation is done
 * through <activeProfiles>, NOT <activeByDefault>: Maven deactivates every
 * activeByDefault profile as soon as any other profile is activated (e.g.
 * `-P`), which would silently drop the repo again.
 * Existing content is preserved byte-for-byte apart from the insertions.
 * A null/empty input yields a minimal new settings.xml.
 *
 * @param {string|null} xml
 * @returns {string}
 */
export function addReleasesRepo(xml) {
  if (xml == null || !/<settings\b[^>]*>/.test(stripComments(xml))) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<settings>\n  <profiles>\n${PROFILE_XML}  </profiles>\n  <activeProfiles>\n    <activeProfile>${PROFILE_ID}</activeProfile>\n  </activeProfiles>\n</settings>\n`;
  }
  // Every test and insertion below works on the comment-masked text, so a
  // commented-out <profiles>, <activeProfiles> or </settings> is never the
  // anchor. A self-closing root (`<settings/>`, or with xmlns attributes) has
  // no </settings> to anchor on — expand it first.
  let out = replaceLive(xml, /<settings\b[^>]*?\s*\/>/, (tag) => `${tag.replace(/\s*\/>$/, '>')}\n</settings>`);
  const live = () => maskComments(out);
  // Function replacements throughout: no `$&`-style pattern expansion.
  if (/<profiles>[\s\S]*?<\/profiles>/.test(live())) {
    out = replaceLive(out, /<\/profiles>/, () => `${PROFILE_XML}  </profiles>`);
  } else if (/<profiles\s*\/>/.test(live())) {
    out = replaceLive(out, /<profiles\s*\/>/, () => `<profiles>\n${PROFILE_XML}  </profiles>`);
  } else {
    out = replaceLive(out, /<\/settings>/, () => `  <profiles>\n${PROFILE_XML}  </profiles>\n</settings>`);
  }
  const activation = `<activeProfile>${PROFILE_ID}</activeProfile>`;
  if (/<activeProfiles>[\s\S]*?<\/activeProfiles>/.test(live())) {
    out = replaceLive(out, /<\/activeProfiles>/, () => `  ${activation}\n  </activeProfiles>`);
  } else if (/<activeProfiles\s*\/>/.test(live())) {
    out = replaceLive(out, /<activeProfiles\s*\/>/, () => `<activeProfiles>\n    ${activation}\n  </activeProfiles>`);
  } else {
    out = replaceLive(out, /<\/settings>/, () => `  <activeProfiles>\n    ${activation}\n  </activeProfiles>\n</settings>`);
  }
  return out;
}

/**
 * Read-only preflight.
 * @param {string} [settingsPath]
 * @returns {{ settingsPath: string, exists: boolean, covered: boolean, via: string|null, needsAdd: boolean }}
 */
export function checkReleasesRepo(settingsPath = defaultSettingsPath()) {
  const exists = existsSync(settingsPath);
  const info = inspectReleasesRepo(exists ? readFileSync(settingsPath, 'utf8') : null);
  return { settingsPath, exists, covered: info.covered, via: info.via, needsAdd: !info.covered };
}

/**
 * Adds the releases repo to the REAL settings.xml. Call ONLY after the user
 * confirmed. Backs the existing file up first (settings.xml.bak-<ms>), also
 * creates ~/.m2/repository when absent (only when it actually changes the file) (the describe-connector resolver fails
 * with an NPE if its local repo directory does not exist), and is a no-op
 * when the repo is already covered.
 *
 * @param {string} [settingsPath]
 * @returns {{ changed: boolean, settingsPath: string, backupPath: string|null, createdLocalRepo: boolean }}
 */
export function applyReleasesRepo(settingsPath = defaultSettingsPath()) {
  const exists = existsSync(settingsPath);
  const current = exists ? readFileSync(settingsPath, 'utf8') : null;
  // Already covered: a true no-op — nothing is created, backed up or written.
  if (inspectReleasesRepo(current).covered) {
    return { changed: false, settingsPath, backupPath: null, createdLocalRepo: false };
  }
  // Build and verify the new text BEFORE touching the disk, so a failure
  // leaves no stray backup or directory behind.
  const next = addReleasesRepo(current);
  // Never report success for a file that still would not satisfy the check.
  if (!inspectReleasesRepo(next).covered) throw new Error(`could not add ${RELEASES_REPO_ID} to ${settingsPath}`);
  const localRepo = join(dirname(settingsPath), 'repository');
  const createdLocalRepo = !existsSync(localRepo);
  if (createdLocalRepo) mkdirSync(localRepo, { recursive: true });
  mkdirSync(dirname(settingsPath), { recursive: true });
  let backupPath = null;
  if (exists) {
    backupPath = `${settingsPath}.bak-${Date.now()}`;
    copyFileSync(settingsPath, backupPath);
  }
  writeFileSync(settingsPath, next);
  return { changed: true, settingsPath, backupPath, createdLocalRepo };
}
