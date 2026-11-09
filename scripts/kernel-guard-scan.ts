/**
 * The scan vocabulary the kernel guards share (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation):
 * tokenizers for Lean and TypeScript that drop comments and strings, the source tree a guard reads, and the empty-input
 * rule of guard 23: a guard whose input is empty fails, because a renamed directory or type must never read as clean.
 *
 * A guard is a pure function from a `KernelTree` (or from explicit facts) to `string[]` findings, so its seeded test
 * builds a self-contained fixture tree and sees it fail. Guards keep no data file; the only exception mark is a
 * `guard-exception(<number>): <reason>` comment at the site (`isJustified`), as the proposal's guardrails require.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const TokenKind = { Word: "word", Number: "number", String: "string", Punct: "punct" } as const;
export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

export type Token = Readonly<{ kind: TokenKind; text: string; line: number; column: number }>;

export type Source = Readonly<{
  /** Path relative to the tree root, with `/` separators. */
  file: string;
  text: string;
  tokens: readonly Token[];
  comments: ReadonlyMap<number, string>;
  nonblank: number;
}>;

const typeScriptPunctuators = ["===", "!==", "...", "=>", "??", "?.", "==", "!=", "&&", "||", "<=", ">="];
const leanPunctuators = [":=", "=>", "->", "<|", "|>", "..", ":"];

function appendComment(comments: Map<number, string>, line: number, text: string): void {
  comments.set(line, `${comments.get(line) ?? ""} ${text}`.trim());
}

/** Keywords after which a `/` starts a regular expression rather than a division. */
const regexPrecedingWords = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "await", "yield"]);

/** Tokenize TypeScript, keeping string contents as `String` tokens and recording comments per line. */
export function tokenizeTypeScript(text: string): { tokens: Token[]; comments: Map<number, string> } {
  const tokens: Token[] = [];
  const comments = new Map<number, string>();
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const advanceLines = (from: number, to: number): void => {
    for (let k = from; k < to; k += 1) {
      if (text[k] === "\n") { line += 1; lineStart = k + 1; }
    }
  };
  const previousIsValue = (): boolean => {
    const previous = tokens.at(-1);
    if (previous === undefined) return false;
    if (previous.kind === TokenKind.Word) return !regexPrecedingWords.has(previous.text);
    return previous.kind !== TokenKind.Punct || previous.text === ")" || previous.text === "]" || previous.text === "}";
  };
  function scanCode(stop: string | null): void {
    let depth = 0;
    while (i < text.length) {
      const c = text[i] ?? "";
      if (c === "\n") { line += 1; i += 1; lineStart = i; continue; }
      if (/\s/u.test(c)) { i += 1; continue; }
      if (stop !== null && c === stop && depth === 0) return;
      const column = i - lineStart;
      if (c === "/" && text[i + 1] === "/") {
        const end = text.indexOf("\n", i);
        const stopAt = end === -1 ? text.length : end;
        appendComment(comments, line, text.slice(i + 2, stopAt));
        i = stopAt;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        const stopAt = end === -1 ? text.length : end + 2;
        const startLine = line;
        text.slice(i, stopAt).split("\n").forEach((part, offset) => appendComment(comments, startLine + offset, part));
        advanceLines(i, stopAt);
        i = stopAt;
        continue;
      }
      if (c === '"' || c === "'") {
        const start = i;
        i += 1;
        while (i < text.length && text[i] !== c) { if (text[i] === "\\") i += 1; i += 1; }
        tokens.push({ kind: TokenKind.String, text: text.slice(start + 1, i), line, column });
        i += 1;
        continue;
      }
      if (c === "`") {
        const startLine = line;
        i += 1;
        let chunk = "";
        const flush = (): void => {
          if (chunk !== "") tokens.push({ kind: TokenKind.String, text: chunk, line: startLine, column });
          chunk = "";
        };
        while (i < text.length && text[i] !== "`") {
          if (text[i] === "\\") { chunk += text.slice(i, i + 2); advanceLines(i, i + 2); i += 2; continue; }
          if (text[i] === "$" && text[i + 1] === "{") {
            flush();
            i += 2;
            tokens.push({ kind: TokenKind.Punct, text: "{", line, column: i - lineStart });
            scanCode("}");
            tokens.push({ kind: TokenKind.Punct, text: "}", line, column: i - lineStart });
            i += 1;
            continue;
          }
          chunk += text[i];
          if (text[i] === "\n") { line += 1; lineStart = i + 1; }
          i += 1;
        }
        flush();
        i += 1;
        continue;
      }
      if (c === "/" && !previousIsValue()) {
        const start = i;
        i += 1;
        let inClass = false;
        while (i < text.length && (text[i] !== "/" || inClass) && text[i] !== "\n") {
          if (text[i] === "\\") i += 1;
          else if (text[i] === "[") inClass = true;
          else if (text[i] === "]") inClass = false;
          i += 1;
        }
        i += 1;
        while (i < text.length && /[a-z]/iu.test(text[i] ?? "")) i += 1;
        tokens.push({ kind: TokenKind.String, text: text.slice(start, i), line, column });
        continue;
      }
      const word = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(text.slice(i));
      if (word !== null) {
        tokens.push({ kind: TokenKind.Word, text: word[0], line, column });
        i += word[0].length;
        continue;
      }
      const number = /^\d[\d_.]*/u.exec(text.slice(i));
      if (number !== null) {
        tokens.push({ kind: TokenKind.Number, text: number[0], line, column });
        i += number[0].length;
        continue;
      }
      const punctuator = typeScriptPunctuators.find((candidate) => text.startsWith(candidate, i)) ?? c;
      tokens.push({ kind: TokenKind.Punct, text: punctuator, line, column });
      if (punctuator === "{" || punctuator === "(" || punctuator === "[") depth += 1;
      if (punctuator === "}" || punctuator === ")" || punctuator === "]") depth -= 1;
      i += punctuator.length;
    }
  }
  scanCode(null);
  return { tokens, comments };
}

