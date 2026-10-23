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
  commentRanges: ReadonlyArray<{ start: number; end: number }>;
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
  const commentRanges: Array<{ start: number; end: number }> = [];
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
      const end = newline === -1 ? source.length : newline;
      commentRanges.push({ start: index, end });
      maskThrough(end);
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
      commentRanges.push({ start: index, end: cursor });
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
  return { code: chunks.join(""), moduleDocuments, literalRanges, commentRanges };
}

/**
 * The source with every comment form removed, including module and declaration
 * documents, and with trailing whitespace and blank lines dropped.
 *
 * Literals and indentation stay, because they are elaboration input. This is the
 * text [the cost record](./lean-module-cost.ts) binds, so a comment repair does
 * not invalidate a memory measurement of unchanged code.
 */
export function leanCodeWithoutComments(source: string): string {
  const kept: string[] = [];
  let cursor = 0;
  for (const { start, end } of analyzeLeanSource(source).commentRanges) {
    kept.push(source.slice(cursor, start));
    cursor = end;
  }
  kept.push(source.slice(cursor));
  return kept.join("").split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0).join("\n");
}

/** One import of a Lean header, with the module-system modifiers that decide its visibility. */
export type LeanImport = Readonly<{
  module: string;
  line: number;
  isPublic: boolean;
  isMeta: boolean;
  importsAll: boolean;
}>;

export type LeanHeader = Readonly<{
  isModule: boolean;
  imports: ReadonlyArray<LeanImport>;
  /** Offset just past the header's last token, or 0 for an empty header. */
  endOffset: number;
}>;

const leanModuleName = /^[\p{L}_][\p{L}\p{N}_']*(?:\.[\p{L}_][\p{L}\p{N}_']*)*$/u;
const leanHeaderKeywords = new Set(["module", "prelude", "public", "meta", "import", "all"]);
const lateHeaderForm = /^[ \t]*(?:(?:public|meta)\s+)*import\b|^[ \t]*(?:module|prelude)[ \t]*$/mu;

/**
 * The header of a Lean file under the pinned toolchain's grammar (Lean v4.34.1,
 * `src/lean/Lean/Parser/Module/Syntax.lean`): an optional `module`, an optional `prelude`, then
 * `[public] [meta] import [all] <ident>` imports.
 *
 * Every guard that reads imports goes through this parser, so the module system's forms cannot hide a
 * build edge from one of them. Anything that looks like a header form but falls outside the grammar
 * throws a `SyntaxError` instead of being skipped: a quoted or missing module name, a modifier after
 * `import`, trailing tokens on an import line, or an import, `module` or `prelude` after the header.
 */
