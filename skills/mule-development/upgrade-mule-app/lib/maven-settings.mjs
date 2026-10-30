// maven-settings.mjs — refresh the Exchange <server> credential in a temp
// copy of the user's ~/.m2/settings.xml, for the skill's OWN direct `mvn`
// invocations (baseline build, Step 16/17, verify_dependency_tree.mjs).
//
// Why this exists: @salesforce/anypoint-cli-dx-mule-plugin's
// describe-connector subprocess does this same refresh internally (its own
// embedded Aether resolver merges a live CLI-session credential into a temp
// settings.xml before resolving) — that is why describe-connector needs
// DX_PLUGIN_MIN_LABEL (lib/anypoint.mjs). The skill's own `mvn` calls are a
// SEPARATE Maven invocation that the plugin has no part in, so they need the
// same refresh applied here, independently.
//
// Scope: refresh (or, if missing, add) the `anypoint-exchange-v2` and
// `anypoint-exchange-v3` <server> credentials (both share the same bearer
// token/Connected App — a pom.xml may still declare the legacy v2 repository
// id, so both are kept fresh with the same live credential) in a TEMP COPY
// of settings.xml only; the real ~/.m2/settings.xml on disk is never
// written to, in any code path below. This does NOT touch Nexus/orbit
// <server> entries — those are long-lived personal credentials that are
// already present in a provisioned ~/.m2/settings.xml and pass through
// untouched. It also does NOT add a <profile><repository> binding like the
// plugin's own lib/helpers/exchange-settings.js does — the skill's own `mvn`
// calls always run inside the target app directory, where the app's own
// pom.xml already declares whichever anypoint-exchange-v2/v3 <repository>
// id/URL it needs; only the matching credential is this function's job.
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { anypointEnv } from './anypoint.mjs';

// mkdtempSync prefix for the temp settings.xml dir created below — also the
// signature cleanupMavenSettings() checks for before deleting anything, so
// it can never be tricked into rm -rf'ing an unrelated directory.
const TEMP_DIR_PREFIX = 'upgrade-mule-app-mvn-settings-';

// v3 is preferred when both are present in a credential-lookup context (e.g.
// borrowing a representative credential from ACB's acb_settings.xml) since
// it's the currently canonical endpoint; v2 is kept for legacy pom.xml files
// that still declare it.
const EXCHANGE_SERVER_IDS = ['anypoint-exchange-v3', 'anypoint-exchange-v2'];

// ACB (Anypoint Code Builder) has its own, separate Maven settings file —
// acb_settings.xml, written by mule-dx-platform's DefaultSettingsManager
// under <mule.homeDirectory, default ~/AnypointCodeBuilder>/.tmp/<backend-pid>/.
// ACB keeps the anypoint-exchange-v3 <server> credential in that file fresh
// on its own token-refresh timer, driven by the IDE's native "Sign in"
// session (VS Code AuthenticationSession + its own KeyStore) — a DIFFERENT
// credential store than `anypoint-cli-v4 conf`, which only knows about a
// separate `anypoint-cli-v4 login`. A customer who only ever signs in
// through ACB's own UI has nothing in `anypoint-cli-v4 conf`, so this is the
// fallback: if the CLI has no session, look for a live acb_settings.xml and
// borrow its already-fresh Exchange credential.
const ACB_TEMP_DIR_DEFAULT = join(homedir(), 'AnypointCodeBuilder', '.tmp');

// Same precedence as the plugin: a static Connected App beats the short-lived
// session bearer token, which in turn beats the ACB fallback below — even
// though a CLI token can itself be stale (expired/revoked) while ACB's own
// session is still fresh. `anypoint-cli-v4 conf token` doesn't expose an
// expiry timestamp we can check locally, so there's no reliable signal here
// to prefer ACB over a present-but-maybe-dead CLI token. In practice this
// only matters when the CLI session is stale AND ACB's is not: the dead-CLI-
// token case still surfaces correctly via looksLikeAuthFailure() -> "ask to
// re-login" at the point mvn actually tries to use it.
function readConfValue(key) {
  const r = spawnSync('anypoint-cli-v4', ['conf', key], { env: anypointEnv(), encoding: 'utf8', timeout: 10_000 });
  if (r.status !== 0) return '';
  return (r.stdout || '').trim();
}

// `anypoint-cli-v4 conf token` has been observed printing either a bare token
// string or a JSON-ish `{token: '...'}` wrapper (same two shapes the plugin's
// own Conf.get('token') unwraps) — handle both without assuming either.
function unwrapToken(raw) {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.token === 'string') return parsed.token;
  } catch {
    // Not JSON — fall through to treating it as the raw token string.
  }
  return raw;
}

