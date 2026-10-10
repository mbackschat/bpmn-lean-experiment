/**
 * Lexical facts about one TypeScript source: what it imports, what file sets it enumerates and which
 * path literals and extension filters surround those enumerations.
 *
 * The facts exist so `what-binds` can tell a guard that constrains a path from one whose text merely
 * contains a directory word. They are read from source text by a small lexer rather than a parser:
 * import specifiers and enumeration calls need only string, comment and call syntax, and the
 * planning report must run in about a second over the whole tree. Package aliases such as
 * `@bpmn-lean/semantic-core` are not followed, because resolving them needs manifests this module
 * does not read.
 */

import path from "node:path";

import { compareCanonicalStrings } from "../packages/semantic-core/src/wire.ts";

export type CorpusFile = Readonly<{
  path: string;
  text: string;
}>;

export const EnumerationKind = {
  GitListing: "git ls-files",
  DirectoryRead: "directory read",
  Glob: "glob",
} as const;

export type EnumerationKind = typeof EnumerationKind[keyof typeof EnumerationKind];

export type Enumeration = Readonly<{
  kind: EnumerationKind;
  /** Explicit selection; empty when the scope comes from the surrounding path literals. */
  pathspecs: ReadonlyArray<string>;
  /** Offset in the source, used to attribute the enumeration to its enclosing declaration. */
  position: number;
}>;

export type ImportEdge = Readonly<{
  /** The imported module as a repository-relative path. */
  path: string;
  /** The imported names, or `null` when the whole module is reachable (namespace or dynamic import). */
  names: ReadonlySet<string> | null;
}>;

export type SourceFacts = Readonly<{
  imports: ReadonlyArray<ImportEdge>;
  enumerations: ReadonlyArray<Enumeration>;
  /** Enumerations a caller reaches by importing one exported name, through same-file calls. */
  exportedEnumerations: ReadonlyMap<string, ReadonlyArray<Enumeration>>;
  /** Path-like literals, resolved against the file's directory when relative. */
  scopeLiterals: ReadonlyArray<string>;
  /** Extensions the file filters on, such as `lean` for `.endsWith(".lean")`. */
  extensionTokens: ReadonlySet<string>;
}>;

// ---------------------------------------------------------------------------------------------
// Lexing
// ---------------------------------------------------------------------------------------------

type Literal = Readonly<{ value: string; start: number; end: number }>;

type Lexed = Readonly<{
  /** The source with comment text and string contents blanked, so call syntax can be matched safely. */
  skeleton: string;
  literals: ReadonlyArray<Literal>;
}>;

function lineEnd(source: string, from: number): number {
  const newline = source.indexOf("\n", from);
  return newline === -1 ? source.length : newline;
}

/** Index just after the closing quote, or just before the newline of an unterminated string. */
function stringEnd(source: string, open: number): number {
  const quote = source.charAt(open);
  for (let index = open + 1; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "\\") {
      index += 1;
    } else if (char === quote) {
      return index + 1;
    } else if (char === "\n" && quote !== "`") {
      return index;
    }
  }
  return source.length;
}

/**
 * A template's dynamic parts become `*`, so `${tree}/src` stays usable as a pathspec; a leading
 * dynamic part becomes `**` because it is usually a root that may or may not add directories.
 */
function templateValue(raw: string): string {
  const value = raw.replace(/\$\{[^}]*\}/gu, "*");
  return value.startsWith("*/") ? `*${value}` : value;
}

function blank(chars: string[], from: number, to: number): void {
  for (let index = from; index < to; index += 1) {
    if (chars[index] !== "\n") {
      chars[index] = " ";
    }
  }
}

/**
 * One pass that separates code from comments and string contents. Regular-expression literals are
 * not recognised, so a quote inside one can swallow the rest of its line; the cost is a missed
 * literal, never an invented one.
 */