export function leanHeader(source: string): LeanHeader {
  const code = analyzeLeanSource(source).code;
  const tokens = [...code.matchAll(/\S+/gu)].map((match) => ({ text: match[0], offset: match.index }));
  const lineOf = (offset: number) => code.slice(0, offset).split("\n").length;
  let index = 0;
  const accept = (word: string): boolean => {
    if (tokens[index]?.text !== word) return false;
    index += 1;
    return true;
  };
  const isModule = accept("module");
  accept("prelude");
  let endOffset = index === 0 ? 0 : tokens[index - 1]!.offset + tokens[index - 1]!.text.length;
  const imports: LeanImport[] = [];
  for (;;) {
    const start = index;
    const isPublic = accept("public");
    const isMeta = accept("meta");
    if (!accept("import")) {
      index = start;
      break;
    }
    const line = lineOf(tokens[start]!.offset);
    const importsAll = accept("all");
    const name = tokens[index];
    const nameEnd = name === undefined ? code.length : name.offset + name.text.length;
    if (name === undefined || !leanModuleName.test(name.text) || leanHeaderKeywords.has(name.text) ||
      !/^[ \t]*(?:\n|$)/u.test(code.slice(nameEnd))) {
      throw new SyntaxError(`unrecognized Lean import form at line ${line}`);
    }
    index += 1;
    endOffset = nameEnd;
    imports.push({ module: name.text, line, isPublic, isMeta, importsAll });
  }
  const late = lateHeaderForm.exec(code.slice(endOffset));
  if (late !== null) {
    throw new SyntaxError(`Lean header form after the header at line ${lineOf(endOffset + late.index)}`);
  }
  return { isModule, imports, endOffset };
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

/** AA-26's complete wait occurrence key: instance, element/task, and activation.
 * Match the predicate shape in masked code; owner/definition-only lookups have different keys. */
export function inlineWaitIdentityLookups(path: string, source: string):
  ReadonlyArray<{ path: string; line: number; predicate: string }> {
  const code = analyzeLeanSource(source).code;
  const identifier = String.raw`[A-Za-z_][\w']*(?:\.[A-Za-z_][\w']*)*`;
  const operand = String.raw`(?:${identifier}|⟨\s*${identifier}\s*⟩)`;
  const comparison = (field: string, projection: string): string => {
    const selected = String.raw`\k<wait>\.${projection}${field}`;
    return String.raw`(?:decide\s*\(\s*)?(?:${selected}\s*(?:==|=)\s*${operand}|${operand}\s*(?:==|=)\s*${selected})\s*\)?`;
  };
  const fields = ["processInstanceId", String.raw`(?:task\.id|elementId)(?:\.value)?`, "activation"];
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const predicates = ["", String.raw`wait\.`].flatMap(projection =>
    orders.map(order => order.map(index => comparison(fields[index]!, projection)).join(String.raw`\s*(?:&&|∧)\s*`)));
  const pattern = new RegExp(
    String.raw`fun\s+\(?(?<wait>[A-Za-z_][\w']*)\s*(?::\s*(?:UserTaskWait|MessageWait|TimerWait|EffectWait))?\s*\)?\s*=>\s*(?:decide\s*\(\s*)?` +
      `(?:${predicates.join("|")})`,
    "gu",
  );
  return [...code.matchAll(pattern)].map((match) => ({
    path,
    line: source.slice(0, match.index).split("\n").length,
    predicate: source.slice(match.index, match.index + match[0].length),
  }));
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
      if (kind === "open") {
        const lineEnd = code.indexOf("\n", command.index!);
        const opening = code.slice(command.index!, lineEnd < 0 ? code.length : lineEnd);
        const names = /^[\t ]*open[\t ]+([A-Za-z_][A-Za-z0-9_'.?]*(?:[\t ]+[A-Za-z_][A-Za-z0-9_'.?]*)*)[\t ]*$/u
          .exec(opening)?.[1]?.split(/[\t ]+/u);
        const ordinary = names !== undefined && !names.some((item) => ["scoped", "hiding", "renaming"].includes(item));
        opened.push(...(ordinary ? names : name === undefined ? [] : [name]));
        return [];
      }
      if (name === undefined) return [];
      const start = command.index! + command[0].length;
      const end = commands[index + 1]?.index ?? code.length;
      const body = code.slice(start, end);
      const assignment = body.indexOf(":=");
      const headerEnd = assignment < 0 ? body.length : assignment;
      return [{ path, name: name!, kind, namespace: namespaces.join("."), opened: [...opened],
        line: code.slice(0, command.index).split("\n").length,
        header: body.slice(0, headerEnd), value: assignment < 0 ? "" : body.slice(assignment + 2).trim(),
        headerContainsLiteral: literalRanges.some((literal) => literal.start >= start && literal.start < start + headerEnd),
        valueContainsLiteral: assignment >= 0 && literalRanges.some((literal) => literal.start >= start + assignment + 2 && literal.start < end) }];
    });
  });
  const application = /^[A-Za-z_][A-Za-z0-9_'.?]*(?:\s+[A-Za-z_][A-Za-z0-9_'.?]*)+$/u;
  const normalized = (value: string) => value.replace(/\s+/gu, " ").trim();
  const aliases = declarations.filter((declaration) =>
    ["def", "abbrev"].includes(declaration.kind!) && /^\s*:/u.test(declaration.header) &&
    application.test(declaration.value) && !declaration.valueContainsLiteral);
  const qualifiedName = (declaration: typeof declarations[number]) =>
    [declaration.namespace, declaration.name].filter(Boolean).join(".");
  const declaredNames = new Map<string, Array<typeof declarations[number]>>();
  for (const declaration of declarations) {
    const name = qualifiedName(declaration);
    const named = declaredNames.get(name) ?? [];
    named.push(declaration);
    declaredNames.set(name, named);
  }
  return declarations.flatMap((declaration) => {
    if (!["theorem", "lemma"].includes(declaration.kind!)) return [];
    const equality = /^\s*:\s*([^=]+?)\s*=\s*([A-Za-z_][A-Za-z0-9_'.?]*)\s*$/u.exec(declaration.header);
    if (equality === null || declaration.headerContainsLiteral || !application.test(normalized(equality[1]!))) return [];
    const prefixes = declaration.namespace.split(".").filter(Boolean)
      .map((_, index, parts) => parts.slice(0, index + 1).join(".")).reverse();
    const introduced = (named: typeof declarations[number]) =>
      named.path !== declaration.path || named.line < declaration.line;
    const nearest = [...prefixes.map((prefix) => `${prefix}.${equality[2]}`), equality[2]!]
      .find((name) => declaredNames.get(name)?.some(introduced));
    const visible = new Set(nearest === undefined
      ? declaration.opened.map((prefix) => `${prefix}.${equality[2]}`) : [nearest]);
    return aliases.some((alias) => introduced(alias) && visible.has(qualifiedName(alias)) &&
      normalized(alias.value) === normalized(equality[1]!))
      ? [{ path: declaration.path, line: declaration.line, theorem: declaration.name, alias: equality[2]! }]
      : [];
  });
}
