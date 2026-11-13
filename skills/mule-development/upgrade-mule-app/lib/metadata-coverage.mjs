//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Single definition of "which describe files must exist for a connector",
// shared by verify_metadata_coverage.mjs (the Step 7 / 11.5 gate) and
// describe_missing.mjs (the runner) so the two cannot drift apart.
import path from 'node:path';
import { readJsonOrNull } from './fsx.mjs';

/** Name of a Mode-A list entry: a bare string or an object with name/elementName. @param {any} entry @returns {string} */
export function entryName(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return String(entry.name || entry.elementName || '');
  return '';
}

/** Case/punctuation-insensitive form of an element or provider name (Mode-A is kebab-case, flows camelCase). @param {string} s @returns {string} */
export function normalizeElementName(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A flow-side provider element matches a Mode-A provider id when equal, or when the element extends it (http: `listener` -> `listenerConnection`). Over-matching only costs a describe. */
function elementMatchesProvider(element, provider) {
  const e = normalizeElementName(element);
  const p = normalizeElementName(provider);
  return e.length > 0 && p.length > 0 && (e === p || e.startsWith(p));
}

/**
 * Decide which Mode-A providers need a Mode-C describe, from what the app uses.
 *
 * The only consumer of an UNUSED provider's Mode-C is the provider-rename check
 * (SKILL.md Step 7: the old connection element's local name must appear among the
 * NEW providers' elementNames). A used provider whose own elementName equals the
 * element the app already uses proves "no rename" for it, so the sibling providers
 * add nothing. This returns that narrower set, or null (= describe every provider,
 * the conservative default) whenever the usage cannot be mapped with confidence:
 *   - `config_providers_used` is missing or empty, or
 *   - any entry in it is neither a Mode-A provider (by `elementMatchesProvider`)
 *     nor a known operation / source (the enumerator also reports provider
 *     children such as kafka's `bootstrapServer` there), which is what an old
 *     provider element that was renamed or removed looks like, or
 *   - no config ends up with a matched provider, or
 *   - the flows declare a config element (`config_elems_used`) whose providers none matched:
 *     an implicit connection, which leaves no provider element to key on.
 *
 * @param {any} usage parsed connector-usage file
 * @param {any} modeA parsed `<nick>-new.json`
 * @returns {null | { usedElements: string[], byConfig: Map<string, string[]> }}
 *   `byConfig`: config name -> its Mode-A providers that the app uses.
 */
export function usedProviderPlan(usage, modeA) {
  const used = Array.isArray(usage?.config_providers_used) ? usage.config_providers_used.filter(Boolean) : [];
  if (used.length === 0) return null;

  const known = new Set([
    ...(Array.isArray(usage?.operations_used) ? usage.operations_used : []),
    ...(Array.isArray(usage?.sources_used) ? usage.sources_used : []),
  ].map(normalizeElementName));

  const configElems = new Set((Array.isArray(usage?.config_elems_used) ? usage.config_elems_used : []).map(normalizeElementName));
  let implicitConnection = false;
  const configs = Array.isArray(modeA?.configs) ? modeA.configs : [];
  const byConfig = new Map();
  const matchedElements = new Set();
  for (const cfg of configs) {
    const configName = entryName(cfg);
    const providers = (cfg && typeof cfg === 'object' && Array.isArray(cfg.connectionProviders))
      ? cfg.connectionProviders.map(entryName).filter(Boolean)
      : [];
    const matched = providers.filter((prov) => used.some((el) => {
      const hit = elementMatchesProvider(el, prov);
      if (hit) matchedElements.add(el);
      return hit;
    }));
    if (matched.length > 0) byConfig.set(configName, matched);
    else if (providers.length > 0 && [cfg?.name, cfg?.elementName].some((n) => n && configElems.has(normalizeElementName(n)))) implicitConnection = true;
  }
  // A config the flows declare with no connection child (an implicit connection) gives no provider
  // signal, so it would look unused and lose its config-level Mode-C data: describe everything.
  if (implicitConnection || byConfig.size === 0) return null;
  for (const el of used) {
    if (matchedElements.has(el)) continue;
    // The classifier also files unmatched provider-ish elements under operations_used, so being
    // "known" only excuses an element that does not look like a connection provider (kafka's
    // `bootstrapServer` noise); an unmatched `*Connection` element may be a renamed provider of a
    // config we would otherwise skip, so describe everything.
    const norm = normalizeElementName(el);
    if (!known.has(norm) || norm.endsWith('connection')) return null;
  }
  return { usedElements: used, byConfig };
}

/**
 * Compute the ordered coverage rows for one connector.
 *
 *  - `WARN` / `INFO` rows carry final report text.
 *  - `EXPECT` rows are describe files that must exist: `path` is the output
 *    file, `args` the describe_connector.mjs arguments that produce it, and
 *    `label` / `missingText` the gate's FAIL row text if it is absent.
 *
 * Mode-B covers the operations / sources the flows use. Mode-C covers the
 * (Mode-A config, connectionProviders[] entry) pairs the provider-rename check
 * in SKILL.md Step 7 needs. Normally that is only the providers the app uses
 * (`usedProviderPlan`); it widens to EVERY provider of a config when the used
 * provider's Mode-C elementName differs from the element the flows use (a
 * rename is possible, so the whole set of new elementNames is needed), and to
 * every provider of every config when the usage cannot be mapped at all. The
 * widening is re-evaluated from the Mode-C files on disk, so the runner (which
 * re-plans after each pass) and the gate stay in step.
 *
 * @param {{nick: string, usage: any, modeA: any, metadataDir: string, readMetadata?: (p: string) => any}} p
 * @returns {Array<{level: 'WARN'|'INFO', text: string} | {level: 'EXPECT', kind: 'operation'|'source'|'connection-provider', label: string, path: string, args: string[], missingText: string}>}
 */
export function computeCoverageRows({ nick, usage, modeA, metadataDir, readMetadata = readJsonOrNull }) {
  const rows = [];
  const plan = usedProviderPlan(usage, modeA);
  const skipped = [];
  const widened = [];
  const modeAName = `${nick}-new`;

  const modeAOps = (Array.isArray(modeA?.operations) ? modeA.operations : []).map(entryName).filter(Boolean);
  const modeASrcs = (Array.isArray(modeA?.sources) ? modeA.sources : []).map(entryName).filter(Boolean);

  for (const op of Array.isArray(usage?.operations_used) ? usage.operations_used : []) {
    if (!op) continue;
    if (!modeAOps.includes(op)) {
      rows.push({ level: 'WARN', text: `WARN  ${nick}/${op} — op not in Mode-A .operations[] (rename or removed; check <nick>-op-renames.json)` });
      continue;
    }
    const file = path.join(metadataDir, `${modeAName}-${op}.json`);
    rows.push({
      level: 'EXPECT', kind: 'operation', label: `${nick}/${op}`, path: file,
      args: [modeAName, '--type', 'operation', '--name', op],
      missingText: `FAIL  ${nick}/${op} — missing Mode-B: ${file}`,
    });
  }

  for (const src of Array.isArray(usage?.sources_used) ? usage.sources_used : []) {
    if (!src) continue;
    if (!modeASrcs.includes(src)) {
      rows.push({ level: 'WARN', text: `WARN  ${nick}/${src} — source not in Mode-A .sources[]` });
      continue;
    }
    const file = path.join(metadataDir, `${modeAName}-${src}.json`);
    rows.push({
      level: 'EXPECT', kind: 'source', label: `${nick}/${src}`, path: file,
      args: [modeAName, '--type', 'source', '--name', src],
      missingText: `FAIL  ${nick}/${src} — missing Mode-B (source): ${file}`,
    });
  }

  for (const cfg of Array.isArray(modeA?.configs) ? modeA.configs : []) {
    const configName = entryName(cfg);
    if (!configName) continue;
    const providers = (cfg && typeof cfg === 'object' && Array.isArray(cfg.connectionProviders))
      ? cfg.connectionProviders.map(entryName).filter(Boolean)
      : [];
    if (providers.length === 0) {
      // Mode-C is un-runnable here (degraded describe); Phase C reads
      // Mode-A .configs[] directly. Non-fatal.
      rows.push({ level: 'INFO', text: `INFO  ${nick}/${configName} — no providers declared in Mode-A (Phase C reads .configs[] directly)` });
      continue;
    }
    const modeCFile = (prov) => path.join(metadataDir, `${modeAName}-${configName}-${prov}.json`);
    let wanted = providers;
    if (plan) {
      const used = plan.byConfig.get(configName) || [];
      if (used.length === 0) {
        skipped.push(`${configName} (${providers.length})`);
        continue;
      }
      // Rename suspected when a used provider's own elementName is not the element the flows use.
      const renamed = used.some((prov) => {
        const meta = readMetadata(modeCFile(prov));
        if (!meta) return false; // file absent/unreadable: the used provider's own row reports it
        const list = meta.connectionProviders;
        const entries = Array.isArray(list) ? list : [];
        const elementName = (entries.find((cp) => normalizeElementName(entryName(cp)) === normalizeElementName(prov)) || entries[0])?.elementName;
        if (!elementName) return true; // file present but no elementName: cannot rule a rename out
        return !plan.usedElements.some((el) => normalizeElementName(el) === normalizeElementName(elementName));
      });
      if (renamed) widened.push(configName);
      else wanted = used;
    }
    for (const prov of wanted) {
      const file = modeCFile(prov);
      rows.push({
        level: 'EXPECT', kind: 'connection-provider', label: `${nick}/${configName}/${prov}`, path: file,
        args: [modeAName, '--type', 'connection-provider', '--name', prov, '--config-name', configName],
        missingText: `FAIL  ${nick}/${configName}/${prov} — missing Mode-C: ${file}`,
      });
    }
  }
  if (skipped.length > 0) {
    rows.push({ level: 'INFO', text: `INFO  ${nick} — Mode-C skipped for config(s) the app does not use: ${skipped.join(', ')}` });
  }
  for (const configName of widened) {
    rows.push({ level: 'INFO', text: `INFO  ${nick}/${configName} — the used provider's elementName differs from the element in the flows (possible rename): describing every provider of this config` });
  }

  return rows;
}