/** Tokenize Lean: a dotted name is one `Word` (`.ctor` keeps its leading dot), comments and strings recorded apart. */
export function tokenizeLean(text: string): { tokens: Token[]; comments: Map<number, string> } {
  const tokens: Token[] = [];
  const comments = new Map<number, string>();
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const wordPattern = /^(?:\.?[\p{L}_«][\p{L}\p{N}_'!?»]*)(?:\.[\p{L}_«][\p{L}\p{N}_'!?»]*)*/u;
  while (i < text.length) {
    const c = text[i] ?? "";
    if (c === "\n") { line += 1; i += 1; lineStart = i; continue; }
    if (/\s/u.test(c)) { i += 1; continue; }
    const column = i - lineStart;
    if (c === "-" && text[i + 1] === "-") {
      const end = text.indexOf("\n", i);
      const stopAt = end === -1 ? text.length : end;
      appendComment(comments, line, text.slice(i + 2, stopAt));
      i = stopAt;
      continue;
    }
    if (c === "/" && text[i + 1] === "-") {
      let depth = 1;
      const start = i;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "-") { depth += 1; i += 2; continue; }
        if (text[i] === "-" && text[i + 1] === "/") { depth -= 1; i += 2; continue; }
        i += 1;
      }
      const startLine = line;
      text.slice(start, i).split("\n").forEach((part, offset) => appendComment(comments, startLine + offset, part));
      for (let k = start; k < i; k += 1) { if (text[k] === "\n") { line += 1; lineStart = k + 1; } }
      continue;
    }
    if (c === '"') {
      const start = i;
      i += 1;
      while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i += 1; i += 1; }
      tokens.push({ kind: TokenKind.String, text: text.slice(start + 1, i), line, column });
      i += 1;
      continue;
    }
    if (c === "'" && text[i + 2] === "'") {
      tokens.push({ kind: TokenKind.String, text: text.slice(i + 1, i + 2), line, column });
      i += 3;
      continue;
    }
    const word = wordPattern.exec(text.slice(i));
    if (word !== null) {
      tokens.push({ kind: TokenKind.Word, text: word[0], line, column });
      i += word[0].length;
      continue;
    }
    const number = /^\d[\d_]*/u.exec(text.slice(i));
    if (number !== null) {
      tokens.push({ kind: TokenKind.Number, text: number[0], line, column });
      i += number[0].length;
      continue;
    }
    const punctuator = leanPunctuators.find((candidate) => text.startsWith(candidate, i)) ?? c;
    tokens.push({ kind: TokenKind.Punct, text: punctuator, line, column });
    i += punctuator.length;
  }
  return { tokens, comments };
}

