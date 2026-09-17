// template-rank.mjs — rank Exchange template assets by relevance to a search term.
// rankTemplates(publicRows, privateRows, searchTerm) -> ranked rows
// { name, groupId, assetId, version, sourceLocation }, private/org-scoped first.

function tokenizeSearch(s) {
  return String(s)
    .toLowerCase()
    .split(' ')
    .filter((t) => t !== '' && t !== 'mule' && t !== 'template');
}

function tokenizeAsset(assetId) {
  return String(assetId)
    .toLowerCase()
    .split('-')
    .filter((t) => t !== '' && t !== 'mule' && t !== 'template');
}

// Split version into a tuple of numbers; non-numeric segments become 0.
function versionKey(version) {
  return String(version)
    .split('.')
    .map((seg) => {
      const n = Number(seg);
      return Number.isFinite(n) ? n : 0;
    });
}

function compareTuples(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const ai = i < a.length ? a[i] : 0;
    const bi = i < b.length ? b[i] : 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
}

function classifyToken(t, searchTokens, searchSet) {
  if (searchSet.has(t)) return 'exact';
  if (t.length < 2) return 'none';
  for (const s of searchTokens) {
    if (s.length < 2) continue;
    if (s.includes(t) || t.includes(s)) return 'substring';
  }
  return 'none';
}

/**
 * @param {Array<object>} publicRows Unscoped Exchange asset rows.
 * @param {Array<object>} privateRows Org-scoped Exchange asset rows.
 * @param {string} searchTerm Original user term used for token-overlap scoring.
 * @returns {Array<{name:string, groupId:string, assetId:string, version:string, sourceLocation:('private'|'public')}>}
 *   Ranked template rows, best first.
 */
export function rankTemplates(publicRows, privateRows, searchTerm) {
  const pub = (Array.isArray(publicRows) ? publicRows : []).map((r) => ({ ...r, _origin: 'public' }));
  const priv = (Array.isArray(privateRows) ? privateRows : []).map((r) => ({ ...r, _origin: 'private' }));
  // Private first so the first row of a collision group is the private one.
  const all = [...priv, ...pub];

  const searchTokens = tokenizeSearch(searchTerm);
  const searchSet = new Set(searchTokens);

  const templates = all.filter((row) => row && typeof row === 'object' && row.type === 'template');

  // Group by [groupId, assetId]; buckets are reordered below.
  const groups = new Map();
  for (const row of templates) {
    const key = `${row.groupId} ${row.assetId}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(row);
  }

  // Sort buckets in [groupId, assetId] lexical order so it acts as the stable
  // final tiebreak when two candidates tie on [origin, -score, assetId.length].
  const orderedBuckets = [...groups.values()].sort((a, b) => {
    if (a[0].groupId !== b[0].groupId) return a[0].groupId < b[0].groupId ? -1 : 1;
    if (a[0].assetId !== b[0].assetId) return a[0].assetId < b[0].assetId ? -1 : 1;
    return 0;
  });

  const candidates = [];
  for (const bucket of orderedBuckets) {
    const first = bucket[0];
    const groupId = first.groupId;
    const assetId = first.assetId;

    // Highest version across the group.
    let bestVersion = first.version;
    let bestKey = versionKey(bestVersion);
    for (let i = 1; i < bucket.length; i += 1) {
      const k = versionKey(bucket[i].version);
      if (compareTuples(k, bestKey) > 0) {
        bestVersion = bucket[i].version;
        bestKey = k;
      }
    }

    const origin = bucket.some((r) => r._origin === 'private') ? 'private' : 'public';
    const name = first.name ?? assetId;
    const assetTokens = tokenizeAsset(assetId);

    let exact = 0;
    let substr = 0;
    let unmatched = 0;
    for (const t of assetTokens) {
      const kind = classifyToken(t, searchTokens, searchSet);
      if (kind === 'exact') exact += 1;
      else if (kind === 'substring') substr += 1;
      else unmatched += 1;
    }
    const score = 2 * exact + substr - unmatched;

    candidates.push({ name, groupId, assetId, version: bestVersion, sourceLocation: origin, _score: score });
  }

  // Sort private/org-scoped first, then descending score, then shorter assetId.
  candidates.sort((a, b) => {
    const oa = a.sourceLocation === 'private' ? 0 : 1;
    const ob = b.sourceLocation === 'private' ? 0 : 1;
    if (oa !== ob) return oa - ob;
    if (a._score !== b._score) return b._score - a._score;
    return a.assetId.length - b.assetId.length;
  });

  return candidates.map(({ _score, ...rest }) => rest);
}
