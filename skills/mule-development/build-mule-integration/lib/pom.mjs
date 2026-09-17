// pom.mjs — pom.xml mutation helpers.
//
// hasArtifact(text, artifactId) -> boolean (substring match)
// insertDependency(text, {groupId, artifactId, version, classifier})
//     -> new pom.xml text with a <dependency> block injected immediately
//        before the first </dependencies> close tag.
//
// The source's existing line ending (LF or CRLF) is preserved, and the new
// block lines use that same terminator. The block is indented with 8 spaces
// and inner lines with 12 spaces.

/** @param {string} text pom.xml content. @param {string} artifactId Artifact id substring. @returns {boolean} True iff artifactId appears anywhere in text. */
export function hasArtifact(text, artifactId) {
  if (typeof text !== 'string' || typeof artifactId !== 'string' || artifactId === '') {
    return false;
  }
  return text.includes(artifactId);
}

// Detect the line ending used in the source by sniffing the first observed
// terminator. Falls back to LF when the file is single-line.
function detectEol(text) {
  const i = text.indexOf('\n');
  if (i === -1) return '\n';
  return (i > 0 && text[i - 1] === '\r') ? '\r\n' : '\n';
}

/** @param {string} text pom.xml content. @param {{groupId:string, artifactId:string, version:string, classifier?:string}} dep Maven coordinates. @returns {string} New pom.xml with a `<dependency>` block inserted before the first `</dependencies>`. */
export function insertDependency(text, dep) {
  const { groupId, artifactId, version, classifier } = dep || {};
  if (!groupId || !artifactId || !version) {
    throw new Error('insertDependency: groupId, artifactId, and version are required');
  }
  const eol = detectEol(text);
  const lines = ['        <dependency>',
                 `            <groupId>${groupId}</groupId>`,
                 `            <artifactId>${artifactId}</artifactId>`,
                 `            <version>${version}</version>`];
  if (classifier) {
    lines.push(`            <classifier>${classifier}</classifier>`);
  }
  lines.push('        </dependency>');
  const block = lines.join(eol) + eol;

  // Insert before the first line containing </dependencies>. The block is
  // inserted at the START of that matching line so the existing indentation
  // and closing tag remain intact.
  const marker = '</dependencies>';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No </dependencies> present — nothing to do (caller will detect via
    // hasArtifact check on the returned text).
    return text;
  }
  // Walk back to the start of the line that contains the marker, then splice
  // the new block in at that line's leading edge.
  let lineStart = idx;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  return text.slice(0, lineStart) + block + text.slice(lineStart);
}
