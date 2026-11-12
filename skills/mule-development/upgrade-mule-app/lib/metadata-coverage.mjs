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

/** Name of a Mode-A list entry: a bare string or an object with name/elementName. @param {any} entry @returns {string} */
export function entryName(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return String(entry.name || entry.elementName || '');
  return '';
}

/**
 * Compute the ordered coverage rows for one connector.
 *
 *  - `WARN` / `INFO` rows carry final report text.
 *  - `EXPECT` rows are describe files that must exist: `path` is the output
 *    file, `args` the describe_connector.mjs arguments that produce it, and
 *    `label` / `missingText` the gate's FAIL row text if it is absent.
 *
 * Mode-B covers the operations / sources the flows use. Mode-C covers EVERY
 * (Mode-A config, connectionProviders[] entry) pair, used or not: the
 * provider-rename check in SKILL.md Step 7 compares the old local names with
 * the whole set of new provider elementNames.
 *
 * @param {{nick: string, usage: any, modeA: any, metadataDir: string}} p
 * @returns {Array<{level: 'WARN'|'INFO', text: string} | {level: 'EXPECT', kind: 'operation'|'source'|'connection-provider', label: string, path: string, args: string[], missingText: string}>}
 */
export function computeCoverageRows({ nick, usage, modeA, metadataDir }) {
  const rows = [];
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
    for (const prov of providers) {
      const file = path.join(metadataDir, `${modeAName}-${configName}-${prov}.json`);
      rows.push({
        level: 'EXPECT', kind: 'connection-provider', label: `${nick}/${configName}/${prov}`, path: file,
        args: [modeAName, '--type', 'connection-provider', '--name', prov, '--config-name', configName],
        missingText: `FAIL  ${nick}/${configName}/${prov} — missing Mode-C: ${file}`,
      });
    }
  }

  return rows;
}
