import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type LeanModuleDocument = Readonly<{
  offset: number;
  line: number;
}>;

export type LeanSourceAnalysis = Readonly<{
  code: string;
  moduleDocuments: ReadonlyArray<LeanModuleDocument>;
}>;

const simpleCharacterEscapes = new Set([
  "0",
  "a",
  "b",
  "e",
  "f",
  "n",
  "r",
  "t",
  "v",
  "'",
  '"',
  "\\",
]);

function characterLiteralEnd(source: string, start: number): number | null {
  if (source[start] !== "'") {
    return null;
  }
  const valueStart = start + 1;
  const first = source[valueStart];
  if (first === undefined || first === "\n" || first === "\r" || first === "'") {
    return null;
  }

  let closingQuote: number;
  if (first === "\\") {
    const escapeKind = source[valueStart + 1];
    if (escapeKind === undefined) {
      return null;
    }
    if (simpleCharacterEscapes.has(escapeKind)) {
      closingQuote = valueStart + 2;
    } else {
      const hexadecimalLength =
        escapeKind === "x" ? 2 : escapeKind === "u" ? 4 : escapeKind === "U" ? 8 : 0;
      if (hexadecimalLength === 0) {
        return null;
      }
      const digitsStart = valueStart + 2;
      const digits = source.slice(digitsStart, digitsStart + hexadecimalLength);
      if (
        digits.length !== hexadecimalLength ||
        !/^[0-9A-Fa-f]+$/u.test(digits)
      ) {
        return null;
      }
      closingQuote = digitsStart + hexadecimalLength;
    }
  } else {
    const codePoint = source.codePointAt(valueStart);
    if (codePoint === undefined || first === "\\") {
      return null;
    }
    closingQuote = valueStart + (codePoint > 0xffff ? 2 : 1);
  }

  return source[closingQuote] === "'" ? closingQuote + 1 : null;
}

function masked(text: string): string {
  return text.replace(/[^\r\n]/gu, " ");
}

/**
 * Classifies Lean comments and literals while preserving source offsets and lines.
 *
 * Comment recognition dominates literal recognition. Character literals are
 * masked only after complete token lookahead, so identifier primes remain code.
 */
export function analyzeLeanSource(source: string): LeanSourceAnalysis {
  const moduleDocuments: LeanModuleDocument[] = [];
  const chunks: string[] = [];
  let codeStart = 0;
  let index = 0;
  let line = 1;

  const maskThrough = (end: number): void => {
    chunks.push(source.slice(codeStart, index));
    const classified = source.slice(index, end);
    chunks.push(masked(classified));
    line += (classified.match(/\n/gu) ?? []).length;
    index = end;
    codeStart = end;
  };

  while (index < source.length) {
    const pair = source.slice(index, index + 2);
    if (pair === "--") {
      const newline = source.indexOf("\n", index + 2);
      maskThrough(newline === -1 ? source.length : newline);
      continue;
    }
    if (pair === "/-") {
      if (source.startsWith("/-!", index)) {
        moduleDocuments.push({ offset: index, line });
      }
      let depth = 1;
      let cursor = index + 2;
      while (cursor < source.length && depth > 0) {
        const nestedPair = source.slice(cursor, cursor + 2);
        if (nestedPair === "/-") {
          depth += 1;
          cursor += 2;
        } else if (nestedPair === "-/") {
          depth -= 1;
          cursor += 2;
        } else {
          cursor += 1;
        }
      }
      if (depth !== 0) {
        throw new SyntaxError(`unterminated Lean block comment at line ${line}`);
      }
      maskThrough(cursor);
      continue;
    }
    if (source[index] === '"') {
      let cursor = index + 1;
      let closed = false;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
        } else if (source[cursor] === '"') {
          cursor += 1;
          closed = true;
          break;
        } else {
          cursor += 1;
        }
      }
      if (!closed) {
        throw new SyntaxError(`unterminated Lean string literal at line ${line}`);
      }
      maskThrough(cursor);
      continue;
    }
    if (source[index] === "'") {
      const end = characterLiteralEnd(source, index);
      if (end !== null) {
        maskThrough(end);
        continue;
      }
    }
    if (source[index] === "\n") {
      line += 1;
    }
    index += 1;
  }

  chunks.push(source.slice(codeStart));
  return { code: chunks.join(""), moduleDocuments };
}

/** Tracked and non-ignored pending Lean sources that still exist in the worktree. */
export function worktreeLeanSourceFiles(worktree = "."): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: worktree, encoding: "utf8" },
  )
    .split("\n")
    .filter((sourcePath) => sourcePath.endsWith(".lean"))
    .filter((sourcePath) => existsSync(join(worktree, sourcePath)));
}
