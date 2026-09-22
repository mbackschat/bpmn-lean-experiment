import { createHash } from "node:crypto";

export function sha256(value: string | Uint8Array): string {
  const hash = createHash("sha256");
  return typeof value === "string"
    ? hash.update(value, "utf8").digest("hex")
    : hash.update(value).digest("hex");
}

/** Provides a locale-independent total order over exact JavaScript strings. */
export function compareExactStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export type MarkdownSection = Readonly<{
  headingPath: string;
  level: number;
  line: number;
  text: string;
  ownText: string;
}>;

/** Shares fence and heading recognition between claim extraction and review navigation. */
export function markdownStructure(document: string): Readonly<{
  headings: ReadonlyArray<Readonly<{ headingPath: string; level: number; line: number }>>;
  fencedLines: ReadonlySet<number>;
}> {
  const headings: Array<{ headingPath: string; level: number; line: number }> = [];
  const stack: Array<string | undefined> = [];
  const fencedLines = new Set<number>();
  let fence: string | undefined;
  for (const [line, text] of document.split("\n").entries()) {
    if (fence !== undefined) {
      fencedLines.add(line);
      const closing = /^\s*(`{3,}|~{3,})\s*$/u.exec(text)?.[1];
      if (closing !== undefined && closing[0] === fence[0] && closing.length >= fence.length) fence = undefined;
      continue;
    }
    const opening = /^\s*(`{3,}|~{3,})/u.exec(text)?.[1];
    if (opening !== undefined) {
      fence = opening;
      fencedLines.add(line);
      continue;
    }
    const match = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u.exec(text);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const level = match[1].length;
    stack.length = level - 1;
    stack[level - 1] = match[2];
    headings.push({ headingPath: stack.filter((heading) => heading !== undefined).join(" > "), level, line });
  }
  return { headings, fencedLines };
}

export function markdownSections(document: string): ReadonlyArray<MarkdownSection> {
  const { headings } = markdownStructure(document);
  const lines = document.split("\n");
  const slice = (start: number, end: number): string =>
    lines.slice(start, end).join("\n") + (end < lines.length ? "\n" : "");
  const nextAtLevel = Array<number>(7).fill(lines.length);
  const ends = new Map<number, number>();
  for (const heading of [...headings].reverse()) {
    ends.set(heading.line, Math.min(...nextAtLevel.slice(1, heading.level + 1)));
    nextAtLevel[heading.level] = heading.line;
  }
  return headings.map((heading, index) => {
    const end = ends.get(heading.line) ?? lines.length;
    const ownEnd = headings[index + 1]?.line ?? lines.length;
    return { ...heading, text: slice(heading.line, end), ownText: slice(heading.line, ownEnd) };
  });
}

export function exactMarkdownSection(document: string, headingPath: string): string {
  const sections = markdownSections(document).filter((section) => section.headingPath === headingPath);
  if (sections.length !== 1 || sections[0] === undefined) {
    throw new Error(`${headingPath} heading must occur exactly once`);
  }
  return sections[0].text;
}
