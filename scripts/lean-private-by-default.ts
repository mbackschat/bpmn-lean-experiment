import { leanDeclarations, type LeanDeclaration } from "./lean-fanout.ts";
import { leanCodeWithoutComments, leanHeader } from "./lean-source-analysis.ts";

type LeanSources = ReadonlyArray<Readonly<{ path: string; source: string }>>;

const keywords = ["theorem", "lemma", "def", "abbrev", "structure", "inductive", "class", "opaque", "instance", "example"];

/**
 * Attributes that register a declaration for use that names it nowhere, such as a `simp` lemma another module's
 * `simp` finds, so a source scan cannot tell whether another module needs it.
 */
const registering = /(?<![\w])(?:simp|grind|ext|aesop|instance|default_instance|induction_eliminator|cases_eliminator|app_unexpander|delab|term_elab|command_elab|tactic|macro|csimp|coe|norm_cast|push_cast|refl|symm|trans|gcongr|congr)\b/u;

type Scanned = Readonly<{ declaration: LeanDeclaration; isPublic: boolean; publicText: string }>;

/**
 * The declarations of `current` that are new since `base`, public, and named by no other module of `everyLean`,
 * each as a finding. A public declaration belongs to its module's interface, so adding one rebuilds every module that
 * loads it, while a private one changes only the hidden part (owner decision, 2026-10-29); a declaration therefore
 * starts private until another module names it.
 *
 * A new declaration also stays public when the public text of a public declaration of its own module names it, since
 * Lean rejects a private name there: a statement, or the whole of an `abbrev`, `instance`, `structure`, `inductive`,
 * `class`, `opaque` or exposed `def`. A declaration is new when no declaration of `base` has its full name, so a move
 * between files is not. An instance and a declaration with a registering attribute are exempt. Another module naming
 * the short name counts as a use, which over-approximates use and so never rejects a declaration another module
 * needs.
 */
export function leanPublicAdditions(base: LeanSources, current: LeanSources, everyLean: LeanSources): string[] {
  const existing = new Set(base.flatMap(({ source }) => leanDeclarations(leanCodeWithoutComments(source), keywords))
    .map(({ qualifiedName }) => qualifiedName));
  const code = new Map(everyLean.map(({ path, source }) => [path, leanCodeWithoutComments(source)]));
  return current.flatMap(({ path, source }) => {
    const scanned = scan(leanCodeWithoutComments(source));
    const exempt = ({ declaration }: Scanned) => declaration.keyword === "instance" || registering.test(declaration.attributes);
    const candidates = scanned.filter((entry) => entry.isPublic && entry.declaration.keyword !== "example"
      && !existing.has(entry.declaration.qualifiedName) && !exempt(entry));
    const others = [...code].filter(([other]) => other !== path).map(([, text]) => text);
    const kept = new Set(candidates.filter(({ declaration }) => others.some((text) => names(text, declaration.name))));
    const anchors = scanned.filter((entry) => entry.isPublic && (existing.has(entry.declaration.qualifiedName) || exempt(entry)));
    for (let grew = true; grew;) {
      grew = false;
      for (const candidate of candidates) {
        if (kept.has(candidate)) continue;
        if ([...anchors, ...kept].some((anchor) => anchor !== candidate && names(anchor.publicText, candidate.declaration.name))) {
          kept.add(candidate);
          grew = true;
        }
      }
    }
    return candidates.filter((candidate) => !kept.has(candidate)).map(({ declaration }) =>
      `${path}: ${declaration.qualifiedName} is new and public, but no other module names it; declare it private until one does`);
  });
}

/** Each declaration with whether it is public and the part of it a public declaration shows importers. */
function scan(code: string): Scanned[] {
  const isModule = leanHeader(code).isModule;
  const lines = code.split("\n");
  const found = leanDeclarations(code, keywords);
  return found.map((declaration, index) => {
    const block = lines.slice(declaration.line, found[index + 1]?.line ?? lines.length).join("\n");
    const showsBody = declaration.keyword !== "theorem" && declaration.keyword !== "lemma"
      && (declaration.keyword !== "def" || declaration.inExposedScope || /(?<![\w])expose\b/u.test(declaration.attributes));
    return {
      declaration,
      isPublic: !declaration.isPrivate && (!isModule || declaration.inPublicScope),
      publicText: showsBody ? block : statementOf(block),
    };
  });
}

/** A declaration's text before its top-level `:=`, `where` or first pattern-matching alternative. */
function statementOf(block: string): string {
  let depth = 0;
  for (let at = 0; at < block.length; at += 1) {
    const char = block[at]!;
    if ("([{⦃⟨".includes(char)) depth += 1;
    else if (")]}⦄⟩".includes(char)) depth -= 1;
    else if (depth === 0 && (block.startsWith(":=", at) || /^\n\s*\|/u.test(block.slice(at, at + 200))
      || /^\swhere\b/u.test(block.slice(at, at + 7)))) return block.slice(0, at);
  }
  return block;
}

/**
 * Whether `text` names `name`, alone or as the last component of a qualified name. Lean admits `!` and `?` inside an
 * identifier but not at its start, so one of them continues an identifier only after an identifier character; after
 * anything else it is a prefix operator such as Boolean negation, and the name that follows is named.
 */
function names(text: string, name: string): boolean {
  return new RegExp(`(?<![\\w'])(?<![\\w'?!][?!])${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\w'?!])`, "u").test(text);
}
