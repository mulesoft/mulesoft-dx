// java-boundary.mjs — the Step 8 gate: does the upgrade cross a Java version?
//
// Step 8 (custom Java) only has work to do when targetJava > currentJava; every
// breakage it looks for is anchored to a Java version inside that span. The gate
// used to be a sentence of prose, and agents read the app's Java sources and
// Spring beans before applying it. This makes the verdict a single command.

/**
 * @param {unknown} from current Java major (e.g. 17 or "17")
 * @param {unknown} to   target Java major
 * @returns {{ from: number|null, to: number|null, crosses: boolean, verdict: 'run'|'skip'|'unknown', reason: string }}
 *   `unknown` (a value missing or not a number) means the gate cannot decide, and the caller runs Step 8.
 */
export function javaBoundary(from, to) {
  const f = Number.parseInt(String(from), 10);
  const t = Number.parseInt(String(to), 10);
  if (!Number.isFinite(f) || !Number.isFinite(t)) {
    return { from: Number.isFinite(f) ? f : null, to: Number.isFinite(t) ? t : null, crosses: false, verdict: 'unknown', reason: `cannot compare Java versions (current=${from}, target=${to}); run Step 8` };
  }
  if (t > f) return { from: f, to: t, crosses: true, verdict: 'run', reason: `Java ${f} → ${t} crosses a version boundary` };
  return { from: f, to: t, crosses: false, verdict: 'skip', reason: t === f ? `skipped — Java unchanged (${f} → ${t})` : `skipped — target Java ${t} is below current ${f} (the skill never downgrades)` };
}
