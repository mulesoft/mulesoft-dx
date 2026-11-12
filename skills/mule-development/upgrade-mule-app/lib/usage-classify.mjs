//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Classification of flow element names against a connector's Mode-A
// metadata, shared by enumerate_usage.mjs and enumerate_usage_xml.mjs.
//
// Flow element names arrive camelCased (kebabToCamel), but Mode-A spells
// names the way the SDK declares them: operations are camelCase
// (`bulkPublish`) while sources, configs and connection providers are
// usually kebab-case (`message-listener`, `producer-config`). Comparing
// the raw strings misses every hyphenated name, so lookups are made on a
// normalised form and report the canonical Mode-A spelling — the one the
// coverage gate and the Step 7 fan-out match against.

/** Lowercase and drop `-` / `_` so `message-listener` and `messageListener` meet. @param {string} s @returns {string} */
export function normalizeName(s) {
  return String(s).toLowerCase().replace(/[-_]/g, '');
}

/** @param {any} v @returns {string} */
function listEntryName(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return String(v.name || '');
  return '';
}

/** @param {any} cfg @returns {string} */
function configDslName(cfg) {
  if (!cfg || typeof cfg !== 'object') return '';
  return String(cfg.elementName || cfg.name || '');
}

/** @param {Iterable<string>} names @returns {Map<string, string>} normalised -> canonical (first spelling wins) */
function lookup(names) {
  const m = new Map();
  for (const n of names) {
    if (!n) continue;
    const k = normalizeName(n);
    if (!m.has(k)) m.set(k, n);
  }
  return m;
}

/**
 * Build a classifier for one connector's Mode-A metadata.
 * Precedence matches the original enumerators: operation, source, config,
 * connection provider, otherwise unknown.
 *
 * @param {any} newMeta parsed `<nick>-new.json`
 * @returns {(name: string) => {bucket: 'operation'|'source'|'config'|'provider'|'unknown', canonical: string}}
 */
export function buildClassifier(newMeta) {
  const configs = Array.isArray(newMeta?.configs) ? newMeta.configs : [];
  const ops = lookup((Array.isArray(newMeta?.operations) ? newMeta.operations : []).map(listEntryName));
  const srcs = lookup((Array.isArray(newMeta?.sources) ? newMeta.sources : []).map(listEntryName));
  const cfgs = lookup(configs.map(configDslName));
  const providerNames = [];
  for (const cfg of configs) {
    const providers = (cfg && Array.isArray(cfg.connectionProviders)) ? cfg.connectionProviders : [];
    for (const cp of providers) providerNames.push(typeof cp === 'string' ? cp : configDslName(cp));
  }
  const provs = lookup(providerNames);

  return (name) => {
    const k = normalizeName(name);
    if (ops.has(k)) return { bucket: 'operation', canonical: ops.get(k) };
    if (srcs.has(k)) return { bucket: 'source', canonical: srcs.get(k) };
    if (cfgs.has(k)) return { bucket: 'config', canonical: cfgs.get(k) };
    if (provs.has(k)) return { bucket: 'provider', canonical: provs.get(k) };
    return { bucket: 'unknown', canonical: name };
  };
}

/**
 * Split element names into the usage buckets. Operations and sources are
 * reported under their canonical Mode-A spelling; provider and unknown
 * names keep the flow-side spelling (config_providers_used is documented
 * camelCase and is merged with extractConfigProviderChildren's output).
 *
 * @param {string[]} elems camelCased element names found in the flows
 * @param {any} newMeta parsed `<nick>-new.json`
 */
export function classifyElements(elems, newMeta) {
  const classify = buildClassifier(newMeta);
  const operations_used = [];
  const sources_used = [];
  const config_elems_used = [];
  const provider_hits_from_classify = [];
  const child_elements_used = [];
  for (const name of elems) {
    if (!name) continue;
    const { bucket, canonical } = classify(name);
    if (bucket === 'operation') {
      operations_used.push(canonical);
    } else if (bucket === 'source') {
      sources_used.push(canonical);
    } else if (bucket === 'config') {
      config_elems_used.push(name);
    } else if (bucket === 'provider') {
      // Known child element of <prefix:config> — child_elements_used only.
      provider_hits_from_classify.push(name);
      child_elements_used.push(name);
    } else {
      // Unknown to NEW metadata — treat as ambiguous op/child. Downstream
      // Phase B intersect filters these before per-op describe.
      operations_used.push(name);
      child_elements_used.push(name);
    }
  }
  return { operations_used, sources_used, config_elems_used, provider_hits_from_classify, child_elements_used };
}