function lex(source: string): Lexed {
  // UTF-16 units, not code points, so offsets stay aligned with the source string's own indices.
  const skeleton = source.split("");
  const literals: Literal[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    if (char === "/" && next === "/") {
      const end = lineEnd(source, index);
      blank(skeleton, index, end);
      index = end;
    } else if (char === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(skeleton, index, end);
      index = end;
    } else if (char === "\"" || char === "'" || char === "`") {
      const end = stringEnd(source, index);
      const closed = end > index + 1 && source.charAt(end - 1) === char;
      const raw = source.slice(index + 1, closed ? end - 1 : end);
      literals.push({
        value: char === "`" ? templateValue(raw) : raw,
        start: index,
        end,
      });
      blank(skeleton, index + 1, closed ? end - 1 : end);
      index = end;
    } else {
      index += 1;
    }
  }
  return { skeleton: skeleton.join(""), literals };
}

// ---------------------------------------------------------------------------------------------
// Path specifications
// ---------------------------------------------------------------------------------------------

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function directoryPrefixes(target: string): ReadonlyArray<string> {
  const segments = target.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function globPattern(spec: string): RegExp {
  let source = "";
  let index = 0;
  while (index < spec.length) {
    const char = spec.charAt(index);
    if (char === "*") {
      let end = index;
      while (spec.charAt(end) === "*") end += 1;
      const wholeSegments = end - index >= 2 && spec.charAt(end) === "/";
      source += wholeSegments ? "(?:.*/)?" : ".*";
      index = wholeSegments ? end + 1 : end;
    } else {
      source += char === "?" ? "." : escapeRegExp(char);
      index += 1;
    }
  }
  return new RegExp(`^${source}$`, "u");
}

/**
 * Whether a git-style pathspec selects the target or one of its directories. A wildcard crosses
 * directory separators, as it does for git, which makes a node glob over-report slightly.
 */
export function pathspecCovers(spec: string, target: string): boolean {
  const normalized = spec.replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (normalized.length === 0) {
    return false;
  }
  const prefixes = directoryPrefixes(target);
  if (!/[*?]/u.test(normalized)) {
    return prefixes.includes(normalized);
  }
  const pattern = globPattern(normalized);
  return prefixes.some((prefix) => pattern.test(prefix));
}

// ---------------------------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------------------------

const fromTailPattern = /\bfrom\s*$/u;
const dynamicImportTailPattern = /\bimport\s*\(?\s*$/u;
const identifierPattern = /[A-Za-z_$][\w$]*/gu;

function resolveSpecifier(importer: string, specifier: string): string {
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier),
  );
  // Compiled packages import `./x.js` for the `x.ts` they are built from.
  return resolved.endsWith(".js") ? `${resolved.slice(0, -3)}.ts` : resolved;
}

/** The names a `import { a, b as c } from` clause brings in, or `null` for anything wider. */
function importedNames(skeleton: string, specifierStart: number): ReadonlySet<string> | null {
  const window = skeleton.slice(Math.max(0, specifierStart - 2000), specifierStart);
  const from = fromTailPattern.exec(window);
  if (from === null) {
    return null;
  }
  const before = window.slice(0, from.index);
  const keyword = [...before.matchAll(/\b(?:import|export)\b/gu)].at(-1);
  const clause = keyword === undefined ? before : before.slice(keyword.index);
  const braces = /\{([^}]*)\}/u.exec(clause);
  if (braces?.[1] === undefined) {
    return null;
  }
  const names = braces[1].match(identifierPattern) ?? [];
  return new Set(names.filter((name) => name !== "type" && name !== "as"));
}

/** Two imports of one module combine; either being wider than a name list makes the union wide. */
function mergedNames(
  left: ReadonlySet<string> | null,
  right: ReadonlySet<string> | null,
): ReadonlySet<string> | null {
  return left === null || right === null ? null : new Set([...left, ...right]);
}

