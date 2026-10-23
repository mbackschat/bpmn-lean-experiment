/**
 * Static unfolding sites of one Lean definition, for `what-binds --unfolds`.
 *
 * Changing a definition's body breaks the proofs that unfold it, and Lake skips every dependent of a
 * failed module, so complete builds surface those proofs one import layer at a time: five labelled
 * builds did so for one changed definition on 2026-10-21 ([Finding 75](../docs/PROCESS-ASSESSMENT-LEDGER.md#finding-75)).
 * Listing the sites first lets the root repair them all before the first dependent build.
 *
 * A site names the definition, or a definition whose body calls it directly, inside an `unfold` or
 * `delta` argument line, inside the bracketed lemma list of a rewriting or simplifying tactic, or as one
 * of its generated equation lemmas. Direct callers count because unfolding one exposes the changed body:
 * most proofs the 2026-10-21 corrections repaired named a caller such as `ordinaryExecutionFrontier`,
 * not the changed definition. A caller's caller exposes only the caller, which a proof must name in turn
 * unless it is a simp lemma; following callers transitively listed 12,576 sites for that definition. Kernel reduction by `decide` also unfolds definitions but names nothing,
 * so it stays invisible here; the import graph, not this report, finds those consumers. Names are
 * matched by their last component, so an unrelated declaration with the same name over-reports.
 */
import { compareCanonicalStrings } from "../packages/semantic-core/src/wire.ts";
import { analyzeLeanSource, leanDeclarationPrefix } from "./lean-source-analysis.ts";

const identifier = /(?<![\p{L}\p{N}_'?!.])(?:[\p{L}_][\p{L}\p{N}_'?!]*\.)*[\p{L}_][\p{L}\p{N}_'?!]*/gu;
const equationLemma = /\.(?:eq_def|eq_unfold|eq_\d+)$/u;
const definitionHeader = new RegExp(`^${leanDeclarationPrefix()}(?:def|abbrev)\\s+(\\S+)`, "gmu");
const argumentLine = /\b(unfold|delta)\b([^\n]*)/gu;
const lemmaList = /\b(simp_all|simpa|simp|dsimp|rwa|erw|rw)\??(?:\s+only)?\s*\[([^\]]*)\]/gu;

function ownName(name: string): string {
  return name.split(".").at(-1)!;
}

/** Own names of the identifiers in `text`, with each one's offset. */
function identifiers(text: string): ReadonlyArray<Readonly<{ name: string; offset: number }>> {
  return [...text.matchAll(identifier)].map((match) => ({ name: match[0], offset: match.index }));
}

/** The declaration mapped to `null`, and each definition whose body calls it mapped to itself. */
function unfoldingNames(codes: ReadonlyArray<string>, declaration: string): ReadonlyMap<string, string | null> {
  const callers = new Map<string, Set<string>>();
  for (const code of codes) {
    for (const header of code.matchAll(definitionHeader)) {
      const bodyStart = header.index + header[0].length;
      const next = /\n(?=\S)/u.exec(code.slice(bodyStart));
      const body = code.slice(bodyStart, next === null ? code.length : bodyStart + next.index);
      const caller = ownName(header[1]!);
      for (const { name } of identifiers(body)) {
        const callee = ownName(name);
        if (!callers.has(callee)) callers.set(callee, new Set());
        callers.get(callee)!.add(caller);
      }
    }
  }
  const target = ownName(declaration);
  return new Map<string, string | null>([
    ...[...callers.get(target) ?? []].filter((caller) => caller !== target).map((caller) => [caller, caller] as const),
    [target, null],
  ]);
}

/** `<path>:<line> <tactic>[ via <caller>]` for each unfolding site, in path and line order. */
export function leanUnfoldingSites(
  sources: ReadonlyArray<Readonly<{ path: string; source: string }>>,
  declaration: string,
): ReadonlyArray<string> {
  const analyzed = [...sources]
    .sort((left, right) => compareCanonicalStrings(left.path, right.path))
    .map(({ path, source }) => ({ path, code: analyzeLeanSource(source).code }));
  const names = unfoldingNames(analyzed.map(({ code }) => code), declaration);
  const sites: string[] = [];
  for (const { path, code } of analyzed) {
    const lineStarts = [0, ...[...code.matchAll(/\n/gu)].map((match) => match.index + 1)];
    const lineOf = (offset: number): number => {
      let line = 0;
      while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= offset) line++;
      return line + 1;
    };
    // A direct site outranks one reached through a caller; otherwise the first site found on a line wins.
    const found = new Map<number, Readonly<{ tactic: string; via: string | null }>>();
    const record = (offset: number, name: string, tactic: string): void => {
      const lemma = equationLemma.test(name);
      const via = names.get(ownName(lemma ? name.replace(equationLemma, "") : name));
      if (via === undefined) return;
      const line = lineOf(offset);
      const previous = found.get(line);
      if (previous === undefined || (previous.via !== null && via === null)) {
        found.set(line, { tactic: lemma ? "equation lemma" : tactic, via });
      }
    };
    for (const { name, offset } of identifiers(code)) {
      if (equationLemma.test(name)) record(offset, name, "equation lemma");
    }
    for (const pattern of [argumentLine, lemmaList]) {
      for (const match of code.matchAll(pattern)) {
        const argumentsStart = match.index + match[0].length - match[2]!.length - (pattern === lemmaList ? 1 : 0);
        for (const { name, offset } of identifiers(match[2]!)) record(argumentsStart + offset, name, match[1]!);
      }
    }
    for (const [line, { tactic, via }] of [...found].sort(([left], [right]) => left - right)) {
      sites.push(`${path}:${line} ${via === null ? tactic : `${tactic} via ${via}`}`);
    }
  }
  return sites;
}
