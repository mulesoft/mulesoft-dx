// platform.mjs — platform helpers (parseJavaVersion).

/** @param {string} stderrOrStdout Full `java -version` output (stderr typically). @returns {{raw:string, major:number|null}} Parsed version; handles legacy "1.8.0_321"→8 and modern "11.0.21"→11. */
export function parseJavaVersion(stderrOrStdout) {
  if (!stderrOrStdout) return { raw: '', major: null };
  // Scan every line: with _JAVA_OPTIONS / JAVA_TOOL_OPTIONS set the JVM prints
  // `Picked up _JAVA_OPTIONS: ...` on stderr BEFORE the version line. Match
  // `<vendor> version "` at the start of a line so a quoted flag value inside
  // such a banner can't match.
  // e.g. java version "11.0.21" or openjdk version "1.8.0_321"
  const m = String(stderrOrStdout).match(/^\S+ version "([^"]+)"/m);
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