function importEdges(file: string, lexed: Lexed): ReadonlyArray<ImportEdge> {
  const edges = new Map<string, ImportEdge>();
  for (const { value, start } of lexed.literals) {
    if (!value.startsWith("./") && !value.startsWith("../")) {
      continue;
    }
    const tail = lexed.skeleton.slice(Math.max(0, start - 24), start);
    if (!fromTailPattern.test(tail) && !dynamicImportTailPattern.test(tail)) {
      continue;
    }
    const resolved = resolveSpecifier(file, value);
    const names = importedNames(lexed.skeleton, start);
    const known = edges.get(resolved);
    edges.set(resolved, {
      path: resolved,
      names: known === undefined ? names : mergedNames(known.names, names),
    });
  }
  return [...edges.values()].sort((left, right) => compareCanonicalStrings(left.path, right.path));
}

// ---------------------------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------------------------

/**
 * The pathspec arguments of every `git ls-files` array in the file.
 *
 * The call is recognised by its `"ls-files"` element, and its arguments are the literals up to the
 * array's closing bracket. Arguments after `--` are pathspecs; without `--` every non-option
 * literal is one.
 */
function gitListings(source: string, literals: ReadonlyArray<Literal>): ReadonlyArray<Enumeration> {
  return literals.flatMap((literal, index): ReadonlyArray<Enumeration> => {
    if (literal.value !== "ls-files") {
      return [];
    }
    const args: string[] = [];
    let previousEnd = literal.end;
    for (const following of literals.slice(index + 1)) {
      if (source.slice(previousEnd, following.start).includes("]")) {
        break;
      }
      args.push(following.value);
      previousEnd = following.end;
    }
    const separator = args.indexOf("--");
    const pathspecs = separator === -1
      ? args.filter((arg) => !arg.startsWith("-"))
      : args.slice(separator + 1);
    return [{ kind: EnumerationKind.GitListing, pathspecs, position: literal.start }];
  });
}

function callEnumerations(skeleton: string): ReadonlyArray<Enumeration> {
  const calls: ReadonlyArray<readonly [EnumerationKind, RegExp]> = [
    [EnumerationKind.DirectoryRead, /\b(?:readdir|readdirSync|opendir|opendirSync)\s*\(/gu],
    [EnumerationKind.Glob, /\b(?:glob|globSync)\s*\(/gu],
  ];
  return calls.flatMap(([kind, pattern]) =>
    [...skeleton.matchAll(pattern)].map((match) => ({
      kind,
      pathspecs: [],
      position: match.index,
    }))
  );
}

// ---------------------------------------------------------------------------------------------
// Declarations: which exported name reaches which enumeration
// ---------------------------------------------------------------------------------------------

type Declaration = Readonly<{
  name: string;
  exported: boolean;
  start: number;
  end: number;
}>;

const declarationPattern =
  /^(export\s+)?(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/gmu;

/** Column-zero declarations; a declaration spans until the next one, which suits formatted source. */
function declarationsOf(skeleton: string): ReadonlyArray<Declaration> {
  const heads = [...skeleton.matchAll(declarationPattern)];
  return heads.flatMap((head, index): ReadonlyArray<Declaration> => {
    const name = head[2];
    return name === undefined
      ? []
      : [{
        name,
        exported: head[1] !== undefined,
        start: head.index,
        end: heads[index + 1]?.index ?? skeleton.length,
      }];
  });
}

/**
 * Enumerations reachable from each exported name: those inside its own declaration plus those of
 * every same-file declaration it references, transitively. This is what lets a guard that imports
 * one pure helper from a module that also happens to enumerate files avoid inheriting the enumeration.
 */
function exportedEnumerationsOf(
  skeleton: string,
  enumerations: ReadonlyArray<Enumeration>,
): ReadonlyMap<string, ReadonlyArray<Enumeration>> {
  const declarations = declarationsOf(skeleton);
  const byName = new Map(declarations.map((declaration) => [declaration.name, declaration]));
  const references = new Map<Declaration, ReadonlyArray<string>>();
  const referenced = (declaration: Declaration): ReadonlyArray<string> => {
    const known = references.get(declaration);
    if (known !== undefined) {
      return known;
    }
    const names = [
      ...new Set(skeleton.slice(declaration.start, declaration.end).match(identifierPattern) ?? []),
    ].filter((name) => name !== declaration.name && byName.has(name));
    references.set(declaration, names);
    return names;
  };
  const reachable = (root: Declaration): ReadonlySet<Declaration> => {
    const seen = new Set<Declaration>([root]);
    const pending = [root];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      for (const name of referenced(next)) {
        const callee = byName.get(name);
        if (callee !== undefined && !seen.has(callee)) {
          seen.add(callee);
          pending.push(callee);
        }
      }
    }
    return seen;
  };
  return new Map(
    declarations
      .filter(({ exported }) => exported)
      .map((declaration) => {
        const spans = [...reachable(declaration)];
        return [
          declaration.name,
          enumerations.filter(({ position }) =>
            spans.some(({ start, end }) => position >= start && position < end)
          ),
        ] as const;
      }),
  );
}

// ---------------------------------------------------------------------------------------------
// Scope: path literals and extension filters
// ---------------------------------------------------------------------------------------------

const pathLikePattern = /^(?:\.{1,2}\/)*[\w@+.\-*?][\w@+.\-*?/]*$/u;

function scopeLiteral(value: string, directory: string): string | null {
  if (!pathLikePattern.test(value) || !/[A-Za-z0-9]/u.test(value)) {
    return null;
  }
  if (!value.startsWith("./") && !value.startsWith("../")) {
    return value;
  }
  const resolved = path.posix.normalize(path.posix.join(directory, value));
  return resolved.startsWith("..") ? null : resolved;
}

function extensionTokensOf(lexed: Lexed): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const { value } of lexed.literals) {
    const quoted = /^\.([A-Za-z0-9]+)$/u.exec(value);
    if (quoted?.[1] !== undefined) tokens.add(quoted[1]);
  }
  for (const match of lexed.skeleton.matchAll(/\\\.([A-Za-z0-9]+)\$/gu)) {
    if (match[1] !== undefined) tokens.add(match[1]);
  }
  return tokens;
}