function sourceOf(file: string, text: string, language: "lean" | "ts"): Source {
  const { tokens, comments } = language === "lean" ? tokenizeLean(text) : tokenizeTypeScript(text);
  return { file, text, tokens, comments, nonblank: text.split("\n").filter((line) => line.trim() !== "").length };
}

function listFiles(root: string, directory: string, extension: string): string[] {
  const full = path.join(root, directory);
  if (!existsSync(full) || !statSync(full).isDirectory()) return [];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(root, relative, extension);
    return entry.name.endsWith(extension) ? [relative] : [];
  }).sort();
}

export type KernelTree = Readonly<{
  root: string;
  /** `Kernel.lean` and `Kernel/**`, the Lean kernel. */
  lean: readonly Source[];
  /** `packages/kernel/src/**`, the TypeScript kernel. */
  typeScript: readonly Source[];
  /** `packages/bpmn-source/src/kernel-reader/**`. */
  reader: readonly Source[];
  /** Plain text of every test file that can carry a refusal test (`packages/kernel/test`, bpmn-source, differential). */
  testFiles: ReadonlyArray<Readonly<{ file: string; text: string }>>;
}>;

/** Read one tree. `root` is the repository for the real scan and a temporary fixture for a guard's seeded test. */
export function loadTree(root: string = repositoryRoot): KernelTree {
  const read = (relative: string, language: "lean" | "ts"): Source =>
    sourceOf(relative, readFileSync(path.join(root, relative), "utf8"), language);
  const lean = [
    ...(existsSync(path.join(root, "Kernel.lean")) ? ["Kernel.lean"] : []),
    ...listFiles(root, "Kernel", ".lean"),
  ].map((file) => read(file, "lean"));
  const typeScript = listFiles(root, "packages/kernel/src", ".ts").map((file) => read(file, "ts"));
  const reader = listFiles(root, "packages/bpmn-source/src/kernel-reader", ".ts").map((file) => read(file, "ts"));
  const testDirectories = ["packages/kernel/test", "packages/bpmn-source/test", "packages/differential/test"];
  const testFiles = testDirectories
    .flatMap((directory) => [...listFiles(root, directory, ".ts"), ...listFiles(root, directory, ".json")])
    .map((file) => ({ file, text: readFileSync(path.join(root, file), "utf8") }));
  return { root, lean, typeScript, reader, testFiles };
}

/**
 * Guard 23 for the pre-existing scans in `kernel-structure.ts`: they return no findings on an empty tree, so the
 * sentinels below make a renamed `Kernel/` or `packages/kernel/src/` fail here instead.
 */
export function structureInputFindings(tree: KernelTree): string[] {
  const has = (sources: readonly Source[], file: string): boolean => sources.some((source) => source.file === file);
  const sentinels: ReadonlyArray<readonly [readonly Source[], string]> = [
    [tree.lean, "Kernel/Step.lean"],
    [tree.lean, "Kernel/IL/Types.lean"],
    [tree.typeScript, "packages/kernel/src/step.ts"],
    [tree.typeScript, "packages/kernel/src/il/types.ts"],
  ];
  return sentinels.flatMap(([sources, file]) => (has(sources, file) ? [] : [emptyInputFinding(23, file)]));
}

/** Guard 23: a guard that read nothing fails rather than reporting a clean tree. */
export function emptyInputFinding(guard: number, what: string): string {
  return `G${guard}: read no ${what}; a renamed module, type or directory must not empty a guard's input`;
}

export function finding(guard: number, source: Readonly<{ file: string }>, line: number, message: string): string {
  return `G${guard} ${source.file}:${line}: ${message}`;
}

/**
 * The proposal's only exception mark: a `guard-exception(<number>): <reason>` comment on the line or the line above,
 * with a reason of at least ten characters, so that a bare tag cannot pass.
 */
