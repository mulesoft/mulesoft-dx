// exchange-rank.mjs — rank Exchange connector assets by relevance to a search term.
// rankCandidates(pageA, pageB, searchTerm) -> ranked candidates, best first
// { groupId, assetId, version, score, groupPref }.

const PRERELEASE_RE = /-(SNAPSHOT|RC|alpha|beta|M[0-9])/;

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split('-')
    .filter((t) => t !== '' && t !== 'mule' && t !== 'connector');
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

// Compare two version tuples element-by-element; a shorter tuple sorts before
// an equal-prefix longer one.
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

function groupPref(groupId) {
  if (groupId === 'com.mulesoft.connectors') return 0;
  if (groupId === 'org.mule.connectors') return 1;
  return 2;
}

// Pick the highest version from a list of {version} objects.
function highestVersion(group) {
  let best = group[0];
  let bestKey = versionKey(best.version);
  for (let i = 1; i < group.length; i += 1) {
    const k = versionKey(group[i].version);
    if (compareTuples(k, bestKey) > 0) {
      best = group[i];
      bestKey = k;
    }
  }
  return best.version;
}

// Token classification: returns 'exact' | 'substring' | 'none'.
// `searchSet` is a Set of `searchTokens` used for the exact-match check.
function classifyToken(t, searchTokens, searchSet) {
  if (searchSet.has(t)) return 'exact';
  if (t.length < 2) return 'none';
  for (const s of searchTokens) {
    if (s.length < 2) continue;
    // A substring match in either direction.
    if (s.includes(t) || t.includes(s)) return 'substring';
  }
  return 'none';
}

/** @param {Array<object>} pageA Exchange page-A assets. @param {Array<object>} pageB Exchange page-B assets. @param {string} searchTerm Original user term used for token-overlap scoring. @returns {Array<{groupId:string, assetId:string, version:string, score:number, groupPref:number}>} Ranked candidates, best first. */
export function rankCandidates(pageA, pageB, searchTerm) {
  const all = [...(Array.isArray(pageA) ? pageA : []), ...(Array.isArray(pageB) ? pageB : [])];

  const searchTokens = tokenize(searchTerm);
  const searchSet = new Set(searchTokens);

  // Filter: type=="extension" and version not pre-release.
  const filtered = all.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    if (row.type !== 'extension') return false;
    const v = row.version;
    if (typeof v !== 'string') return false;
    return !PRERELEASE_RE.test(v);
  });

  // Group by [groupId, assetId].
  const groups = new Map();
  for (const row of filtered) {
    const key = `${row.groupId} ${row.assetId}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(row);
  }

  // Build candidate per group, scored.
  const candidates = [];
  for (const bucket of groups.values()) {
    const first = bucket[0];
    const groupId = first.groupId;
    const assetId = first.assetId;
    const version = highestVersion(bucket);
    const assetTokens = tokenize(assetId);

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
    const pref = groupPref(groupId);

    candidates.push({
      groupId,
      assetId,
      version,
      score,
      groupPref: pref,
    });
  }

  // Sort by descending score, then group preference, then shorter assetId.
  candidates.sort((a, b) => {
    const sa = -a.score;
    const sb = -b.score;
    if (sa !== sb) return sa - sb;
    if (a.groupPref !== b.groupPref) return a.groupPref - b.groupPref;
    return a.assetId.length - b.assetId.length;
  });

  return candidates;
}
