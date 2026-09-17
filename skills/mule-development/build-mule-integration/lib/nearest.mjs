// nearest.mjs — "did you mean…" suggestions via a Hamming-on-overlap distance.

/** @param {string} token Reference. @param {string} candidate Candidate. @returns {number} Hamming distance over the overlapping prefix plus abs length delta. */
export function distance(token, candidate) {
  const overlap = Math.min(token.length, candidate.length);
  let mismatches = 0;
  for (let i = 0; i < overlap; i += 1) {
    if (token[i] !== candidate[i]) mismatches += 1;
  }
  return mismatches + Math.abs(token.length - candidate.length);
}

/** @param {string} token Reference. @param {string[]} candidates Pool. @returns {string} Closest candidate by `distance()`; "" when pool empty; first wins on ties. */
export function nearest(token, candidates) {
  if (!candidates || candidates.length === 0) return '';
  let best = candidates[0];
  let bestDist = distance(token, best);
  for (let i = 1; i < candidates.length; i += 1) {
    const d = distance(token, candidates[i]);
    if (d < bestDist) {
      best = candidates[i];
      bestDist = d;
    }
  }
  return best;
}

/** @param {string} nsid An `NS:ID` token. @returns {string} The substring before the first ":", or "" when no colon present. */
export function nsOf(nsid) {
  const idx = nsid.indexOf(':');
  return idx === -1 ? '' : nsid.slice(0, idx);
}

/**
 * Find the nearest allowlist entry sharing `miss`'s namespace.
 *
 * @param {string} miss The unrecognised `NS:ID` token.
 * @param {string[]} allowlist Full allowlist (any namespace).
 * @returns {string} Nearest same-namespace candidate, or "" when the
 *   namespace pool is empty. When `miss` contains no `:`, `nsOf(miss)` is `""`
 *   and the search widens to the entire allowlist (no namespace filter).
 */
export function suggestForMiss(miss, allowlist) {
  const ns = nsOf(miss);
  const pool = ns
    ? allowlist.filter((c) => nsOf(c) === ns)
    : allowlist.slice();
  return nearest(miss, pool);
}
