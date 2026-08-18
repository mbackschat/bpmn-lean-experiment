export type MarkdownLinkSpan = Readonly<{
  start: number;
  end: number;
  label: string;
  destination: string;
  isImage: boolean;
  containerStart: number;
  containerEnd: number;
}>;

export type MarkdownAnchorSpan = Readonly<{
  name: string;
  level: number;
  start: number;
  end: number;
}>;

type Fence = Readonly<{
  character: "`" | "~";
  length: number;
  quoteDepth: number;
  listIndent: number;
}>;

type Line = Readonly<{
  start: number;
  end: number;
}>;

function markRange(mask: Uint8Array, start: number, end: number): void {
  mask.fill(1, start, end);
}

function markdownLines(markdown: string): ReadonlyArray<Line> {
  const lines: Line[] = [];
  let start = 0;
  for (let index = 0; index <= markdown.length; index += 1) {
    if (index === markdown.length || markdown[index] === "\n") {
      lines.push({ start, end: index });
      start = index + 1;
    }
  }
  return lines;
}

function blockquoteContent(line: string): Readonly<{ content: string; depth: number }> {
  let content = line;
  let depth = 0;
  while (/^ {0,3}>/u.test(content)) {
    content = content.replace(/^ {0,3}>[ \t]?/u, "");
    depth += 1;
  }
  return { content, depth };
}

function fenceAtLineStart(line: string): Fence | null {
  const quote = blockquoteContent(line);
  const list = /^( {0,3})(?:[-+*]|\d+[.)])[ \t]+/u.exec(quote.content);
  const listIndent = list?.[0].length ?? 0;
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(quote.content.slice(listIndent));
  if (match === null) {
    return null;
  }
  const run = match[2];
  const suffix = match[3];
  if (run === undefined || suffix === undefined) {
    return null;
  }
  const character = run[0];
  if (character === undefined || (character !== "`" && character !== "~")) {
    return null;
  }
  if (character === "`" && suffix.includes("`")) {
    return null;
  }
  return { character, length: run.length, quoteDepth: quote.depth, listIndent };
}

function closesFence(line: string, fence: Fence): boolean {
  const quote = blockquoteContent(line);
  if (quote.depth !== fence.quoteDepth) return false;
  if (fence.listIndent > 0 && !new RegExp(`^[ \\t]{${fence.listIndent}}`, "u").test(quote.content)) return false;
  const content = quote.content.slice(fence.listIndent);
  const leadingSpaces = /^ {0,3}/u.exec(content)?.[0].length ?? 0;
  let index = leadingSpaces;
  while (content[index] === fence.character) {
    index += 1;
  }
  return (
    index - leadingSpaces >= fence.length &&
    /^[ \t]*$/u.test(content.slice(index))
  );
}

function isIndentedCode(line: string): boolean {
  return /^(?: {4}|\t)/u.test(line) && line.trim() !== "";
}

function lineEnd(markdown: string, start: number): number {
  const newline = markdown.indexOf("\n", start);
  return newline === -1 ? markdown.length : newline;
}

function fenceEnd(markdown: string, openingLineEnd: number, fence: Fence): number {
  let start = openingLineEnd + 1;
  while (start <= markdown.length) {
    const end = lineEnd(markdown, start);
    const source = markdown.slice(start, end).replace(/\r$/u, "");
    if (closesFence(source, fence)) {
      return end;
    }
    if (end === markdown.length) {
      break;
    }
    start = end + 1;
  }
  return markdown.length;
}

function ignoredRegionMask(markdown: string): Uint8Array {
  const mask = new Uint8Array(markdown.length);
  for (let index = 0; index < markdown.length; index += 1) {
    if (index === 0 || markdown[index - 1] === "\n") {
      const end = lineEnd(markdown, index);
      const source = markdown.slice(index, end).replace(/\r$/u, "");
      const fence = fenceAtLineStart(source);
      if (fence !== null) {
        const endOfFence = fenceEnd(markdown, end, fence);
        markRange(mask, index, endOfFence);
        index = endOfFence - 1;
        continue;
      }
      if (isIndentedCode(source)) {
        markRange(mask, index, end);
        index = end - 1;
        continue;
      }
    }
    if (markdown[index] === "\n") {
      continue;
    }
    if (markdown.startsWith("<!--", index)) {
      const close = markdown.indexOf("-->", index + 4);
      const end = close === -1 ? markdown.length : close + 3;
      markRange(mask, index, end);
      index = end - 1;
      continue;
    }
    if (markdown[index] !== "`") {
      continue;
    }
    let openingEnd = index;
    while (markdown[openingEnd] === "`") {
      openingEnd += 1;
    }
    const runLength = openingEnd - index;
    let candidate = openingEnd;
    let closingEnd = -1;
    while (candidate < markdown.length) {
      if (markdown[candidate] !== "`") {
        candidate += 1;
        continue;
      }
      let runEnd = candidate;
      while (markdown[runEnd] === "`") {
        runEnd += 1;
      }
      if (runEnd - candidate === runLength) {
        closingEnd = runEnd;
        break;
      }
      candidate = runEnd;
    }
    if (closingEnd !== -1) {
      markRange(mask, index, closingEnd);
      index = closingEnd - 1;
    } else {
      index = openingEnd - 1;
    }
  }

  return mask;
}

