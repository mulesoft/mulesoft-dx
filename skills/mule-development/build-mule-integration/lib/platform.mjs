// platform.mjs — platform helpers (parseJavaVersion, semver-like sort).

/** @param {string} stderrOrStdout `java -version` output (stderr typically). @returns {{raw:string, major:number|null}} Parsed version; handles legacy "1.8.0_321"→8 and modern "11.0.21"→11. */
export function parseJavaVersion(stderrOrStdout) {
  if (!stderrOrStdout) return { raw: '', major: null };
  const firstLine = String(stderrOrStdout).split(/\r?\n/, 1)[0] || '';
  // Match the first quoted token, e.g. java version "11.0.21" or openjdk version "1.8.0_321"
  const m = firstLine.match(/"([^"]+)"/);
  const raw = m ? m[1] : '';
  if (!raw) return { raw: '', major: null };
  const parts = raw.split('.');
  let major;
  if (parts[0] === '1' && parts.length > 1) {
    major = parseInt(parts[1], 10);
  } else {
    major = parseInt(parts[0], 10);
  }
  return { raw, major: Number.isFinite(major) ? major : null };
}

/** @param {string[]} arr Strings like "mule-4.5.0". @returns {string[]} New array sorted by version-sort semantics (numeric runs compared numerically). */
export function sortVersionStrings(arr) {
  const tokenize = (s) => String(s).split(/(\d+)/).map((t) => /^\d+$/.test(t) ? parseInt(t, 10) : t);
  return [...arr].sort((a, b) => {
    const ta = tokenize(a);
    const tb = tokenize(b);
    const len = Math.max(ta.length, tb.length);
    for (let i = 0; i < len; i += 1) {
      const x = ta[i];
      const y = tb[i];
      if (x === undefined) return -1;
      if (y === undefined) return 1;
      if (typeof x === 'number' && typeof y === 'number') {
        if (x !== y) return x - y;
      } else {
        const sx = String(x);
        const sy = String(y);
        if (sx !== sy) return sx < sy ? -1 : 1;
      }
    }
    return 0;
  });
}