export function isJustified(source: Source, line: number, guard: number): boolean {
  const pattern = new RegExp(`guard-exception\\(${guard}\\):\\s*(.{10,})`, "u");
  return [line, line - 1].some((candidate) => pattern.test(source.comments.get(candidate) ?? ""));
}

/** Index one past the token closing the bracket opened at `open` (of any kind); `tokens.length` when unbalanced. */
export function closeOf(tokens: readonly Token[], open: number): number {
  const pairs: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}", "⟨": "⟩" };
  const opener = tokens[open]?.text ?? "";
  const closer = pairs[opener];
  if (closer === undefined) return open + 1;
  let depth = 0;
  for (let i = open; i < tokens.length; i += 1) {
    if (tokens[i]?.kind !== TokenKind.Punct) continue;
    const text = tokens[i]?.text;
    if (text === opener) depth += 1;
    if (text === closer) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return tokens.length;
}

/** `Kernel/Feature/Multi-Instance.lean`-like segments to the normalized pair key of guard 8. */
export function normalizeSegment(segment: string): string {
  return segment.replace(/[-_]/gu, "").toLowerCase();
}

/** A module path under `Kernel/` or `packages/kernel/src/` to its Lean/TypeScript pair key, `null` outside both. */
export function pairKeyOf(file: string): string | null {
  const lean = /^Kernel\/(.*)\.lean$/u.exec(file);
  const typeScript = /^packages\/kernel\/src\/(.*)\.ts$/u.exec(file);
  const relative = lean?.[1] ?? typeScript?.[1];
  if (relative === undefined || relative === "index") return null;
  if (lean !== null && (relative.startsWith("Laws/") || relative.startsWith("Proofs/"))) return null;
  return relative.split("/").map(normalizeSegment).join("/");
}

/** `Kernel.Feature.MultiInstance` to `feature/multi-instance`: the TypeScript path of a Lean module. */
export function leanModuleToTypeScriptPath(moduleName: string): string {
  return moduleName.replace(/^Kernel\./u, "").split(".")
    .map((segment) => segment.replace(/(?<=[a-z0-9])(?=[A-Z])/gu, "-").toLowerCase())
    .join("/");
}

export type LeanDeclaration = Readonly<{
  kind: string;
  name: string;
  /** Namespaces joined with the declared name, e.g. `Kernel.Feature.Flow.gateway`. */
  qualified: string;
  line: number;
  endLine: number;
  tokenStart: number;
  tokenEnd: number;
}>;

const leanDeclarationKinds = new Set(["def", "abbrev", "theorem", "lemma", "instance", "structure", "class", "inductive", "opaque", "example"]);
const leanModifiers = new Set(["private", "public", "protected", "partial", "noncomputable", "unsafe", "nonrec", "meta"]);

/** Top-level Lean declarations by column-zero keyword, with their token and line spans. */
export function leanDeclarations(tokens: readonly Token[]): LeanDeclaration[] {
  const namespaces: string[] = [];
  const headers: Array<Readonly<{ kind: string; name: string; qualified: string; line: number; tokenStart: number }>> = [];
  const boundaries: number[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined || token.column !== 0) continue;
    if (token.text === "namespace") {
      namespaces.push(tokens[i + 1]?.text ?? "");
      boundaries.push(i);
      continue;
    }
    if (token.text === "section") {
      namespaces.push("");
      boundaries.push(i);
      continue;
    }
    if (token.text === "end") {
      namespaces.pop();
      boundaries.push(i);
      continue;
    }
    let cursor = i;
    while (leanModifiers.has(tokens[cursor]?.text ?? "") || (tokens[cursor]?.text === "@" && tokens[cursor + 1]?.text === "[")) {
      cursor = tokens[cursor]?.text === "@" ? closeOf(tokens, cursor + 1) : cursor + 1;
    }
    const keyword = tokens[cursor]?.text ?? "";
    if (!leanDeclarationKinds.has(keyword)) continue;
    const nameToken = tokens[cursor + 1];
    const name = nameToken?.kind === TokenKind.Word ? nameToken.text : "";
    const qualified = [...namespaces.filter((part) => part !== ""), name].filter((part) => part !== "").join(".");
    headers.push({ kind: keyword, name, qualified, line: token.line, tokenStart: i });
    boundaries.push(i);
  }
  return headers.map((header) => {
    const next = boundaries.find((boundary) => boundary > header.tokenStart) ?? tokens.length;
    const lastToken = tokens[next - 1];
    return { ...header, endLine: lastToken?.line ?? header.line, tokenEnd: next };
  });
}