export function maskMarkdownIgnoredRegions(markdown: string): string {
  const mask = ignoredRegionMask(markdown);
  let result = "";
  for (let index = 0; index < markdown.length; index += 1) {
    const character = markdown[index];
    result += mask[index] === 0 || character === "\n" ? character : " ";
  }
  return result;
}

function isEscaped(markdown: string, index: number): boolean {
  let slashCount = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && markdown[cursor] === "\\";
    cursor -= 1
  ) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function closingLabel(
  markdown: string,
  mask: Uint8Array,
  openingBracket: number,
): number {
  let depth = 1;
  for (let index = openingBracket + 1; index < markdown.length; index += 1) {
    if (mask[index] !== 0 || isEscaped(markdown, index)) {
      continue;
    }
    switch (markdown[index]) {
      case "[":
        depth += 1;
        break;
      case "]":
        depth -= 1;
        if (depth === 0) {
          return index;
        }
        break;
      default:
        break;
    }
  }
  return -1;
}

function closingDestination(
  markdown: string,
  mask: Uint8Array,
  openingParenthesis: number,
): number {
  let depth = 1;
  for (
    let index = openingParenthesis + 1;
    index < markdown.length;
    index += 1
  ) {
    if (mask[index] !== 0 || isEscaped(markdown, index)) {
      continue;
    }
    switch (markdown[index]) {
      case "(":
        depth += 1;
        break;
      case ")":
        depth -= 1;
        if (depth === 0) {
          return index;
        }
        break;
      default:
        break;
    }
  }
  return -1;
}

function lineIndexAt(lines: ReadonlyArray<Line>, offset: number): number {
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = lines[middle];
    if (line === undefined) {
      break;
    }
    if (offset < line.start) {
      high = middle - 1;
    } else if (offset > line.end) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return Math.max(0, Math.min(low, lines.length - 1));
}

function unescapedPipes(markdown: string, line: Line): ReadonlyArray<number> {
  const pipes: number[] = [];
  for (let index = line.start; index < line.end; index += 1) {
    if (markdown[index] === "|" && !isEscaped(markdown, index)) {
      pipes.push(index);
    }
  }
  return pipes;
}

function tableCellContainer(
  markdown: string,
  line: Line,
  offset: number,
): Readonly<{ start: number; end: number }> | null {
  const pipes = unescapedPipes(markdown, line);
  if (pipes.length === 0) {
    return null;
  }
  const lineSource = markdown.slice(line.start, line.end);
  const firstNonspace =
    line.start + (lineSource.match(/^\s*/u)?.[0].length ?? 0);
  const trimmedEnd =
    line.end - (lineSource.match(/\s*$/u)?.[0].length ?? 0);
  if (pipes[0] !== firstNonspace && pipes[pipes.length - 1] !== trimmedEnd - 1) {
    return null;
  }
  let start = line.start;
  let end = line.end;
  for (const pipe of pipes) {
    if (pipe < offset) {
      start = pipe + 1;
    } else {
      end = pipe;
      break;
    }
  }
  return { start, end };
}

type ListMarker = Readonly<{
  indent: number;
  contentIndent: number;
}>;

function listMarker(line: string): ListMarker | null {
  const match = /^( {0,3})(?:[-+*]|\d+[.)])[ \t]+/u.exec(line);
  return match === null
    ? null
    : { indent: match[1]?.length ?? 0, contentIndent: match[0].length };
}