// XML-escape a credential value before interpolating it into a <username>/
// <password> text node — CLI/ACB-sourced values pass through untouched
// otherwise, and could contain &, <, >, or quote characters.
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Byte ranges of every <!-- ... --> comment in xml, so matches inside them
// can be skipped below — a commented-out <server> block (e.g. a customer
// who disabled a stale entry by hand) must not be treated as a live one.
function findCommentRanges(xml) {
  const ranges = [];
  const commentRe = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = commentRe.exec(xml)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function isInsideAnyRange(ranges, index) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

// Find the <server> block whose <id> is one of EXCHANGE_SERVER_IDS, trying
// each id in order. Returns the matched block text, or null. Blocks inside
// an XML comment are ignored — see findCommentRanges().
function findExchangeServerBlock(xml) {
  const commentRanges = findCommentRanges(xml);
  const serverRe = /<server\b[^>]*>[\s\S]*?<\/server>/g;
  const blocksById = new Map();
  let m;
  while ((m = serverRe.exec(xml)) !== null) {
    if (isInsideAnyRange(commentRanges, m.index)) continue;
    const idMatch = /<id>\s*([^<]*?)\s*<\/id>/.exec(m[0]);
    if (idMatch) blocksById.set(idMatch[1], m[0]);
  }
  for (const id of EXCHANGE_SERVER_IDS) {
    if (blocksById.has(id)) return blocksById.get(id);
  }
  return null;
}

// Read-only: extract { username, password } from whichever Exchange
// <server> block (v3 preferred, else v2) is present in an arbitrary
// settings-shaped XML file (used against ACB's acb_settings.xml, never
// against the real ~/.m2/settings.xml). Both ids share the same bearer
// token, so either one is a representative credential.
function extractExchangeServerCredential(xml) {
  const block = findExchangeServerBlock(xml);
  if (!block) return null;
  const username = /<username>([\s\S]*?)<\/username>/.exec(block)?.[1]?.trim();
  const password = /<password>([\s\S]*?)<\/password>/.exec(block)?.[1]?.trim();
  if (!username || !password) return null;
  return { username, password };
}

// Scan <acbTempDir>/<any-subdir>/acb_settings.xml and return the credential
// from whichever one was modified most recently — ACB refreshes the file on
// a timer while its backend is running, so recency is the best signal for
// "the currently active session" without knowing the backend's actual PID.
// Trade-off: a crashed backend's directory could in principle be the most
// recently *written* one and win over a live backend that hasn't rewritten
// its file yet since the crash — accepted here since this is already a
// fallback path (CLI session empty) and a stale ACB credential surfaces the
// same way any other stale one does, via looksLikeAuthFailure() at the mvn
// call site.
function readAcbSettingsCredentials(acbTempDir) {
  if (!existsSync(acbTempDir)) return null;
  let entries;
  try {
    entries = readdirSync(acbTempDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((e) => e.isDirectory())
    .map((e) => join(acbTempDir, e.name, 'acb_settings.xml'))
    .filter((p) => existsSync(p))
    .map((p) => ({ path: p, mtimeMs: statSync(p).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (candidates.length === 0) return null;

  const xml = readFileSync(candidates[0].path, 'utf8');
  return extractExchangeServerCredential(xml);
}

function readCredentials(opts) {
  const clientId = readConfValue('client_id');
  const clientSecret = readConfValue('client_secret');
  if (clientId && clientSecret) {
    return { kind: 'client', username: '~~~Client~~~', password: `${clientId}~?~${clientSecret}` };
  }
  const token = unwrapToken(readConfValue('token'));
  if (token) {
    return { kind: 'token', username: '~~~Token~~~', password: token };
  }

  const acbTempDir = opts.acbTempDir || ACB_TEMP_DIR_DEFAULT;
  const acbCreds = readAcbSettingsCredentials(acbTempDir);
  if (acbCreds) {
    return { kind: 'acb', username: acbCreds.username, password: acbCreds.password };
  }

  return null;
}

// Replace <username>/<password> inside every EXISTING <server> block whose
// <id> is in EXCHANGE_SERVER_IDS. Tolerant of child-element order and
// whitespace; every other <server>/<profile>/<mirror> in the file is left
// byte-for-byte untouched. A block inside an XML comment is left alone and
// does NOT count as "found" — a commented-out entry is not live. Returns
// { xml, foundIds } where foundIds is the set of EXCHANGE_SERVER_IDS that
// already had a (non-commented) block (and got refreshed).
//
// Every `.replace(regex, replacementString)` below uses a function as the
// replacement (even where it doesn't need to compute anything) rather than
// a plain string — a plain-string replacement is subject to String.replace's
// special `$&`/`$1`/`$$` pattern expansion, and creds.username/password are
// untrusted (CLI- or ACB-sourced) values that could coincidentally contain
// `$`. A function's return value is always inserted literally.
function patchExistingExchangeServers(xml, creds) {
  const commentRanges = findCommentRanges(xml);
  const serverRe = /<server\b[^>]*>[\s\S]*?<\/server>/g;
  const foundIds = new Set();
  const username = escapeXml(creds.username);
  const password = escapeXml(creds.password);
  const patched = xml.replace(serverRe, (block, offset) => {
    if (isInsideAnyRange(commentRanges, offset)) return block;
    const idMatch = /<id>\s*([^<]*?)\s*<\/id>/.exec(block);
    if (!idMatch || !EXCHANGE_SERVER_IDS.includes(idMatch[1])) return block;
    foundIds.add(idMatch[1]);
    let next = block;
    next = /<username>[\s\S]*?<\/username>/.test(next)
      ? next.replace(/<username>[\s\S]*?<\/username>/, () => `<username>${username}</username>`)
      : next.replace(/<\/server>/, () => `  <username>${username}</username>\n</server>`);
    next = /<password>[\s\S]*?<\/password>/.test(next)
      ? next.replace(/<password>[\s\S]*?<\/password>/, () => `<password>${password}</password>`)
      : next.replace(/<\/server>/, () => `  <password>${password}</password>\n</server>`);
    return next;
  });
  return { xml: patched, foundIds };
}

// For any EXCHANGE_SERVER_IDS not already present (per foundIds), append a
// brand-new <server> block with creds. A customer who's never run the DX
// plugin's own describe-connector (which would have provisioned the v3
// block) or who only ever declared the legacy v2 repository in their pom.xml
// may have neither block yet — this only ever touches the in-memory string
// that becomes the TEMP settings.xml copy, never the real file. Appends to
// an existing <servers>/<servers/> container if present, otherwise inserts a
// new <servers> container right after the <settings ...> opening tag. If
// there's no recognizable <settings ...> root at all (e.g. an empty file),
// this is a no-op and the missing ids stay missing — same as before.
function addMissingExchangeServers(xml, creds, foundIds) {
  const missingIds = EXCHANGE_SERVER_IDS.filter((id) => !foundIds.has(id));
  if (missingIds.length === 0) return { xml, addedIds: [] };

  const username = escapeXml(creds.username);
  const password = escapeXml(creds.password);
  // credential values are already XML-escaped above, so the only remaining
  // $-expansion risk is String.replace's own special pattern handling in
  // the two `.replace(regex, newBlocks)` calls below — both use a function
  // replacement to avoid it (same reasoning as patchExistingExchangeServers).
  const newBlocks = missingIds
    .map((id) => `    <server>\n      <id>${id}</id>\n      <username>${username}</username>\n      <password>${password}</password>\n    </server>\n`)
    .join('');

  if (/<servers>[\s\S]*?<\/servers>/.test(xml)) {
    return { xml: xml.replace(/<\/servers>/, () => `${newBlocks}  </servers>`), addedIds: missingIds };
  }
  if (/<servers\s*\/>/.test(xml)) {
    return { xml: xml.replace(/<servers\s*\/>/, () => `<servers>\n${newBlocks}  </servers>`), addedIds: missingIds };
  }
  if (/<settings\b[^>]*>/.test(xml)) {
    return { xml: xml.replace(/<settings\b[^>]*>/, (tag) => `${tag}\n  <servers>\n${newBlocks}  </servers>`), addedIds: missingIds };
  }
  // No <settings> root to anchor an insertion on (e.g. empty/malformed file)
  // — leave xml untouched, same as the pre-synthesis no-op behavior.
  return { xml, addedIds: [] };
}

/**
 * Writes a temp copy of the user's ~/.m2/settings.xml with the
 * anypoint-exchange-v2 and anypoint-exchange-v3 <server> credentials
 * refreshed from the live CLI session (or, when that session is empty,
 * ACB's own acb_settings.xml) — refreshing existing blocks and adding
 * whichever of the two is missing. Never mutates the real settings.xml.
 *
 * @param {{ sourcePath?: string, acbTempDir?: string }} [opts] sourcePath
 *   overrides ~/.m2/settings.xml, acbTempDir overrides
 *   ~/AnypointCodeBuilder/.tmp (for tests).
 * @returns {{ path: string|null, patched: boolean, credentialKind: 'client'|'token'|'acb'|null, warning?: string }}
 *   path is null only when sourcePath does not exist AND no CLI/ACB
 *   credential was found — there is nothing to pass to `mvn -s` in that
 *   case, so callers MUST omit `-s` rather than pass a nonexistent path
 *   (`mvn -s /nonexistent/settings.xml` hard-fails with "The specified
 *   user settings file does not exist"), e.g.
 *   `${MVN_SETTINGS:+-s "$MVN_SETTINGS"}`. When sourcePath does not exist
 *   but a credential IS found (CLI or ACB), a brand-new minimal
 *   settings.xml is synthesized in the temp copy — path is non-null in
 *   that case too. Whenever a source file DOES exist, path is always
 *   non-null and safe to pass to `mvn -s <path>`, whether or not anything
 *   was patched.
 */
export function writeMavenSettings(opts = {}) {
  const sourcePath = opts.sourcePath || join(homedir(), '.m2', 'settings.xml');

  // Resolve credentials BEFORE checking whether sourcePath exists. A missing
  // ~/.m2/settings.xml is common for a first build on a machine (Maven
  // creates it lazily) and must not short-circuit past an active CLI/ACB
  // session — synthesize a minimal settings.xml from scratch in that case
  // rather than giving up with path: null while a live credential sits
  // unused.
  const creds = readCredentials(opts);

  if (!existsSync(sourcePath)) {
    if (!creds) {
      return { path: null, patched: false, credentialKind: null, warning: `${sourcePath} not found and no Anypoint CLI/ACB session credentials found; mvn will run with no custom settings.` };
    }
    const { xml: patchedXml, addedIds } = addMissingExchangeServers(
      '<settings>\n  <servers>\n  </servers>\n</settings>\n',
      creds,
      new Set()
    );
    const dir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
    const outPath = join(dir, 'settings.xml');
    writeFileSync(outPath, patchedXml, { mode: 0o600 });
    return { path: outPath, patched: addedIds.length > 0, credentialKind: creds.kind };
  }

  const xml = readFileSync(sourcePath, 'utf8');
  if (!creds) {
    return { path: sourcePath, patched: false, credentialKind: null, warning: 'No Anypoint CLI session credentials found (anypoint-cli-v4 conf client_id/client_secret/token empty, and no acb_settings.xml session found); using settings.xml as-is.' };
  }

  const { xml: refreshedXml, foundIds } = patchExistingExchangeServers(xml, creds);
  const { xml: patchedXml, addedIds } = addMissingExchangeServers(refreshedXml, creds, foundIds);
  if (foundIds.size === 0 && addedIds.length === 0) {
    return { path: sourcePath, patched: false, credentialKind: null, warning: `No <settings> root found in ${sourcePath} to add a <server><id>${EXCHANGE_SERVER_IDS.join('</id> or <id>')}</id> block to; using settings.xml as-is.` };
  }

  const dir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
  const outPath = join(dir, 'settings.xml');
  writeFileSync(outPath, patchedXml, { mode: 0o600 });
  return { path: outPath, patched: true, credentialKind: creds.kind };
}

/**
 * Deletes the temp dir writeMavenSettings() created for `path`, once mvn is
 * done reading it — the written file holds a plaintext bearer token/client
 * secret, and nothing else ever removes it. Safe to call with ANY path,
 * including null or the real ~/.m2/settings.xml (the `patched: false`
 * case): this only ever deletes a directory under os.tmpdir() whose name
 * has the exact mkdtempSync prefix writeMavenSettings() uses, so it can
 * never reach the user's real settings.xml or any other directory.
 *
 * @param {string|null|undefined} path the `path` field from a
 *   writeMavenSettings() result.
 */
export function cleanupMavenSettings(path) {
  if (!path) return;
  const dir = dirname(path);
  if (dirname(dir) !== tmpdir()) return;
  if (!basename(dir).startsWith(TEMP_DIR_PREFIX)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only — a failure here must never fail the caller.
  }
}

// writeMavenSettings() can only forward whatever credential the live CLI
// session currently reports — it has no way to know that credential is dead
// until Maven actually tries to use it. A 401 at that point is an EXPIRED
// SESSION, not a build defect: no code edit will fix it, and the Step 16/17
// retry classifiers must not burn a retry guessing at one. This is the
// signal callers check to route to "ask the user to re-login" instead.
//
// Deliberately contextual, not bare `\b401\b` / `\bUnauthorized\b` — those
// false-positive on ordinary Maven output that happens to contain the
// number or word (a download-speed log like "(401 kB at 2.0 MB/s)", or an
// XSD line/column reference like "flows.xml:[401,25]"), which would
// misroute a real code/XSD defect to the auth-failure path instead of the
// Step 16 code-fix classifier.
const AUTH_FAILURE_RE =
  /status code:\s*401|ReasonPhrase:\s*Unauthorized|Not authorized to access|\b401\s+Unauthorized\b/i;

/**
 * @param {string} mvnOutput combined stdout+stderr from a failed mvn run.
 * @returns {boolean} true when the failure looks like an expired/invalid
 *   Anypoint CLI session rather than a code/XSD/dependency defect.
 */
export function looksLikeAuthFailure(mvnOutput) {
  return AUTH_FAILURE_RE.test(mvnOutput || '');
}
