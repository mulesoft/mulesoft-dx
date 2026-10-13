// platform.mjs — platform helpers (parseJavaVersion).

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