function listItemContainer(
  markdown: string,
  lines: ReadonlyArray<Line>,
  currentLineIndex: number,
): Readonly<{ start: number; end: number }> | null {
  const current = lines[currentLineIndex];
  if (current === undefined) {
    return null;
  }
  let ownerIndex = currentLineIndex;
  let marker = listMarker(markdown.slice(current.start, current.end));
  if (marker === null) {
    for (let index = currentLineIndex - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (line === undefined) {
        break;
      }
      const source = markdown.slice(line.start, line.end);
      const candidate = listMarker(source);
      if (candidate !== null) {
        marker = candidate;
        ownerIndex = index;
        break;
      }
    }
  }
  if (marker === null) {
    return null;
  }

  let endIndex = ownerIndex;
  for (let index = ownerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const source = markdown.slice(line.start, line.end);
    if (source.trim() === "") {
      continue;
    }
    const candidate = listMarker(source);
    if (candidate !== null && candidate.indent <= marker.indent) {
      break;
    }
    const leadingWhitespace = /^[ \t]*/u.exec(source)?.[0].length ?? 0;
    if (candidate === null && leadingWhitespace < marker.contentIndent) {
      break;
    }
    endIndex = index;
  }
  if (currentLineIndex < ownerIndex || currentLineIndex > endIndex) {
    return null;
  }
  const first = lines[ownerIndex];
  const last = lines[endIndex];
  return first === undefined || last === undefined
    ? null
    : { start: first.start, end: last.end };
}

function isBlockquoteLine(source: string): boolean {
  return /^ {0,3}>/u.test(source) && !/^ {0,3}>[ \t]*$/u.test(source);
}

function blockquoteContainer(
  markdown: string,
  lines: ReadonlyArray<Line>,
  currentLineIndex: number,
): Readonly<{ start: number; end: number }> | null {
  const current = lines[currentLineIndex];
  if (
    current === undefined ||
    !isBlockquoteLine(markdown.slice(current.start, current.end))
  ) {
    return null;
  }
  let firstIndex = currentLineIndex;
  let lastIndex = currentLineIndex;
  while (firstIndex > 0) {
    const previous = lines[firstIndex - 1];
    if (
      previous === undefined ||
      !isBlockquoteLine(markdown.slice(previous.start, previous.end))
    ) {
      break;
    }
    firstIndex -= 1;
  }
  while (lastIndex + 1 < lines.length) {
    const next = lines[lastIndex + 1];
    if (
      next === undefined ||
      !isBlockquoteLine(markdown.slice(next.start, next.end))
    ) {
      break;
    }
    lastIndex += 1;
  }
  const first = lines[firstIndex];
  const last = lines[lastIndex];
  return first === undefined || last === undefined
    ? null
    : { start: first.start, end: last.end };
}

