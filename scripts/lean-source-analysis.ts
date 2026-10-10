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
  literalRanges: ReadonlyArray<{ start: number; end: number }>;
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
  const literalRanges: Array<{ start: number; end: number }> = [];
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
      literalRanges.push({ start: index, end: cursor });
      maskThrough(cursor);
      continue;
    }
    if (source[index] === "'") {
      const end = characterLiteralEnd(source, index);
      if (end !== null) {
        literalRanges.push({ start: index, end });
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
  return { code: chunks.join(""), moduleDocuments, literalRanges };
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

/** AA-25's direct `E = expected` pattern, where a visible zero-argument alias defines `expected := E`.
 * This masked text scan recognizes identifier applications, not arbitrary Lean propositions. */
export function leanSelfComparisons(sources: ReadonlyArray<{ path: string; source: string }>):
    Array<{ path: string; line: number; theorem: string; alias: string }> {
  const declarations = sources.flatMap(({ path, source }) => {
    const { code, literalRanges } = analyzeLeanSource(source);
    const commands = [...code.matchAll(/^[\t ]*(?:@\[[^\]\n]*\]\s*)*(?:(?:private|protected|noncomputable|partial)\s+)*(namespace|section|end|open|def|abbrev|theorem|lemma|inductive|structure|instance|class)(?:[\t ]+([^\s:({\[]+))?(?=[\t \r\n:({\[]|$)/gmu)];
    let namespaces: string[] = [];
    let opened: string[] = [];
    const scopes: Array<{ namespaces: string[]; opened: string[] }> = [];
    return commands.flatMap((command, index) => {
      const [, kind, name] = command;
      if (kind === "namespace" || kind === "section") {
        scopes.push({ namespaces: [...namespaces], opened: [...opened] });
        if (kind === "namespace" && name !== undefined) namespaces.push(name);
        return [];
      }
      if (kind === "end") {
        const scope = scopes.pop();
        if (scope !== undefined) ({ namespaces, opened } = scope);
        return [];
      }
      if (kind === "open") { opened.push(name!); return []; }
      if (name === undefined) return [];
      const start = command.index! + command[0].length;
      const end = commands[index + 1]?.index ?? code.length;
      const body = code.slice(start, end);
      const assignment = body.indexOf(":=");
      if (assignment < 0) return [];
      return [{ path, name: name!, kind, namespace: namespaces.join("."), opened: [...opened],
        line: code.slice(0, command.index).split("\n").length,
        header: body.slice(0, assignment), value: body.slice(assignment + 2).trim(),
        headerContainsLiteral: literalRanges.some((literal) => literal.start >= start && literal.start < start + assignment),
        valueContainsLiteral: literalRanges.some((literal) => literal.start >= start + assignment + 2 && literal.start < end) }];
    });
  });
  const application = /^[A-Za-z_][A-Za-z0-9_'.?]*(?:\s+[A-Za-z_][A-Za-z0-9_'.?]*)+$/u;
  const normalized = (value: string) => value.replace(/\s+/gu, " ").trim();
  const aliases = declarations.filter((declaration) =>
    ["def", "abbrev"].includes(declaration.kind!) && /^\s*:/u.test(declaration.header) &&
    application.test(declaration.value) && !declaration.valueContainsLiteral);
  return declarations.flatMap((declaration) => {
    if (!["theorem", "lemma"].includes(declaration.kind!)) return [];
    const equality = /^\s*:\s*([^=]+?)\s*=\s*([A-Za-z_][A-Za-z0-9_'.?]*)\s*$/u.exec(declaration.header);
    if (equality === null || declaration.headerContainsLiteral || !application.test(normalized(equality[1]!))) return [];
    const prefixes = declaration.namespace.split(".").map((_, index, parts) => parts.slice(0, index + 1).join("."));
    const visible = new Set([equality[2]!, ...[...prefixes, ...declaration.opened].map((prefix) => `${prefix}.${equality[2]}`)]);
    return aliases.some((alias) => visible.has([alias.namespace, alias.name].filter(Boolean).join(".")) &&
      normalized(alias.value) === normalized(equality[1]!))
      ? [{ path: declaration.path, line: declaration.line, theorem: declaration.name, alias: equality[2]! }]
      : [];
  });
}