export function isLeanExecutable(file: string): boolean {
  return /^Kernel(?:\.lean$|\/)/u.test(file) && !/^Kernel\/(?:Laws|Proofs)\//u.test(file);
}

export type TypeScriptEnum = Readonly<{ name: string; file: string; line: number; members: ReadonlyMap<string, string> }>;

/** Every `enum` declared in the given TypeScript sources, keyed by name. */
export function typeScriptEnums(sources: readonly Source[]): Map<string, TypeScriptEnum> {
  const enums = new Map<string, TypeScriptEnum>();
  for (const source of sources) {
    const { tokens } = source;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i]?.text !== "enum" || tokens[i + 1]?.kind !== TokenKind.Word || tokens[i + 2]?.text !== "{") continue;
      const close = closeOf(tokens, i + 2);
      const members = new Map<string, string>();
      for (let k = i + 3; k < close - 1; k += 1) {
        const member = tokens[k];
        if (member?.kind !== TokenKind.Word) continue;
        let value = member.text;
        if (tokens[k + 1]?.text === "=") {
          value = tokens[k + 2]?.text ?? value;
          k += 2;
        }
        members.set(member.text, value);
      }
      enums.set(tokens[i + 1]?.text ?? "", { name: tokens[i + 1]?.text ?? "", file: source.file, line: tokens[i]?.line ?? 0, members });
    }
  }
  return enums;
}

/** `Kernel/IL/Types.lean`-relative parser: each `inductive`'s constructor names, with field counts. */
export type LeanConstructor = Readonly<{ name: string; fields: number; line: number }>;

export function leanInductives(source: Source): Map<string, readonly LeanConstructor[]> {
  const inductives = new Map<string, LeanConstructor[]>();
  const { tokens } = source;
  for (const declaration of leanDeclarations(tokens)) {
    if (declaration.kind !== "inductive") continue;
    const constructors: LeanConstructor[] = [];
    for (let i = declaration.tokenStart; i < declaration.tokenEnd; i += 1) {
      if (tokens[i]?.text !== "|" || tokens[i + 1]?.kind !== TokenKind.Word) continue;
      const name = tokens[i + 1]?.text ?? "";
      let cursor = i + 2;
      let fields = 0;
      while (tokens[cursor]?.text === "(" || tokens[cursor]?.text === "{" || tokens[cursor]?.text === "[") {
        const open = tokens[cursor]?.text;
        const close = closeOf(tokens, cursor);
        if (open === "(") {
          const colon = tokens.slice(cursor, close).findIndex((token) => token.text === ":");
          const names = colon === -1 ? 1 : tokens.slice(cursor + 1, cursor + colon).filter((token) => token.kind === TokenKind.Word).length;
          fields += Math.max(names, 1);
        }
        cursor = close;
      }
      if (tokens[cursor]?.text === ":") {
        let k = cursor + 1;
        let depth = 0;
        while (k < declaration.tokenEnd) {
          const text = tokens[k]?.text ?? "";
          if (text === "(" || text === "[" || text === "{") depth += 1;
          if (text === ")" || text === "]" || text === "}") depth -= 1;
          if (depth === 0 && text === "→") fields += 1;
          if (depth === 0 && (text === "|" || text === "deriving")) break;
          k += 1;
        }
      }
      constructors.push({ name, fields, line: tokens[i]?.line ?? declaration.line });
    }
    inductives.set(declaration.name, constructors);
  }
  return inductives;
}

export function allowedByOwner(file: string, allowed: readonly string[]): boolean {
  const key = file.replace(/\.ts$/u, "");
  return allowed.some((module) => key === module || key.startsWith(`${module}/`));
}