function isParagraphBoundary(source: string): boolean {
  return (
    source.trim() === "" ||
    listMarker(source) !== null ||
    /^ {0,3}>/u.test(source) ||
    /^ {0,3}#{1,6}[ \t]+/u.test(source) ||
    /^ {0,3}(?:`{3,}|~{3,})/u.test(source)
  );
}

function paragraphContainer(
  markdown: string,
  lines: ReadonlyArray<Line>,
  currentLineIndex: number,
): Readonly<{ start: number; end: number }> {
  let firstIndex = currentLineIndex;
  let lastIndex = currentLineIndex;
  while (firstIndex > 0) {
    const previous = lines[firstIndex - 1];
    if (
      previous === undefined ||
      isParagraphBoundary(markdown.slice(previous.start, previous.end))
    ) {
      break;
    }
    firstIndex -= 1;
  }
  while (lastIndex + 1 < lines.length) {
    const next = lines[lastIndex + 1];
    if (
      next === undefined ||
      isParagraphBoundary(markdown.slice(next.start, next.end))
    ) {
      break;
    }
    lastIndex += 1;
  }
  return {
    start: lines[firstIndex]?.start ?? 0,
    end: lines[lastIndex]?.end ?? markdown.length,
  };
}

function surroundingContainer(
  markdown: string,
  lines: ReadonlyArray<Line>,
  offset: number,
): Readonly<{ start: number; end: number }> {
  const currentLineIndex = lineIndexAt(lines, offset);
  const line = lines[currentLineIndex];
  if (line === undefined) {
    return { start: 0, end: markdown.length };
  }
  return (
    tableCellContainer(markdown, line, offset) ??
    listItemContainer(markdown, lines, currentLineIndex) ??
    blockquoteContainer(markdown, lines, currentLineIndex) ??
    paragraphContainer(markdown, lines, currentLineIndex)
  );
}

export function scanMarkdownLinks(
  markdown: string,
): ReadonlyArray<MarkdownLinkSpan> {
  const mask = ignoredRegionMask(markdown);
  const lines = markdownLines(markdown);
  const spans: MarkdownLinkSpan[] = [];

  for (let index = 0; index < markdown.length; index += 1) {
    if (mask[index] !== 0) {
      continue;
    }
    const imageStart =
      markdown[index] === "!" &&
      !isEscaped(markdown, index) &&
      markdown[index + 1] === "[";
    const openingBracket = imageStart ? index + 1 : index;
    if (
      markdown[openingBracket] !== "[" ||
      mask[openingBracket] !== 0 ||
      isEscaped(markdown, openingBracket)
    ) {
      continue;
    }
    if (
      !imageStart &&
      openingBracket > 0 &&
      markdown[openingBracket - 1] === "!" &&
      !isEscaped(markdown, openingBracket - 1)
    ) {
      continue;
    }
    const labelEnd = closingLabel(markdown, mask, openingBracket);
    if (labelEnd === -1 || markdown[labelEnd + 1] !== "(") {
      continue;
    }
    const destinationEnd = closingDestination(
      markdown,
      mask,
      labelEnd + 1,
    );
    if (destinationEnd === -1) {
      continue;
    }
    const start = imageStart ? index : openingBracket;
    const end = destinationEnd + 1;
    const container = surroundingContainer(markdown, lines, start);
    spans.push(
      Object.freeze({
        start,
        end,
        label: markdown.slice(openingBracket + 1, labelEnd),
        destination: markdown.slice(labelEnd + 2, destinationEnd).trim(),
        isImage: imageStart,
        containerStart: container.start,
        containerEnd: container.end,
      }),
    );
    index = destinationEnd;
  }

  return Object.freeze(spans);
}

function markdownHeadingText(value: string): string {
  const withoutInlineLinks = scanMarkdownLinks(value).reduceRight(
    (text, link) =>
      `${text.slice(0, link.start)}${link.label}${text.slice(link.end)}`,
    value,
  );
  return withoutInlineLinks
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/gu, "$1")
    .replace(/<[^>]+>/gu, "")
    .replace(/[`*_~]/gu, "")
    .replace(/\\([\\`*_{}\[\]()#+.!-])/gu, "$1");
}

function githubHeadingSlug(value: string): string {
  return markdownHeadingText(value)
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "")
    .replace(/\s/gu, "-");
}

/** Returns every live GitHub-style heading and explicit HTML anchor with its owning range. */
export function scanMarkdownAnchors(
  markdown: string,
): ReadonlyArray<MarkdownAnchorSpan> {
  const sourceLines = markdownLines(markdown);
  const visible = maskMarkdownIgnoredRegions(markdown);
  const headings = sourceLines.flatMap((line) => {
    const visibleLine = visible.slice(line.start, line.end).replace(/\r$/u, "");
    if (!/^(#{1,6})[ \t]+/u.test(visibleLine)) {
      return [];
    }
    const match = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/u.exec(
      markdown.slice(line.start, line.end).replace(/\r$/u, ""),
    );
    return match === null
      ? []
      : [{ line, level: match[1]?.length ?? 0, base: githubHeadingSlug(match[2] ?? "") }];
  }).filter(({ base }) => base !== "");
  const occurrences = new Map<string, number>();
  const anchors: MarkdownAnchorSpan[] = headings.map((heading, index) => {
    const occurrence = occurrences.get(heading.base) ?? 0;
    occurrences.set(heading.base, occurrence + 1);
    const next = headings.find((candidate, candidateIndex) =>
      candidateIndex > index && candidate.level <= heading.level
    );
    return Object.freeze({
      name: occurrence === 0 ? heading.base : `${heading.base}-${occurrence}`,
      level: heading.level,
      start: heading.line.start,
      end: next?.line.start ?? markdown.length,
    });
  });
  for (const match of visible.matchAll(/<(?:a|h[1-6]|span)\b[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gimu)) {
    const name = match[1];
    if (name === undefined || anchors.some((anchor) => anchor.name === name)) {
      continue;
    }
    anchors.push(Object.freeze({ name, level: 0, start: match.index, end: markdown.length }));
  }
  anchors.sort((left, right) => left.start - right.start);
  return Object.freeze(anchors);
}
