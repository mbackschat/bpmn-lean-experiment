import { analyzeLeanSource, leanDeclarationPrefix } from "./lean-source-analysis.ts";

const declarationKinds = [
  "theorem",
  "lemma",
  "def",
  "inductive",
  "structure",
  "abbrev",
  "instance",
  "class",
] as const;

export type LeanDeclarationKind = typeof declarationKinds[number];

/** One module-level declaration, named exactly as written after its keyword (no namespace prefix). */
export type LeanDeclaration = Readonly<{
  kind: LeanDeclarationKind;
  name: string;
}>;

// A declaration starts its line, optionally behind attributes and the pinned declaration modifiers.
// `private` is deliberately excluded: the project reserves private declarations for supporting
// lemmas, so a private name is never a citable guarantee. Anonymous instances have no name to cite
// and do not match.
const declarationLine = new RegExp(
  `^${leanDeclarationPrefix(["private"])}(${
    declarationKinds.join("|")
  })\\s+([^\\s:({\\[⟨]+)`,
  "u",
);

function isDeclarationKind(keyword: string): keyword is LeanDeclarationKind {
  return (declarationKinds as ReadonlyArray<string>).includes(keyword);
}

/**
 * Lists a Lean module's declarations by scanning code lines, with comments and string literals masked.
 *
 * This is a text scan, not elaboration: it sees only declarations that begin a line and cannot expand
 * macros that generate theorems. That is enough to decide whether a documentation link names something
 * the module actually declares.
 */
export function leanDeclarations(source: string): ReadonlyArray<LeanDeclaration> {
  return analyzeLeanSource(source).code.split("\n").flatMap((line) => {
    const [, keyword, name] = declarationLine.exec(line) ?? [];
    return keyword !== undefined && name !== undefined && isDeclarationKind(keyword)
      ? [{ kind: keyword, name }]
      : [];
  });
}

/**
 * Names the module's executable checks: `def name : Bool := decide …`, which the conformance check driver
 * evaluates natively rather than the kernel, so such a check cannot carry a proved claim.
 */
export function leanExecutableChecks(source: string): ReadonlyArray<string> {
  return [...analyzeLeanSource(source).code.matchAll(/^def ([^\s:({\[⟨]+) : Bool := decide\b/gmu)]
    .flatMap(([, name]) => (name === undefined ? [] : [name]));
}
