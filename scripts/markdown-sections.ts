/**
 * Returns the text from the first `heading` line through the next heading of the same level, or `null`.
 *
 * The match is a plain substring search, so a caller that must ignore example headings inside code
 * blocks masks them first (see `maskMarkdownIgnoredRegions`).
 */
export function headingSection(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(`${heading}\n`);
  if (start === -1) {
    return null;
  }
  const boundary = `\n${"#".repeat(heading.indexOf(" "))} `;
  const end = markdown.indexOf(boundary, start + heading.length);
  return end === -1 ? markdown.slice(start) : markdown.slice(start, end);
}