function sourceFactsOf(file: CorpusFile): SourceFacts {
  const lexed = lex(file.text);
  const directory = path.posix.dirname(file.path);
  const enumerations = [
    ...gitListings(file.text, lexed.literals),
    ...callEnumerations(lexed.skeleton),
  ];
  return {
    imports: importEdges(file.path, lexed),
    enumerations,
    exportedEnumerations: exportedEnumerationsOf(lexed.skeleton, enumerations),
    scopeLiterals: lexed.literals.flatMap(({ value }) => {
      const scope = scopeLiteral(value, directory);
      return scope === null ? [] : [scope];
    }),
    extensionTokens: extensionTokensOf(lexed),
  };
}

// ---------------------------------------------------------------------------------------------
// Corpus index
// ---------------------------------------------------------------------------------------------

const typeScriptModulePattern = /\.(?:ts|tsx|mts)$/u;

/** A TypeScript source that can take part in an import chain, guard or not. */
export function isImportGraphModule(candidate: string): boolean {
  return typeScriptModulePattern.test(candidate);
}

/** Lazily analysed corpus: only files an import chain or a guard reaches are ever lexed. */
export type CorpusIndex = Readonly<{
  facts(path: string): SourceFacts | undefined;
}>;

const indexes = new WeakMap<ReadonlyArray<CorpusFile>, CorpusIndex>();

/** Memoised per corpus array, so every target of one command shares a single analysis. */
export function indexCorpus(corpus: ReadonlyArray<CorpusFile>): CorpusIndex {
  const cached = indexes.get(corpus);
  if (cached !== undefined) {
    return cached;
  }
  const files = new Map(corpus.map((file) => [file.path, file]));
  const analysed = new Map<string, SourceFacts>();
  const index: CorpusIndex = {
    facts: (filePath) => {
      const known = analysed.get(filePath);
      if (known !== undefined) {
        return known;
      }
      const file = files.get(filePath);
      if (file === undefined || !isImportGraphModule(file.path)) {
        return undefined;
      }
      const computed = sourceFactsOf(file);
      analysed.set(filePath, computed);
      return computed;
    },
  };
  indexes.set(corpus, index);
  return index;
}
